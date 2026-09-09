import type { RecordingFile } from '../recording/recordingPublic';

export type RecordingFolderId = 'system' | 'xgc';

export type RecordingFolderGroup = {
  id: RecordingFolderId;
  items: RecordingFile[];
};

/** XGC capture / upload names start with `xgc-`. GNOME and other OS files do not. */
export function recordingFolderId(item: Pick<RecordingFile, 'id' | 'name'>): RecordingFolderId {
  const name = (item.name || item.id).trim().toLowerCase();
  return name.startsWith('xgc-') ? 'xgc' : 'system';
}

export function groupRecordings(items: readonly RecordingFile[]): RecordingFolderGroup[] {
  const system: RecordingFile[] = [];
  const xgc: RecordingFile[] = [];
  for (const item of items) {
    (recordingFolderId(item) === 'xgc' ? xgc : system).push(item);
  }
  return [
    { id: 'system', items: system },
    { id: 'xgc', items: xgc },
  ];
}
