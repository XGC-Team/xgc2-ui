import { describe,expect,it } from 'vitest';
import type {
  AutomationExecutionRelations,
  AutomationNodeInvocation,
} from './automationExecutionContracts';
import { parseAutomationExecutionRelations,validateAutomationRelationLedger } from './automationRelationsModel';

describe('Automation execution relations model', () => {
  it('parses an empty exact Run graph and rejects unknown or cross-Run data', () => {
    const empty = relationsFixture({ childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],runtimes: [],resources: [] });
    expect(parseAutomationExecutionRelations(empty, '/relations', 'run-1', 'local')).toEqual(empty);
    expect(() => parseAutomationExecutionRelations({ ...empty,secret: true }, '/relations', 'run-1', 'local'))
      .toThrow('unknown property "secret"');
    expect(() => parseAutomationExecutionRelations({ ...empty,runId: 'run-2' }, '/relations', 'run-1', 'local'))
      .toThrow('unexpected Run');
  });

  it('validates the complete child/wait/effect/runtime/resource navigation graph against the occurrence ledger', () => {
    const raw = relationsFixture();
    const parsed = parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local');
    expect(parsed.childRuns[0]).toMatchObject({
      parentInvocationId: invocationId,childRunId: 'child-run',
      childConfigDigest: '1'.repeat(64),childExecutionPlanDigest: '2'.repeat(64),
      childRegistryDigest: '3'.repeat(64),childDefinitionDigest: '4'.repeat(64),
    });
    expect(parsed.runtimes[0]).toMatchObject({ groupId,backendId: 'process-1' });
    expect(parsed.resources[0].runtimeGroupId).toBe(groupId);
    expect(() => validateAutomationRelationLedger(parsed, [invocationFixture()], '/relations')).not.toThrow();
    expect(() => validateAutomationRelationLedger(parsed, [], '/relations')).toThrow('missing invocation');
  });

  it('rejects broken runtime group navigation and secret relation payloads', () => {
    const raw = relationsFixture();
    expect(() => parseAutomationExecutionRelations({ ...raw,runtimeGroups: [] }, '/relations', 'run-1', 'local'))
      .toThrow('missing group');
    expect(() => parseAutomationExecutionRelations({
      ...raw,effects: [{ ...raw.effects[0],checkpoint: { token: 'private' } }],
    }, '/relations', 'run-1', 'local')).toThrow('unknown property "checkpoint"');
  });

  it('validates fan-out groups against exact child links and rejects dispatch credentials', () => {
    const raw = relationsFixture();
    raw.childRunGroups = [{
      id: 'child-group',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',producerInvocationId: invocationId,
      producerNodeId: 'call',groupKey: 'robots',expectedMembers: 1,memberCount: 1,membershipDigest: 'sha256:' + 'd'.repeat(64),
      waitPolicy: 'join-later',joinMode: 'join-all',failurePolicy: 'collect-errors',remainingPolicy: 'retain',
      resultPolicy: 'reference',maxConcurrency: 4,state: 'sealed',terminalCount: 0,
      createdAt: timestamp,updatedAt: timestamp,sealedAt: timestamp,revision: 2,
    }];
    raw.childRunGroupMembers = [{
      id: 'member-0',groupId: 'child-group',ordinal: 0,itemKey: 'robot-0',childRunId: 'child-run',state: 'queued',
      createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }];
    const parsed = parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local');
    expect(parsed.childRunGroups[0]).toMatchObject({ producerInvocationId: invocationId,memberCount: 1 });
    expect(parsed.childRunGroupMembers[0]).toMatchObject({ ordinal: 0,childRunId: 'child-run' });
    expect(() => validateAutomationRelationLedger(parsed, [invocationFixture()], '/relations')).not.toThrow();

    expect(() => parseAutomationExecutionRelations({
      ...raw,childRunGroupMembers: [{ ...raw.childRunGroupMembers[0],ordinal: 1 }],
    }, '/relations', 'run-1', 'local')).toThrow('disagrees with its child link');
    expect(() => parseAutomationExecutionRelations({
      ...raw,childRunGroupMembers: [{ ...raw.childRunGroupMembers[0],leaseOwner: 'private-worker' }],
    }, '/relations', 'run-1', 'local')).toThrow('unknown property "leaseOwner"');
  });

  it('projects exact local and remote target-root status revisions without executable payloads',() => {
    const local=relationsFixture();
    local.childRuns[0]={ ...local.childRuns[0]!,boundAt:timestamp,runStatus:'waiting',runRevision:7 };
    expect(parseAutomationExecutionRelations(local,'/local','run-1','local').childRuns[0])
      .toMatchObject({ childRunId:'child-run',runStatus:'waiting',runRevision:7 });
    expect(() => parseAutomationExecutionRelations({
      ...local,childRuns:[{ ...local.childRuns[0]!,runRevision:undefined }],
    },'/local','run-1','local')).toThrow('incomplete local child Run projection');

    const remote=relationsFixture();
    remote.childRuns[0]={
      ...remote.childRuns[0]!,targetId:'agent-a',targetRoot:true,targetRootBindingId:'binding-a',
      targetRootPresetId:'run',targetRootActionId:'run',targetRootActionVersion:1,
      targetRootRunMode:'physical',observedStatus:'running',observedRevision:4,observedAt:timestamp,
      boundAt:timestamp,
    };
    expect(parseAutomationExecutionRelations(remote,'/remote','run-1','local').childRuns[0])
      .toMatchObject({ targetRoot:true,observedStatus:'running',observedRevision:4 });
  });

  it('parses the durable stopping fence and rejects incomplete runtime release facts', () => {
    const raw = relationsFixture();
    raw.runtimes[0] = {
      ...raw.runtimes[0],state: 'stopping',releaseStartedAt: timestamp,revision: 2,
    };
    expect(parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local').runtimes[0])
      .toMatchObject({ state: 'stopping',releaseStartedAt: timestamp,revision: 2 });

    raw.runtimes[0] = { ...raw.runtimes[0],releaseStartedAt: undefined };
    expect(() => parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local'))
      .toThrow('inconsistent release lifecycle facts');

    raw.runtimes[0] = { ...raw.runtimes[0],state: 'released',releaseStartedAt: timestamp };
    expect(() => parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local'))
      .toThrow('inconsistent release lifecycle facts');
  });

  it('accepts resource-capacity waits and observable lost resource claims', () => {
    const raw = relationsFixture();
    raw.waits[0] = { ...raw.waits[0],type: 'resource',subjectId: 'resource-bundle-1' };
    raw.resources[0] = {
      ...raw.resources[0],state: 'lost',lostAt: timestamp,
      lossReason: 'lease ownership changed',cleanupError: 'backend stop unavailable',
    };
    const parsed = parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local');
    expect(parsed.waits[0]).toMatchObject({ type: 'resource',subjectId: 'resource-bundle-1' });
    expect(parsed.resources[0]).toMatchObject({
      state: 'lost',lostAt: timestamp,lossReason: 'lease ownership changed',cleanupError: 'backend stop unavailable',
    });

    raw.resources[0] = { ...raw.resources[0],lossReason: undefined };
    expect(() => parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local'))
      .toThrow('inconsistent terminal lifecycle facts');
  });

  it('accepts the durable Gazebo readiness wait emitted by Wait for Gazebo Server', () => {
    const raw = relationsFixture();
    raw.waits[0] = { ...raw.waits[0],type: 'gazebo-ready',subjectId: 'gazebo-server:11345' };

    expect(parseAutomationExecutionRelations(raw, '/relations', 'run-1', 'local').waits[0])
      .toMatchObject({ type: 'gazebo-ready',subjectId: 'gazebo-server:11345' });
  });
});

const invocationId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-07-19T00:00:00Z';

function relationsFixture(overrides: Partial<AutomationExecutionRelations> = {}): AutomationExecutionRelations {
  return {
    runId: 'run-1',
    childRuns: [{
      id: 'child-link',targetId: 'local',rootRunId: 'run-1',parentRunId: 'run-1',parentInvocationId: invocationId,
      callNodeId: 'call',ordinal: 0,childRunId: 'child-run',ownerRunId: 'run-1',childDefinitionId: 'child-definition',
      childDefinitionVersion: 2,childConfigDigest: '1'.repeat(64),childExecutionPlanDigest: '2'.repeat(64),
      childRegistryDigest: '3'.repeat(64),childDefinitionDigest: '4'.repeat(64),triggerNodeId: 'called',
      relation: 'attached',waitPolicy: 'wait',cancelPolicy: 'cascade',resultPolicy: 'propagate',
      createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    childRunGroups: [],childRunGroupMembers: [],
    waits: [{
      id: '44444444-4444-4444-8444-444444444444',generation: 1,type: 'runtime',subjectId: 'process-1',
      runId: 'run-1',invocationId,attemptId,state: 'pending',reason: 'readiness',createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    effects: [{
      id: '55555555-5555-4555-8555-555555555555',targetId: 'local',runId: 'run-1',invocationId,
      preparedAttemptId: attemptId,effectKey: 'start',kind: 'runtime.ensure',ownership: 'owned',
      checkpointDigest: 'sha256:' + 'b'.repeat(64),state: 'applied',externalIdentity: 'process-1',
      compensationPolicy: 'required',compensationState: 'unscheduled',compensationAttemptCount: 0,
      preparedAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    runtimeGroups: [{
      id: groupId,targetId: 'local',runId: 'run-1',invocationId,preparedAttemptId: attemptId,
      groupKey: 'fs150',manifestDigest: 'sha256:' + 'c'.repeat(64),state: 'active',createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    runtimes: [{
      id: '66666666-6666-4666-8666-666666666666',targetId: 'local',groupId,runId: 'run-1',invocationId,
      bindingKey: 'controller',backendKind: 'process-instance',backendId: 'process-1',ownership: 'owned',
      relation: 'supervised',cleanupPolicy: 'stop',ownerType: 'run',ownerId: 'run-1',state: 'active',
      createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    resources: [{
      id: '77777777-7777-4777-8777-777777777777',targetId: 'local',runId: 'run-1',invocationId,boundAttemptId: attemptId,
      runtimeGroupId: groupId,bindingKey: 'udp-port',resourceKey: 'udp:14540',mode: 'exclusive',capacity: 1,slot: 0,
      ownership: 'owned',cleanupPolicy: 'release',scope: 'runtime-group',scopeId: groupId,
      ownerType: 'run',ownerId: 'run-1',state: 'active',createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
    ...overrides,
  };
}

function invocationFixture(): AutomationNodeInvocation {
  return {
    id: invocationId,runId: 'run-1',nodeId: 'call',kind: 'automation.call',
    status: 'waiting',activeAttemptId: attemptId,compensationStatus: 'none',
    createdAt: timestamp,updatedAt: timestamp,revision: 1,inputRefs: [],outputRefs: [],attempts: [{
      id: attemptId,runId: 'run-1',invocationId,phase: 'execution',number: 1,status: 'waiting',
      createdAt: timestamp,updatedAt: timestamp,revision: 1,
    }],
  };
}
