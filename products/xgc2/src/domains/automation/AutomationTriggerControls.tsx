import { useEffect, useState } from 'react';
import { Notice,StatusText } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { TextareaControl } from '../../components/controls/TextControls';
import { useDelayedTask } from '../../hooks/useDelayedTask';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import '../../styles/automation-trigger-controls.css';
import { useAutomationTriggerText } from './automationTriggerMessages';
import type {
  AutomationActivation,
  AutomationActivationFailureCode,
  AutomationTestListenerSession,
  AutomationTriggerCredential,
  AutomationTriggerEventReceipt,
  AutomationTriggerKind,
} from './automationTriggerContracts';
import { automationTriggerInteraction } from './automationTriggerInteraction';
import { AutomationNumericInput } from './AutomationNumericInput';

const DEFAULT_LISTENER_TTL_SECONDS = 120;
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_483_647;

export function AutomationTriggerControls({
  resourceId,
  entrypointNodeId,
  triggerKind,
  activation,
  activationCredential,
  listenerSession,
  draftDiffersFromActivation,
  busy = '',
  disabled = false,
  onRunOnce,
  onActivate,
  onDeactivate,
  onDismissActivationCredential,
  onStartListening,
  onCancelListening,
  onSubmitTestEvent,
  embedded = false,
}: {
  resourceId: string;
  entrypointNodeId: string;
  triggerKind: AutomationTriggerKind;
  activation?: AutomationActivation;
  activationCredential?: AutomationTriggerCredential;
  listenerSession?: AutomationTestListenerSession;
  draftDiffersFromActivation: boolean;
  busy?: string;
  disabled?: boolean;
  onRunOnce: () => Promise<AutomationTriggerEventReceipt>;
  onActivate: () => Promise<unknown>;
  onDeactivate: () => Promise<unknown>;
  onDismissActivationCredential: () => void;
  onStartListening: (ttlSeconds: number) => Promise<unknown>;
  onCancelListening: () => Promise<unknown>;
  onSubmitTestEvent: (payload: Record<string, unknown>) => Promise<AutomationTriggerEventReceipt>;
  embedded?: boolean;
}) {
  const t = useAutomationTriggerText();
  const interaction = automationTriggerInteraction(triggerKind);
  const [ttlSeconds, setTTLSeconds] = useState(DEFAULT_LISTENER_TTL_SECONDS);
  const [payloadText, setPayloadText] = useState(() => defaultTestPayload(triggerKind));
  const [inputError, setInputError] = useState('');
  const [eventMessage, setEventMessage] = useState('');
  const [expiredListenerId, setExpiredListenerId] = useState('');
  const [, setListenerDeadlineCheckpoint] = useState(() => Date.now());
  const beginFeedbackRequest = useLatestAsyncRequest(JSON.stringify([resourceId,entrypointNodeId,triggerKind]));
  const listener = listenerSession?.listener;
  const listenerDeadline = listener ? Date.parse(listener.expiresAt) : Number.NaN;
  const listenerStatus = effectiveListenerStatus(listener, expiredListenerId);
  const listenerReady = listenerStatus === 'listening' && Boolean(listenerSession?.credential?.token);
  const activationDesired = activation?.desiredState === 'active';
  const activationNeedsUpdate = activationDesired
    && (draftDiffersFromActivation || activation?.observedState === 'error');

  useEffect(() => {
    setPayloadText(defaultTestPayload(triggerKind));
    setInputError('');
    setEventMessage('');
  }, [entrypointNodeId,resourceId,triggerKind]);

  useEffect(() => {
    setExpiredListenerId('');
    setListenerDeadlineCheckpoint(Date.now());
  }, [listener?.id,listener?.revision]);

  useDelayedTask({
    enabled: listener?.status === 'listening'
      && listenerStatus === 'listening'
      && Number.isFinite(listenerDeadline),
    delayMs: Number.isFinite(listenerDeadline)
      ? Math.min(MAX_BROWSER_TIMER_DELAY_MS, Math.max(0, listenerDeadline - Date.now()))
      : 0,
    task: () => {
      if (listenerDeadline <= Date.now()) setExpiredListenerId(listener?.id ?? '');
      else setListenerDeadlineCheckpoint(Date.now());
    },
  });

  if (triggerKind === 'trigger.manual') return null;

  // Call-only workflows have no runnable actions here: the entrypoint selector
  // already labels them "When called", so a repeating callout would duplicate it.
  if (triggerKind === 'trigger.automation-call') return null;

  async function submitTestEvent() {
    const isCurrent = beginFeedbackRequest();
    setInputError('');
    setEventMessage('');
    try {
      const payload = JSON.parse(payloadText) as unknown;
      if (!isJSONObject(payload)) throw new Error(t('Test payload must be a JSON object.'));
      const receipt = await onSubmitTestEvent(payload);
      if (!isCurrent()) return;
      setEventMessage(receipt.eventId ? t('Test event {id} accepted.', { id: receipt.eventId }) : t('Test event accepted.'));
    } catch (cause) {
      if (isCurrent()) setInputError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function runControlAction(action: () => Promise<unknown>) {
    const isCurrent = beginFeedbackRequest();
    setInputError('');
    setEventMessage('');
    try {
      await action();
    } catch (cause) {
      if (isCurrent()) setInputError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function runOnce() {
    const isCurrent = beginFeedbackRequest();
    setInputError('');
    setEventMessage('');
    try {
      const receipt = await onRunOnce();
      if (!isCurrent()) return;
      setEventMessage(receipt.eventId ? t('Run-once event {id} queued.', { id: receipt.eventId }) : t('Run-once event queued.'));
    } catch (cause) {
      if (isCurrent()) setInputError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <aside
      className="automation-trigger-controls-surface"
      data-xgc-layout={embedded ? 'embedded' : 'shell'}
      data-xgc-role="automation-trigger-controls"
      data-xgc-id={entrypointNodeId}
      data-xgc-resource-id={resourceId}
    >
      <div className="automation-trigger-controls-toolbar">
        <StatusText
          className="automation-trigger-controls-status"
          data-xgc-state={activation?.observedState ?? 'inactive'}
          data-xgc-role="automation-trigger-status"
          data-xgc-id={entrypointNodeId}
          status={activation?.observedState ?? 'inactive'}
          title={t(triggerTitle(triggerKind))}
        >{t(activationStatusLabel(activation))}</StatusText>
        {activation?.reachability === 'unreachable' && (
          <span
            data-xgc-role="automation-trigger-reachability"
            data-xgc-id={entrypointNodeId}
            title={t('Last observed {time}', { time: formatTimestamp(activation.lastObservedAt) })}
          >{t('Unreachable')}</span>
        )}
        <div className="automation-trigger-controls-actions">
          {interaction.primaryAction === 'run-once' && (
            <ControlButton
              tone="primary"
              size="compact"
              type="button"
              data-xgc-role="automation-trigger-run-once"
              data-xgc-id={entrypointNodeId}
              disabled={disabled || Boolean(busy)}
              onClick={() => void runOnce()}
            >{t(busy === 'run-once' ? 'Queuing…' : interaction.primaryActionLabel)}</ControlButton>
          )}
          {interaction.activatable && activationNeedsUpdate && (
            <ControlButton
              tone="primary"
              size="compact"
              type="button"
              data-xgc-role="automation-trigger-update-activation"
              data-xgc-id={entrypointNodeId}
              disabled={disabled || Boolean(busy)}
              onClick={() => void runControlAction(onActivate)}
            >{busy === 'activate'
                ? t('Updating…')
                : t(draftDiffersFromActivation ? 'Update activation' : 'Retry activation')}</ControlButton>
          )}
          {interaction.activatable && (activationDesired ? (
            <ControlButton
              size="compact"
              type="button"
              data-xgc-role="automation-trigger-deactivate"
              data-xgc-id={entrypointNodeId}
              disabled={disabled || Boolean(busy)}
              onClick={() => void runControlAction(onDeactivate)}
            >{t(busy === 'deactivate' ? 'Deactivating…' : 'Deactivate')}</ControlButton>
          ) : (
            <ControlButton
              size="compact"
              type="button"
              data-xgc-role="automation-trigger-activate"
              data-xgc-id={entrypointNodeId}
              disabled={disabled || Boolean(busy)}
              onClick={() => void runControlAction(onActivate)}
            >{t(busy === 'activate' ? 'Activating…' : 'Activate')}</ControlButton>
          ))}
        </div>
      </div>

      {draftDiffersFromActivation && activationDesired && (
        <Notice
          className="automation-trigger-controls-notice"
          tone="warning"
          density="compact"
          data-xgc-role="automation-trigger-version-drift"
          data-xgc-id={entrypointNodeId}
        >
          {t('Activated version {version} differs from this draft. Update activation to pin the current commit.', { version: activation?.pinnedRef.version ?? '—' })}
        </Notice>
      )}

      {activation?.failureCode && (
        <Notice
          className="automation-trigger-controls-notice"
          tone="danger"
          density="compact"
          heading={t(activationFailureMessage(activation.failureCode))}
          data-xgc-role="automation-trigger-activation-failure"
          data-xgc-id={entrypointNodeId}
        >
          <code>{activation.failureCode}</code>
        </Notice>
      )}

      {inputError && <Notice className="automation-trigger-controls-notice" tone="danger" density="compact">{inputError}</Notice>}
      {eventMessage && (
        <Notice
          className="automation-trigger-controls-notice"
          tone="neutral"
          density="compact"
          data-xgc-role="automation-trigger-event-message"
          data-xgc-id={entrypointNodeId}
        >{eventMessage}</Notice>
      )}

      {activationCredential?.token && (
        <section
          className="automation-trigger-controls-credential"
          data-xgc-role="automation-activation-credential"
          data-xgc-id={entrypointNodeId}
        >
          <code title={t('Copy this token now. It will not be shown again.')}>{activationCredential.publicId}</code>
          <code title={t('Copy this token now. It will not be shown again.')}>{activationCredential.token}</code>
          <ControlButton
            size="compact"
            type="button"
            data-xgc-role="automation-activation-credential-dismiss"
            data-xgc-id={entrypointNodeId}
            onClick={() => onDismissActivationCredential()}
          >{t('Dismiss')}</ControlButton>
        </section>
      )}

      {interaction.primaryAction === 'start-listening' && (
        <section className="automation-trigger-controls-listener">
          <div className="automation-trigger-controls-listener-row">
            <strong
              data-xgc-role="automation-test-listener-status"
              data-xgc-id={entrypointNodeId}
              data-xgc-listener-id={listener?.id}
              title={listener ? t('Expires {time}', { time: formatTimestamp(listener.expiresAt) }) : t('No test listener is active.')}
            >{t(listenerStatusLabel(listenerStatus))}</strong>
            <span
              className="automation-trigger-controls-listener-expiry"
              data-xgc-role="automation-test-listener-expiry"
              data-xgc-id={entrypointNodeId}
              data-xgc-listener-id={listener?.id}
              hidden={!listener}
            >{listener ? t('Expires {time}', { time: formatTimestamp(listener.expiresAt) }) : t('No test listener is active.')}</span>
            {listenerStatus === 'listening' ? (
              <ControlButton
                size="compact"
                type="button"
                data-xgc-role="automation-test-listener-cancel"
                data-xgc-id={entrypointNodeId}
                data-xgc-listener-id={listener?.id}
                disabled={disabled || Boolean(busy)}
                onClick={() => void runControlAction(onCancelListening)}
              >{t(busy === 'cancel-listening' ? 'Cancelling…' : 'Cancel listening')}</ControlButton>
            ) : (
              <div className="automation-trigger-controls-listener-start">
                <AutomationNumericInput
                  id={`automation-test-listener-ttl-${entrypointNodeId}`}
                  integer
                  min={1}
                  max={900}
                  value={ttlSeconds}
                  ariaLabel={t('TTL seconds')}
                  title={t('TTL seconds')}
                  data-xgc-role="automation-test-listener-ttl"
                  data-xgc-id={entrypointNodeId}
                  disabled={disabled || Boolean(busy)}
                  onValueChange={(value) => setTTLSeconds(clampTTL(value))}
                />
                <ControlButton
                  tone="primary"
                  size="compact"
                  type="button"
                  data-xgc-role="automation-test-listener-start"
                  data-xgc-id={entrypointNodeId}
                  disabled={disabled || Boolean(busy)}
                  onClick={() => void runControlAction(() => onStartListening(ttlSeconds))}
                >{t(busy === 'start-listening' ? 'Listening…' : interaction.primaryActionLabel)}</ControlButton>
              </div>
            )}
          </div>

          <TextareaControl
            id={`automation-test-payload-${entrypointNodeId}`}
            className="automation-trigger-controls-payload"
            rows={3}
            value={payloadText}
            spellCheck={false}
            aria-label={t('Test payload (JSON object)')}
            title={t('Test payload (JSON object)')}
            data-xgc-role="automation-test-payload"
            data-xgc-id={entrypointNodeId}
            disabled={disabled || Boolean(busy)}
            onChange={(value) => {
              setPayloadText(value);
              setInputError('');
            }}
          />
          <ControlButton
            tone="primary"
            size="compact"
            type="button"
            data-xgc-role="automation-test-event-submit"
            data-xgc-id={entrypointNodeId}
            disabled={disabled || Boolean(busy) || !listenerReady}
            onClick={() => void submitTestEvent()}
          >{t(busy === 'submit-test-event' ? 'Sending…' : testEventLabel(triggerKind))}</ControlButton>
        </section>
      )}
    </aside>
  );
}

function effectiveListenerStatus(
  listener: AutomationTestListenerSession['listener'] | undefined,
  expiredListenerId: string,
) {
  if (!listener) return 'none' as const;
  if (listener.status === 'listening'
    && (listener.id === expiredListenerId || Date.parse(listener.expiresAt) <= Date.now())) return 'expired' as const;
  return listener.status;
}

function listenerStatusLabel(status: ReturnType<typeof effectiveListenerStatus>) {
  if (status === 'none') return 'Not listening';
  return status === 'listening' ? 'Listening' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function activationStatusLabel(activation?: AutomationActivation) {
  if (!activation) return 'Inactive';
  const state = activation.observedState;
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}

function activationFailureMessage(failureCode: AutomationActivationFailureCode) {
  if (failureCode === 'schedule_policy_rejected') {
    return 'The scheduling policy rejected this Automation. Check its schedule and run conditions.';
  }
  return 'The scheduler could not reconcile this Automation listener. Retry or reactivate it.';
}

function defaultTestPayload(kind: AutomationTriggerKind) {
  if (kind === 'trigger.chat-message') return '{\n  "message": "Hello"\n}';
  if (kind === 'trigger.form-submission') return '{\n  "name": "Test submission"\n}';
  return '{\n  "event": "test"\n}';
}

function triggerTitle(kind: AutomationTriggerKind) {
  if (kind === 'trigger.schedule') return 'Schedule trigger';
  if (kind === 'trigger.target-startup') return 'Target startup trigger';
  if (kind === 'trigger.chat-message') return 'Chat trigger';
  if (kind === 'trigger.form-submission') return 'Form trigger';
  return 'Webhook trigger';
}

function testEventLabel(kind: AutomationTriggerKind) {
  if (kind === 'trigger.chat-message') return 'Send test message';
  if (kind === 'trigger.form-submission') return 'Submit test form';
  return 'Send test webhook';
}

function isJSONObject(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampTTL(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_LISTENER_TTL_SECONDS;
  return Math.min(900, Math.max(1, Math.round(value)));
}

function formatTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}
