import { describe, expect, it } from 'vitest';
import {
  formatIntrinsicStamp,
  isForbiddenExtrinsicAlias,
  isForbiddenIntrinsicAlias,
  timestampedExtrinsicYamlFiles,
  timestampedIntrinsicYamlFiles,
  worldCameraExtrinsicOptionLabel,
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

  it('keeps only timestamped extrinsics YAML and labels physical and simulation partitions',() => {
    const files = timestampedExtrinsicYamlFiles([
      { name:'extrinsics.yaml',path:'/cal/phy/usb_cam/extrinsics.yaml',isDir:false },
      { name:'intrinsics-20260904T021713.263963Z.yaml',path:'/cal/phy/usb_cam/intrinsics-20260904T021713.263963Z.yaml',isDir:false },
      { name:'extrinsics-20260904T010000.000000Z.yaml',path:'/cal/phy/usb_cam/extrinsics-20260904T010000.000000Z.yaml',isDir:false },
      { name:'extrinsics-20260904T021713.263963Z.yaml',path:'/cal/phy/usb_cam/extrinsics-20260904T021713.263963Z.yaml',isDir:false },
    ]);
    expect(files.map((file) => file.path)).toEqual([
      '/cal/phy/usb_cam/extrinsics-20260904T021713.263963Z.yaml',
      '/cal/phy/usb_cam/extrinsics-20260904T010000.000000Z.yaml',
    ]);
    expect(isForbiddenExtrinsicAlias('extrinsics.yaml')).toBe(true);
    expect(worldCameraExtrinsicOptionLabel(files[0]!,'phy','Latest · ','Simulation','Physical'))
      .toBe('Physical · Latest · 2026-09-04 02:17:13');
  });

  it('keeps immutable extrinsic versions that share a timestamp and use a collision suffix',() => {
    const name='extrinsics-20260920T123456.123Z-02.yaml';
    expect(timestampedExtrinsicYamlFiles([{ name,path:`/cal/sim/usb_cam/${name}`,isDir:false }]))
      .toEqual([{ path:`/cal/sim/usb_cam/${name}`,stamp:'20260920T123456.123Z',latest:true }]);
  });
});
