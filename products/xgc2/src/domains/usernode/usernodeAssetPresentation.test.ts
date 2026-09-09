import { describe, expect, it } from 'vitest';
import { newUsernodeAssetSpec, normalizeUsernodeAssetSpec } from './usernodeAuthoring';
import { usernodeAssetSummary } from './usernodeAssetPresentation';
import type { UsernodeAssetDocument } from './usernodeContractsPublic';

describe('usernodeAssetSummary', () => {
  it('shows bash or python3 as the script type', () => {
    expect(usernodeAssetSummary(documentFixture({ interpreter: 'bash' }))).toBe('bash');
    expect(usernodeAssetSummary(documentFixture({ interpreter: 'python3',source: 'print("ok")\n' })))
      .toBe('python3');
  });

  it('adds the ROS package target and never dumps declared-input counts', () => {
    const withUnusedInputs = documentFixture({
      interpreter: 'rosrun',
      source: '',
      package: 'demo_nodes_cpp',
      executable: 'talker',
      inputs: [{ name: 'unused',kind: 'string',required: false,default: '',description: '' }],
    });
    expect(usernodeAssetSummary(withUnusedInputs)).toBe('rosrun · demo_nodes_cpp/talker');
    expect(usernodeAssetSummary(withUnusedInputs)).not.toMatch(/\d+\s+inputs?/i);
    expect(usernodeAssetSummary(documentFixture({
      interpreter: 'roslaunch',
      source: '',
      package: 'xgc_bringup',
      launchFile: 'robot.launch',
    }))).toBe('roslaunch · xgc_bringup/robot.launch');
  });
});

function documentFixture(specOverrides: Partial<UsernodeAssetDocument['spec']> = {}): UsernodeAssetDocument {
  const timestamp = '2026-08-22T00:00:00Z';
  const spec = normalizeUsernodeAssetSpec({
    ...newUsernodeAssetSpec('Warm up'),
    ...specOverrides,
    name: 'Warm up',
  });
  return {
    head: {
      domain: 'usernode', resourceId: 'warm-up', name: spec.name, description: spec.description, tags: spec.tags,
      mainCommitId: 'commit-1', currentVersion: 1, digest: 'a'.repeat(64), revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    branch: {
      domain: 'usernode', resourceId: 'warm-up', name: 'main', headCommitId: 'commit-1', headVersion: 1, revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    spec,
  };
}
