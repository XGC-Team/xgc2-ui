// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorAccessError } from './operatorAccessService';
import type { OperatorIdentity } from './operatorAccessTypes';
import {
  ensureOperatorControlSession,
  getOperatorControlSessionSnapshot,
  noteOperatorSessionEnded,
  probeOperatorControlSession,
  resetOperatorControlSession,
} from './operatorControlSession';

const { establish, currentIdentity, confirmTransport, unauthorizedListeners } = vi.hoisted(() => ({
  establish: vi.fn<() => Promise<OperatorIdentity>>(),
  currentIdentity: vi.fn<() => Promise<OperatorIdentity>>(),
  confirmTransport: vi.fn(),
  unauthorizedListeners: new Set<() => void>(),
}));

vi.mock('../../api/http', async () => ({
  ...(await vi.importActual('../../api/http')),
  // Collapse the backoff so retry timing is not what these tests assert.
  waitForTransportRetry: () => Promise.resolve(),
}));

vi.mock('./operatorAccessService', async () => ({
  ...(await vi.importActual('./operatorAccessService')),
  establishOperatorSessionWithRetry: establish,
  getOperatorIdentity: currentIdentity,
  confirmOperatorTransport: confirmTransport,
  subscribeOperatorSessionCheck: (listener: () => void) => {
    unauthorizedListeners.add(listener);
    return () => { unauthorizedListeners.delete(listener); };
  },
}));

const session = { authenticated: true as const, transport: 'operator-cookie' as const, stationId: 'station-main', name: 'Main', role: 'owner', capabilities: ['core.view'], visibleCores: ['local'], canPair: false };
const signedOut = { authenticated: false as const, canPair: false as const };

function reportUnauthorized() {
  for (const listener of unauthorizedListeners) listener();
}

describe('operator control session fencing', () => {
  beforeEach(() => {
    establish.mockReset();
    currentIdentity.mockReset();
    confirmTransport.mockReset();
    resetOperatorControlSession();
  });
  afterEach(() => { resetOperatorControlSession(); });

  it('establishes the session once and confirms the transport for later requests', async () => {
    establish.mockResolvedValue(session);
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    expect(getOperatorControlSessionSnapshot().phase).toBe('ready');
    expect(confirmTransport).toHaveBeenCalledWith('operator-cookie');
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    expect(establish).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable station as unavailable, never as denied, and recovers on retry', async () => {
    establish.mockRejectedValue(new TypeError('network down'));
    await expect(ensureOperatorControlSession()).resolves.toBe(false);
    expect(establish).toHaveBeenCalledTimes(1);
    expect(getOperatorControlSessionSnapshot().phase).toBe('unavailable');
    establish.mockResolvedValue(session);
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    expect(getOperatorControlSessionSnapshot().phase).toBe('ready');
  });

  it('denies control on a definitive 401/403 from the session authority', async () => {
    establish.mockRejectedValue(new OperatorAccessError(403, 'local session requires an unmixed verified local Origin'));
    await expect(ensureOperatorControlSession()).resolves.toBe(false);
    expect(establish).toHaveBeenCalledTimes(1);
    expect(getOperatorControlSessionSnapshot().phase).toBe('denied');
  });

  it('denies control when the authority answers with a signed-out identity', async () => {
    establish.mockResolvedValue(signedOut);
    await expect(ensureOperatorControlSession()).resolves.toBe(false);
    expect(getOperatorControlSessionSnapshot().phase).toBe('denied');
  });

  it('keeps a ready session through stray business-endpoint 401s while the identity stays valid', async () => {
    establish.mockResolvedValue(session);
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    currentIdentity.mockResolvedValue(session);
    reportUnauthorized();
    await waitFor(() => expect(currentIdentity).toHaveBeenCalledTimes(1));
    expect(getOperatorControlSessionSnapshot().phase).toBe('ready');
  });

  it('keeps a ready session when the revalidation itself fails (unknown)', async () => {
    establish.mockResolvedValue(session);
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    currentIdentity.mockRejectedValue(new OperatorAccessError(401, 'expired'));
    reportUnauthorized();
    await waitFor(() => expect(currentIdentity).toHaveBeenCalledTimes(1));
    expect(getOperatorControlSessionSnapshot().phase).toBe('ready');
    // A report arriving while the previous revalidation runs is coalesced.
    await flushMicrotasks();
    currentIdentity.mockRejectedValue(new TypeError('network down'));
    reportUnauthorized();
    await waitFor(() => expect(currentIdentity).toHaveBeenCalledTimes(2));
    expect(getOperatorControlSessionSnapshot().phase).toBe('ready');
  });

  it('ends the session only on a successful signed-out answer from the authority', async () => {
    establish.mockResolvedValue(session);
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    currentIdentity.mockResolvedValue(signedOut);
    reportUnauthorized();
    await waitFor(() => expect(getOperatorControlSessionSnapshot().phase).toBe('denied'));
    // Control can be re-established inline after the denial.
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    expect(getOperatorControlSessionSnapshot().phase).toBe('ready');
  });

  it('ignores stray 401s before any control session exists', async () => {
    reportUnauthorized();
    await Promise.resolve();
    expect(currentIdentity).not.toHaveBeenCalled();
    expect(getOperatorControlSessionSnapshot().phase).toBe('idle');
  });

  it('startup probe only confirms transport and never establishes or blocks', async () => {
    currentIdentity.mockResolvedValue({ ...session, transport: 'local' });
    probeOperatorControlSession();
    await waitFor(() => expect(confirmTransport).toHaveBeenCalledWith('local'));
    expect(establish).not.toHaveBeenCalled();
    expect(getOperatorControlSessionSnapshot().phase).toBe('idle');
    currentIdentity.mockRejectedValue(new TypeError('network down'));
    probeOperatorControlSession();
    await waitFor(() => expect(currentIdentity).toHaveBeenCalledTimes(2));
    expect(getOperatorControlSessionSnapshot().phase).toBe('idle');
  });

  it('a deliberate sign-out ends the control session without a round trip', async () => {
    establish.mockResolvedValue(session);
    await expect(ensureOperatorControlSession()).resolves.toBe(true);
    noteOperatorSessionEnded();
    expect(getOperatorControlSessionSnapshot().phase).toBe('denied');
  });
});

async function waitFor(assertion: () => void) {
  await vi.waitFor(assertion);
}

async function flushMicrotasks() {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
}
