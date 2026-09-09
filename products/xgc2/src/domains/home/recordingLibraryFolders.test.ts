import { describe,expect,it } from 'vitest';
import type { RecordingFile } from '../recording/recordingPublic';
import { groupRecordings, recordingFolderId } from './recordingLibraryFolders';
import { recordingLibraryCopy } from './recordingLibraryCopy';

function file(name: string): RecordingFile {
  return { id: name, name, size: 1024, createdAt: '2026-08-19T00:00:00.000Z' };
}

describe('recordingLibraryFolders', () => {
  it('puts GNOME xscreen files in system and xgc-prefixed files in the product folder', () => {
    expect(recordingFolderId(file('xscreen-2026-08-19-19-00-00.mp4'))).toBe('system');
    expect(recordingFolderId(file('xgc-screen-2026-08-19.webm'))).toBe('xgc');
    expect(recordingFolderId(file('xgc-ground-station-2026-08-19T11-00-00Z.webm'))).toBe('xgc');
  });

  it('keeps folder titles language-adaptive', () => {
    expect(recordingLibraryCopy['en-US'].systemFolder).toBe('System recordings');
    expect(recordingLibraryCopy['en-US'].xgcFolder).toBe('XGC recordings');
    expect(recordingLibraryCopy['zh-CN'].systemFolder).toBe('系统录屏');
    expect(recordingLibraryCopy['zh-CN'].xgcFolder).toBe('XGC 录屏');
  });

  it('groups a mixed list as System then XGC without flattening', () => {
    const groups = groupRecordings([
      file('xgc-screen-a.webm'),
      file('xscreen-b.mp4'),
      file('clip.mp4'),
      file('xgc-ground-station-c.webm'),
    ]);
    expect(groups.map((group) => [group.id, group.items.map((item) => item.id)])).toEqual([
      ['system', ['xscreen-b.mp4', 'clip.mp4']],
      ['xgc', ['xgc-screen-a.webm', 'xgc-ground-station-c.webm']],
    ]);
  });
});
