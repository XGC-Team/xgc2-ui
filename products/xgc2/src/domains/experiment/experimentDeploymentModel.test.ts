import { describe, expect, it } from 'vitest';
import {
  newExperimentSpec, normalizeExperimentSpec, validateExperimentSpec,
  type ExperimentRobotBinding, type ExperimentSpec,
} from './experimentModel';
import { newExperimentDeployment } from './experimentDeployment';

function robot(): ExperimentRobotBinding {
  return {
    id: 'scout-01', ref: { domain: 'robot', resourceId: 'shared-robot-asset', branch: 'main' },
    namespace: '/scout_01', hybridSource: 'simulation', runtimeParameters: {},
    initialPose: { x: 0, y: 0, z: 0, yaw: 0 },
    scout: { lidarSimulationEnabled: false, imageSimulationEnabled: false },
  };
}

describe('deployment survives the existing Experiment model path', () => {
  it.each(['centralized', 'per-robot'] as const)('creates, reads and edits %s without dropping identity', (placement) => {
    const created = newExperimentSpec({ name: 'A', deployment: newExperimentDeployment(placement), robots: [robot()] });
    expect(validateExperimentSpec(created)).toBe('');
    const read = normalizeExperimentSpec(JSON.parse(JSON.stringify(created)) as ExperimentSpec);
    const committed = normalizeExperimentSpec({ ...read, description: 'Edited metadata' });
    expect(committed.deployment).toEqual(created.deployment);
    expect(committed.robots[0]?.executionHost).toEqual(created.robots[0]?.executionHost);
    expect(validateExperimentSpec(committed)).toBe('');
    expect(committed.deployment).not.toBe(read.deployment);
    expect(committed.robots[0]?.executionHost).not.toBe(read.robots[0]?.executionHost);
  });

  it('does not let A change B or their reused asset input', () => {
    const shared = robot();
    shared.executionHost = { kind: 'agent', agentId: 'original-board' };
    const deployment = newExperimentDeployment('centralized');
    const a = newExperimentSpec({ name: 'A', deployment, robots: [shared] });
    const b = newExperimentSpec({ name: 'B', deployment, robots: [shared] });
    const host = a.robots[0]?.executionHost;
    if (host?.kind !== 'agent' || !a.deployment) throw new Error('Creation lost host');
    host.agentId = 'board-a';
    a.deployment.worldHost = { kind: 'agent', agentId: 'world-a' };
    expect(b.robots[0]?.executionHost).toEqual({ kind: 'agent', agentId: 'original-board' });
    expect(shared.executionHost).toEqual({ kind: 'agent', agentId: 'original-board' });
    expect(b.deployment).toEqual(deployment);
    expect(shared.ref).toEqual({ domain: 'robot', resourceId: 'shared-robot-asset', branch: 'main' });
  });

  it('retains absence in legacy reads and refuses a partial authored plan', () => {
    const legacy = newExperimentSpec({ name: 'Legacy', robots: [robot()] });
    const normalized = normalizeExperimentSpec(legacy);
    expect(normalized).not.toHaveProperty('deployment');
    expect(normalized.robots[0]).not.toHaveProperty('executionHost');
    expect(JSON.stringify(normalized)).not.toContain('centralized');
    const partial = normalizeExperimentSpec({ ...legacy, deployment: newExperimentDeployment('per-robot') });
    expect(partial.robots[0]).not.toHaveProperty('executionHost');
    expect(validateExperimentSpec(partial)).not.toBe('');
  });

  it('preserves invalid extra fields so validation cannot silently approve them', () => {
    const spec = newExperimentSpec({ name: 'Invalid', deployment: newExperimentDeployment('centralized'), robots: [robot()] });
    const invalid = JSON.parse(JSON.stringify(spec)) as ExperimentSpec;
    Object.assign(invalid.robots[0]!.executionHost!, { address: '192.0.2.10' });
    expect(validateExperimentSpec(normalizeExperimentSpec(invalid))).not.toBe('');
  });
});
