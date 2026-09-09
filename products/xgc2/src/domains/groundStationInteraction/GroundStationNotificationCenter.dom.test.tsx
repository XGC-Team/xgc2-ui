// @vitest-environment jsdom
import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { GroundStationInteractionProvider } from './GroundStationInteractionProvider';
import { GroundStationInteractionHost,GroundStationLocalNotificationHost } from './GroundStationInteractionHost';
import { useState } from 'react';
import { GroundStationNotificationCenter } from './GroundStationNotificationCenter';
import { GroundStationActivityPanel } from './GroundStationActivityPanel';
import { GroundStationActivityScopeProvider } from './groundStationActivityScope';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import { hideGroundStationNotification } from './groundStationAttention';
import type { GroundStationNativeAttentionItem } from './GroundStationNativeAgentProvider';
import { dismissLocalGroundStationNotification,publishLocalGroundStationNotification } from './localGroundStationNotifications';

const feed = vi.hoisted(() => ({ decisions: [] as GroundStationDecisionInteraction[],respond: vi.fn(),dismiss: vi.fn() }));
const native = vi.hoisted(() => ({ items: [] as GroundStationNativeAttentionItem[],answer: vi.fn() }));
vi.mock('./GroundStationNativeAgentProvider', () => ({
  useGroundStationNativeAttention: () => native,
  useGroundStationNativeAgentRegistry: () => null,
}));
vi.mock('./useGroundStationInteractions', () => ({ useGroundStationInteractions: (targetId: string) => ({
  targetId,targetScope: 'local',inventory: feed.decisions,chatDecisions: feed.decisions,
  statusCards: [],contextOffers: [],toasts: [],streamState: 'connected',inventoryError: '',
  loading: false,respond: feed.respond,dismiss: feed.dismiss,dismissLocal: vi.fn(),
}) }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  feed.decisions = [decision('arm', 'experiment-a')];
  feed.respond.mockImplementation(async (item) => item);
  native.items = [];
  native.answer.mockResolvedValue(undefined);
});

describe('global interaction attention', () => {
  it('keeps the pending request reachable without a popup covering the open drawer', () => {
    renderSurface();
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View and handle' }));
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast"]')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(feed.respond).not.toHaveBeenCalled();
    expect(feed.dismiss).not.toHaveBeenCalled();
  });

  it('opens retained local notifications when no execution subscription is available', () => {
    const published = publishLocalGroundStationNotification({ targetId: 'offline-target',title: 'Download failed',
      message: 'The recording could not be downloaded.',source: 'recording-test' });
    function LocalSurface() {
      const [open,setOpen] = useState(false);
      return <><GroundStationNotificationCenter targetId="offline-target" open={open} onOpenChange={setOpen} />
        <GroundStationLocalNotificationHost notificationCenterOpen={open} onViewNotifications={() => setOpen(true)} /></>;
    }
    try {
      render(<LocalSurface />);
      fireEvent.click(screen.getByRole('button', { name: 'View details' }));
      expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast"]')).toBeNull();
      expect(within(screen.getByRole('dialog')).getByText('Download failed')).toBeInTheDocument();
    } finally { if (published) act(() => dismissLocalGroundStationNotification('offline-target',published.id)); }
  });

  it('routes native decisions back to their session while workflow decisions stay independent', async () => {
    native.items = [{ id: 'session-a:request-a',experimentId: 'experiment-a',sessionId: 'session-a',submitted: false,
      request: { id: 'request-a',kind: 'permission',title: 'Inspect experiment logs',options: [
        { id: 'decline',label: 'Decline inspection',kind: 'reject' },
      ],questions: [] } }];
    renderSurface();
    fireEvent.click(screen.getByRole('button', { name: /Notifications · Pending 2/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Decline inspection' }));
    await waitFor(() => expect(native.answer).toHaveBeenCalledWith(native.items[0],{ optionId: 'decline' }));
    expect(feed.respond).not.toHaveBeenCalled();
    expect(feed.dismiss).not.toHaveBeenCalled();
  });

  it('retains native input when source navigation fails', async () => {
    native.items = [{ id: 'session-b:request-b',experimentId: 'experiment-b',sessionId: 'session-b',submitted: false,
      request: { id: 'request-b',kind: 'question',title: 'Choose a log interval',options: [],questions: [] } }];
    const openSource = vi.fn().mockResolvedValue(false);
    render(<GroundStationNotificationCenter targetId="agent-remote" onOpenNativeSource={openSource} />);
    fireEvent.click(screen.getByRole('button', { name: /Notifications · Pending 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'View source' }));
    await screen.findByText('Notification source is unavailable');
    expect(openSource).toHaveBeenCalledWith('experiment-b');
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeEnabled();
    expect(native.answer).not.toHaveBeenCalled();
  });

  it('keeps submitted native requests reachable and disabled until provider resolution', async () => {
    const item: GroundStationNativeAttentionItem = { id: 'session-a:request-a',experimentId: 'experiment-a',
      sessionId: 'session-a',submitted: false,request: { id: 'request-a',kind: 'permission',
        title: 'Inspect retained evidence',options: [{ id: 'decline',label: 'Decline inspection',kind: 'reject' }],questions: [] } };
    native.items = [item];
    const openSource = vi.fn().mockResolvedValue(false);
    const surface = (open: boolean) => <GroundStationNotificationCenter targetId="local" open={open}
      onOpenNativeSource={openSource} />;
    const view = render(surface(true));
    const entrySelector = '[data-xgc-role="ground-station-native-notification"][data-xgc-id="session-a:request-a"]';
    const entry = () => {
      const element = document.querySelector<HTMLElement>(entrySelector);
      if (!element) throw new Error('The unresolved native request must remain reachable.');
      return within(element);
    };
    fireEvent.click(entry().getByRole('button', { name: 'Decline inspection' }));
    await waitFor(() => expect(native.answer).toHaveBeenCalledWith(item,{ optionId: 'decline' }));

    // A delivery receipt is not a provider resolution, including after remounting the drawer.
    native.items = [{ ...item,submitted: true }];
    view.rerender(surface(false));
    expect(document.querySelector(entrySelector)).toBeNull();
    expect(screen.getByRole('button', { name: /Notifications · Pending 1/ })).toBeInTheDocument();
    view.rerender(surface(true));
    expect(entry().getByRole('group', { name: 'Inspect retained evidence' })).toHaveTextContent('Inspect retained evidence');
    expect(entry().getByRole('button', { name: 'Decline inspection' })).toBeDisabled();
    expect(entry().getByRole('button', { name: 'Cancel request' })).toBeDisabled();
    fireEvent.click(entry().getByRole('button', { name: 'Decline inspection' }));
    fireEvent.click(entry().getByRole('button', { name: 'View source' }));
    await screen.findByText('Notification source is unavailable');
    expect(openSource).toHaveBeenCalledWith('experiment-a');
    expect(document.querySelector(entrySelector)).toBeInTheDocument();
    expect(native.answer).toHaveBeenCalledTimes(1);
    expect(feed.respond).not.toHaveBeenCalled();
    expect(feed.dismiss).not.toHaveBeenCalled();

    // Only the authoritative registry projection removes a resolved/expired request.
    native.items = [];
    view.rerender(surface(true));
    expect(document.querySelector(entrySelector)).toBeNull();
    expect(screen.queryByRole('button', { name: /Notifications · Pending/ })).toBeNull();
    expect(screen.getByText('No pending requests')).toBeInTheDocument();
    expect(native.answer).toHaveBeenCalledTimes(1);
  });

  it('retains off-page decisions after hiding the popup and reopening the page', async () => {
    const view = renderSurface();
    fireEvent.click(screen.getByRole('button', { name: 'Hide notification · Confirm arm' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(feed.respond).not.toHaveBeenCalled();
    expect(feed.dismiss).not.toHaveBeenCalled();
    view.unmount();
    renderSurface();
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Notifications · Pending 1/ }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Area clear?')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Mark as read' }));
    expect(screen.getByRole('button', { name: /Notifications · Pending 1/ })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(feed.respond).toHaveBeenCalledWith(feed.decisions[0], 'rejected', {}));
  });

  it('keeps an experiment panel scoped while all pending requests remain globally reachable', () => {
    feed.decisions.push(decision('mode', 'experiment-b'));
    render(<GroundStationInteractionProvider targetId="local">
      <GroundStationNotificationCenter targetId="local" />
      <GroundStationActivityScopeProvider experimentId="experiment-a" visible>
        <GroundStationActivityPanel targetId="local" />
      </GroundStationActivityScopeProvider>
    </GroundStationInteractionProvider>);
    const chat = screen.getByRole('complementary');
    expect(within(chat).getByRole('article',{ name: 'Confirm arm' })).toBeInTheDocument();
    expect(within(chat).queryByRole('article',{ name: 'Confirm mode' })).toBeNull();
    expect(screen.getByRole('button', { name: /Notifications · Pending 2/ })).toBeInTheDocument();
  });

  it('does not transfer a viewer receipt between two Core endpoints sharing local scope', () => {
    act(() => hideGroundStationNotification(feed.decisions[0]!, 'core:other'));
    renderSurface();
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast"]')).toBeInTheDocument();
  });

  it('leaves the decision intact when its source cannot be opened', async () => {
    const onOpenSource = vi.fn().mockResolvedValue(false);
    renderSurface(onOpenSource);
    fireEvent.click(screen.getByRole('button', { name: /Notifications · Pending 1/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'View source' }));
    await screen.findByText('Notification source is unavailable');
    expect(feed.respond).not.toHaveBeenCalled();
    expect(feed.dismiss).not.toHaveBeenCalled();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});

function renderSurface(onOpenSource?: () => Promise<boolean>) {
  return render(<GroundStationInteractionProvider targetId="local" onOpenSource={onOpenSource}>
    <GroundStationNotificationCenter targetId="local" />
    <main>Another page</main>
    <GroundStationInteractionHost targetId="local" showDecisionDialog={false} />
  </GroundStationInteractionProvider>);
}

function decision(id: string, experimentId: string): GroundStationDecisionInteraction {
  const item = decodeGroundStationInteraction({ schemaVersion: 1,id,targetScope: 'local',revision: 1,
    status: 'open',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
    title: `Confirm ${id}`,message: 'Area clear?',origin: { type: 'automation',experimentId,runId: 'run-a' },
    audience: { scope: 'all' },createdAt: new Date().toISOString(),updatedAt: new Date().toISOString(),
    payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel',requireReason: false } },
  });
  if (item?.kind !== 'decision') throw new Error('invalid fixture');
  return item;
}
