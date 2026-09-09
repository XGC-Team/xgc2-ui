import { createUserIntentId } from '../../shared/utils/intent';
import {
  actOnGroundStationInteraction,
  isGroundStationInteractionCASConflict,
} from './groundStationInteractionService';
import type {
  GroundStationContextInteraction,
  GroundStationDecisionAction,
  GroundStationDecisionInteraction,
  GroundStationFormValues,
  GroundStationInteraction,
  GroundStationMessageInteraction,
  GroundStationOperatorAction,
} from './groundStationInteractionTypes';

export type GroundStationDecisionResponseOptions = {
  reason?: string;
  /** Typed answers to a form decision; only an approval may carry them. */
  values?: GroundStationFormValues;
};

export type GroundStationDismissibleInteraction =
  | GroundStationMessageInteraction
  | GroundStationContextInteraction;

export type GroundStationDecisionResponseAction = Exclude<GroundStationDecisionAction,'canceled'>;

export type GroundStationDecisionResponder = (
  interaction: GroundStationDecisionInteraction,
  action: GroundStationDecisionResponseAction,
  options?: GroundStationDecisionResponseOptions,
) => Promise<GroundStationDecisionInteraction>;

export type GroundStationInteractionDismisser = (
  interaction: GroundStationDismissibleInteraction,
) => Promise<GroundStationDismissibleInteraction>;

export type GroundStationInteractionActionTarget = {
  targetId: string;
  targetScope: string;
  epoch: number;
};

export type GroundStationInteractionActionRuntime = {
  currentTarget: () => GroundStationInteractionActionTarget;
  reconcile: (
    target: GroundStationInteractionActionTarget,
  ) => Promise<GroundStationInteraction[]>;
  merge: (
    target: GroundStationInteractionActionTarget,
    interaction: GroundStationInteraction,
  ) => void;
};

export async function respondToGroundStationDecision(
  runtime: GroundStationInteractionActionRuntime,
  interaction: GroundStationDecisionInteraction,
  action: GroundStationDecisionResponseAction,
  options: GroundStationDecisionResponseOptions = {},
) {
  const response = await performAction(runtime, interaction, action, options.reason, options.values);
  if (response.kind !== 'decision') {
    throw new Error('Invalid ground-station decision action response.');
  }
  return response;
}

export async function dismissGroundStationInteraction(
  runtime: GroundStationInteractionActionRuntime,
  interaction: GroundStationDismissibleInteraction,
) {
  const response = await performAction(runtime, interaction, 'dismissed');
  if ((response.kind !== 'message' && response.kind !== 'context')
      || response.kind !== interaction.kind) {
    throw new Error('Invalid ground-station dismissal response.');
  }
  return response;
}

async function performAction(
  runtime: GroundStationInteractionActionRuntime,
  interaction: GroundStationDecisionInteraction | GroundStationDismissibleInteraction,
  action: GroundStationOperatorAction,
  reason?: string,
  values?: GroundStationFormValues,
) {
  const target = runtime.currentTarget();
  if (interaction.targetScope !== target.targetScope) {
    throw new Error('The selected execution target changed. Review the current ground-station request.');
  }
  const requestId = createUserIntentId(`ground-station.interaction.${action}`, interaction.id);
  try {
    const response = await actOnGroundStationInteraction(target.targetId, interaction.id, {
      action,
      expectedRevision: interaction.revision,
      requestId,
      idempotencyKey: requestId,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      ...(values && Object.keys(values).length > 0 ? { values } : {}),
    });
    runtime.merge(target, response.interaction);
    return response.interaction;
  } catch (cause) {
    if (!isGroundStationInteractionCASConflict(cause)) throw cause;
    const interactions = await runtime.reconcile(target);
    const latest = interactions.find((item) => item.id === interaction.id);
    if (!latest || latest.status !== 'open') return latest ?? interaction;
    throw new Error('This ground-station request changed before your response was applied. Review it and try again.');
  }
}
