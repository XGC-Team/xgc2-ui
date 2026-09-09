import { describe, expect, it } from 'vitest';
import { newUsernodeAssetSpec, normalizeUsernodeAssetSpec } from './usernodeAuthoring';
import type { UsernodeAssetDocument, UsernodeNamespace } from './usernodeContractsPublic';
import {
  groupUsernodeAssetsForTerminal,
  projectUsernodeAssetsForTerminal,
  sortUsernodeAssetsByCatalogOrder,
} from './usernodeTerminalProjection';

describe('projectUsernodeAssetsForTerminal', () => {
  it('lists every ordinary asset by resource id and inserts source for bash and python', () => {
    const bash = documentFixture('script-b', 'Warm up', {
      interpreter: 'bash',
      source: '#!/usr/bin/env bash\necho ready\n',
    });
    const python = documentFixture('script-a', 'Calibrate', {
      interpreter: 'python3',
      source: 'print("ok")\n',
    });

    expect(projectUsernodeAssetsForTerminal([bash, python])).toEqual([
      {
        resourceId: 'script-a',
        name: 'Calibrate',
        folderId: 'user',
        folderTitle: 'Ungrouped',
        summary: 'python3',
        insertText: 'print("ok")',
      },
      {
        resourceId: 'script-b',
        name: 'Warm up',
        folderId: 'user',
        folderTitle: 'Ungrouped',
        summary: 'bash',
        insertText: '#!/usr/bin/env bash\necho ready',
      },
    ]);
  });

  it('inserts rosrun and roslaunch invocations without copying Job lowering', () => {
    const rosrun = documentFixture('run-talker', 'Talker', {
      interpreter: 'rosrun',
      source: '',
      package: 'demo_nodes_cpp',
      executable: 'talker',
      defaultArgs: ['--ros-args'],
    });
    const launch = documentFixture('bringup', 'Bringup', {
      interpreter: 'roslaunch',
      source: '',
      package: 'xgc_bringup',
      launchFile: 'robot.launch',
    });

    const items = projectUsernodeAssetsForTerminal([rosrun, launch]);
    expect(items.map((item) => item.insertText)).toEqual([
      'roslaunch xgc_bringup robot.launch',
      'rosrun demo_nodes_cpp talker --ros-args',
    ]);
    expect(items.map((item) => item.resourceId)).toEqual(['bringup', 'run-talker']);
  });

  it('returns an empty list when the catalog is empty', () => {
    expect(projectUsernodeAssetsForTerminal([])).toEqual([]);
  });

  it('groups ordinary scripts by functional folder and drops seeded System rows', () => {
    const user = documentFixture('warm-up', 'Warm up');
    const field = documentFixture('fs150-linux', 'FS150 · configure linux');
    field.head.namespaceId = 'ns-fs150';
    const system = documentFixture('default-system-ls', 'ls', {
      interpreter: 'bash',
      source: 'ls',
      tags: ['built-in'],
    });
    system.head.system = true;
    const folders: UsernodeNamespace[] = [{
      domain: 'usernode',
      namespaceId: 'ns-fs150',
      name: 'FS150',
      revision: 1,
      createdAt: '2026-08-22T00:00:00Z',
      updatedAt: '2026-08-22T00:00:00Z',
    }];

    const items = projectUsernodeAssetsForTerminal([user, field, system], folders);
    expect(items.map((item) => [item.resourceId, item.folderTitle])).toEqual([
      ['fs150-linux', 'FS150'],
      ['warm-up', 'Ungrouped'],
    ]);
    expect(groupUsernodeAssetsForTerminal(items).map((group) => [group.id, group.title, group.items.length]))
      .toEqual([
        ['ns-fs150', 'FS150', 1],
        ['user', 'Ungrouped', 1],
      ]);
  });

  it('keeps FS150 step1 scripts in catalog configuration order', () => {
    const applyPx4 = documentFixture('apply-px4', 'apply PX4 params', { tags: ['fs150', 'order-6'] });
    const linux = documentFixture('linux', 'configure linux', { tags: ['fs150', 'order-1'] });
    const aptBoot = documentFixture('apt-boot', 'check apt boot', { tags: ['fs150', 'order-2'] });
    const network = documentFixture('network', 'configure network', { tags: ['fs150', 'order-3'] });
    applyPx4.head.namespaceId = 'ns-step1';
    linux.head.namespaceId = 'ns-step1';
    aptBoot.head.namespaceId = 'ns-step1';
    network.head.namespaceId = 'ns-step1';
    const folders: UsernodeNamespace[] = [
      {
        domain: 'usernode',
        namespaceId: 'ns-fs150',
        name: 'FS150',
        revision: 1,
        createdAt: '2026-08-22T00:00:00Z',
        updatedAt: '2026-08-22T00:00:00Z',
      },
      {
        domain: 'usernode',
        namespaceId: 'ns-step1',
        name: 'step1',
        parentNamespaceId: 'ns-fs150',
        revision: 1,
        createdAt: '2026-08-22T00:00:00Z',
        updatedAt: '2026-08-22T00:00:00Z',
      },
    ];

    const items = projectUsernodeAssetsForTerminal([applyPx4, linux, aptBoot, network], folders);
    expect(items.map((item) => item.name)).toEqual([
      'configure linux',
      'check apt boot',
      'configure network',
      'apply PX4 params',
    ]);
    expect(items[0]?.folderTitle).toBe('FS150 / step1');
    expect(items.every((item) => !item.name.startsWith('FS150 ·'))).toBe(true);
  });

  it('sorts folder items by catalog order and keeps the caller order as a tie-breaker', () => {
    const later = documentFixture('apt-boot', 'check apt boot', { tags: ['fs150', 'order-2'] });
    const earlier = documentFixture('linux', 'configure linux', { tags: ['fs150', 'order-1'] });
    const apply = documentFixture('apply-px4', 'apply PX4 params', { tags: ['fs150', 'order-6'] });
    expect(sortUsernodeAssetsByCatalogOrder([apply, later, earlier]).map((item) => item.head.resourceId))
      .toEqual(['linux', 'apt-boot', 'apply-px4']);
  });
});

function documentFixture(
  resourceId: string,
  name: string,
  specOverrides: Partial<UsernodeAssetDocument['spec']> = {},
): UsernodeAssetDocument {
  const timestamp = '2026-08-22T00:00:00Z';
  const spec = normalizeUsernodeAssetSpec({
    ...newUsernodeAssetSpec(name),
    ...specOverrides,
    name,
  });
  return {
    head: {
      domain: 'usernode', resourceId, name, description: spec.description, tags: spec.tags,
      mainCommitId: 'commit-1', currentVersion: 1, digest: 'a'.repeat(64), revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    branch: {
      domain: 'usernode', resourceId, name: 'main', headCommitId: 'commit-1', headVersion: 1, revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    spec,
  };
}
