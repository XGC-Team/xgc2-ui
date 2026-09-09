import { describe,expect,it } from 'vitest';
import {
  automationResourceFolderId,
  automationResourceIsProtected,
  automationResourceProtection,
} from './automationResourceProtection';

function resource(system: boolean, tags: string[], namespaceId?: string, originResourceId?: string) {
  return {
    head: { system,namespaceId,originResourceId },
    spec: { metadata: { tags } },
  };
}

describe('automationResourceProtection', () => {
  it('uses only the Core-owned identity and standard template tags', () => {
    expect(automationResourceProtection(resource(true, []))).toBe('system');
    expect(automationResourceProtection(resource(true, ['template']))).toBe('template');
    expect(automationResourceFolderId(resource(true, ['built-in']))).toBe('system');
    expect(automationResourceProtection(resource(true, ['xgc.seed.ros-basic-services.roscore']))).toBe('system');
    expect(automationResourceIsProtected(resource(true, []))).toBe(true);
  });

  it('never elevates editable resources from seed-like metadata', () => {
    const tags = [
      'xgc.seed.lichtblick-ros-bridge',
      'xgc.seed.ros-basic-services.rosbag',
      'xgc.seed.px4-panel-control.arm',
      'xgc.seed.scout-single-ugv-nmpc',
    ];
    for (const tag of tags) {
      const document = resource(false, [tag], 'flight');
      expect(automationResourceProtection(document)).toBe('user');
      expect(automationResourceFolderId(document)).toBe('flight');
      expect(automationResourceIsProtected(document)).toBe(false);
    }
  });

  it('keeps ordinary user tags and namespaces writable', () => {
    const user = resource(false, ['template','built-in','xgc.seed.user-workflow'], 'flight');

    expect(automationResourceProtection(user)).toBe('user');
    expect(automationResourceFolderId(user)).toBe('flight');
    expect(automationResourceIsProtected(user)).toBe(false);
  });

  it('keeps clones of managed resources editable', () => {
    const clone = resource(false, ['xgc.seed.lichtblick-ros-bridge'], undefined, 'managed-seed');

    expect(automationResourceProtection(clone)).toBe('user');
    expect(automationResourceFolderId(clone)).toBe('user');
  });
});
