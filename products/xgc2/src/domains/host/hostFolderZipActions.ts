/**
 * Client-side folder download action for System → Files.
 * Walks the host/agent file list API and builds a store-only ZIP so operators
 * get an automatic archive download without layout-side success banners.
 */

import type { ApiTargetOptions } from '../../api/http';
import { downloadHostFile,getHostFileContent,getHostFiles } from './hostFileService';
import {
  HOST_FOLDER_ZIP_MAX_BYTES,
  HOST_FOLDER_ZIP_MAX_DEPTH,
  HOST_FOLDER_ZIP_MAX_FILES,
} from './hostFilesModel';

function formatByteBudget(bytes: number): string {
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 1) return `${Math.round(gib)} GiB`;
  const mib = bytes / (1024 * 1024);
  return `${Math.round(mib)} MiB`;
}

/** Wrap a single download in a real ZIP; changing its extension is not archiving. */
export async function zipHostFile(
  path: string,
  fileName: string,
  options?: ApiTargetOptions,
): Promise<Blob> {
  const file = await downloadHostFile(path, options);
  if (file.size > HOST_FOLDER_ZIP_MAX_BYTES) {
    throw new Error(`File exceeds ${formatByteBudget(HOST_FOLDER_ZIP_MAX_BYTES)} download budget.`);
  }
  const content = new Uint8Array(await file.arrayBuffer());
  return zipBlob(buildZip([{ relativePath: fileName, content }]));
}

export async function zipHostDirectory(
  directoryPath: string,
  archiveBaseName: string,
  options?: ApiTargetOptions,
  onProgress?: (message: string) => void,
): Promise<Blob> {
  const root = directoryPath.replace(/\/+$/, '');
  const files: { relativePath: string; content: Uint8Array }[] = [];
  let totalBytes = 0;

  async function walk(dir: string, depth: number) {
    if (depth > HOST_FOLDER_ZIP_MAX_DEPTH) {
      throw new Error(`Folder is deeper than ${HOST_FOLDER_ZIP_MAX_DEPTH} levels; narrow the path.`);
    }
    const list = await getHostFiles(dir, true, '', options);
    for (const entry of list.entries) {
      if (entry.name === '.' || entry.name === '..') continue;
      if (entry.isDir) {
        await walk(entry.path, depth + 1);
        continue;
      }
      if (files.length >= HOST_FOLDER_ZIP_MAX_FILES) {
        throw new Error(`Folder has more than ${HOST_FOLDER_ZIP_MAX_FILES} files; download subfolders instead.`);
      }
      onProgress?.(`Reading ${entry.name}…`);
      const file = await getHostFileContent(entry.path, options);
      const bytes = new TextEncoder().encode(file.content ?? '');
      totalBytes += bytes.byteLength;
      if (totalBytes > HOST_FOLDER_ZIP_MAX_BYTES) {
        throw new Error(`Folder exceeds ${formatByteBudget(HOST_FOLDER_ZIP_MAX_BYTES)} download budget.`);
      }
      const relative = entry.path.startsWith(`${root}/`)
        ? entry.path.slice(root.length + 1)
        : entry.name;
      files.push({ relativePath: relative.replace(/\\/g, '/'), content: bytes });
    }
  }

  await walk(root, 0);
  if (files.length === 0) {
    // Empty folder: still produce a valid empty zip.
    return zipBlob(buildZip([]));
  }
  onProgress?.(`Packing ${files.length} files…`);
  void archiveBaseName;
  return zipBlob(buildZip(files));
}

function zipBlob(bytes: Uint8Array): Blob {
  // BlobPart deliberately excludes SharedArrayBuffer-backed views. Copy into
  // a fresh ArrayBuffer so the ZIP boundary is portable across DOM typings.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/zip' });
}

/** Minimal ZIP (store / no compression) — enough for source/config trees. */
function buildZip(files: { relativePath: string; content: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.relativePath);
    const crc = crc32(file.content);
    const local = new Uint8Array(30 + nameBytes.length + file.content.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 file name
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.content.length, true);
    lv.setUint32(22, file.content.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(file.content, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); // UTF-8 file name
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.content.length, true);
    cv.setUint32(24, file.content.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(end, pos);
  return out;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
