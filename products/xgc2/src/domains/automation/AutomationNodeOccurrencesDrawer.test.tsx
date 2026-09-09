// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationNodeOccurrencesDrawer } from './AutomationNodeOccurrencesDrawer';
import type {
  AutomationExecutionRelations,
  AutomationNodeInvocation,
} from './automationExecutionContracts';

describe('AutomationNodeOccurrencesDrawer', () => {
  it('shows one DAG invocation with its attempts and compensation without exposing absent payload', () => {
    const onClose = vi.fn();
    const invocations = [
      invocation({
        id: 'invocation-controller',status: 'running',
        attempts: [
          attempt('attempt-execution-1', 'execution', 1, 'failed', 'invocation-controller'),
          attempt('attempt-execution-2', 'execution', 2, 'running', 'invocation-controller'),
          attempt('attempt-compensation-1', 'compensation', 1, 'succeeded', 'invocation-controller'),
        ],
      }),
    ];
    const { container } = render(
      <AutomationNodeOccurrencesDrawer runId="run-1" nodeId="controller" displayName="FS150 controller" invocations={invocations} onClose={onClose} />,
    );

    const drawer = container.querySelector('[data-xgc-role="automation-node-occurrences-drawer"][data-xgc-id="run-1:controller"]');
    expect(drawer).toHaveTextContent('Node execution details');
    expect([...container.querySelectorAll('[data-xgc-role="automation-node-occurrence"]')]
      .map((element) => element.getAttribute('data-xgc-id'))).toEqual(['invocation-controller']);
    const card = container.querySelector('[data-xgc-role="automation-node-occurrence"][data-xgc-id="invocation-controller"]');
    expect(card).toHaveTextContent('Invocation');
    expect(card).not.toHaveTextContent('Run index');
    expect(card?.querySelector('details')).not.toHaveAttribute('open');
    expect(card?.querySelector('details')).toHaveTextContent('invocation-controller');
    expect(container.querySelector('[data-xgc-role="automation-node-attempt"][data-xgc-id="attempt-compensation-1"]'))
      .toHaveTextContent('Compensation attempt 1');
    expect(drawer).toHaveTextContent('Unavailable or not recorded.');

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks an exact invocation and navigates its producer by stable invocation ID', () => {
    const onOpenInvocation = vi.fn();
    const producer = {
      id: 'output-1',runId: 'run-1',invocationId: 'producer-invocation',attemptId: 'producer-attempt',
      nodeId: 'source',port: 'main',value: { ready: true },valueDigest: 'b'.repeat(64),
    };
    const current = invocation({
      id: 'current-invocation',
      inputRefs: [{
        id: 'input-1',runId: 'run-1',consumerInvocationId: 'current-invocation',edgeId: 'source-controller',
        inputKey: 'source',ordinal: 0,producer,
      }],
    });
    const { container } = render(
      <AutomationNodeOccurrencesDrawer
        runId="run-1"
        nodeId="controller"
        invocations={[current]}
        focusedInvocationId={current.id}
        onOpenInvocation={onOpenInvocation}
        onClose={vi.fn()}
      />,
    );

    expect(container.querySelector('.automation-occurrences-public-data')).toHaveTextContent('ready');
    expect(container.querySelector('.automation-occurrences-public-data')).not.toHaveTextContent('valueDigest');
    expect(container.querySelector('.automation-occurrences-public-data')).not.toHaveTextContent('producer-attempt');
    expect(container.querySelector('[data-xgc-role="automation-node-occurrence"][data-xgc-id="current-invocation"]'))
      .toHaveAttribute('aria-current', 'true');
    fireEvent.click(container.querySelector('[data-xgc-role="automation-occurrence-producer-open"][data-xgc-id="producer-invocation"]')!);
    expect(onOpenInvocation.mock.calls.map(([invocationId]) => invocationId))
      .toEqual(['producer-invocation']);
  });

  it('shows only the exact invocation relations and opens its child Run by durable ID', () => {
    const onOpenRun = vi.fn();
    const current = invocation({ id: 'current-invocation' });
    const relations: AutomationExecutionRelations = {
      runId: 'run-1',
      childRuns: [{
        id: 'current-child-link',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',
        parentInvocationId: current.id,callNodeId: 'controller',ordinal: 0,childRunId: 'child-run-1',
        ownerRunId: 'run-1',childDefinitionId: 'child-definition',childDefinitionVersion: 1,
        childConfigDigest: 'a'.repeat(64),childExecutionPlanDigest: 'b'.repeat(64),childRegistryDigest: 'c'.repeat(64),
        childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',relation: 'attached',waitPolicy: 'wait',
        cancelPolicy: 'cascade',resultPolicy: 'propagate',createdAt: current.createdAt,updatedAt: current.updatedAt,revision: 1,
      },{
        id: 'other-child-link',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',
        parentInvocationId: 'other-invocation',callNodeId: 'controller',ordinal: 0,childRunId: 'child-run-2',
        ownerRunId: 'run-1',childDefinitionId: 'child-definition',childDefinitionVersion: 1,
        childConfigDigest: 'e'.repeat(64),childExecutionPlanDigest: 'f'.repeat(64),childRegistryDigest: '1'.repeat(64),
        childDefinitionDigest: '2'.repeat(64),triggerNodeId: 'called',relation: 'attached',waitPolicy: 'wait',
        cancelPolicy: 'cascade',resultPolicy: 'propagate',createdAt: current.createdAt,updatedAt: current.updatedAt,revision: 1,
      }],
      childRunGroups: [],childRunGroupMembers: [],
      waits: [],effects: [],runtimeGroups: [],runtimes: [],resources: [],
    };
    const { container } = render(
      <AutomationNodeOccurrencesDrawer
        runId="run-1"
        nodeId="controller"
        invocations={[current]}
        relations={relations}
        onOpenRun={onOpenRun}
        onClose={vi.fn()}
      />,
    );

    const occurrenceRelations = container.querySelector(
      '[data-xgc-role="automation-occurrence-relations"][data-xgc-id="current-invocation"]',
    );
    expect(occurrenceRelations).not.toBeNull();
    if (!occurrenceRelations) throw new Error('Expected invocation relation section.');
    expect(occurrenceRelations.querySelector('[data-xgc-role="automation-child-run-relation"][data-xgc-id="current-child-link"]')).not.toBeNull();
    expect(occurrenceRelations.querySelector('[data-xgc-role="automation-child-run-relation"][data-xgc-id="other-child-link"]')).toBeNull();
    fireEvent.click(occurrenceRelations.querySelector('[data-xgc-role="automation-child-run-open"][data-xgc-id="child-run-1"]')!);
    expect(onOpenRun).toHaveBeenCalledWith('child-run-1');
  });
});

function invocation(overrides: Partial<AutomationNodeInvocation> = {}): AutomationNodeInvocation {
  return {
    id: 'invocation-controller',runId: 'run-1',nodeId: 'controller',kind: 'process.run-definition',
    status: 'succeeded',compensationStatus: 'none',
    createdAt: '2026-07-19T00:00:00Z',updatedAt: '2026-07-19T00:00:01Z',revision: 2,
    attempts: [attempt('attempt-1', 'execution', 1, 'succeeded', 'invocation-controller')],
    inputRefs: [],outputRefs: [],
    ...overrides,
  };
}

function attempt(
  id: string,
  phase: 'execution' | 'compensation',
  number: number,
  status: 'running' | 'waiting' | 'succeeded' | 'failed' | 'canceled' | 'abandoned',
  invocationId: string,
) {
  return {
    id,runId: 'run-1',invocationId,phase,number,status,
    createdAt: '2026-07-19T00:00:00Z',updatedAt: '2026-07-19T00:00:01Z',revision: 1,
  };
}
