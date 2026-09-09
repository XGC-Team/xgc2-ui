// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationExecutionRelationsView } from './AutomationExecutionRelations';
import type { AutomationExecutionRelations } from './automationExecutionContracts';

describe('AutomationExecutionRelationsView', () => {
  it('renders the stable empty relation state for a Run and an exact invocation', () => {
    const relations = relationFixture({ childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],runtimes: [],resources: [] });
    const { container,rerender } = render(<AutomationExecutionRelationsView relations={relations} />);

    expect(container.querySelector('[data-xgc-role="automation-run-relations"][data-xgc-id="run-1"]'))
      .toHaveTextContent('No child Run or group, durable wait, effect, Runtime, or resource is recorded for this Run.');
    expect(container.querySelector('[data-xgc-role="automation-relations-empty"][data-xgc-id="run-1"]')).not.toBeNull();

    rerender(<AutomationExecutionRelationsView relations={relations} invocationId="invocation-empty" />);
    expect(container.querySelector('[data-xgc-role="automation-occurrence-relations"][data-xgc-id="invocation-empty"]'))
      .toHaveTextContent('for this invocation.');
  });

  it('separates relation, effect and Runtime lifecycle facts and navigates by stable identities', () => {
    const onOpenRun = vi.fn();
    const onOpenInvocation = vi.fn();
    const relations = relationFixture();
    const { container } = render(
      <AutomationExecutionRelationsView relations={relations} onOpenRun={onOpenRun} onOpenInvocation={onOpenInvocation} />,
    );

    expect(container.querySelector('[data-xgc-role="automation-child-run-relation"][data-xgc-id="child-link"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-wait-state"][data-xgc-id="wait-1"]')).toHaveTextContent('Wait: pending');
    expect(container.querySelector('[data-xgc-role="automation-effect-state"][data-xgc-id="effect-1"]')).toHaveTextContent('Effect: failed');
    expect(container.querySelector('[data-xgc-role="automation-effect-primary-error"][data-xgc-id="effect-1"]')).toHaveTextContent('Primary error · permanentstart rejected');
    expect(container.querySelector('[data-xgc-role="automation-effect-compensation-error"][data-xgc-id="effect-1"]')).toHaveTextContent('Cleanup error · transientstop retrying');
    expect(container.querySelector('[data-xgc-role="automation-runtime-group-state"][data-xgc-id="group-1"]')).toHaveTextContent('Runtime group: active');
    expect(container.querySelector('[data-xgc-role="automation-runtime-state"][data-xgc-id="runtime-1"]')).toHaveTextContent('Runtime: active');
    expect(container.querySelector('[data-xgc-role="automation-resource-state"][data-xgc-id="resource-1"]')).toHaveTextContent('Resource: lost');
    const loss = container.querySelector('[data-xgc-role="automation-resource-loss-reason"][data-xgc-id="resource-1"]');
    expect(loss).toHaveTextContent('Resource loss');
    expect(loss).toHaveTextContent('lease ownership changed');
    const cleanup = container.querySelector('[data-xgc-role="automation-resource-cleanup-error"][data-xgc-id="resource-1"]');
    expect(cleanup).toHaveTextContent('Cleanup error');
    expect(cleanup).toHaveTextContent('backend stop unavailable');
    expect(container.querySelector('[data-xgc-role="automation-runtime-independence"][data-xgc-id="run-1"]'))
      .toHaveTextContent('independent after its Run or start invocation finishes');
    expect(container.querySelector('[data-xgc-role="automation-runtime-backend"][data-xgc-id="process-1"]')).toHaveTextContent('process-1');

    fireEvent.click(container.querySelector('[data-xgc-role="automation-child-run-open"][data-xgc-id="child-run"]')!);
    expect(onOpenRun).toHaveBeenCalledWith('child-run');
    fireEvent.click(container.querySelector('[data-xgc-role="automation-relation-invocation-open"][data-xgc-id="invocation-1"]')!);
    expect(onOpenInvocation).toHaveBeenCalledWith('invocation-1');

    const group = container.querySelector('[data-xgc-role="automation-runtime-group"][data-xgc-id="group-1"]');
    expect(group).not.toHaveAttribute('aria-current');
    fireEvent.click(container.querySelector('[data-xgc-role="automation-runtime-group-open"][data-xgc-id="group-1"]')!);
    expect(group).toHaveAttribute('aria-current', 'true');
  });

  it('renders durable fan-out groups and navigates every independently bound child Run', () => {
    const onOpenRun = vi.fn();
    const relations = relationFixture({
      childRuns: [0,1].map((ordinal) => ({
        id: `child-run-${ordinal}`,targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',parentInvocationId: 'invocation-1',
        callNodeId: 'call-child',ordinal,childRunId: `child-run-${ordinal}`,ownerRunId: 'run-1',childDefinitionId: 'shared-child',
        childDefinitionVersion: 3,childConfigDigest: 'a'.repeat(64),childExecutionPlanDigest: 'b'.repeat(64),
        childRegistryDigest: 'c'.repeat(64),childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',relation: 'attached' as const,
        waitPolicy: 'wait' as const,cancelPolicy: 'cascade' as const,resultPolicy: 'propagate' as const,
        createdAt: timestamp,updatedAt: timestamp,boundAt: timestamp,revision: 2,
      })),
      childRunGroups: [{
        id: 'fan-out-group',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',producerInvocationId: 'invocation-1',
        producerNodeId: 'call-child',groupKey: 'robots',expectedMembers: 2,memberCount: 2,membershipDigest: 'digest',
        waitPolicy: 'join-later',joinMode: 'join-all',failurePolicy: 'collect-errors',remainingPolicy: 'retain',
        resultPolicy: 'reference',maxConcurrency: 2,state: 'resolved',outcome: 'succeeded',terminalCount: 2,
        createdAt: timestamp,updatedAt: timestamp,sealedAt: timestamp,resolvedAt: timestamp,revision: 4,
      }],
      childRunGroupMembers: [0,1].map((ordinal) => ({
        id: `member-${ordinal}`,groupId: 'fan-out-group',ordinal,itemKey: `robot-${ordinal}`,childRunId: `child-run-${ordinal}`,
        state: 'terminal' as const,createdAt: timestamp,updatedAt: timestamp,dispatchedAt: timestamp,terminalAt: timestamp,revision: 3,
      })),
    });
    const { container } = render(<AutomationExecutionRelationsView relations={relations} onOpenRun={onOpenRun} />);

    expect(container.querySelector('[data-xgc-role="automation-child-run-group-relation"][data-xgc-id="fan-out-group"]'))
      .toHaveTextContent('2 prepared · 2/2 sealed');
    expect(container.querySelector('[data-xgc-role="automation-child-run-group-state"][data-xgc-id="fan-out-group"]'))
      .toHaveTextContent('Child group: resolved');
    expect(container.querySelectorAll('[data-xgc-role="automation-child-run-group-member"]')).toHaveLength(2);
    expect(container.querySelector('[data-xgc-role="automation-child-run-relation"]')).toBeNull();

    fireEvent.click(container.querySelector('[data-xgc-role="automation-child-run-group-member-open"][data-xgc-id="child-run-0"]')!);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-child-run-group-member-open"][data-xgc-id="child-run-1"]')!);
    expect(onOpenRun).toHaveBeenNthCalledWith(1, 'child-run-0');
    expect(onOpenRun).toHaveBeenNthCalledWith(2, 'child-run-1');
  });
});

const timestamp = '2026-07-19T00:00:00Z';

function relationFixture(overrides: Partial<AutomationExecutionRelations> = {}): AutomationExecutionRelations {
  return {
    runId: 'run-1',
    childRuns: [{
      id: 'child-link',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',parentInvocationId: 'invocation-1',
      callNodeId: 'call-child',ordinal: 0,childRunId: 'child-run',ownerRunId: 'run-1',childDefinitionId: 'child-definition',
      childDefinitionVersion: 1,childConfigDigest: 'a'.repeat(64),childExecutionPlanDigest: 'b'.repeat(64),
      childRegistryDigest: 'c'.repeat(64),childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',relation: 'attached',
      waitPolicy: 'wait',cancelPolicy: 'cascade',resultPolicy: 'propagate',createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    childRunGroups: [],childRunGroupMembers: [],
    waits: [{
      id: 'wait-1',generation: 1,type: 'runtime',subjectId: 'process-1',runId: 'run-1',invocationId: 'invocation-1',
      attemptId: 'attempt-1',state: 'pending',reason: 'readiness',createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    effects: [{
      id: 'effect-1',targetId: 'local',runId: 'run-1',invocationId: 'invocation-1',preparedAttemptId: 'attempt-1',
      effectKey: 'controller',kind: 'runtime.ensure',ownership: 'owned',checkpointDigest: 'b'.repeat(64),state: 'failed',
      primaryErrorClass: 'permanent',primaryError: 'start rejected',compensationPolicy: 'required',compensationState: 'failed',
      compensationAttemptCount: 2,compensationErrorClass: 'transient',compensationError: 'stop retrying',
      preparedAt: timestamp,updatedAt: timestamp,revision: 3,
    }],
    runtimeGroups: [{
      id: 'group-1',targetId: 'local',runId: 'run-1',invocationId: 'invocation-1',preparedAttemptId: 'attempt-1',
      groupKey: 'fs150',manifestDigest: 'c'.repeat(64),state: 'active',createdAt: timestamp,updatedAt: timestamp,revision: 2,
    }],
    runtimes: [{
      id: 'runtime-1',targetId: 'local',groupId: 'group-1',runId: 'run-1',invocationId: 'invocation-1',
      bindingKey: 'controller',backendKind: 'process-instance',backendId: 'process-1',ownership: 'owned',relation: 'supervised',
      cleanupPolicy: 'stop',ownerType: 'run',ownerId: 'run-1',state: 'active',createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    resources: [{
      id: 'resource-1',targetId: 'local',runId: 'run-1',invocationId: 'invocation-1',boundAttemptId: 'attempt-1',
      runtimeGroupId: 'group-1',bindingKey: 'udp',resourceKey: 'udp:14540',mode: 'exclusive',capacity: 1,slot: 0,
      ownership: 'owned',cleanupPolicy: 'release',scope: 'runtime-group',scopeId: 'group-1',ownerType: 'run',ownerId: 'run-1',
      state: 'lost',createdAt: timestamp,updatedAt: timestamp,lostAt: timestamp,
      lossReason: 'lease ownership changed',cleanupError: 'backend stop unavailable',revision: 1,
    }],
    ...overrides,
  };
}
