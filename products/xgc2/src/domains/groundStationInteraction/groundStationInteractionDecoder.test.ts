import { describe,expect,it } from 'vitest';
import {
  decodeGroundStationInteraction,
  isGroundStationInteractionOpen,
} from './groundStationInteractionDecoder';

describe('decodeGroundStationInteraction', () => {
  it.each([
    ['message', { kind: 'message',presentation: 'toast',responseMode: 'none',payload: { message: { durationMs: 8_000,dismissLabel: 'Close' } } }],
    ['decision', { kind: 'decision',presentation: 'panel',responseMode: 'decision',payload: { decision: { approveLabel: 'Authorize',rejectLabel: 'Reject',requireReason: true } } }],
    ['status', { kind: 'status',presentation: 'panel',responseMode: 'none',payload: { status: { statusKey: 'mission',state: 'tracking',detail: 'Following trajectory',progress: 0.4 } } }],
    ['context', { kind: 'context',presentation: 'panel',responseMode: 'none',payload: { context: { kind: 'robot',id: 'uav-1',subview: 'telemetry',actionLabel: 'Inspect' } } }],
  ] as const)('decodes a strict %s snapshot', (_kind, patch) => {
    expect(decodeGroundStationInteraction(fixture(patch))).toMatchObject(patch);
  });

  it('preserves and validates the scoped remote-controller destination',()=>{
    const remoteController={sessionId:'session-a',conversationId:'conversation-a',robotIds:['scout-01']};
    const patch={kind:'context',presentation:'panel',responseMode:'none',payload:{context:{kind:'robot-remote-controller',id:'remote-a',remoteController}}};
    expect(decodeGroundStationInteraction(fixture(patch))).toMatchObject(patch);
    expect(decodeGroundStationInteraction(fixture({...patch,payload:{context:{...patch.payload.context,remoteController:{...remoteController,robotIds:['scout-01','scout-01']}}}}))).toBeUndefined();
    expect(decodeGroundStationInteraction(fixture({...patch,payload:{context:{...patch.payload.context,remoteController:{...remoteController,conversationId:''}}}}))).toBeUndefined();
  });

  it('applies bounded display defaults for optional message and decision payloads', () => {
    expect(decodeGroundStationInteraction(fixture({ payload: {} }))).toMatchObject({
      kind: 'message',
      payload: { message: { durationMs: 6_000,dismissLabel: 'Got it' } },
    });
    expect(decodeGroundStationInteraction(fixture({
      kind: 'decision',presentation: 'panel',responseMode: 'decision',payload: {},
    }))).toMatchObject({
      payload: { decision: { approveLabel: 'Approve and continue',rejectLabel: 'Reject',requireReason: false } },
    });
  });

  it('rejects mismatched discriminants, invalid tagged payloads, and unsafe numeric ranges', () => {
    expect(decodeGroundStationInteraction(fixture({
      kind: 'decision',presentation: 'toast',responseMode: 'decision',payload: { decision: {} },
    }))).toBeUndefined();
    expect(decodeGroundStationInteraction(fixture({
      kind: 'status',presentation: 'panel',responseMode: 'none',payload: { status: { statusKey: 'mission',state: 'running',progress: 1.1 } },
    }))).toBeUndefined();
    expect(decodeGroundStationInteraction(fixture({ schemaVersion: 2 }))).toBeUndefined();
  });

  it.each(['start', 'stop'])('rejects a retired screen-recording %s request instead of decoding a plain confirmation', (op) => {
    expect(decodeGroundStationInteraction(formFixture({
      approveLabel: 'Record ground station',
      action: { kind: 'screen-recording',op },
    }))).toBeUndefined();
    expect(decodeGroundStationInteraction(formFixture({
      action: { kind: 'future-operator-effect',op },
    }))).toBeUndefined();
  });

  it('decodes the durable response shape without accepting arbitrary fields', () => {
    expect(decodeGroundStationInteraction(fixture({
      kind: 'decision',
      presentation: 'panel',
      responseMode: 'decision',
      payload: { decision: { approveLabel: 'Authorize',rejectLabel: 'Reject' } },
      status: 'resolved',
      revision: 2,
      response: {
        action: 'approved',
        actor: 'operator-a',
        reason: 'Checks complete',
        at: '2026-07-15T09:01:00Z',
      },
    }))).toMatchObject({ response: { action: 'approved',reason: 'Checks complete' } });
    expect(decodeGroundStationInteraction(fixture({
      kind: 'decision',presentation: 'panel',responseMode: 'decision',payload: { decision: {} },
      response: { action: 'approved',actor: 'operator-a',extra: { nested: true },at: '2026-07-15T09:01:00Z' },
    }))).toBeUndefined();
  });

  it('accepts the lifecycle cancellation snapshots emitted when Automation stops', () => {
    const canceledMessage = decodeGroundStationInteraction(fixture({
      status: 'canceled',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      response: { action: 'canceled',actor: 'automation',reason: 'Automation run stopped',at: '2026-07-15T09:01:00Z' },
    }));
    const canceledStatus = decodeGroundStationInteraction(fixture({
      kind: 'status',presentation: 'panel',responseMode: 'none',
      payload: { status: { statusKey: 'mission',state: 'running' } },
      status: 'canceled',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      response: { action: 'canceled',actor: 'automation',reason: 'Automation run stopped',at: '2026-07-15T09:01:00Z' },
    }));
    const canceledContext = decodeGroundStationInteraction(fixture({
      kind: 'context',presentation: 'panel',responseMode: 'none',
      payload: { context: { kind: 'robot',id: 'uav-1' } },
      status: 'canceled',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      response: { action: 'canceled',actor: 'automation',reason: 'Automation run stopped',at: '2026-07-15T09:01:00Z' },
    }));

    expect(canceledMessage).toMatchObject({ kind: 'message',status: 'canceled',response: { action: 'canceled' } });
    expect(canceledStatus).toMatchObject({ kind: 'status',status: 'canceled',response: { action: 'canceled' } });
    expect(canceledContext).toMatchObject({ kind: 'context',status: 'canceled',response: { action: 'canceled' } });
  });

  it('decodes a decision form and refuses declarations it could not render exactly', () => {
    const form = { fields: [
      { name: 'site',label: 'Site',kind: 'string',required: true },
      { name: 'altitude',kind: 'number',default: 12 },
      { name: 'verified',kind: 'boolean' },
    ] };
    expect(decodeGroundStationInteraction(formFixture({ form }))).toMatchObject({
      payload: { decision: { form: { fields: [
        { name: 'site',label: 'Site',kind: 'string',required: true },
        { name: 'altitude',kind: 'number',default: 12 },
        { name: 'verified',kind: 'boolean' },
      ] } } },
    });
    for (const invalid of [
      { fields: [] },
      { fields: [{ name: '1bad',kind: 'string' }] },
      { fields: [{ name: 'a',kind: 'string' },{ name: 'a',kind: 'number' }] },
      { fields: [{ name: 'a',kind: 'object' }] },
      { fields: [{ name: 'a',kind: 'number',default: 'twelve' }] },
      { fields: [{ name: 'a',kind: 'string',hint: 'x' }] },
      { fields: Array.from({ length: 17 }, (_item, index) => ({ name: `f${index}`,kind: 'string' })) },
    ]) {
      expect(decodeGroundStationInteraction(formFixture({ form: invalid }))).toBeUndefined();
    }
  });

  it('binds submitted values to the form that declared them', () => {
    const form = { fields: [{ name: 'site',kind: 'string',required: true },{ name: 'altitude',kind: 'number' }] };
    const resolved = {
      status: 'resolved',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
    };
    expect(decodeGroundStationInteraction(formFixture({ form }, {
      ...resolved,
      response: { action: 'approved',actor: 'operator-a',values: { site: 'pad-3',altitude: 15 },at: '2026-07-15T09:01:00Z' },
    }))).toMatchObject({ response: { action: 'approved',values: { site: 'pad-3',altitude: 15 } } });

    // A value the form never declared, a value of the wrong kind, and values on
    // a non-approval are all snapshots this ground station cannot account for.
    for (const response of [
      { action: 'approved',actor: 'a',values: { unknown: 'x' },at: '2026-07-15T09:01:00Z' },
      { action: 'approved',actor: 'a',values: { altitude: 'high' },at: '2026-07-15T09:01:00Z' },
      { action: 'rejected',actor: 'a',values: { site: 'pad-3' },at: '2026-07-15T09:01:00Z' },
    ]) {
      expect(decodeGroundStationInteraction(formFixture({ form }, { ...resolved,response }))).toBeUndefined();
    }
  });

  it('treats expired and closed snapshots as non-open while retaining future open work', () => {
    const now = Date.parse('2026-07-15T10:00:00Z');
    const future = decodeGroundStationInteraction(fixture({ expiresAt: '2026-07-15T10:01:00Z' }))!;
    const expired = decodeGroundStationInteraction(fixture({ expiresAt: '2026-07-15T09:59:59Z' }))!;
    const resolved = decodeGroundStationInteraction(fixture({
      status: 'resolved',revision: 2,updatedAt: '2026-07-15T10:00:00Z',resolvedAt: '2026-07-15T10:00:00Z',
      response: { action: 'dismissed',actor: 'operator',at: '2026-07-15T10:00:00Z' },
    }))!;

    expect(isGroundStationInteractionOpen(future, now)).toBe(true);
    expect(isGroundStationInteractionOpen(expired, now)).toBe(false);
    expect(isGroundStationInteractionOpen(resolved, now)).toBe(false);
  });
});

function formFixture(decision: Record<string,unknown>, patch: Record<string,unknown> = {}) {
  return fixture({
    kind: 'decision',presentation: 'panel',responseMode: 'decision',
    payload: { decision: { approveLabel: 'Send',rejectLabel: 'Skip',...decision } },
    ...patch,
  });
}

function fixture(patch: Record<string,unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'interaction-1',
    targetScope: 'local',
    revision: 1,
    status: 'open',
    kind: 'message',
    presentation: 'toast',
    responseMode: 'none',
    severity: 'info',
    title: 'Operator message',
    message: '<strong>Plain text only</strong>',
    payload: { message: { durationMs: 8_000 } },
    origin: { type: 'automation',ref: 'mission',runId: 'run-1',nodeId: 'notify' },
    audience: { scope: 'all' },
    createdAt: '2026-07-15T09:00:00Z',
    updatedAt: '2026-07-15T09:00:00Z',
    ...patch,
  };
}
