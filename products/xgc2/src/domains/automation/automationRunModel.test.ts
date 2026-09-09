import { describe,expect,it } from 'vitest';
import type { ProcessInstance } from '../execution/executionPublic';
import type { AutomationSpec } from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { activeWorkflowRuntimeNodeIds } from './automationRunModel';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';

describe('automationRunModel', () => {
  it('uses an active owned Gazebo Client process while the relation read is catching up', () => {
    const definition = supervisedProcessSpec('gazebo-client');
    const run = runFixture();

    expect(activeWorkflowRuntimeNodeIds(
      run,
      emptyDetail(run),
      definition,
      [processFixture(run.id, 'gazebo-client')],
    )).toEqual(['service']);
  });

  it('does not let a process fallback override an explicitly released runtime relation', () => {
    const definition = supervisedProcessSpec('gazebo-client');
    const run = runFixture();
    const detail = emptyDetail(run);
    detail.invocations = [{
      id: 'invocation-service',runId: run.id,nodeId: 'service',kind: 'process.run-definition',status: 'succeeded',
      compensationStatus: 'none',attempts: [],inputRefs: [],outputRefs: [],createdAt: run.createdAt,
      updatedAt: run.updatedAt,revision: 1,
    }];
    detail.relations = {
      runId: run.id,childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],resources: [],
      runtimes: [{
        id: 'runtime-service',targetId: 'local',groupId: 'group-service',runId: run.id,invocationId: 'invocation-service',
        bindingKey: 'process',backendKind: 'process-instance',backendId: 'process-service',ownership: 'owned',
        relation: 'supervised',cleanupPolicy: 'stop',ownerType: 'orchestration-run',ownerId: run.id,state: 'released',
        createdAt: run.createdAt,updatedAt: run.updatedAt,releaseStartedAt: run.updatedAt,releasedAt: run.updatedAt,revision: 2,
      }],
    };

    expect(activeWorkflowRuntimeNodeIds(
      run,
      detail,
      definition,
      [processFixture(run.id, 'gazebo-client')],
    )).toEqual([]);
  });

  it('does not guess when two supervised nodes use the same process definition', () => {
    const definition = supervisedProcessSpec('gazebo-client');
    definition.nodes.push({ ...definition.nodes[0],id: 'service-copy' });
    const run = runFixture();

    expect(activeWorkflowRuntimeNodeIds(
      run,
      emptyDetail(run),
      definition,
      [processFixture(run.id, 'gazebo-client')],
    )).toEqual([]);
  });
});

function supervisedProcessSpec(definitionId: string): AutomationSpec {
  const spec = newAutomationSpec('System process');
  spec.nodes = [{
    ...newAutomationNode('process.run-definition', {
      definitionId,definitionDigest: 'd'.repeat(64),runtimeLifecycle: 'supervised',parameters: {},
    }),
    id: 'service',displayName: `Start ${definitionId}`,
  }];
  return spec;
}

function runFixture(): AutomationRun {
  const timestamp = '2026-07-20T10:14:35Z';
  return {
    id: 'run-gazebo-client',targetId: 'local',automationResourceId: 'automation-gazebo-client',
    definitionId: 'definition-gazebo-client',definitionVersion: 1,actionId:'run',actionVersion:1,configDigest: 'c'.repeat(64),
    executionPlanDigest: 'e'.repeat(64),registryDigest: 'r'.repeat(64),definitionDigest: 'd'.repeat(64),
    executionModel: 'orchestration-occurrence-v1',sourceKind: 'automation',
    sourceRef: {
      domain: 'automation',resourceId: 'automation-gazebo-client',branch: 'main',commitId: 'commit-gazebo-client',
      version: 1,digest: 'd'.repeat(64),
    },
    status: 'waiting',revision: 4,parameters: {},rootRunId: 'run-gazebo-client',depth: 0,correlationId: 'run-gazebo-client',
    admissionMode: 'parallel',admissionScope: 'root',acceptedAt: timestamp,createdAt: timestamp,
    startedAt: timestamp,updatedAt: timestamp,
  };
}

function emptyDetail(run: AutomationRun): AutomationRunDetail {
  return { run,invocations: [],nodeSummaries: [],loading: false,error: '' };
}

function processFixture(runId: string, definitionId: string): ProcessInstance {
  const timestamp = '2026-07-20T10:14:35Z';
  return {
    id: 'process-service',targetId: 'local',definitionId,definitionVersion: '1.0.0',definitionDigest: 'd'.repeat(64),
    ownerType: 'orchestration-run',ownerId: runId,scope: 'automation/automation-gazebo-client/invocation/opaque',
    parameters: {},driver: 'host',desiredState: 'running',observedState: 'running',
    readiness: { status: 'passing' },liveness: { status: 'passing' },revision: 3,restartCount: 0,
    startedAt: timestamp,createdAt: timestamp,updatedAt: timestamp,
  };
}
