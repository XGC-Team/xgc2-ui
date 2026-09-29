/**
 * Per-robot `(sim)` is a hybrid-session partition label.
 * Simulation / physical Sessions unify every provider and must not paint
 * authored hybridSource onto the instrument.
 */
export function experimentRobotSimulationSourceMark(
  runMode: string | undefined,
  hybridSource: string | undefined,
) {
  return runMode === 'hybrid' && hybridSource === 'simulation';
}

/** Concrete Robot source a Config card can claim; anything else is unknown. */
export type ExperimentRobotConfigSource = 'simulation' | 'physical';

/**
 * Always-visible Config card source for one Robot. `current` is the source in
 * effect (the running Session's frozen value, or the selected mode's outcome
 * while idle); `next` appears only while a Run is active and the draft would
 * start this Robot from a different known source.
 */
export type ExperimentRobotSourceLabel = {
  current: ExperimentRobotConfigSource | 'unknown';
  next?: ExperimentRobotConfigSource;
};

/**
 * Resolve one slot's source under a run mode. Pure simulation/physical modes
 * override every slot's authored hybridSource; only hybrid reads it. Custom
 * modes and missing authored values carry no evidence and stay unknown.
 */
export function experimentRobotSourceForRunMode(
  runMode: string | undefined,
  hybridSource: string | undefined,
): ExperimentRobotConfigSource | 'unknown' {
  if (runMode === 'simulation' || runMode === 'physical') return runMode;
  if (runMode === 'hybrid') {
    return hybridSource === 'simulation' || hybridSource === 'physical' ? hybridSource : 'unknown';
  }
  return 'unknown';
}

/**
 * Compose the Config card label for one draft binding.
 *
 * - Idle (`running` false): the selected mode decides; there is no separate
 *   "current Run" to disagree with, so no next hint exists.
 * - A pure running Session's mode determines each Robot's source while its
 *   frozen roster is loading. Once loading ends, roster membership is checked.
 * - A failed frozen read, or an unknown Session mode, claims no current source;
 *   never substitute the editable HEAD for the frozen roster.
 * - Running pure mode: the Session source only for cards still in the frozen
 *   roster; a card whose slot/asset left the frozen roster claims no current
 *   source but can state the locked mode's next-start outcome.
 * - Running hybrid: per-slot frozen hybridSource; a differing draft value is
 *   surfaced as `next` without marking the running Robot as switched.
 */
export function experimentRobotConfigSourceLabel(input: {
  running: boolean;
  frozenLoading: boolean;
  frozenReady: boolean;
  sessionRunMode: string;
  selectedRunMode: string;
  inFrozenRoster: boolean;
  draftHybridSource: string | undefined;
  frozenHybridSource: string | undefined;
}): ExperimentRobotSourceLabel {
  if (!input.running) {
    return { current: experimentRobotSourceForRunMode(input.selectedRunMode, input.draftHybridSource) };
  }
  if (input.frozenLoading
    && (input.sessionRunMode === 'simulation' || input.sessionRunMode === 'physical')) {
    return { current: input.sessionRunMode };
  }
  if (!input.frozenReady) return { current: 'unknown' };
  if (input.sessionRunMode === 'simulation' || input.sessionRunMode === 'physical') {
    if (!input.inFrozenRoster) return { current: 'unknown', next: input.sessionRunMode };
    return { current: input.sessionRunMode };
  }
  if (input.sessionRunMode === 'hybrid') {
    const next = experimentRobotSourceForRunMode('hybrid', input.draftHybridSource);
    if (!input.inFrozenRoster) {
      return next === 'unknown' ? { current: 'unknown' } : { current: 'unknown', next };
    }
    const current = experimentRobotSourceForRunMode('hybrid', input.frozenHybridSource);
    return next !== 'unknown' && next !== current ? { current, next } : { current };
  }
  return { current: 'unknown' };
}
