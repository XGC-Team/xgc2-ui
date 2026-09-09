import { describe,expect,it } from 'vitest';
import type { AutomationNodeExecutionSummary,AutomationRunDetail } from './automationExecutionContracts';
import {
  automationGraphOperatorStatus,
  projectAutomationGraphRuntime,
} from './automationGraphRuntime';

describe('projectAutomationGraphRuntime', () => {
  it('maps waiting and running summaries onto readable operator states', () => {
    const projection = projectAutomationGraphRuntime(detail([
      summary('trigger','succeeded'),
      summary('read-request','waiting'),
      summary('run-calibration','pending'),
    ]));
    expect(projection.nodeRuntimeFacts.trigger?.status).toBe('passing');
    expect(projection.nodeRuntimeFacts['read-request']?.status).toBe('running');
    expect(projection.nodeRuntimeFacts['run-calibration']?.status).toBe('idle');
    expect(projection.activeRuntimeNodeIds).toEqual(['read-request']);
  });

  it('keeps a succeeded node active when its runtime relation is still live', () => {
    const projection = projectAutomationGraphRuntime({
      ...detail([summary('start-process','succeeded')]),
      invocations: [{
        id: 'invocation-start',runId: 'run-1',nodeId: 'start-process',kind: 'process.run-definition',
        status: 'succeeded',compensationStatus: 'none',attempts: [],inputRefs: [],outputRefs: [],
        createdAt: 't',updatedAt: 't',revision: 1,
      }],
      relations: emptyRelations({
        runtimes: [{
          id: 'runtime-start',targetId: 'local',groupId: 'group',runId: 'run-1',
          invocationId: 'invocation-start',bindingKey: 'process',backendKind: 'process-instance',
          backendId: 'process-1',ownership: 'owned',relation: 'supervised',cleanupPolicy: 'stop',
          ownerType: 'orchestration-run',ownerId: 'run-1',state: 'active',createdAt: 't',
          updatedAt: 't',revision: 1,
        }],
      }),
    });
    expect(projection.nodeRuntimeFacts['start-process']?.status).toBe('passing');
    expect(projection.activeRuntimeNodeIds).toEqual(['start-process']);
  });

  it('marks a parent node active while a bound child run is still attached', () => {
    const projection = projectAutomationGraphRuntime({
      ...detail([summary('call-panels','succeeded')]),
      invocations: [{
        id: 'invocation-call',runId: 'run-1',nodeId: 'call-panels',kind: 'automation.call-bound-each',
        status: 'waiting',compensationStatus: 'none',attempts: [],inputRefs: [],outputRefs: [],
        createdAt: 't',updatedAt: 't',revision: 1,
      }],
      relations: emptyRelations({
        childRuns: [{
          id: 'child-1',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',
          parentInvocationId: 'invocation-call',callNodeId: 'call-panels',ordinal: 0,
          childRunId: 'panel-run',ownerRunId: 'run-1',childDefinitionId: 'panel',
          childDefinitionVersion: 1,childConfigDigest: 'c'.repeat(64),
          childExecutionPlanDigest: 'e'.repeat(64),childRegistryDigest: 'r'.repeat(64),
          childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',
          relation: 'supervised',waitPolicy: 'wait',cancelPolicy: 'cascade',
          resultPolicy: 'propagate',createdAt: 't',updatedAt: 't',boundAt: 't',revision: 1,
        }],
      }),
    });
    expect(projection.activeRuntimeNodeIds).toEqual(['call-panels']);
  });

  it('ignores released runtimes and abandoned child launches', () => {
    const projection = projectAutomationGraphRuntime({
      ...detail([summary('start-process','succeeded')]),
      invocations: [{
        id: 'invocation-start',runId: 'run-1',nodeId: 'start-process',kind: 'process.run-definition',
        status: 'succeeded',compensationStatus: 'none',attempts: [],inputRefs: [],outputRefs: [],
        createdAt: 't',updatedAt: 't',revision: 1,
      }],
      relations: emptyRelations({
        runtimes: [{
          id: 'runtime-start',targetId: 'local',groupId: 'group',runId: 'run-1',
          invocationId: 'invocation-start',bindingKey: 'process',backendKind: 'process-instance',
          backendId: 'process-1',ownership: 'owned',relation: 'supervised',cleanupPolicy: 'stop',
          ownerType: 'orchestration-run',ownerId: 'run-1',state: 'released',createdAt: 't',
          updatedAt: 't',releasedAt: 't',revision: 2,
        }],
        childRuns: [{
          id: 'child-1',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',
          parentInvocationId: 'invocation-start',callNodeId: 'start-process',ordinal: 0,
          childRunId: 'child-run',ownerRunId: 'run-1',childDefinitionId: 'child',
          childDefinitionVersion: 1,childConfigDigest: 'c'.repeat(64),
          childExecutionPlanDigest: 'e'.repeat(64),childRegistryDigest: 'r'.repeat(64),
          childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',
          relation: 'supervised',waitPolicy: 'wait',cancelPolicy: 'cascade',
          resultPolicy: 'propagate',createdAt: 't',updatedAt: 't',boundAt: 't',
          launchAbandonedAt: 't',revision: 1,
        }],
      }),
    });
    expect(projection.activeRuntimeNodeIds).toEqual([]);
  });

  it('returns empty projection when there is no run detail', () => {
    expect(projectAutomationGraphRuntime(undefined)).toEqual({
      nodeRuntimeFacts: {},
      activeRuntimeNodeIds: [],
    });
  });
});

describe('automationGraphOperatorStatus', () => {
  it('maps engine statuses onto operator vocabulary', () => {
    expect(automationGraphOperatorStatus('failed')).toBe('failing');
    expect(automationGraphOperatorStatus('compensated')).toBe('passing');
    expect(automationGraphOperatorStatus('canceled')).toBe('stopping');
    expect(automationGraphOperatorStatus('compensating')).toBe('stopping');
    expect(automationGraphOperatorStatus('running')).toBe('running');
    expect(automationGraphOperatorStatus('waiting')).toBe('running');
    expect(automationGraphOperatorStatus('pending')).toBe('idle');
    expect(automationGraphOperatorStatus('skipped')).toBe('idle');
  });
});

function summary(nodeId: string,status: AutomationNodeExecutionSummary['status']): AutomationNodeExecutionSummary {
  return {
    runId: 'run-1',nodeId,kind: 'test',status,attemptCount: 1,occurrenceCount: 1,
    activeOccurrenceCount: status === 'running' || status === 'waiting' ? 1 : 0,
    completedOccurrenceCount: status === 'succeeded' ? 1 : 0,
    failedOccurrenceCount: status === 'failed' ? 1 : 0,updatedAt: 't',revision: 1,
  };
}

function detail(nodeSummaries: AutomationNodeExecutionSummary[]): AutomationRunDetail {
  return { invocations: [],nodeSummaries,loading: false,error: '' };
}

function emptyRelations(patch: Partial<NonNullable<AutomationRunDetail['relations']>> = {}) {
  return {
    runId: 'run-1',childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],
    effects: [],runtimeGroups: [],runtimes: [],resources: [],...patch,
  };
}
