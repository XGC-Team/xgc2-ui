import { describe,expect,it } from 'vitest';
import { RUN_STATUSES,isRunStatusTerminal } from '../../shared/executionStatusVocabulary';
import {
  automationNodeOccurrenceAggregates,
  currentAutomationNodeExecutionSummaries,
  parseAutomationNodeInvocations,
} from './automationInvocationModel';
import { parseAutomationRun } from './automationRunRecordModel';
import type { AutomationRun } from './automationRunContracts';

describe('Automation occurrence execution contract', () => {
  it('projects only the exact public Run schema and rejects private or unknown fields', () => {
    const run = runFixture();
    expect(parseAutomationRun(run, '/run')).toEqual(run);
    expect(() => parseAutomationRun({ ...run,idempotencyKey: 'private-dedupe-key' }, '/run'))
      .toThrow('unknown property "idempotencyKey"');
    expect(() => parseAutomationRun({ ...run,credentialEnvelope: { token: 'secret' } }, '/run'))
      .toThrow('unknown property "credentialEnvelope"');
    expect(() => parseAutomationRun({ ...run,registryDigest: undefined }, '/run')).toThrow('/run.registryDigest');
    expect(() => parseAutomationRun({ ...run,configDigest: 'A'.repeat(64) }, '/run')).toThrow('canonical SHA-256');
  });

  it('fails closed on missing or unknown execution model epochs', () => {
    expect(() => parseAutomationRun({ ...runFixture(),executionModel: undefined }, '/run')).toThrow('/run.executionModel');
    expect(() => parseAutomationRun({ ...runFixture(),executionModel: 'orchestration-static-node-v0' }, '/run'))
      .toThrow('unsupported value');
  });

  it('requires the stable Automation resource identity independently of the installed definition', () => {
    const { automationResourceId: _removed,...withoutResource } = runFixture();
    expect(() => parseAutomationRun(withoutResource, '/run')).toThrow('/run.automationResourceId');
  });

  it.each(RUN_STATUSES)(
    'accepts canonical run status %s',
    (status) => {
      const terminal = isRunStatusTerminal(status);
      expect(parseAutomationRun(runFixture({
        status,
        ...(terminal ? { finishedAt: '2026-07-19T08:00:01Z' } : {}),
      }), '/run').status).toBe(status);
    },
  );

  it('keeps requested termination, primary failure, and cleanup failure as independent structured facts', () => {
    const stopped = runFixture({
      status: 'stopped',terminationKind: 'stopped',reason: 'failure-looking text is not a status protocol',
      finishedAt: '2026-07-19T08:00:01Z',
    });
    expect(parseAutomationRun(stopped, '/run')).toMatchObject({ status: 'stopped',terminationKind: 'stopped' });

    const cleanupFailed = runFixture({
      status: 'failed',terminationKind: 'stopped',cleanupErrors: ['runtime cleanup timed out'],
      finishedAt: '2026-07-19T08:00:01Z',
    });
    expect(parseAutomationRun(cleanupFailed, '/run')).toMatchObject({
      status: 'failed',terminationKind: 'stopped',cleanupErrors: ['runtime cleanup timed out'],
    });
    expect(() => parseAutomationRun({ ...cleanupFailed,cleanupErrors: undefined }, '/run'))
      .toThrow('inconsistent primary or cleanup failure facts');
    expect(() => parseAutomationRun({ ...stopped,primaryError: 'not allowed' }, '/run'))
      .toThrow('terminal status and termination facts disagree');
    expect(() => parseAutomationRun({
      ...runFixture(),status: 'stopping',terminationKind: 'failed',primaryError: undefined,
    }, '/run')).toThrow('inconsistent termination facts');
  });

  it.each(['starting','active','unknown'])('rejects legacy or unknown run status %s', (status) => {
    expect(() => parseAutomationRun({ ...runFixture(),status }, '/run'))
      .toThrow('/run.status');
  });

  it('validates replacement admission metadata', () => {
    const limited = runFixture({
      status: 'queued',admissionMode: 'limited',admissionScope: 'root',admissionKey: 'definition:definition-1',
      admissionLimit: 1,admissionOnConflict: 'replace',replacesRunId: 'run-old',
    });
    expect(parseAutomationRun(limited, '/run')).toMatchObject({ admissionOnConflict: 'replace',replacesRunId: 'run-old' });
    expect(() => parseAutomationRun({ ...limited,admissionOnConflict: 'drop' }, '/run')).toThrow('/run.admissionOnConflict');
    expect(() => parseAutomationRun({ ...limited,replacesRunId: '' }, '/run')).toThrow('/run.replacesRunId');
    expect(() => parseAutomationRun({ ...limited,admissionOnConflict: 'queue' }, '/run')).toThrow('/run.replacesRunId');
  });

  it('accepts only payload-free trigger audit metadata on public Runs', () => {
    const run = runFixture({
      triggerInvocation: {
        eventId: 'event-a',nodeId: 'webhook',kind: 'trigger.webhook',sessionId: 'listener-a',
        occurredAt: '2026-07-19T10:11:12.000Z',
      },
    });
    expect(parseAutomationRun(run, '/run').triggerInvocation).toEqual(run.triggerInvocation);
    expect(() => parseAutomationRun({
      ...run,triggerInvocation: { ...run.triggerInvocation,payload: { authorization: 'secret-token' } },
    }, '/run')).toThrow('/run.triggerInvocation');
    expect(() => parseAutomationRun({
      ...run,triggerInvocation: { nodeId: 'webhook',kind: 'trigger.webhook',occurredAt: '2026-07-19T10:11:12.000Z' },
    }, '/run')).toThrow('/run.triggerInvocation.eventId');
  });

  it('rejects malformed nested identities, lineage, admission, lifecycle, and timestamps', () => {
    const run = runFixture();
    expect(() => parseAutomationRun({ ...run,sourceRef: { ...run.sourceRef,privateRef: true } }, '/run'))
      .toThrow('unknown property "privateRef"');
    expect(() => parseAutomationRun({ ...run,sourceRef: { ...run.sourceRef,resourceId: 'automation-other' } }, '/run'))
      .toThrow('/run.sourceRef.resourceId');
    expect(() => parseAutomationRun({ ...run,rootRunId: 'run-other' }, '/run')).toThrow('/run.rootRunId');
    expect(() => parseAutomationRun({ ...run,admissionMode: 'limited' }, '/run')).toThrow('limited admission requires');
    expect(() => parseAutomationRun({ ...run,status: 'succeeded',terminationKind: 'completed' }, '/run'))
      .toThrow('terminal status and finishedAt');
    expect(() => parseAutomationRun({ ...run,acceptedAt: '2026-07-19T08:00:02Z' }, '/run'))
      .toThrow('acceptedAt must not follow createdAt');
    expect(() => parseAutomationRun({
      ...run,sourceKind: 'experiment',sourceRef: { ...run.sourceRef,domain: 'experiment',resourceId: 'experiment-a' },
    }, '/run')).toThrow('/run.automationRef');
  });

  it('parses independent DAG node invocations and derives only authoritative current node summaries', () => {
    const first = invocationFixture({
      id: 'invocation-1',nodeId: 'worker-a',status: 'succeeded',
      attempts: [attemptFixture({ id: 'attempt-1',invocationId: 'invocation-1',number: 1,status: 'succeeded' })],
    });
    const second = invocationFixture({
      id: 'invocation-2',nodeId: 'worker-b',status: 'running',
      attempts: [attemptFixture({ id: 'attempt-2',invocationId: 'invocation-2',number: 1,status: 'running' })],
      activeAttemptId: 'attempt-2',
    });

    const invocations = parseAutomationNodeInvocations([first,second], '/runs/run-1/invocations');

    expect(invocations).toEqual([first,second]);
    expect(currentAutomationNodeExecutionSummaries(runFixture(), [
      nodeFixture({ id: 'worker-a' }),nodeFixture({ id: 'worker-b' }),
    ], invocations)).toEqual([
      nodeSummaryFixture({ nodeId: 'worker-a',latestInvocationId: 'invocation-1' }),
      nodeSummaryFixture({
        nodeId: 'worker-b',status: 'running',latestInvocationId: 'invocation-2',activeOccurrenceCount: 1,
        completedOccurrenceCount: 0,
      }),
    ]);
    expect(automationNodeOccurrenceAggregates(invocations)['worker-b']).toEqual({
      nodeId: 'worker-b',total: 1,active: 1,failed: 0,completed: 0,latestStatus: 'running',
    });
  });

  it('keeps execution retries and compensation attempts in independent phases', () => {
    const invocation = invocationFixture({
      attempts: [
        attemptFixture({ id: 'attempt-execution-1',phase: 'execution',number: 1,status: 'failed' }),
        attemptFixture({ id: 'attempt-execution-2',phase: 'execution',number: 2,status: 'succeeded' }),
        attemptFixture({ id: 'attempt-compensation-1',phase: 'compensation',number: 1,status: 'succeeded' }),
      ],
    });

    expect(parseAutomationNodeInvocations([invocation], '/invocations')[0].attempts.map((attempt) => [attempt.phase,attempt.number]))
      .toEqual([['execution',1],['execution',2],['compensation',1]]);
  });

  it('projects a durable occurrence wait as unresolved waiting state', () => {
    const invocation = invocationFixture({
      status: 'waiting',
      activeAttemptId: 'attempt-1',
      currentWaitId: 'wait-1',waitGeneration: 1,
      attempts: [attemptFixture({ status: 'waiting',finishedAt: undefined })],
    });

    expect(currentAutomationNodeExecutionSummaries(
      runFixture(),[nodeFixture()],parseAutomationNodeInvocations([invocation], '/invocations'),
    )).toEqual([nodeSummaryFixture({ status: 'waiting',latestInvocationId: 'invocation-1',activeOccurrenceCount: 1,completedOccurrenceCount: 0 })]);
  });

  it('retains the last durable wait generation after the current wait has resumed', () => {
    const [invocation] = parseAutomationNodeInvocations([
      invocationFixture({ waitGeneration: 1 }),
    ], '/invocations');

    expect(invocation).toHaveProperty('waitGeneration', 1);
    expect(invocation).not.toHaveProperty('currentWaitId');
  });

  it('keeps a successful manual trigger green when stopping records no-op compensation as canceled', () => {
    const manualNode = nodeFixture({ id: 'manual',kind: 'trigger.manual' });
    const stopped = parseAutomationNodeInvocations([invocationFixture({
      nodeId: 'manual',kind: 'trigger.manual',status: 'succeeded',compensationStatus: 'canceled',
      compensationFinishedAt: '2026-07-19T08:00:02Z',
    })], '/invocations');

    expect(currentAutomationNodeExecutionSummaries(runFixture(), [manualNode], stopped)[0]).toMatchObject({
      nodeId: 'manual',kind: 'trigger.manual',status: 'succeeded',failedOccurrenceCount: 0,
    });

    const failed = parseAutomationNodeInvocations([invocationFixture({
      nodeId: 'manual',kind: 'trigger.manual',status: 'failed',compensationStatus: 'none',
      failure: { class: 'permanent',message: 'manual trigger failed' },
      attempts: [attemptFixture({ status: 'failed' })],
    })], '/invocations');
    expect(currentAutomationNodeExecutionSummaries(runFixture(), [manualNode], failed)[0]).toMatchObject({
      nodeId: 'manual',status: 'failed',failedOccurrenceCount: 1,error: 'manual trigger failed',
    });
  });

  it.each([
    ['raw invocation payload', { inputs: { secret: true } }, 'unknown property "inputs"'],
    ['raw attempt payload', { attempts: [attemptFixture({ output: { secret: true } })] }, 'unknown property "output"'],
    ['mismatched attempt', { attempts: [attemptFixture({ runId: 'another-run' })] }, 'identity does not match'],
    ['duplicate phase number', { attempts: [attemptFixture({ id: 'attempt-a' }),attemptFixture({ id: 'attempt-b' })] }, 'duplicate execution attempt 1'],
    ['legacy activation path', { activationPath: [] }, 'unknown property "activationPath"'],
    ['legacy activation digest', { activationDigest: 'a'.repeat(64) }, 'unknown property "activationDigest"'],
    ['legacy parent invocation', { parentInvocationId: 'parent' }, 'unknown property "parentInvocationId"'],
    ['legacy run index', { runIndex: 1 }, 'unknown property "runIndex"'],
    ['incomplete durable wait identity', { currentWaitId: 'wait-1' }, 'current wait id requires a wait generation'],
    ['output with missing producer attempt', { outputRefs: [outputRefFixture({ attemptId: 'attempt-missing' })] }, 'output producing attempt is missing'],
    ['legacy projection', { origin: 'static-node-projection' }, 'unknown property "origin"'],
  ])('rejects %s', (_case, override, message) => {
    expect(() => parseAutomationNodeInvocations([invocationFixture(override)], '/invocations')).toThrow(message);
  });

  it('rejects duplicate identities and mixed-run collections', () => {
    expect(() => parseAutomationNodeInvocations([
      invocationFixture({ attempts: [] }),invocationFixture({ attempts: [] }),
    ], '/invocations'))
      .toThrow('duplicate invocation id');
    expect(() => parseAutomationNodeInvocations([
      invocationFixture(),invocationFixture({ id: 'invocation-2',runId: 'run-2',attempts: [] }),
    ], '/invocations')).toThrow('multiple runs');
  });

  it('rejects multiple DAG invocations and unexpected runs', () => {
    expect(() => parseAutomationNodeInvocations([
      invocationFixture({ id: 'invocation-a',attempts: [] }),
      invocationFixture({ id: 'invocation-b',attempts: [] }),
    ], '/invocations')).toThrow('multiple invocations for DAG node');
    expect(() => parseAutomationNodeInvocations([
      invocationFixture({ attempts: [] }),
    ], '/invocations', 'another-run')).toThrow('unexpected run');
  });
});

function invocationFixture(overrides: Record<string,unknown> = {}) {
  return {
    id: 'invocation-1',runId: 'run-1',nodeId: 'worker',kind: 'process.run-definition',
    status: 'succeeded',compensationStatus: 'none',
    createdAt: '2026-07-19T08:00:00Z',updatedAt: '2026-07-19T08:00:01Z',revision: 2,
    attempts: [attemptFixture()],
    inputRefs: [],outputRefs: [],
    ...overrides,
  };
}

function attemptFixture(overrides: Record<string,unknown> = {}) {
  return {
    id: 'attempt-1',runId: 'run-1',invocationId: 'invocation-1',phase: 'execution',number: 1,status: 'succeeded',
    createdAt: '2026-07-19T08:00:00Z',startedAt: '2026-07-19T08:00:00Z',finishedAt: '2026-07-19T08:00:01Z',updatedAt: '2026-07-19T08:00:01Z',revision: 2,
    ...overrides,
  };
}

function outputRefFixture(overrides: Record<string,unknown> = {}) {
  return {
    id: 'output-1',runId: 'run-1',invocationId: 'invocation-1',attemptId: 'attempt-1',
    nodeId: 'worker',port: 'main',value: {},valueDigest: `sha256:${'a'.repeat(64)}`,...overrides,
  };
}

function nodeSummaryFixture(overrides: Record<string,unknown> = {}) {
  return {
    runId: 'run-1',nodeId: 'worker',kind: 'process.run-definition',status: 'succeeded',attemptCount: 1,
    occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
    updatedAt: '2026-07-19T08:00:01Z',revision: 2,
    ...overrides,
  };
}

function runFixture(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const run = {
    id: 'run-1',targetId: 'local',automationResourceId: 'automation-1',definitionId: 'definition-1',definitionVersion: 1,actionId:'run',actionVersion:1,
    configDigest: 'b'.repeat(64),executionPlanDigest: 'c'.repeat(64),registryDigest: 'd'.repeat(64),definitionDigest: 'a'.repeat(64),
    executionModel: 'orchestration-occurrence-v1' as const,sourceKind: 'automation' as const,
    sourceRef: {
      domain: 'automation' as const,resourceId: 'automation-1',branch: 'main',commitId: 'commit-1',
      version: 1,digest: 'a'.repeat(64),
    },status: 'running' as const,revision: 1,rootRunId: 'run-1',depth: 0,correlationId: 'run-1',
    parameters: {},admissionMode: 'parallel' as const,admissionScope: 'all' as const,
    acceptedAt: '2026-07-19T08:00:00Z',createdAt: '2026-07-19T08:00:00Z',updatedAt: '2026-07-19T08:00:01Z',
  };
  const status = overrides.status ?? run.status;
  const hasExplicitTermination = ['terminationKind','primaryError','cleanupErrors']
    .some((key) => Object.prototype.hasOwnProperty.call(overrides, key));
  return {
    ...run,...overrides,executionModel: 'orchestration-occurrence-v1' as const,
    configDigest: overrides.configDigest ?? run.configDigest,
    executionPlanDigest: overrides.executionPlanDigest ?? run.executionPlanDigest,
    registryDigest: overrides.registryDigest ?? run.registryDigest,
    ...(hasExplicitTermination ? {} : runTerminationFixture(status)),
  };
}

function runTerminationFixture(status: AutomationRun['status']): Partial<AutomationRun> {
  switch (status) {
    case 'stopping': return { terminationKind: 'stopped' };
    case 'succeeded': return { terminationKind: 'completed' };
    case 'failed': return { terminationKind: 'failed',primaryError: 'test failure' };
    case 'canceled': return { terminationKind: 'canceled' };
    case 'stopped': return { terminationKind: 'stopped' };
    case 'rejected': return { terminationKind: 'rejected' };
    default: return {};
  }
}

function nodeFixture(overrides: Record<string,unknown> = {}) {
  return {
    id: 'worker',displayName: 'Worker',kind: 'process.run-definition',typeVersion: 1,parameters: {},
    retry: { maxAttempts: 1,initialBackoff: 0,maxBackoff: 0 },
    ...overrides,
  };
}
