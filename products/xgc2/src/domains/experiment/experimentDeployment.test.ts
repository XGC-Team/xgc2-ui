import { describe, expect, it } from 'vitest';
import {
  cloneExecutionHostRef, cloneExperimentDeployment, newExecutionHostRef,
  newExperimentDeployment, validateExecutionHostRef, validateExperimentDeployment,
  validateExperimentDeploymentBindings,
} from './experimentDeployment';
import type { ExecutionHostRef } from './experimentDeployment';

describe('Experiment deployment identity contract', () => {
  it('requires the identity selected by kind', () => {
    for (const host of [{ kind: 'station' }, { kind: 'environment', slotId: 'world' }, { kind: 'agent', agentId: 'board' }]) {
      expect(validateExecutionHostRef(host)).toBe('');
    }
    for (const host of [{ kind: 'agent' }, { kind: 'environment' }, { kind: 'station', agentId: 'board' }]) {
      expect(validateExecutionHostRef(host)).not.toBe('');
    }
  });

  it('uses defaults only for an explicitly requested creation template', () => {
    expect(newExperimentDeployment('centralized')).toEqual({
      placement: 'centralized', worldHost: { kind: 'station' },
    });
    expect(newExperimentDeployment('per-robot')).toEqual({
      placement: 'per-robot', worldHost: { kind: 'environment', slotId: 'world' },
    });
    expect(newExecutionHostRef('per-robot', 'scout-01')).toEqual({ kind: 'environment', slotId: 'scout-01' });
    expect(() => newExecutionHostRef('per-robot', '')).toThrow();
  });

  it('keeps template choice independent from a world host override', () => {
    expect(validateExperimentDeployment({ placement: 'centralized', worldHost: { kind: 'agent', agentId: 'board' } })).toBe('');
    expect(validateExperimentDeployment({ placement: 'per-robot', worldHost: { kind: 'station' } })).toBe('');
    expect(validateExperimentDeployment({ placement: 'centralized', worldHost: { kind: 'station' }, dmpcHost: 'board' })).not.toBe('');
    expect(validateExperimentDeployment({ placement: 'split', worldHost: { kind: 'station' } })).not.toBe('');
  });

  it('clones identities without rewriting or sanitizing them into valid input', () => {
    const host: ExecutionHostRef = { kind: 'agent', agentId: 'board' };
    const other = cloneExecutionHostRef(host);
    expect(other).toEqual(host);
    expect(other).not.toBe(host);
    const deployment = { placement: 'centralized' as const, worldHost: host };
    const copy = cloneExperimentDeployment(deployment);
    host.agentId = 'changed';
    expect(copy.worldHost).toEqual({ kind: 'agent', agentId: 'board' });
    const bad = { kind: 'station', address: '192.0.2.1' } as unknown as ExecutionHostRef;
    expect(validateExecutionHostRef(cloneExecutionHostRef(bad))).not.toBe('');
  });

  it('does not reinterpret absent legacy provenance as a centralized plan', () => {
    expect(validateExperimentDeploymentBindings(undefined, [{ id: 'scout-01' }])).toBe('');
    expect(validateExperimentDeploymentBindings(undefined, [{ id: 'scout-01', executionHost: { kind: 'station' } }])).not.toBe('');
    expect(validateExperimentDeploymentBindings(newExperimentDeployment('centralized'), [{ id: 'scout-01' }])).not.toBe('');
  });

  it('validates declared slots without requiring a live container or Agent', () => {
    const plan = newExperimentDeployment('per-robot');
    expect(validateExperimentDeploymentBindings(plan, [
      { id: 'scout-01', executionHost: { kind: 'environment', slotId: 'scout-01' } },
      { id: 'px4-01', executionHost: { kind: 'agent', agentId: 'offline-board' } },
    ])).toBe('');
    expect(validateExperimentDeploymentBindings(plan, [
      { id: 'scout-01', executionHost: { kind: 'environment', slotId: 'another-experiment-slot' } },
    ])).not.toBe('');
  });
});
