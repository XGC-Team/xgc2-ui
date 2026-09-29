import { describe,expect,it } from 'vitest';
import type { RecordingFile } from '../recording/recordingPublic';
import { groupRecordings,recentArchivedRecordings } from './recordingLibraryFolders';

function file(id: string, relativePath?: string): RecordingFile {
  return { id, name: relativePath?.split('/').at(-1) ?? id, relativePath, size: 1024, createdAt: '2026-09-20T00:00:00.000Z' };
}

describe('recordingLibraryFolders', () => {
  it('preserves real experiment/run directories and newest-first input order, not filenames', () => {
    const groups = groupRecordings([
      file('new', 'Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/clip.mp4'),
      file('other', 'Experiments/4-Mecanum/Runs/2026-09-19_physical/ScreenRecording/clip.mp4'),
      file('old', 'Experiments/TASE-4UGVs/Runs/2026-09-18_仿真/ScreenRecording/clip.mp4'),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['Experiments']);
    expect(groups[0]!.count).toBe(3);
    const experiments = groups[0]!.folders;
    expect(experiments.map((g) => g.name)).toEqual(['TASE-4UGVs', '4-Mecanum']);
    const runs = experiments[0]!.folders[0]!.folders;
    expect(runs.map((g) => g.name)).toEqual(['2026-09-20_simulation', '2026-09-18_仿真']);
    expect(runs[0]!.folders[0]!.items.map((item) => item.id)).toEqual(['new']);
    expect(runs[1]!.folders[0]!.items.map((item) => item.id)).toEqual(['old']);
  });

  it('omits files without a current archive relative path', () => {
    expect(groupRecordings([file('xgc-screen.webm'), file('xscreen.mp4')])).toEqual([]);
  });

  it('projects at most nine newest archived recordings for the player grid', () => {
    const items = Array.from({ length: 11 }, (_, index) => (
      file(`clip-${index}`, `Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/clip-${index}.mp4`)
    ));
    items.splice(2, 0, file('loose.webm'));
    expect(recentArchivedRecordings(items).map((item) => item.id)).toEqual(
      Array.from({ length: 9 }, (_, index) => `clip-${index}`),
    );
    expect(recentArchivedRecordings([file('xgc-screen.webm')])).toEqual([]);
  });

  it('does not manufacture folders from noncanonical paths or a mismatched basename', () => {
    expect(groupRecordings([
      file('outside', '/Experiments/clip.mp4'),
      file('traversal', 'Experiments/A/../clip.mp4'),
      { ...file('wrong', 'Experiments/A/clip.mp4'), name: 'other.mp4' },
    ])).toEqual([]);
  });
});
