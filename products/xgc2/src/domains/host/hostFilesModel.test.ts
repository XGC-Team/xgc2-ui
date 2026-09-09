import { describe,expect,it } from 'vitest';
import {
  canDownloadHostFileEntry,
  defaultHostFilePath,
  filterHostFileEntries,
  folderDownloadArchiveName,
  HOST_FOLDER_ZIP_MAX_FILES,
  hostFileDestinationConfirm,
  hostFileDownloadConfirm,
  joinPath,
  modeToOctal,
} from './hostFilesModel';

describe('hostFilesModel', () => {
  it('uses shell home expansion as the local default path', () => {
    expect(defaultHostFilePath).toBe('~');
  });

  it('normalizes filesystem paths without duplicating slashes', () => {
    expect(joinPath('/srv/operator/','/logs/app.log')).toBe('/srv/operator/logs/app.log');
    expect(joinPath('/','tmp')).toBe('/tmp');
    expect(joinPath('','tmp')).toBe('/tmp');
  });

  it('names folder download archives predictably', () => {
    expect(folderDownloadArchiveName('logs')).toBe('logs.zip');
    expect(folderDownloadArchiveName('backup.zip')).toBe('backup.zip');
    expect(folderDownloadArchiveName('a/b')).toBe('a-b.zip');
    expect(folderDownloadArchiveName('')).toBe('archive.zip');
  });

  it('allows directories to use archive download', () => {
    expect(canDownloadHostFileEntry({ canDownload: false,isDir: true })).toBe(true);
    expect(canDownloadHostFileEntry({ canDownload: true,isDir: false })).toBe(true);
    expect(canDownloadHostFileEntry({ canDownload: false,isDir: false })).toBe(false);
  });

  it('states download size for files and ZIP budget for folders', () => {
    expect(hostFileDownloadConfirm({ name: 'hello.txt',isDir: false,size: 1536 })).toEqual({
      title: 'Download',
      confirmLabel: 'Download',
      message: 'Download hello.txt (1.5 KB)?',
    });
    const folder = hostFileDownloadConfirm({ name: 'logs',isDir: true,size: 0 });
    expect(folder.title).toBe('Download folder');
    expect(folder.message).toContain('logs');
    expect(folder.message).toContain('10.0 GB');
    expect(folder.message).toContain(HOST_FOLDER_ZIP_MAX_FILES.toLocaleString());
  });

  it('states move and copy destinations in the confirm copy', () => {
    expect(hostFileDestinationConfirm('move',{ name: 'hello.txt' },'/tmp')).toEqual({
      title: 'Move',
      confirmLabel: 'Move',
      message: 'Move hello.txt to /tmp?',
    });
    expect(hostFileDestinationConfirm('copy',{ name: 'hello.txt' },'/tmp')).toEqual({
      title: 'Copy',
      confirmLabel: 'Copy',
      message: 'Copy hello.txt to /tmp?',
    });
  });

  it('converts Unix modes to octal permission prompts', () => {
    expect(modeToOctal('-rwxr-xr-x')).toBe('755');
    expect(modeToOctal('drwx------')).toBe('700');
    expect(modeToOctal('')).toBe('755');
  });

  it('hides dotfiles unless showHidden is true and applies search', () => {
    const entries = [
      { name: 'visible' },
      { name: '.hidden' },
      { name: '.config' },
      { name: 'readme.md' },
    ];
    expect(filterHostFileEntries(entries, { showHidden: false }).map((e) => e.name)).toEqual([
      'visible',
      'readme.md',
    ]);
    expect(filterHostFileEntries(entries, { showHidden: true }).map((e) => e.name)).toEqual([
      'visible',
      '.hidden',
      '.config',
      'readme.md',
    ]);
    expect(filterHostFileEntries(entries, { showHidden: true,search: 'con' }).map((e) => e.name)).toEqual([
      '.config',
    ]);
    expect(filterHostFileEntries(null, { showHidden: false })).toEqual([]);
  });
});
