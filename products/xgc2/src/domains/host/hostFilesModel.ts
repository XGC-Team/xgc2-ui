import { formatBytes } from './hostFormatting';

export const defaultHostFilePath = '~';

/** Client-side folder ZIP budget (System → Files download). */
export const HOST_FOLDER_ZIP_MAX_FILES = 50_000;
export const HOST_FOLDER_ZIP_MAX_BYTES = 10 * 1024 * 1024 * 1024;
export const HOST_FOLDER_ZIP_MAX_DEPTH = 12;

export function joinPath(base: string,name: string) {
  const cleanBase = base.endsWith('/') ? base.slice(0,-1) : base;
  const cleanName = name.replace(/^\/+/, '');
  return cleanBase ? `${cleanBase}/${cleanName}` : `/${cleanName}`;
}

export function folderDownloadArchiveName(name: string) {
  const cleanName = name.trim().replace(/[\\/]+/g, '-');
  if (!cleanName) return 'archive.zip';
  return cleanName.toLowerCase().endsWith('.zip') ? cleanName : `${cleanName}.zip`;
}

export function canDownloadHostFileEntry(item: { canDownload: boolean; isDir: boolean }) {
  return item.canDownload || item.isDir;
}

export function hostFileDownloadConfirm(item: { name: string; isDir: boolean; size: number }) {
  if (item.isDir) {
    return {
      title: 'Download folder',
      confirmLabel: 'Download',
      message: `Compress and download ${item.name} as a ZIP? Folder size is not listed here. Packing stops above ${formatBytes(HOST_FOLDER_ZIP_MAX_BYTES)} or ${HOST_FOLDER_ZIP_MAX_FILES.toLocaleString()} files.`,
    };
  }
  return {
    title: 'Download',
    confirmLabel: 'Download',
    message: `Download ${item.name} (${formatBytes(item.size)})?`,
  };
}

export function hostFileDestinationConfirm(
  mode: 'copy' | 'move',
  item: { name: string },
  destination: string,
) {
  const verb = mode === 'move' ? 'Move' : 'Copy';
  return {
    title: verb,
    confirmLabel: verb,
    message: `${verb} ${item.name} to ${destination}?`,
  };
}

export function hostFileCompressConfirm(
  item: { name: string },
  archiveName: string,
  remoteManagedHost: boolean,
) {
  return remoteManagedHost
    ? {
      title: 'Download ZIP',
      confirmLabel: 'Download',
      message: `Download ${item.name} as ${archiveName}?`,
    }
    : {
      title: 'Compress',
      confirmLabel: 'Compress',
      message: `Compress ${item.name} as ${archiveName}?`,
    };
}

/**
 * Filter directory entries for the Files browser.
 * - hidden=false: hide dotfiles (name starts with ".")
 * - search: case-insensitive substring on name
 * Applied client-side so Core and Agent (which may ignore `hidden` query) behave the same.
 */
export function filterHostFileEntries<T extends { name: string }>(
  entries: readonly T[] | null | undefined,
  options: { showHidden?: boolean;search?: string } = {},
): T[] {
  const list = Array.isArray(entries) ? entries : [];
  const showHidden = options.showHidden === true;
  const query = (options.search ?? '').trim().toLowerCase();
  return list.filter((entry) => {
    const name = entry?.name ?? '';
    if (!showHidden && name.startsWith('.')) return false;
    if (query && !name.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function modeToOctal(mode: string) {
  if (!mode || mode.length < 10) return '755';
  const bits = mode.slice(1,10);
  return [bits.slice(0,3),bits.slice(3,6),bits.slice(6,9)].map((part) => {
    let value = 0;
    if (part[0] === 'r') value += 4;
    if (part[1] === 'w') value += 2;
    if (part[2] === 'x' || part[2] === 's' || part[2] === 't') value += 1;
    return String(value);
  }).join('');
}
