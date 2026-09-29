import type { RecordingFile } from '../recording/recordingPublic';

export type RecordingFolderGroup = {
  id: string;
  name: string;
  folders: RecordingFolderGroup[];
  items: RecordingFile[];
  count: number;
};

export const RECENT_RECORDING_TILE_COUNT = 9;

export function isArchivedRecording(item: RecordingFile): boolean {
  const parts = item.relativePath?.split('/') ?? [];
  return parts.length > 2 && parts[0] === 'Experiments'
    && parts.at(-1) === item.name
    && parts.every((part) => part !== '' && part !== '.' && part !== '..' && !part.includes('\\'));
}

/** Newest-first archive projection for the unselected player grid. */
export function recentArchivedRecordings(
  items: readonly RecordingFile[],
  limit = RECENT_RECORDING_TILE_COUNT,
): RecordingFile[] {
  return items.filter(isArchivedRecording).slice(0, limit);
}

/** Preserve the owner's real directories, and the server's newest-first order. */
export function groupRecordings(items: readonly RecordingFile[]): RecordingFolderGroup[] {
  const roots: RecordingFolderGroup[] = [];
  const byPath = new Map<string, RecordingFolderGroup>();
  for (const item of items) {
    if (!isArchivedRecording(item)) {
      continue;
    }
    const parts = item.relativePath!.split('/');
    const directories = parts.slice(0, -1);
    let siblings = roots;
    let parent: RecordingFolderGroup | undefined;
    for (let depth = 0; depth < directories.length; depth += 1) {
      const id = directories.slice(0, depth + 1).join('/');
      let folder = byPath.get(id);
      if (!folder) {
        folder = { id, name: directories[depth]!, folders: [], items: [], count: 0 };
        byPath.set(id, folder);
        siblings.push(folder);
      }
      folder.count += 1;
      siblings = folder.folders;
      parent = folder;
    }
    parent?.items.push(item);
  }
  return roots;
}
