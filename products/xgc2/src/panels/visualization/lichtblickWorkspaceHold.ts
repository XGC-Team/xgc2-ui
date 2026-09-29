import type { ProcessInstance } from '../../domains/execution/executionPublic';

export const EMPTY_LICHTBLICK_RUN_IDS: ReadonlySet<string> = new Set();

export type HeldLichtblickEmbed = {
  url: string;
  targetId: string;
  processId: string;
};

export type LichtblickWorkspaceEmptyKind = 'error' | 'stopping' | 'preparing' | 'stopped';

/** Keep the last viewer while a Panel Action hydrates or a process restarts. */
export function lichtblickProcessStillLive(
  process: Pick<ProcessInstance,'desiredState'|'observedState'>,
): boolean {
  if (process.desiredState === 'running') return true;
  return process.observedState === 'running'
    || process.observedState === 'starting'
    || process.observedState === 'stopping';
}

export function nextHeldLichtblickActionRunIds(input: {
  stopping: boolean;
  connected: boolean;
  liveRunIds: ReadonlySet<string>;
  previousRunIds: ReadonlySet<string>;
  previousOwnedStillLive: boolean;
}): ReadonlySet<string> {
  if (input.stopping || !input.connected) return EMPTY_LICHTBLICK_RUN_IDS;
  if (input.liveRunIds.size > 0) return input.liveRunIds;
  if (input.previousRunIds.size > 0 && input.previousOwnedStillLive) return input.previousRunIds;
  return EMPTY_LICHTBLICK_RUN_IDS;
}

export function nextHeldLichtblickEmbed(input: {
  stopping: boolean;
  keepHold: boolean;
  targetId: string;
  liveProcessId: string;
  live: HeldLichtblickEmbed | null;
  previous: HeldLichtblickEmbed | null;
}): HeldLichtblickEmbed | null {
  if (input.stopping || !input.keepHold) return input.live;
  if (input.live) return input.live;
  if (!input.previous || input.previous.targetId !== input.targetId) return null;
  if (input.liveProcessId && input.previous.processId !== input.liveProcessId) return null;
  return input.previous;
}

export function lichtblickWorkspaceIsPreparing(input: {
  connected: boolean;
  active: boolean;
  runtimeLoading: boolean;
  hasOwnedLiveProcess: boolean;
  runtimeReady: boolean;
}): boolean {
  if (input.runtimeReady) return false;
  if (!input.connected) return input.active || input.hasOwnedLiveProcess;
  return input.active || input.runtimeLoading || input.hasOwnedLiveProcess;
}

export function lichtblickWorkspaceEmptyKind(input: {
  runtimeError: string;
  stopping: boolean;
  preparing: boolean;
}): LichtblickWorkspaceEmptyKind {
  if (input.runtimeError.trim()) return 'error';
  if (input.stopping) return 'stopping';
  if (input.preparing) return 'preparing';
  return 'stopped';
}

/**
 * Viewer ready is a domain fact, not a reason to freeze startup rails.
 * `emptyKind` can be `stopped` once WebUI is ready; the pipeline must stay
 * `starting` until presentation handover so Run/Viewer/Bridge can play.
 */
export function lichtblickWorkspaceStartupPhase(input: {
  stopping: boolean;
  runtimeError: string;
  active: boolean;
  hasOwnedLiveProcess: boolean;
  hasEmbed: boolean;
}): 'stopped' | 'starting' | 'stopping' {
  if (input.runtimeError.trim()) return 'starting';
  if (input.stopping) return 'stopping';
  if (input.active || input.hasOwnedLiveProcess || input.hasEmbed) return 'starting';
  return 'stopped';
}
