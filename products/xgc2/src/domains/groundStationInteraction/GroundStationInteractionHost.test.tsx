// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { GroundStationInteractionHost } from './GroundStationInteractionHost';
import { GroundStationActivityPanel } from './GroundStationActivityPanel';
import { GroundStationInteractionProvider } from './GroundStationInteractionProvider';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type { GroundStationInteraction } from './groundStationInteractionTypes';
import { dismissLocalGroundStationNotification,publishLocalGroundStationNotification } from './localGroundStationNotifications';

const interactionFeedMock = vi.hoisted(() => ({
  value: {} as Record<string,unknown>,
  dismissLocal: vi.fn(),
  dismiss: vi.fn(),
  respond: vi.fn(),
}));

vi.mock('./useGroundStationInteractions', () => ({
  useGroundStationInteractions: () => interactionFeedMock.value,
}));

describe('GroundStationInteractionHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    interactionFeedMock.dismiss.mockImplementation(async (interaction: GroundStationInteraction) => interaction);
    interactionFeedMock.respond.mockImplementation(async (interaction: GroundStationInteraction) => interaction);
    interactionFeedMock.value = interactionFeed();
  });

  it('keeps the application host non-blocking without synthesizing a chat fallback', () => {
    const view = renderHost();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="app-shell"]')).not.toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Open ground station chat' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-chat-launcher"]')).toBeNull();
    expect(document.querySelector('[data-xgc-presentation="overlay"]')).toBeNull();
  });

  it('keeps global toasts available when an Experiment dashboard owns the chat panel', () => {
    render(
      <div data-xgc-role="app-shell">
        <GroundStationInteractionHost targetId="local" showDecisionDialog={false} />
      </div>,
    );

    expect(document.querySelector('[data-xgc-role="ground-station-interaction-host"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open ground station chat' })).toBeNull();
  });

  it('uses a mounted dashboard activity panel for a direct yes-or-no decision instead of opening a fallback dialog', async () => {
    const decision = interaction({
      id: 'decision-dashboard',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm landing',message: 'Land the selected aircraft now?',
      payload: { decision: { approveLabel: 'Yes',rejectLabel: 'No',requireReason: false } },
      expiresAt: '2099-07-15T09:05:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });

    render(
      <GroundStationInteractionProvider targetId="local">
        <div data-xgc-role="app-shell">
          <GroundStationInteractionHost targetId="local" />
          <GroundStationActivityPanel targetId="local" />
        </div>
      </GroundStationInteractionProvider>,
    );

    const panel = screen.getByRole('complementary', { name: 'Ground station chat' });
    expect(panel).toHaveAttribute('data-xgc-presentation', 'panel');
    expect(document.querySelector('[data-xgc-presentation="overlay"]')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(panel).getByText('Land the selected aircraft now?')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(interactionFeedMock.respond).toHaveBeenCalledWith(decision, 'approved', {}));
  });

  it('never synthesizes fallback chat when an activity panel mounts or unmounts', () => {
    const view = render(
      <div data-xgc-role="app-shell">
        <GroundStationInteractionHost targetId="local" />
        <GroundStationInteractionProvider targetId="local">
          <GroundStationActivityPanel targetId="local" />
        </GroundStationInteractionProvider>
      </div>,
    );

    expect(screen.queryByRole('button', { name: 'Open ground station chat' })).toBeNull();

    view.rerender(
      <div data-xgc-role="app-shell">
        <GroundStationInteractionHost targetId="local" />
      </div>,
    );
    expect(screen.queryByRole('button', { name: 'Open ground station chat' })).toBeNull();
    expect(document.querySelector('[data-xgc-presentation="overlay"]')).toBeNull();
  });

  it('moves a still-pending dashboard decision to the centered fallback dialog when its panel unmounts', async () => {
    const decision = interaction({
      id: 'decision-background',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm return home',message: 'Return the aircraft to home now?',
      payload: { decision: { approveLabel: 'Yes',rejectLabel: 'No',requireReason: false } },
      expiresAt: '2099-07-15T09:05:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    const view = render(
      <GroundStationInteractionProvider targetId="local">
        <GroundStationInteractionHost targetId="local" />
        <GroundStationActivityPanel targetId="local" />
      </GroundStationInteractionProvider>,
    );

    expect(screen.queryByRole('alertdialog')).toBeNull();
    view.rerender(
      <GroundStationInteractionProvider targetId="local">
        <GroundStationInteractionHost targetId="local" />
      </GroundStationInteractionProvider>,
    );

    expect(await screen.findByRole('alertdialog', { name: 'Confirm return home' })).toHaveTextContent('Return the aircraft to home now?');
  });

  it('keeps critical messages visible until locally hidden without mutating the producer', async () => {
    const toast = interaction({ title: 'Bridge ready',message: '<img src=x onerror=alert(1)> Ready',severity: 'critical' });
    interactionFeedMock.value = interactionFeed({ toasts: [toast] });
    renderHost();
    const card = document.querySelector<HTMLElement>('[data-xgc-role="ground-station-interaction-toast"]')!;
    expect(card).toHaveAttribute('role', 'alert');
    expect(card.querySelector('[data-tone="danger"]')).toHaveTextContent('Critical');
    expect(card).toHaveTextContent('<img src=x onerror=alert(1)> Ready');
    expect(card.querySelector('img')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hide notification · Bridge ready' }));
    expect(interactionFeedMock.dismiss).not.toHaveBeenCalled();
    expect(interactionFeedMock.dismissLocal).not.toHaveBeenCalled();

    act(() => card.dispatchEvent(new Event('animationend', { bubbles: true })));
    expect(interactionFeedMock.dismissLocal).not.toHaveBeenCalled();
  });

  it('renders and dismisses local panel failures through the same global toast host', () => {
    const published = publishLocalGroundStationNotification({
      targetId: 'local',title: 'Robot instruments',message: 'panel state rejected',source: 'robot-panel',dedupeKey: 'host-test',
    });
    renderHost();

    expect(screen.getByRole('alert')).toHaveTextContent('panel state rejected');
    fireEvent.click(screen.getByRole('button', { name: 'Hide notification · Robot instruments' }));
    expect(screen.queryByText('panel state rejected')).toBeNull();
    expect(interactionFeedMock.dismiss).not.toHaveBeenCalled();
    act(() => dismissLocalGroundStationNotification('local', published!.id));
  });

  it('keeps transient toast feedback out of the persistent global chat timeline', async () => {
    const message = interaction({ id: 'message-1',title: 'Launch sequence',message: 'Preflight checks started' });
    const status = interaction({
      id: 'status-1',kind: 'status',presentation: 'panel',title: 'Mission progress',
      payload: { status: { statusKey: 'mission',state: 'tracking',detail: 'Following path',progress: 0.5 } },
    });
    const context = interaction({
      id: 'context-1',kind: 'context',presentation: 'panel',title: 'Inspect UAV',
      payload: { context: { kind: 'robot',id: 'uav-1',subview: 'telemetry',actionLabel: 'View telemetry' } },
    });
    interactionFeedMock.value = interactionFeed({ toasts: [message],statusCards: [status],contextOffers: [context] });
    renderHostWithPanel();

    const chat = screen.getByRole('complementary', { name: 'Ground station chat' });
    expect(within(chat).getByRole('log', { name: 'Current ground station activity' })).not.toHaveTextContent('Preflight checks started');
    expect(within(chat).getByRole('progressbar', { name: 'Mission progress progress' })).toBeInTheDocument();
    expect(within(chat).queryByText('Mission progress · tracking 50%')).toBeNull();
    expect(within(chat).getByRole('button', { name: 'View telemetry' })).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast-stack"]')).toHaveTextContent('Preflight checks started');
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-status-dock"]')).toBeNull();
    // A composer is present only when a real delivery handler is connected.
    expect(within(chat).queryByRole('textbox', { name: 'Message the ground station' })).toBeNull();
    expect(within(chat).queryByText(/Activity only/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hide notification · Launch sequence' }));
    expect(interactionFeedMock.dismiss).not.toHaveBeenCalled();
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-toast"]')).toBeNull();
  });

  it('opens a centered fallback dialog for a pending decision and submits a typed response', async () => {
    const decision = interaction({
      id: 'decision-chat',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm unlock',message: 'Unlock the selected aircraft?',
      payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel',requireReason: false } },
      expiresAt: '2099-07-15T09:05:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    renderHost();

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm unlock' });
    expect(dialog).toHaveTextContent('Unlock the selected aircraft?');
    expect(document.querySelector('[aria-modal="true"]')).toBe(dialog);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(interactionFeedMock.respond).toHaveBeenCalledWith(decision, 'approved', {}));
  });

  it('projects the authoritative response as an operator bubble using the selected button label', () => {
    const decision = interaction({
      id: 'decision-resolved',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm unlock',message: 'Unlock the selected aircraft?',
      payload: { decision: { approveLabel: '确认',rejectLabel: '取消',requireReason: false } },
      status: 'resolved',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      response: { action: 'approved',actor: 'station-a',at: '2026-07-15T09:01:00Z' },
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    renderHostWithPanel();

    const response = document.querySelector<HTMLElement>('[data-xgc-role="ground-station-chat-operator-response"]')!;
    expect(response).toHaveTextContent('station-a');
    expect(response).toHaveTextContent('确认');
    expect(within(response).queryByRole('button')).toBeNull();
  });

  it('keeps a decision pending during submission and exposes a recoverable CAS error in the card', async () => {
    const decision = interaction({
      id: 'decision-cas',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm mode change',message: 'Continue?',
      payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel' } },expiresAt: '2099-07-15T09:05:00Z',
    });
    let rejectResponse: (cause: Error) => void = () => undefined;
    interactionFeedMock.respond.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectResponse = reject; }));
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    renderHost();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute('aria-busy', 'true');
    await act(async () => rejectResponse(new Error('This ground-station request changed before your response was applied.')));

    expect(await screen.findByRole('alert')).toHaveTextContent('request changed');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('does not apply a stale response failure to a newer revision of the same decision', async () => {
    const earlier = interaction({
      id: 'decision-revised',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm route',message: 'Apply route revision one?',
      payload: { decision: { approveLabel: 'Apply revision one',rejectLabel: 'Cancel',requireReason: false } },
      expiresAt: '2099-07-15T09:05:00Z',
    });
    let rejectEarlier: (cause: Error) => void = () => undefined;
    interactionFeedMock.respond.mockImplementationOnce(() => new Promise((_resolve,reject) => { rejectEarlier = reject; }));
    interactionFeedMock.value = interactionFeed({ chatDecisions: [earlier] });
    const view = renderHost();

    fireEvent.click(screen.getByRole('button', { name: 'Apply revision one' }));
    expect(screen.getByRole('button', { name: 'Apply revision one' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply revision one' })).toHaveAttribute('aria-busy', 'true');

    const current = interaction({
      id: 'decision-revised',revision: 2,kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm route',message: 'Apply route revision two?',
      payload: { decision: { approveLabel: 'Apply revision two',rejectLabel: 'Cancel',requireReason: false } },
      expiresAt: '2099-07-15T09:05:00Z',updatedAt: '2026-07-15T09:01:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [current] });
    view.rerender(
      <div data-xgc-role="app-shell">
        <main>Current ground station page</main>
        <GroundStationInteractionHost targetId="local" />
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Apply revision two' })).toBeEnabled();

    await act(async () => rejectEarlier(new Error('stale revision failed')));
    expect(screen.queryByText('stale revision failed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Apply revision two' })).toBeEnabled();
  });

  it('submits an optional operator note as structured decision metadata', async () => {
    const decision = interaction({
      id: 'decision-note',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm reboot',message: 'Continue?',
      payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel',requireReason: false } },expiresAt: '2099-07-15T09:05:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    renderHost();

    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Operator note' }), { target: { value: 'Aircraft is disarmed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(interactionFeedMock.respond).toHaveBeenCalledWith(decision, 'approved', { reason: 'Aircraft is disarmed' }));
  });

  it('shows local expiry on the original card without a second system message', () => {
    const decision = interaction({
      id: 'decision-expired',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm takeoff',message: 'Continue?',payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel' } },
      expiresAt: '2020-07-15T09:01:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    renderHostWithPanel();

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-chat-decision-terminal"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="ground-station-decision-response-state"][data-xgc-id="decision-expired"]')).toHaveTextContent('Expired');
    expect(interactionFeedMock.respond).not.toHaveBeenCalled();
  });

  it('lets an activity panel suppress only its own target\'s fallback decision dialog', () => {
    const decision = interaction({
      id: 'decision-target',kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
      title: 'Confirm target action',message: 'Continue on the local target?',
      payload: { decision: { approveLabel: 'Continue',rejectLabel: 'Cancel',requireReason: false } },
      expiresAt: '2099-07-15T09:05:00Z',
    });
    interactionFeedMock.value = interactionFeed({ chatDecisions: [decision] });
    const view = render(
      <div data-xgc-role="app-shell">
        <GroundStationActivityPanel targetId="agent-a" />
        <GroundStationInteractionHost targetId="local" />
      </div>,
    );

    // A panel watching another target must not answer for this one.
    expect(screen.getByRole('alertdialog', { name: 'Confirm target action' })).toBeInTheDocument();

    view.rerender(
      <div data-xgc-role="app-shell">
        <GroundStationActivityPanel targetId="local" />
        <GroundStationInteractionHost targetId="local" />
      </div>,
    );
    expect(screen.queryByRole('alertdialog', { name: 'Confirm target action' })).toBeNull();
  });

  it('does not synthesize a launcher for coalesced status revisions without a panel', () => {
    const running = interaction({
      id: 'status-1',kind: 'status',presentation: 'panel',title: 'Mission progress',
      payload: { status: { statusKey: 'mission',state: 'running',detail: 'Following path' } },
    });
    interactionFeedMock.value = interactionFeed({ statusCards: [running] });
    const view = renderHost();
    expect(document.querySelector('[data-xgc-role="ground-station-chat-launcher"]')).toBeNull();

    const failed = interaction({
      id: 'status-1',revision: 2,updatedAt: '2026-07-15T09:01:00Z',severity: 'error',
      kind: 'status',presentation: 'panel',title: 'Mission progress',
      payload: { status: { statusKey: 'mission',state: 'failed',detail: 'Path tracking failed' } },
    });
    interactionFeedMock.value = interactionFeed({ statusCards: [failed] });
    view.rerender(
      <div data-xgc-role="app-shell">
        <main>Current ground station page</main>
        <GroundStationInteractionHost targetId="local" />
      </div>,
    );

    expect(document.querySelector('[data-xgc-role="ground-station-chat-launcher"]')).toBeNull();
    expect(document.querySelector('[data-xgc-presentation="overlay"]')).toBeNull();
  });

  it('renders coalesced status and opens semantic context only after an explicit operator action', async () => {
    const status = interaction({
      id: 'status-1',kind: 'status',presentation: 'panel',title: 'Mission progress',
      payload: { status: { statusKey: 'mission',state: 'tracking',detail: 'Following path',progress: 0.5 } },
    });
    const context = interaction({
      id: 'context-1',kind: 'context',presentation: 'panel',title: 'Inspect UAV',
      payload: { context: { kind: 'robot',id: 'uav-1',subview: 'telemetry',actionLabel: 'View telemetry' } },
    });
    const onOpenContext = vi.fn().mockResolvedValue(true);
    if (context.kind !== 'context') throw new Error('invalid context fixture');
    interactionFeedMock.value = interactionFeed({ statusCards: [status],contextOffers: [context] });
    renderHostWithPanel(onOpenContext);

    const chat = screen.getByRole('complementary', { name: 'Ground station chat' });
    expect(document.querySelector('[data-xgc-role="ground-station-interaction-status-dock"]')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Mission progress progress' })).toBeInTheDocument();
    expect(onOpenContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'View telemetry' }));
    await waitFor(() => expect(onOpenContext).toHaveBeenCalledWith(context.payload.context, context));
    expect(interactionFeedMock.dismiss).not.toHaveBeenCalled();

    expect(within(chat).queryByText('Mission progress · tracking 50%')).toBeNull();
  });
});

function renderHost() {
  return render(
    <div data-xgc-role="app-shell">
      <main>Current ground station page</main>
      <GroundStationInteractionHost targetId="local" />
    </div>,
  );
}

function renderHostWithPanel(
  onOpenContext?: Parameters<typeof GroundStationInteractionProvider>[0]['onOpenContext'],
) {
  return render(
    <GroundStationInteractionProvider targetId="local" onOpenContext={onOpenContext}>
      <div data-xgc-role="app-shell">
        <main>Current ground station page</main>
        <GroundStationInteractionHost targetId="local" />
        <GroundStationActivityPanel targetId="local" />
      </div>
    </GroundStationInteractionProvider>,
  );
}

function interactionFeed(overrides: Record<string,unknown> = {}) {
  return {
    targetId: 'local',
    targetScope: 'local',
    streamState: 'connected',
    loading: false,
    inventoryError: '',
    inventory: ['toasts','chatDecisions','statusCards','contextOffers'].flatMap((key) => (overrides[key] as GroundStationInteraction[] | undefined) ?? []),
    toasts: [],
    chatDecisions: [],
    statusCards: [],
    contextOffers: [],
    dismissLocal: interactionFeedMock.dismissLocal,
    dismiss: interactionFeedMock.dismiss,
    respond: interactionFeedMock.respond,
    ...overrides,
  };
}

function interaction(patch: Record<string,unknown> = {}): GroundStationInteraction {
  const value = decodeGroundStationInteraction({
    schemaVersion: 1,
    id: 'toast-1',
    targetScope: 'local',
    revision: 1,
    status: 'open',
    kind: 'message',
    presentation: 'toast',
    responseMode: 'none',
    severity: 'info',
    title: 'Bridge ready',
    message: 'Ready',
    payload: { message: {} },
    origin: { type: 'automation',displayName: 'Mission workflow',nodeId: 'notify' },
    audience: { scope: 'all' },
    createdAt: '2026-07-15T09:00:00Z',
    updatedAt: new Date().toISOString(),
    ...patch,
  });
  if (!value) throw new Error('invalid test interaction');
  return value;
}
