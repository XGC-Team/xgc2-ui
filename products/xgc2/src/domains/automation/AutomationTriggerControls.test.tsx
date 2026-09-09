// @vitest-environment jsdom

import { act,fireEvent,render,waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationTriggerControls } from './AutomationTriggerControls';
import type {
  AutomationActivation,
  AutomationTestListener,
  AutomationTriggerEventReceipt,
} from './automationTriggerContracts';

describe('AutomationTriggerControls', () => {
  it('keeps manual execution in the topbar and renders no controls for called workflows', () => {
    const manual = renderControls('trigger.manual');
    expect(manual.view.container).toBeEmptyDOMElement();
    manual.view.unmount();

    // The entrypoint selector already labels call-only workflows "When called";
    // repeating that as a callout would duplicate the same fact.
    const called = renderControls('trigger.automation-call', { embedded: true });
    expect(called.view.container.querySelector('[data-xgc-role="automation-call-only-info"]')).toBeNull();
    expect(called.view.container).not.toHaveTextContent('Called by parent workflow');
    expect(called.view.container.querySelector('[data-xgc-role="automation-trigger-activate"]')).toBeNull();
    expect(called.view.container.querySelector('[data-xgc-role="automation-trigger-run-once"]')).toBeNull();
    expect(called.view.container.querySelector('[data-xgc-role="automation-test-listener-start"]')).toBeNull();

    const shell = renderControls('trigger.automation-call');
    expect(shell.view.container).toBeEmptyDOMElement();
  });

  it('keeps schedule Run once independent from activation and shows pinned-version drift', async () => {
    const activation = activationFixture();
    const controls = renderControls('trigger.schedule', {
      activation,
      activationCredential: { publicId: 'production-public',token: 'production-token-once' },
      draftDiffersFromActivation: true,
    });
    const { container } = controls.view;

    expect(container.querySelector('[data-xgc-role="automation-trigger-run-once"][data-xgc-id="start"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-deactivate"][data-xgc-id="start"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-update-activation"][data-xgc-id="start"]'))
      .toHaveTextContent('Update activation');
    expect(container.querySelector('[data-xgc-role="automation-trigger-version-drift"][data-xgc-id="start"]'))
      .toHaveTextContent('differs from this draft');
    expect(container.querySelector('[data-xgc-role="automation-activation-credential"]')).toHaveTextContent('production-token-once');
    expect(container.querySelector('[data-xgc-role="automation-activation-credential"] code[title]'))
      .toHaveAttribute('title', expect.stringContaining('will not be shown again'));

    fireEvent.click(container.querySelector('[data-xgc-role="automation-trigger-run-once"]')!);
    await waitFor(() => expect(controls.props.onRunOnce).toHaveBeenCalledOnce());
    expect(container.querySelector('[data-xgc-role="automation-trigger-event-message"]')).toHaveTextContent('event-run-once');
    fireEvent.click(container.querySelector('[data-xgc-role="automation-trigger-update-activation"]')!);
    await waitFor(() => expect(controls.props.onActivate).toHaveBeenCalledOnce());
    fireEvent.click(container.querySelector('[data-xgc-role="automation-activation-credential-dismiss"]')!);
    expect(controls.props.onDismissActivationCredential).toHaveBeenCalledWith();
  });

  it('activates target startup without a synthetic Run and preserves unreachable Agent truth', () => {
    const controls = renderControls('trigger.target-startup', {
      activation: activationFixture({
        triggerKind: 'trigger.target-startup',reachability: 'unreachable',
      }),
    });
    const { container } = controls.view;
    expect(container.querySelector('[data-xgc-role="automation-trigger-deactivate"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-run-once"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-test-listener-start"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-reachability"]'))
      .toHaveTextContent('Unreachable');
  });

  it('does not let an earlier trigger identity overwrite feedback for the current trigger', async () => {
    const earlier = deferred<AutomationTriggerEventReceipt>();
    const current = deferred<AutomationTriggerEventReceipt>();
    const controls = renderControls('trigger.schedule', { onRunOnce: vi.fn(() => earlier.promise) });

    fireEvent.click(controls.view.container.querySelector('[data-xgc-role="automation-trigger-run-once"]')!);
    controls.view.rerender(<AutomationTriggerControls
      {...controls.props}
      resourceId="automation-b"
      entrypointNodeId="other-start"
      onRunOnce={() => current.promise}
    />);
    fireEvent.click(controls.view.container.querySelector('[data-xgc-role="automation-trigger-run-once"]')!);

    await act(async () => current.resolve({ eventId: 'current-event' }));
    expect(controls.view.container.querySelector('[data-xgc-role="automation-trigger-event-message"]'))
      .toHaveTextContent('current-event');

    await act(async () => earlier.reject(new Error('stale trigger failed')));
    expect(controls.view.container.querySelector('[data-xgc-role="automation-trigger-event-message"]'))
      .toHaveTextContent('current-event');
    expect(controls.view.container).not.toHaveTextContent('stale trigger failed');
  });

  it.each([
    'trigger.chat-message',
    'trigger.form-submission',
    'trigger.webhook',
  ] as const)('uses the same explicit listener interaction for %s', (triggerKind) => {
    const { view } = renderControls(triggerKind);
    const { container } = view;
    expect(container.querySelector('[data-xgc-role="automation-test-listener-start"][data-xgc-id="start"]'))
      .toHaveTextContent('Start listening');
    expect(container.querySelector('[data-xgc-role="automation-trigger-activate"][data-xgc-id="start"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-test-payload"][data-xgc-id="start"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-test-event-submit"]')).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="automation-trigger-run-once"]')).toBeNull();
  });

  it('offers an explicit retry when an active schedule registration is observed in error', async () => {
    const controls = renderControls('trigger.schedule', {
      activation: activationFixture({ observedState: 'error',failureCode: 'schedule_reconcile_failed' }),
    });
    const retry = controls.view.container.querySelector(
      '[data-xgc-role="automation-trigger-update-activation"][data-xgc-id="start"]',
    );
    expect(retry).toHaveTextContent('Retry activation');
    const failure = controls.view.container.querySelector(
      '[data-xgc-role="automation-trigger-activation-failure"][data-xgc-id="start"]',
    );
    expect(failure).toHaveTextContent('could not reconcile');
    expect(failure).toHaveTextContent('schedule_reconcile_failed');

    fireEvent.click(retry!);
    await waitFor(() => expect(controls.props.onActivate).toHaveBeenCalledOnce());
  });

  it('starts a listener with an explicit TTL, then submits an object and can cancel listening', async () => {
    const listening = listenerFixture();
    const controls = renderControls('trigger.chat-message', {
      listenerSession: {
        resourceId: 'automation-a',entrypointNodeId: 'start',
        listener: listening,
        credential: { publicId: listening.publicId,token: 'listener-token' },
      },
    });
    const { container } = controls.view;
    expect(container.querySelector('[data-xgc-role="automation-test-listener-status"][data-xgc-id="start"]'))
      .toHaveTextContent('Listening');
    expect(container.querySelector('[data-xgc-role="automation-test-listener-expiry"][data-xgc-id="start"]'))
      .toHaveTextContent('Expires');

    fireEvent.change(container.querySelector('[data-xgc-role="automation-test-payload"]')!, {
      target: { value: '{"message":"hello","context":{"channel":"test"}}' },
    });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-test-event-submit"]')!);
    await waitFor(() => expect(controls.props.onSubmitTestEvent).toHaveBeenCalledWith({
      message: 'hello',context: { channel: 'test' },
    }));
    expect(container.querySelector('[role="status"]')).toHaveTextContent('event-test');

    fireEvent.click(container.querySelector('[data-xgc-role="automation-test-listener-cancel"][data-xgc-id="start"]')!);
    await waitFor(() => expect(controls.props.onCancelListening).toHaveBeenCalledOnce());
  });

  it('passes a clamped TTL when starting a new listener', async () => {
    const controls = renderControls('trigger.webhook');
    const { container } = controls.view;
    const ttl = container.querySelector('[data-xgc-role="automation-test-listener-ttl"]')!;
    fireEvent.change(ttl, { target: { value: '1200' } });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-test-listener-start"]')!);
    await waitFor(() => expect(controls.props.onStartListening).toHaveBeenCalledWith(900));
  });

  it.each(['[]','null','"message"','{'])('rejects non-object test JSON %s before ingress', async (payload) => {
    const listening = listenerFixture();
    const controls = renderControls('trigger.form-submission', {
      listenerSession: {
        resourceId: 'automation-a',entrypointNodeId: 'start',
        listener: listening,
        credential: { publicId: listening.publicId,token: 'listener-token' },
      },
    });
    const { container } = controls.view;
    fireEvent.change(container.querySelector('[data-xgc-role="automation-test-payload"]')!, { target: { value: payload } });
    fireEvent.click(container.querySelector('[data-xgc-role="automation-test-event-submit"]')!);

    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(controls.props.onSubmitTestEvent).not.toHaveBeenCalled();
  });

  it('shows an expired listener as terminal and never exposes an empty production token', () => {
    const expired = listenerFixture({ expiresAt: '2020-01-01T00:00:00Z' });
    const { view } = renderControls('trigger.webhook', {
      listenerSession: {
        resourceId: 'automation-a',entrypointNodeId: 'start',
        listener: expired,
        credential: { publicId: expired.publicId,token: 'expired-listener-token' },
      },
      activationCredential: { publicId: 'production-public',token: '' },
    });
    const { container } = view;

    expect(container.querySelector('[data-xgc-role="automation-test-listener-status"]')).toHaveTextContent('Expired');
    expect(container.querySelector('[data-xgc-role="automation-test-listener-start"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-test-listener-cancel"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-test-event-submit"]')).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="automation-activation-credential"]')).toBeNull();
  });

  it('changes a listening status to expired when its TTL elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T00:00:00Z'));
    const listener = listenerFixture({ expiresAt: '2026-07-18T00:00:01Z' });
    const controls = renderControls('trigger.chat-message', {
      listenerSession: {
        resourceId: 'automation-a',entrypointNodeId: 'start',
        listener,
        credential: { publicId: listener.publicId,token: 'listener-token' },
      },
    });
    try {
      expect(controls.view.container.querySelector('[data-xgc-role="automation-test-listener-status"]'))
        .toHaveTextContent('Listening');
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(1_010);
        await Promise.resolve();
      });
      expect(controls.view.container.querySelector('[data-xgc-role="automation-test-listener-status"]'))
        .toHaveTextContent('Expired');
    } finally {
      controls.view.unmount();
      vi.useRealTimers();
    }
  });
});

function renderControls(
  triggerKind: ComponentProps<typeof AutomationTriggerControls>['triggerKind'],
  overrides: Partial<ComponentProps<typeof AutomationTriggerControls>> = {},
) {
  const props: ComponentProps<typeof AutomationTriggerControls> = {
    resourceId: 'automation-a',entrypointNodeId: 'start',triggerKind,draftDiffersFromActivation: false,
    onRunOnce: vi.fn().mockResolvedValue({ eventId: 'event-run-once' }),
    onActivate: vi.fn().mockResolvedValue(undefined),
    onDeactivate: vi.fn().mockResolvedValue(undefined),
    onDismissActivationCredential: vi.fn(),
    onStartListening: vi.fn().mockResolvedValue(undefined),
    onCancelListening: vi.fn().mockResolvedValue(undefined),
    onSubmitTestEvent: vi.fn().mockResolvedValue({ eventId: 'event-test' }),
    ...overrides,
  };
  return { props,view: render(<AutomationTriggerControls {...props} />) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve,onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise,resolve,reject };
}

const timestamp = '2026-07-18T00:00:00Z';

function activationFixture(overrides: Partial<AutomationActivation> = {}): AutomationActivation {
  return {
    resourceId: 'automation-a',revision: 1,desiredState: 'active',observedState: 'active',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 1,digest: 'a'.repeat(64),
    },
    targetId: 'local',entrypointNodeId: 'start',triggerKind: 'trigger.webhook',triggerVersion: 1,
    publicId: 'production-public',requiredCapabilities: [],reachability: 'reachable',lastObservedAt: timestamp,createdAt: timestamp,updatedAt: timestamp,
    ...overrides,
  };
}

function listenerFixture(overrides: Partial<AutomationTestListener> = {}): AutomationTestListener {
  return {
    id: 'listener-a',resourceId: 'automation-a',revision: 1,status: 'listening',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 1,digest: 'a'.repeat(64),
    },
    targetId: 'local',entrypointNodeId: 'start',triggerKind: 'trigger.chat-message',triggerVersion: 1,
    oneShot: false,publicId: 'test-public',
    expiresAt: '2099-01-01T00:00:00Z',createdAt: timestamp,updatedAt: timestamp,
    ...overrides,
  };
}
