import { useCallback,useEffect,useMemo,useReducer,useRef } from 'react';
import {
  executionTargetResourceId,
  normalizeExecutionTargetId,
  useExecutionEventChannel,
  type ExecutionEvent,
  type ExecutionStreamState,
} from '../execution/executionPublic';
import {
  dismissGroundStationInteraction,
  respondToGroundStationDecision,
  type GroundStationDecisionResponder,
  type GroundStationDismissibleInteraction,
  type GroundStationInteractionActionRuntime,
  type GroundStationInteractionActionTarget,
  type GroundStationInteractionDismisser,
} from './groundStationInteractionActions';
import { groundStationInteractionFromEvent } from './groundStationInteractionEvent';
import {
  selectGroundStationInteractionExpiry,
  selectGroundStationInteractions,
  type GroundStationInteractionSelection,
} from './groundStationInteractionSelectors';
import {
  createGroundStationInteractionState,
  mergeGroundStationInteractionSnapshots,
  reduceGroundStationInteractions,
} from './groundStationInteractionState';
import {
  listOpenGroundStationInteractions,
  listRecentGroundStationInteractions,
} from './groundStationInteractionService';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

export type GroundStationInteractions = GroundStationInteractionSelection & {
  inventory: GroundStationInteraction[];
  targetId: string;
  targetScope: string;
  streamState: ExecutionStreamState;
  loading: boolean;
  inventoryError: string;
  dismissLocal: (interaction: GroundStationDismissibleInteraction) => void;
  dismiss: GroundStationInteractionDismisser;
  respond: GroundStationDecisionResponder;
};

export function useGroundStationInteractions(targetId: string): GroundStationInteractions {
  const normalizedTargetId = normalizeExecutionTargetId(targetId);
  const targetScope = executionTargetResourceId(normalizedTargetId);
  const selectedTarget = useRef<GroundStationInteractionActionTarget>({
    targetId: normalizedTargetId,
    targetScope,
    epoch: 0,
  });
  if (selectedTarget.current.targetId !== normalizedTargetId
      || selectedTarget.current.targetScope !== targetScope) {
    selectedTarget.current = {
      targetId: normalizedTargetId,
      targetScope,
      epoch: selectedTarget.current.epoch + 1,
    };
  }
  const target = selectedTarget.current;
  const [state, dispatch] = useReducer(
    reduceGroundStationInteractions,
    undefined,
    () => createGroundStationInteractionState(normalizedTargetId, targetScope, target.epoch),
  );
  const stateRef = useRef(state);
  const requestGeneration = useRef(0);
  stateRef.current = state;

  const receive = useCallback((event: ExecutionEvent) => {
    if (!sameTarget(selectedTarget.current, target)) return;
    const interaction = groundStationInteractionFromEvent(event, targetScope);
    if (interaction) dispatch({ type: 'merge',interaction });
  }, [target,targetScope]);

  const eventChannel = useExecutionEventChannel(normalizedTargetId, receive);

  useEffect(() => {
    dispatch({ type: 'reset',targetId: normalizedTargetId,targetScope,targetEpoch: target.epoch });
  }, [normalizedTargetId,target,targetScope]);

  const reconcile = useCallback(async (
    target: GroundStationInteractionActionTarget,
    signal?: AbortSignal,
  ) => {
    const sinceSequence = stateRef.current.targetId === target.targetId
      && stateRef.current.targetScope === target.targetScope
      && stateRef.current.targetEpoch === target.epoch
      ? stateRef.current.sequence
      : 0;
    const openInteractions = await listOpenGroundStationInteractions(target.targetId, { signal });
    if (signal?.aborted || !sameTarget(selectedTarget.current, target)) return openInteractions;
    // Current requests are independently authoritative. History availability
    // must not hold up a newly observed decision or erase cached terminal facts.
    dispatch({ type: 'inventory',openInteractions,recentInteractions: [],sinceSequence,recentPending: true });
    let recentInteractions: GroundStationInteraction[];
    try {
      recentInteractions = await listRecentGroundStationInteractions(target.targetId, { signal });
    } catch (cause) {
      const error = new Error(`Recent activity is unavailable; current pending requests are available. ${messageOf(cause)}`);
      if (!signal?.aborted && sameTarget(selectedTarget.current, target)) {
        dispatch({ type: 'inventory',openInteractions,recentInteractions: [],sinceSequence });
      }
      // In particular, CAS reconciliation must still fail when it cannot read
      // the competing terminal response. A partial inventory is not approval.
      throw error;
    }
    const reconciled = mergeGroundStationInteractionSnapshots(recentInteractions, openInteractions);
    if (signal?.aborted || !sameTarget(selectedTarget.current, target)) return reconciled;
    dispatch({ type: 'inventory',openInteractions,recentInteractions,sinceSequence });
    return reconciled;
  }, []);

  useEffect(() => {
    const target = selectedTarget.current;
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    const controller = new AbortController();
    dispatch({ type: 'loading' });
    void reconcile(target, controller.signal).catch((cause) => {
      if (!controller.signal.aborted
          && requestGeneration.current === generation
          && sameTarget(selectedTarget.current, target)
          && !isPartialHistoryError(cause)) {
        dispatch({ type: 'inventory-error',message: messageOf(cause) });
      }
    });
    return () => controller.abort();
  }, [eventChannel.streamId,normalizedTargetId,reconcile,targetScope]);

  const nextExpiry = useMemo(() => (
    selectGroundStationInteractionExpiry(state, normalizedTargetId, targetScope, target.epoch)
  ), [normalizedTargetId,state,target,targetScope]);

  useEffect(() => {
    if (nextExpiry === undefined || typeof AbortSignal.timeout !== 'function') return undefined;
    const delay = Math.max(1, Math.min(2_147_483_647, nextExpiry - Date.now()));
    const signal = AbortSignal.timeout(delay);
    const expire = () => {
      const target = selectedTarget.current;
      dispatch({ type: 'expiry-tick' });
      void reconcile(target).catch((cause) => {
        if (sameTarget(selectedTarget.current, target) && !isPartialHistoryError(cause)) {
          dispatch({ type: 'inventory-error',message: messageOf(cause) });
        }
      });
    };
    signal.addEventListener('abort', expire, { once: true });
    return () => signal.removeEventListener('abort', expire);
  }, [nextExpiry,reconcile,state.sequence]);

  const dismissLocal = useCallback((interaction: GroundStationDismissibleInteraction) => {
    if (interaction.targetScope !== selectedTarget.current.targetScope) return;
    dispatch({ type: 'dismiss',id: interaction.id,revision: interaction.revision });
  }, []);

  const actionRuntime = useMemo<GroundStationInteractionActionRuntime>(() => ({
    currentTarget: () => selectedTarget.current,
    reconcile: (target) => reconcile(target),
    merge: (target, interaction) => {
      if (sameTarget(selectedTarget.current, target)) {
        dispatch({ type: 'merge',interaction });
      }
    },
  }), [reconcile]);

  const respond = useCallback<GroundStationDecisionResponder>(
    (interaction, action, options) => (
      respondToGroundStationDecision(actionRuntime, interaction, action, options)
    ),
    [actionRuntime],
  );

  const dismiss = useCallback<GroundStationInteractionDismisser>(
    (interaction) => dismissGroundStationInteraction(actionRuntime, interaction),
    [actionRuntime],
  );

  const selection = useMemo(() => (
    selectGroundStationInteractions(state, normalizedTargetId, targetScope, target.epoch)
  ), [normalizedTargetId,state,target,targetScope]);

  return {
    inventory: state.targetId === normalizedTargetId && state.targetScope === targetScope
      && state.targetEpoch === target.epoch
      ? Array.from(state.entries.values(), ({ interaction }) => interaction)
      : [],
    targetId: normalizedTargetId,
    targetScope,
    streamState: eventChannel.streamState,
    loading: state.targetId === normalizedTargetId
      && state.targetScope === targetScope
      && state.targetEpoch === target.epoch
      ? state.loading
      : true,
    inventoryError: state.targetId === normalizedTargetId
      && state.targetScope === targetScope
      && state.targetEpoch === target.epoch
      ? state.inventoryError
      : '',
    ...selection,
    dismissLocal,
    dismiss,
    respond,
  };
}

function sameTarget(
  left: GroundStationInteractionActionTarget,
  right: GroundStationInteractionActionTarget,
) {
  return left.targetId === right.targetId
    && left.targetScope === right.targetScope
    && left.epoch === right.epoch;
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function isPartialHistoryError(cause: unknown) {
  return messageOf(cause).startsWith('Recent activity is unavailable; current pending requests are available.');
}
