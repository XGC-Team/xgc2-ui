import { describe,expect,it } from 'vitest';
import {
  INGRESS_STATUSES,
  type AutomationExecutionIngressStatus,
} from '../../shared/executionStatusVocabulary';
import {
  mergeAutomationExecutionHistoryEntries,
  mergeAutomationIngressTransitions,
  parseAutomationExecutionHistoryEntry,
  parseAutomationExecutionHistoryPage,
  parseAutomationIngressTransitionPage,
} from './automationExecutionHistoryModel';
import type {
  AutomationExecutionHistoryEntry,
} from './automationHistoryTypes';

describe('automation execution history models', () => {
  it.each<AutomationExecutionIngressStatus>(INGRESS_STATUSES)(
    'parses the safe %s ingress whitelist without a Run',
    (status) => {
      const entry = parseAutomationExecutionHistoryEntry(ingressEntry({ status }), '/entry', expected);
      expect(entry.phase).toBe('ingress');
      expect(entry.ingress?.status).toBe(status);
      expect(entry.run).toBeUndefined();
    },
  );

  it('rejects secrets, private Run material and mismatched stable identities', () => {
    expect(() => parseAutomationExecutionHistoryEntry({
      ...ingressEntry(),ingress: { ...ingressFixture(),payload: { authorization: 'Bearer secret' } },
    }, '/entry', expected)).toThrow('unknown property "payload"');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),parameters: { token: 'secret' } },
    }), '/entry', expected)).toThrow('unknown property "parameters"');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),acceptedAt: '2026-07-19T00:00:01Z' },
    }), '/entry', expected)).toThrow('acceptedAt');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),executionPlanDigest: 'not-a-digest' },
    }), '/entry', expected)).toThrow('canonical SHA-256 digest');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),sourceRef: { ...runSummary().sourceRef,domain: 'automation' } },
    }), '/entry', expected)).toThrow('sourceRef.domain');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),sourceRef: undefined },
    }), '/entry', expected)).toThrow('sourceKind and sourceRef must be present together');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),sourceKind: undefined },
    }), '/entry', expected)).toThrow('sourceKind and sourceRef must be present together');
    expect(parseAutomationExecutionHistoryEntry(runEntry({
      run: { ...runSummary(),sourceKind: undefined,sourceRef: undefined },
    }), '/entry', expected).run).toMatchObject({ id: 'run-a',status: 'running' });
  });

  it('accepts only the credential-safe protected Experiment selector',() => {
    const parsed=parseAutomationExecutionHistoryEntry(runEntry({ run:runSummary({
      experimentSelector:{ runMode:'night-field',panelId:'robot-control',presetId:'drive' },
    }) }),'/entry',expected);
    expect(parsed.run?.experimentSelector).toEqual({
      runMode:'night-field',panelId:'robot-control',presetId:'drive',
    });
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({ run:runSummary({
      experimentSelector:{ runMode:'night-field',panelId:'robot-control',inputOverridesJson:'secret' },
    }) }),'/entry',expected)).toThrow('inputOverridesJson');
  });

  it('fails closed on forged summary lineage, admission, lifecycle, and termination facts', () => {
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ rootRunId: 'another-run' }),
    }), '/entry', expected)).toThrow('root Run requires self root identity');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ admissionMode: 'limited' }),
    }), '/entry', expected)).toThrow('limited admission requires');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ status: 'running',startedAt: undefined }),
    }), '/entry', expected)).toThrow('started Run must expose startedAt');
    expect(() => parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ status: 'stopped',terminationKind: 'canceled' }),
    }), '/entry', expected)).toThrow('does not match the terminal Run status');
    expect(parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ status: 'failed',terminationKind: 'stopped' }),
    }), '/entry', expected).run).toMatchObject({ status: 'failed',terminationKind: 'stopped' });
  });

  it('normalizes RFC3339Nano to fixed nanoseconds before keyset ordering', () => {
    const page = parseAutomationExecutionHistoryPage({
      entries: [
        ingressEntry({ id: 'run-new',runId: 'run-new',acceptedAt: '2026-07-19T00:00:00.1Z' }),
        ingressEntry({ id: 'run-old',runId: 'run-old',acceptedAt: '2026-07-19T00:00:00.09Z' }),
      ],
      complete: true,
    }, '/page', expected);
    expect(page.entries.map((entry) => entry.acceptedAt)).toEqual([
      '2026-07-19T00:00:00.100000000Z','2026-07-19T00:00:00.090000000Z',
    ]);
    expect(() => parseAutomationExecutionHistoryPage({
      entries: [
        ingressEntry({ id: 'run-old',runId: 'run-old',acceptedAt: '2026-07-19T00:00:00.09Z' }),
        ingressEntry({ id: 'run-new',runId: 'run-new',acceptedAt: '2026-07-19T00:00:00.1Z' }),
      ],
      complete: true,
    }, '/page', expected)).toThrow('must be ordered');
  });

  it('rejects calendar rollover timestamps instead of accepting JavaScript date normalization', () => {
    expect(() => parseAutomationExecutionHistoryEntry(ingressEntry({
      acceptedAt: '2024-02-31T00:00:00.123456789Z',
    }), '/entry', expected)).toThrow('canonical UTC RFC3339Nano timestamp');
  });

  it('requires ingress source and Run trigger projections to describe one invocation', () => {
    expect(() => parseAutomationExecutionHistoryEntry(ingressEntry({
      ingress: ingressFixture({ sourceKind: 'schedule',triggerKind: 'trigger.webhook' }),
    }), '/entry', expected)).toThrow('does not match triggerKind');

    const matchingInvocation = {
      eventId: 'event-a',nodeId: 'webhook-entry',kind: 'trigger.webhook',occurredAt: baseTimestamp,
    };
    expect(parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ triggerInvocation: matchingInvocation }),
    }), '/entry', expected).run?.triggerInvocation).toMatchObject({
      ...matchingInvocation,occurredAt: '2026-07-19T00:00:00.000000000Z',
    });
    for (const triggerInvocation of [
      { ...matchingInvocation,eventId: 'event-b' },
      { ...matchingInvocation,nodeId: 'other-entry' },
      { ...matchingInvocation,kind: 'trigger.schedule' },
      { ...matchingInvocation,sessionId: 'session-a' },
      { ...matchingInvocation,occurredAt: '2026-07-19T00:00:01Z' },
    ]) {
      expect(() => parseAutomationExecutionHistoryEntry(runEntry({
        run: runSummary({ triggerInvocation }),
      }), '/entry', expected)).toThrow('must match exactly');
    }
  });

  it('merges ingress and Run revisions field-wise without losing either half', () => {
    const acceptedAt = '2026-07-19T00:00:00.000000000Z';
    const current = parseAutomationExecutionHistoryEntry(runEntry({
      acceptedAt,
      ingress: ingressFixture({ revision: 1,status: 'claimed',receivedAt: acceptedAt }),
      run: runSummary({ revision: 3,status: 'running',acceptedAt,updatedAt: '2026-07-19T00:00:03Z' }),
    }), '/current', expected);
    const ingressUpdate = parseAutomationExecutionHistoryEntry(ingressEntry({
      acceptedAt,
      ingress: ingressFixture({ revision: 2,status: 'dispatched',receivedAt: acceptedAt }),
    }), '/ingress', expected);
    const mergedIngress = mergeAutomationExecutionHistoryEntries([current], [ingressUpdate])[0];
    expect(mergedIngress.phase).toBe('run');
    expect(mergedIngress.ingress?.revision).toBe(2);
    expect(mergedIngress.run?.revision).toBe(3);

    const runUpdate = parseAutomationExecutionHistoryEntry(runEntry({
      acceptedAt,ingress: undefined,
      run: runSummary({ revision: 4,status: 'succeeded',acceptedAt,updatedAt: '2026-07-19T00:00:04Z' }),
    }), '/run', expected);
    const mergedRun = mergeAutomationExecutionHistoryEntries([mergedIngress], [runUpdate])[0];
    expect(mergedRun.ingress?.revision).toBe(2);
    expect(mergedRun.run?.revision).toBe(4);
    expect(mergedRun.run?.status).toBe('succeeded');
  });

  it('accepts identical immutable revisions and rejects same-revision fact conflicts', () => {
    const current = parseAutomationExecutionHistoryEntry(runEntry(), '/current', expected);
    const identical = parseAutomationExecutionHistoryEntry(structuredClone(runEntry()), '/identical', expected);
    expect(mergeAutomationExecutionHistoryEntries([current], [identical])).toEqual([current]);

    const ingressConflict = parseAutomationExecutionHistoryEntry(runEntry({
      ingress: ingressFixture({ status: 'claimed' }),
    }), '/ingress-conflict', expected);
    expect(() => mergeAutomationExecutionHistoryEntries([current], [ingressConflict]))
      .toThrow('ingress revision 1 contains conflicting immutable facts');

    const runConflict = parseAutomationExecutionHistoryEntry(runEntry({
      run: runSummary({ status: 'waiting' }),
    }), '/run-conflict', expected);
    expect(() => mergeAutomationExecutionHistoryEntries([current], [runConflict]))
      .toThrow('Run revision 1 contains conflicting immutable facts');
  });

  it('enriches a storage Run summary from History in either merge order', () => {
    const selector = { runMode:'night-field',panelId:'robot-control',presetId:'drive' };
    const storage = parseAutomationExecutionHistoryEntry(runEntry({
      run:runSummary({ sourceKind:undefined,sourceRef:undefined,experimentSelector:undefined }),
    }),'/storage',expected);
    const history = parseAutomationExecutionHistoryEntry(runEntry({
      run:runSummary({ experimentSelector:selector }),
    }),'/history',expected);

    for (const [current,incoming] of [[storage,history],[history,storage]]) {
      expect(mergeAutomationExecutionHistoryEntries([current!],[incoming!])[0]?.run).toMatchObject({
        sourceKind:'experiment',sourceRef:runSummary().sourceRef,experimentSelector:selector,
      });
    }
  });

  it('keeps identical Run enrichment and rejects conflicting source or selector facts', () => {
    const selector = { runMode:'night-field',panelId:'robot-control' };
    const current = parseAutomationExecutionHistoryEntry(runEntry({
      run:runSummary({ experimentSelector:selector }),
    }),'/current-enriched',expected);
    const identical = parseAutomationExecutionHistoryEntry(structuredClone(runEntry({
      run:runSummary({ experimentSelector:selector }),
    })),'/identical-enriched',expected);
    expect(mergeAutomationExecutionHistoryEntries([current],[identical])).toEqual([current]);

    const sourceConflict = parseAutomationExecutionHistoryEntry(runEntry({
      run:runSummary({ sourceRef:{ ...runSummary().sourceRef,commitId:'other-commit' },experimentSelector:selector }),
    }),'/source-conflict',expected);
    expect(() => mergeAutomationExecutionHistoryEntries([current],[sourceConflict]))
      .toThrow('Run revision 1 contains conflicting immutable facts');

    const selectorConflict = parseAutomationExecutionHistoryEntry(runEntry({
      run:runSummary({ experimentSelector:{ ...selector,panelId:'other-panel' } }),
    }),'/selector-conflict',expected);
    expect(() => mergeAutomationExecutionHistoryEntries([current],[selectorConflict]))
      .toThrow('Run revision 1 contains conflicting immutable facts');
  });

  it('still rejects non-enrichment immutable differences at the same Run revision', () => {
    const current = parseAutomationExecutionHistoryEntry(runEntry(),'/base-current',expected);
    const conflict = parseAutomationExecutionHistoryEntry(runEntry({
      run:runSummary({ definitionId:'different-definition' }),
    }),'/base-conflict',expected);
    expect(() => mergeAutomationExecutionHistoryEntries([current],[conflict]))
      .toThrow('Run revision 1 contains conflicting immutable facts');
  });

  it('marks an unavailable Agent page as partial and forbids a misleading cursor', () => {
    expect(parseAutomationExecutionHistoryPage({
      entries: [ingressEntry()],complete: false,unavailableSources: ['agent'],
    }, '/page', expected)).toMatchObject({ complete: false,unavailableSources: ['agent'] });
    expect(() => parseAutomationExecutionHistoryPage({
      entries: [ingressEntry()],complete: false,unavailableSources: ['agent'],nextCursor: 'cursor-a',
    }, '/page', expected)).toThrow('nextCursor');
  });

  it('parses an append-only ingress transition page with a revision cursor', () => {
    const accepted = transitionFixture();
    const claimed = transitionFixture({
      revision: 2,kind: 'claimed',fromStatus: 'pending',toStatus: 'claimed',attemptCount: 1,actor: 'dispatcher',
    });
    const canceled = transitionFixture({
      revision: 3,kind: 'operator_canceled',fromStatus: 'claimed',toStatus: 'abandoned',attemptCount: 1,
      failureCode: 'canceled',actor: 'operator',
    });
    expect(parseAutomationIngressTransitionPage({
      transitions: [accepted,claimed,canceled],nextAfterRevision: 3,complete: true,
    }, '/transitions', { eventId: 'event-a',afterRevision: 0 })).toMatchObject({
      transitions: [
        expect.objectContaining({ revision: 1,kind: 'accepted',toStatus: 'pending' }),
        expect.objectContaining({ revision: 2,kind: 'claimed',fromStatus: 'pending',toStatus: 'claimed' }),
        expect.objectContaining({ revision: 3,kind: 'operator_canceled',fromStatus: 'claimed',toStatus: 'abandoned' }),
      ],
      nextAfterRevision: 3,
      complete: true,
    });
  });

  it('fails closed for malformed, reordered, private or cross-event ingress transitions', () => {
    expect(() => parseAutomationIngressTransitionPage({
      transitions: [transitionFixture({ payload: { authorization: 'secret' } })],complete: true,
    }, '/transitions', { eventId: 'event-a',afterRevision: 0 })).toThrow('unknown property "payload"');
    expect(() => parseAutomationIngressTransitionPage({
      transitions: [transitionFixture({ eventId: 'event-b' })],complete: true,
    }, '/transitions', { eventId: 'event-a',afterRevision: 0 })).toThrow('selected ingress event');
    expect(() => parseAutomationIngressTransitionPage({
      transitions: [
        transitionFixture({ revision: 3,kind: 'dispatched',fromStatus: 'claimed',toStatus: 'dispatched',attemptCount: 1,actor: 'dispatcher' }),
        transitionFixture({ revision: 2,kind: 'claimed',fromStatus: 'pending',toStatus: 'claimed',attemptCount: 1,actor: 'dispatcher' }),
      ],complete: true,
    }, '/transitions', { eventId: 'event-a',afterRevision: 1 })).toThrow('strictly ordered');
    expect(() => parseAutomationIngressTransitionPage({
      transitions: [transitionFixture({ fromStatus: 'pending' })],complete: true,
    }, '/transitions', { eventId: 'event-a',afterRevision: 0 })).toThrow('accepted must omit');
  });

  it('rejects forged kind, actor, state and failure-code combinations in transition audit rows', () => {
    const forged = [
      transitionFixture({ actor: 'dispatcher' }),
      transitionFixture({ revision: 2 }),
      transitionFixture({ revision: 2,kind: 'gate_released',fromStatus: 'claimed',actor: 'admission_controller' }),
      transitionFixture({ revision: 2,kind: 'gate_abandoned',fromStatus: 'pending',toStatus: 'abandoned',actor: 'admission_controller' }),
      transitionFixture({ revision: 2,kind: 'claimed',fromStatus: 'pending',toStatus: 'claimed',actor: 'operator' }),
      transitionFixture({ revision: 2,kind: 'reclaimed',fromStatus: 'pending',toStatus: 'claimed',actor: 'dispatcher' }),
      transitionFixture({ revision: 2,kind: 'dispatched',fromStatus: 'claimed',toStatus: 'dispatched',failureCode: 'dispatch_failed',actor: 'dispatcher' }),
      transitionFixture({ revision: 2,kind: 'requeued',fromStatus: 'claimed',toStatus: 'pending',actor: 'dispatcher' }),
      transitionFixture({ revision: 2,kind: 'dead_lettered',fromStatus: 'claimed',toStatus: 'dead_letter',failureCode: 'gate_abandoned',actor: 'dispatcher' }),
      transitionFixture({ revision: 2,kind: 'operator_retried',fromStatus: 'dead_letter',toStatus: 'dead_letter',actor: 'operator' }),
      transitionFixture({ revision: 2,kind: 'operator_canceled',fromStatus: 'claimed',toStatus: 'abandoned',actor: 'operator' }),
    ];
    for (const transition of forged) {
      expect(() => parseAutomationIngressTransitionPage({
        transitions: [transition],complete: true,
      }, '/transitions', { eventId: 'event-a',afterRevision: transition.revision === 1 ? 0 : 1 }))
        .toThrow('inconsistent controlled transition shape');
    }
  });

  it('represents unavailable Agent transitions without a false cursor and rejects revision conflicts', () => {
    expect(parseAutomationIngressTransitionPage({
      transitions: [],complete: false,unavailableSources: ['agent'],
    }, '/transitions', { eventId: 'event-a',afterRevision: 0 })).toEqual({
      transitions: [],complete: false,unavailableSources: ['agent'],
    });
    expect(() => parseAutomationIngressTransitionPage({
      transitions: [],complete: false,unavailableSources: ['agent'],nextAfterRevision: 2,
    }, '/transitions', { eventId: 'event-a',afterRevision: 0 })).toThrow('nextAfterRevision');
    expect(() => mergeAutomationIngressTransitions(
      [parseAutomationIngressTransitionPage({ transitions: [transitionFixture()],complete: true }, '/first', { eventId: 'event-a',afterRevision: 0 }).transitions[0]!],
      [parseAutomationIngressTransitionPage({ transitions: [transitionFixture({ attemptCount: 1 })],complete: true }, '/second', { eventId: 'event-a',afterRevision: 0 }).transitions[0]!],
    )).toThrow('conflicting immutable facts');
  });
});

const expected = { targetId: 'local',automationResourceId: 'automation-a' };
const baseTimestamp = '2026-07-19T00:00:00Z';

function ingressFixture(overrides: Record<string,unknown> = {}) {
  return {
    eventId: 'event-a',revision: 1,status: 'pending',sourceKind: 'webhook',entrypointNodeId: 'webhook-entry',
    triggerKind: 'trigger.webhook',attemptCount: 0,occurredAt: baseTimestamp,receivedAt: baseTimestamp,runId: 'run-a',
    ...overrides,
  };
}

function ingressEntry(overrides: Record<string,unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : 'run-a';
  const runId = typeof overrides.runId === 'string' ? overrides.runId : id;
  const acceptedAt = typeof overrides.acceptedAt === 'string' ? overrides.acceptedAt : baseTimestamp;
  const customIngress = Object.prototype.hasOwnProperty.call(overrides, 'ingress')
    ? overrides.ingress
    : ingressFixture({
      runId,
      receivedAt: acceptedAt,
      ...(typeof overrides.status === 'string' ? { status: overrides.status } : {}),
    });
  const clean = { ...overrides };
  delete clean.status;
  delete clean.ingress;
  return {
    id,runId,targetId: 'local',automationResourceId: 'automation-a',acceptedAt,phase: 'ingress',
    ingress: customIngress,
    ...clean,
  };
}

function runSummary(overrides: Record<string,unknown> = {}) {
  const status = typeof overrides.status === 'string' ? overrides.status : 'running';
  const updatedAt = typeof overrides.updatedAt === 'string' ? overrides.updatedAt : baseTimestamp;
  const hasExplicitTermination = Object.prototype.hasOwnProperty.call(overrides, 'terminationKind');
  const started = ['running','waiting','stopping','succeeded'].includes(status);
  const terminal = ['succeeded','failed','canceled','stopped','rejected'].includes(status);
  return {
    id: 'run-a',targetId: 'local',automationResourceId: 'automation-a',definitionId: 'definition-a',
    definitionVersion: 1,actionId: 'run',actionVersion: 1,
    configDigest: 'a'.repeat(64),executionPlanDigest: 'b'.repeat(64),
    registryDigest: 'c'.repeat(64),definitionDigest: 'd'.repeat(64),executionModel: 'orchestration-occurrence-v1',
    sourceKind: 'experiment',sourceRef: {
      domain: 'experiment',resourceId: 'experiment-a',branch: 'main',commitId: 'experiment-commit',version: 1,digest: 'e'.repeat(64),
    },
    status: 'running',revision: 1,admissionMode: 'parallel',admissionScope: 'root',acceptedAt: baseTimestamp,
    createdAt: baseTimestamp,updatedAt: baseTimestamp,
    ...overrides,
    ...(!Object.prototype.hasOwnProperty.call(overrides, 'rootRunId') ? { rootRunId: 'run-a' } : {}),
    ...(started && !Object.prototype.hasOwnProperty.call(overrides, 'startedAt') ? { startedAt: baseTimestamp } : {}),
    ...(terminal && !Object.prototype.hasOwnProperty.call(overrides, 'finishedAt') ? { finishedAt: updatedAt } : {}),
    ...(hasExplicitTermination ? {} : runSummaryTermination(status)),
  };
}

function runSummaryTermination(status: string) {
  switch (status) {
    case 'stopping': return { terminationKind: 'stopped' };
    case 'succeeded': return { terminationKind: 'completed' };
    case 'failed': return { terminationKind: 'failed' };
    case 'canceled': return { terminationKind: 'canceled' };
    case 'stopped': return { terminationKind: 'stopped' };
    case 'rejected': return { terminationKind: 'rejected' };
    default: return {};
  }
}

function runEntry(overrides: Record<string,unknown> = {}) {
  const acceptedAt = typeof overrides.acceptedAt === 'string' ? overrides.acceptedAt : baseTimestamp;
  const ingress = Object.prototype.hasOwnProperty.call(overrides, 'ingress')
    ? overrides.ingress
    : ingressFixture({ receivedAt: acceptedAt });
  const run = Object.prototype.hasOwnProperty.call(overrides, 'run')
    ? overrides.run
    : runSummary({ acceptedAt });
  const clean = { ...overrides };
  delete clean.ingress;
  delete clean.run;
  return {
    id: 'run-a',runId: 'run-a',targetId: 'local',automationResourceId: 'automation-a',acceptedAt,phase: 'run',
    ...(ingress === undefined ? {} : { ingress }),run,...clean,
  } as AutomationExecutionHistoryEntry | Record<string,unknown>;
}

function transitionFixture(overrides: Record<string,unknown> = {}) {
  return {
    eventId: 'event-a',revision: 1,kind: 'accepted',toStatus: 'pending',attemptCount: 0,
    actor: 'source_adapter',occurredAt: baseTimestamp,...overrides,
  };
}
