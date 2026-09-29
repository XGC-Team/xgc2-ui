import { useSyncExternalStore } from 'react';
import type { AutomationRunDetail } from '../domains/automation/automationPublic';
import type { PanelExecutionObserver } from './types';

type RunDetailsById = Readonly<Record<string,AutomationRunDetail>>;

/**
 * One target's retained Run details behind a subscription. `read` returns the
 * latest immutable details snapshot; `subscribe` fires when it may change.
 */
export function createPanelExecutionObserver(
  read: () => RunDetailsById,
  subscribe: (listener: () => void) => () => void,
  commands: Pick<PanelExecutionObserver,'loadRunDetail'|'retainRunDetail'|'retainRunObservation'>,
): PanelExecutionObserver {
  return {
    runDetail: (runId) => (runId ? read()[runId] : undefined),
    subscribe,
    loadRunDetail: commands.loadRunDetail,
    retainRunDetail: commands.retainRunDetail,
    retainRunObservation: commands.retainRunObservation,
  };
}

const noSubscription = () => () => undefined;

/** Re-renders only when this Run's retained detail changes. */
export function usePanelExecutionRunDetail(
  execution: PanelExecutionObserver | undefined,
  runId: string,
): AutomationRunDetail | undefined {
  const read = () => (execution && runId ? execution.runDetail(runId) : undefined);
  return useSyncExternalStore(execution?.subscribe ?? noSubscription, read, read);
}
