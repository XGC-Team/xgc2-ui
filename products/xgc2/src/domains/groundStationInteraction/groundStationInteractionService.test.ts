// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { HTTPError,request } from '../../api/http';
import type * as HttpModule from '../../api/http';
import {
  actOnGroundStationInteraction,
  isGroundStationInteractionCASConflict,
  listOpenGroundStationInteractions,
  listRecentGroundStationInteractions,
} from './groundStationInteractionService';

vi.mock('../../api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof HttpModule>();
  return { ...actual,request: vi.fn() };
});

describe('groundStationInteractionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the strict open inventory for the selected execution target', async () => {
    vi.mocked(request).mockResolvedValue([fixture()]);

    await expect(listOpenGroundStationInteractions('local')).resolves.toMatchObject([{ id: 'interaction-1' }]);
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/local/ground-station-interactions?status=open',
      { signal: undefined },
    );
  });

  it('lists a bounded recent inventory including terminal interaction snapshots', async () => {
    vi.mocked(request).mockResolvedValue([
      fixture({ status: 'expired',revision: 2 }),
      fixture({
        id: 'interaction-canceled',status: 'canceled',revision: 2,
        response: { action: 'canceled',actor: 'automation',reason: 'Automation run stopped',at: '2026-07-15T09:01:00Z' },
        updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      }),
    ]);

    await expect(listRecentGroundStationInteractions('local')).resolves.toMatchObject([
      { id: 'interaction-1',status: 'expired',revision: 2 },
      { id: 'interaction-canceled',status: 'canceled',response: { action: 'canceled' } },
    ]);
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/local/ground-station-interactions?limit=256',
      { signal: undefined },
    );
  });

  it.each([
    ['open', listOpenGroundStationInteractions],
    ['recent', listRecentGroundStationInteractions],
  ] as const)('omits retired recording requests from the %s inventory without blocking normal decisions or writing responses', async (_name, list) => {
    const decision = fixture({
      kind: 'decision',presentation: 'panel',responseMode: 'decision',
      payload: { decision: { approveLabel: 'Continue',rejectLabel: 'Cancel' } },
    });
    vi.mocked(request).mockResolvedValue([
      fixture({ ...decision,id: 'recording-start',payload: { decision: { action: { kind: 'screen-recording',op: 'start' } } } }),
      fixture({ ...decision,id: 'normal-decision',revision: 3 }),
      fixture({ ...decision,id: 'recording-stop',payload: { decision: { action: { kind: 'screen-recording',op: 'stop' } } } }),
      fixture({ id: 'normal-message' }),
    ]);

    await expect(list('local')).resolves.toMatchObject([
      { id: 'normal-decision',revision: 3,kind: 'decision',payload: { decision: { approveLabel: 'Continue' } } },
      { id: 'normal-message',kind: 'message' },
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.mocked(request).mock.calls[0][1]).toEqual({ signal: undefined });
  });

  it('posts CAS actions with matching intent headers and an operator reason', async () => {
    vi.mocked(request).mockResolvedValue({ interaction: fixture({
      kind: 'decision',presentation: 'panel',responseMode: 'decision',payload: { decision: {} },
      status: 'resolved',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      response: { action: 'approved',actor: 'operator',at: '2026-07-15T09:01:00Z' },
    }),receipt: { commandId: 'command-1' } });
    const body = {
      action: 'approved' as const,
      expectedRevision: 1,
      requestId: 'request-1',
      idempotencyKey: 'intent-1',
      reason: 'Checks complete',
    };

    await expect(actOnGroundStationInteraction('local', 'interaction-1', body)).resolves.toMatchObject({
      interaction: { id: 'interaction-1',revision: 2 },
      receipt: { commandId: 'command-1' },
    });
    expect(request).toHaveBeenCalledWith(
      '/execution-targets/local/ground-station-interactions/interaction-1/actions',
      {
        method: 'POST',
        headers: { 'X-Request-ID': 'request-1','Idempotency-Key': 'intent-1' },
        body: JSON.stringify(body),
      },
    );
  });

  it('rejects malformed collections, cross-target snapshots, and invalid revisions', async () => {
    vi.mocked(request).mockResolvedValueOnce({ interactions: [fixture()] });
    await expect(listOpenGroundStationInteractions('local')).rejects.toThrow('Expected an interaction collection');

    vi.mocked(request).mockResolvedValueOnce([fixture({ targetScope: 'agent-a' })]);
    await expect(listOpenGroundStationInteractions('local')).rejects.toThrow('Invalid ground-station interaction');

    await expect(actOnGroundStationInteraction('local', 'interaction-1', {
      action: 'approved',expectedRevision: 0,requestId: 'r',idempotencyKey: 'r',
    })).rejects.toThrow('positive expected interaction revision');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('requires the canonical action response envelope', async () => {
    vi.mocked(request).mockResolvedValueOnce(fixture({ status: 'resolved',revision: 2 }));

    await expect(actOnGroundStationInteraction('local', 'interaction-1', {
      action: 'approved',expectedRevision: 1,requestId: 'request-1',idempotencyKey: 'intent-1',
    })).rejects.toThrow('Invalid ground-station interaction action response');
  });

  it('recognizes typed and message-based revision conflicts', () => {
    expect(isGroundStationInteractionCASConflict(new HTTPError(409, 'Conflict'))).toBe(true);
    expect(isGroundStationInteractionCASConflict(new Error('409 revision conflict'))).toBe(true);
    expect(isGroundStationInteractionCASConflict(new HTTPError(400, 'Bad Request'))).toBe(false);
  });
});

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
    title: 'Ready',
    message: 'The ground station is ready.',
    payload: { message: { durationMs: 6_000 } },
    origin: { type: 'system',ref: 'core' },
    audience: { scope: 'all' },
    createdAt: '2026-07-15T09:00:00Z',
    updatedAt: '2026-07-15T09:00:00Z',
    ...patch,
  };
}
