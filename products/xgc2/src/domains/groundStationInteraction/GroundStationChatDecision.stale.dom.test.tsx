// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundStationInteractionContext } from './GroundStationInteractionContext';
import { GroundStationDecisionChatCard } from './GroundStationChatDecision';
import { useGroundStationInteractions } from './useGroundStationInteractions';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import type * as ExecutionPublic from '../execution/executionPublic';
import type * as InteractionService from './groundStationInteractionService';

const inventory = vi.hoisted(() => ({ open: vi.fn(), recent: vi.fn() }));
vi.mock('../execution/executionPublic', async importOriginal => ({
  ...await importOriginal<typeof ExecutionPublic>(),
  useExecutionEventChannel: () => ({ streamId: 'test-inventory', streamState: 'connected' }),
}));
vi.mock('./groundStationInteractionService', async importOriginal => ({
  ...await importOriginal<typeof InteractionService>(),
  listOpenGroundStationInteractions: inventory.open,
  listRecentGroundStationInteractions: inventory.recent,
}));
vi.mock('../operatorAccess/operatorAccessPublic', async (importOriginal) => ({
  ...(await importOriginal() as object),
  ensureOperatorControlSession: async () => true,
  operatorControlSessionReady: () => true,
  useOperatorControlSession: () => ({ phase: 'ready', ensuring: false, blocked: false, retry: vi.fn() }),
  OperatorControlSessionNotice: () => null,
}));
function pending(): GroundStationDecisionInteraction {
  const value = decodeGroundStationInteraction({
    schemaVersion: 1, targetScope: 'local', revision: 1, status: 'open', severity: 'warning',
    id: 'stale-approval', kind: 'decision', presentation: 'panel', responseMode: 'decision',
    title: 'Confirm Arm', message: 'Confirm Arm for PX4 robots ["px4-01","px4-02"]?',
    createdAt: new Date(Date.now() - 301_000).toISOString(), updatedAt: new Date(Date.now() - 301_000).toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(), audience: { scope: 'all' },
    payload: { decision: { approveLabel: 'Confirm', rejectLabel: 'Cancel', requireReason: false } },
    origin: { type: 'automation', ref: 'px4-control' },
  });
  if (!value || value.kind !== 'decision') throw new Error('Invalid fixture');
  return value;
}
function Surface() {
  const interactions = useGroundStationInteractions('local');
  const interaction = interactions.chatDecisions.find(item => item.id === 'stale-approval');
  return <GroundStationInteractionContext.Provider value={{ interactions, activityPanelCount: 1, notificationCenterOpen: false, setNotificationCenterOpen: () => undefined }}>
    {interaction ? <GroundStationDecisionChatCard interaction={interaction} onRespond={interactions.respond} presentation="panel" /> : null}
  </GroundStationInteractionContext.Provider>;
}
beforeEach(() => { inventory.open.mockReset(); inventory.recent.mockReset(); });
afterEach(cleanup);
describe('stale GCS authorization uses the real inventory owner', () => {
  it('adds a warning without replacing the P90 action-row ring, then refreshes open and recent stock', async () => {
    const interaction = pending();
    inventory.open.mockResolvedValue([interaction]);
    inventory.recent.mockResolvedValue([]);
    const view = render(<Surface />);
    await screen.findByText('This approval request may have expired');
    const ring = view.container.querySelector('[data-xgc-role="ground-station-decision-deadline"][data-xgc-variant="ring"]');
    expect(ring).toBeTruthy();
    expect(ring?.parentElement?.lastElementChild).toBe(ring);
    expect(view.container.querySelectorAll('[data-xgc-role="ground-station-chat-decision-approve"]')).toHaveLength(1);
    const before = inventory.open.mock.calls.length;
    inventory.open.mockResolvedValue([]);
    inventory.recent.mockResolvedValue([{ ...interaction, status: 'expired', revision: 2, updatedAt: new Date().toISOString() }]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(inventory.open).toHaveBeenCalledTimes(before + 1));
    await waitFor(() => expect(view.container.querySelector('[data-xgc-stale]')).toBeNull());
    expect(inventory.open).toHaveBeenLastCalledWith('local', { signal: undefined });
    expect(inventory.recent).toHaveBeenLastCalledWith('local', { signal: undefined });
    expect(view.container.querySelectorAll('[data-xgc-role="ground-station-chat-decision-resolved"]')).toHaveLength(1);
  });
  it('keeps the existing request and exposes refresh failure instead of fabricating a terminal', async () => {
    inventory.open.mockResolvedValue([pending()]);
    inventory.recent.mockResolvedValue([]);
    const view = render(<Surface />);
    await screen.findByText('This approval request may have expired');
    inventory.open.mockRejectedValue(new Error('Inventory unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Inventory unavailable');
    expect(view.container.querySelector('[data-xgc-stale="true"]')).toBeTruthy();
    expect(view.container.querySelector('[data-xgc-role="ground-station-chat-decision-resolved"]')).toBeNull();
  });
});
