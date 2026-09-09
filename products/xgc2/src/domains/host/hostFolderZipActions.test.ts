// @vitest-environment node
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { downloadHostFile,getHostFileContent,getHostFiles } from './hostFileService';
import { HOST_FOLDER_ZIP_MAX_BYTES } from './hostFilesModel';
import { zipHostDirectory,zipHostFile } from './hostFolderZipActions';

vi.mock('./hostFileService', () => ({
  downloadHostFile: vi.fn(),
  getHostFileContent: vi.fn(),
  getHostFiles: vi.fn(),
}));

// Independently inspect the stored member and directory record, not just the
// Blob MIME or extension. Full extractor compatibility is an integration gate.
async function readSingleMember(blob: Blob) {
  expect(blob.type).toBe('application/zip');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  expect(view.getUint16(8, true)).toBe(0);
  const nameLength = view.getUint16(26, true);
  const dataOffset = 30 + nameLength + view.getUint16(28, true);
  const size = view.getUint32(18, true);
  const name = new TextDecoder().decode(bytes.slice(30, 30 + nameLength));
  const content = bytes.slice(dataOffset, dataOffset + size);
  const central = dataOffset + size;
  expect(view.getUint32(central, true)).toBe(0x02014b50);
  expect(view.getUint16(central + 8, true) & 0x0800).toBe(0x0800);
  expect(view.getUint32(central + 16, true)).toBe(view.getUint32(14, true));
  expect(view.getUint32(central + 20, true)).toBe(size);
  expect(view.getUint32(central + 42, true)).toBe(0);
  const centralNameLength = view.getUint16(central + 28, true);
  expect(new TextDecoder().decode(bytes.slice(central + 46, central + 46 + centralNameLength))).toBe(name);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(1);
  expect(view.getUint32(end + 16, true)).toBe(central);
  return { name,content,crc: view.getUint32(14, true) };
}

beforeEach(() => vi.resetAllMocks());

describe('host ZIP downloads', () => {
  it('archives a single file under its original name instead of relabeling raw data', async () => {
    const options = { managedHostId: 'agent-1' };
    vi.mocked(downloadHostFile).mockResolvedValue(new Blob(['123456789']));
    const member = await readSingleMember(await zipHostFile('/tmp/log.txt', 'log.txt', options));
    expect(downloadHostFile).toHaveBeenCalledWith('/tmp/log.txt', options);
    expect(member.name).toBe('log.txt');
    expect(new TextDecoder().decode(member.content)).toBe('123456789');
    expect(member.crc).toBe(0xcbf43926);
  });

  it('preserves the bytes returned by the download boundary and UTF-8 member names', async () => {
    // Mocked transport: this does not assert Agent fs/read is binary-safe.
    const payload = Uint8Array.from([0, 255, 128, 80, 75, 13, 10]);
    vi.mocked(downloadHostFile).mockResolvedValue(new Blob([payload]));
    const member = await readSingleMember(await zipHostFile('/tmp/测试.bin', '测试.bin'));
    expect(member.name).toBe('测试.bin');
    expect(member.content).toEqual(payload);
  });

  it('keeps an empty single file as a member rather than an empty archive', async () => {
    vi.mocked(downloadHostFile).mockResolvedValue(new Blob([]));
    const member = await readSingleMember(await zipHostFile('/tmp/empty', 'empty'));
    expect(member.name).toBe('empty');
    expect(member.content).toHaveLength(0);
    expect(member.crc).toBe(0);
  });

  it('marks directory entry names as UTF-8 without changing their content', async () => {
    vi.mocked(getHostFiles).mockResolvedValue({
      path: '/tmp/folder', parent: '/tmp', entries: [{
        name: '测试.txt', path: '/tmp/folder/测试.txt', isDir: false,
        size: 5, mode: '-rw-r--r--', user: 'user', group: 'group', uid: '1', gid: '1',
        modTime: '2026-09-06T00:00:00Z', isSymlink: false, canEdit: true, canDownload: true,
      }],
    });
    vi.mocked(getHostFileContent).mockResolvedValue({ path: '/tmp/folder/测试.txt', content: 'hello', size: 5 });
    const member = await readSingleMember(await zipHostDirectory('/tmp/folder', 'folder'));
    expect(member.name).toBe('测试.txt');
    expect(new TextDecoder().decode(member.content)).toBe('hello');
  });

  it('still emits a valid empty directory ZIP', async () => {
    vi.mocked(getHostFiles).mockResolvedValue({ path: '/tmp/empty', parent: '/tmp', entries: [] });
    const blob = await zipHostDirectory('/tmp/empty', 'empty');
    const view = new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBe(22);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(10, true)).toBe(0);
  });

  it('propagates a download failure instead of creating a success artifact', async () => {
    const error = new Error('download failed');
    vi.mocked(downloadHostFile).mockRejectedValue(error);
    await expect(zipHostFile('/tmp/file', 'file')).rejects.toBe(error);
  });

  it('rejects an over-budget Blob before copying its payload', async () => {
    const blob = new Blob([]);
    Object.defineProperty(blob, 'size', { value: HOST_FOLDER_ZIP_MAX_BYTES + 1 });
    const read = vi.spyOn(blob, 'arrayBuffer');
    vi.mocked(downloadHostFile).mockResolvedValue(blob);
    await expect(zipHostFile('/tmp/large', 'large')).rejects.toThrow('download budget');
    expect(read).not.toHaveBeenCalled();
  });
});
