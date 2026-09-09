import { describe, expect, it } from 'vitest';
import {
  formatIntrinsicStamp,
  isForbiddenIntrinsicAlias,
  timestampedIntrinsicYamlFiles,
  worldCameraIntrinsicOptionLabel,
} from './gazeboWorldCameraIntrinsicFiles';

describe('timestampedIntrinsicYamlFiles', () => {
  it('keeps only timestamped YAML, drops the alias, and marks Latest on the newest stamp', () => {
    const files = timestampedIntrinsicYamlFiles([
      { name: 'intrinsics.yaml', path: '/cal/sim/usb_cam/intrinsics.yaml', isDir: false },
      { name: 'extrinsics-20260904T021713.263963Z.yaml', path: '/cal/sim/usb_cam/extrinsics-20260904T021713.263963Z.yaml', isDir: false },
      { name: 'intrinsics-20260904T014722.128496Z.yaml', path: '/cal/sim/usb_cam/intrinsics-20260904T014722.128496Z.yaml', isDir: false },
      { name: 'intrinsics-20260904T021713.263963Z.yaml', path: '/cal/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml', isDir: false },
      { name: 'usb_cam', path: '/cal/sim/usb_cam', isDir: true },
    ]);
    expect(files.map((file) => file.path)).toEqual([
      '/cal/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml',
      '/cal/sim/usb_cam/intrinsics-20260904T014722.128496Z.yaml',
    ]);
    expect(files[0]).toMatchObject({ latest: true });
    expect(files[1]).toMatchObject({ latest: false });
    expect(isForbiddenIntrinsicAlias('intrinsics.yaml')).toBe(true);
    expect(worldCameraIntrinsicOptionLabel(files[0]!, 'Latest · ')).toBe('Latest · 2026-09-04 02:17:13');
    expect(worldCameraIntrinsicOptionLabel(files[1]!, 'Latest · ')).toBe('2026-09-04 01:47:22');
    expect(formatIntrinsicStamp('20260904T015108.887792Z')).toBe('2026-09-04 01:51:08');
  });
});
