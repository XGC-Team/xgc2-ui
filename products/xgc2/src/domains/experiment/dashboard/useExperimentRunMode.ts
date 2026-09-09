import { useEffect,useMemo,useState } from 'react';
import {
  normalizeExperimentRunModes,
  type ExperimentDocument,
  type ExperimentRunMode,
} from '../experimentModel';
import type { ExperimentRunView } from '../experimentWorkflowService';

export type ExperimentRunModeControl = {
  /** Mode for the next Experiment Run, or the active Run's frozen mode. */
  value: string;
  options: ExperimentRunMode[];
  select: (next: ExperimentRunMode) => void;
  /** True while the active Experiment Run owns the mode. */
  locked: boolean;
};

/**
 * Owns the run-mode selection for one Experiment.
 *
 * The durable authority is the Experiment-sourced System Runner. localStorage remembers
 * only what the operator selected for the next Run.
 */
export function useExperimentRunMode(
  experiment: ExperimentDocument | undefined,
  activeRun: Pick<ExperimentRunView,'runMode'> | undefined,
): ExperimentRunModeControl {
  const experimentId = experiment?.head.resourceId ?? '';
  const runModesSource = experiment?.spec.runModes;
  const runModesKey = (runModesSource ?? []).join('\0');
  const options = useMemo(
    () => normalizeExperimentRunModes(runModesSource),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures content of runModesSource
    [runModesKey],
  );
  const storageKey = experimentId ? `xgc.experiment.runMode.${experimentId}` : '';
  const [preferred,setPreferred] = useState<ExperimentRunMode | ''>(options[0] ?? '');

  useEffect(() => {
    let next = options[0] ?? '';
    if (storageKey) {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (typeof parsed === 'string' && (options as readonly string[]).includes(parsed)) {
            next = parsed as ExperimentRunMode;
          }
        }
      } catch {
        // ignore corrupt preference
      }
    }
    setPreferred(next);
  }, [storageKey,options]);

  useEffect(() => {
    if (!storageKey || !preferred || !(options as readonly string[]).includes(preferred)) return;
    window.localStorage.setItem(storageKey, JSON.stringify(preferred));
  }, [preferred,storageKey,options]);

  const activeRunMode = activeRun?.runMode;
  const activeExperimentRunMode = activeRunMode && (options as readonly string[]).includes(activeRunMode)
    ? activeRunMode as ExperimentRunMode
    : '';
  const selectable = preferred && (options as readonly string[]).includes(preferred)
    ? preferred
    : (options[0] ?? '');
  return {
    value: activeExperimentRunMode || selectable,
    options,
    select: setPreferred,
    locked:Boolean(activeRun),
  };
}
