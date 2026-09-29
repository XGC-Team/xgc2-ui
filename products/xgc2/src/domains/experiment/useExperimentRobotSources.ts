import { useEffect,useMemo,useState } from 'react';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';
import type { ExperimentRobotBinding } from './experimentModel';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';
import {
  experimentRobotConfigSourceLabel,
  type ExperimentRobotSourceLabel,
} from './experimentRunModePresentation';
import { getExperimentAtCommit } from './experimentService';
import type { ExperimentSessionView } from './experimentWorkflowModel';

type FrozenRoster = {
  key: string;
  status: 'loading' | 'ready' | 'failed';
  bindings: readonly ExperimentRobotBinding[];
};

const EMPTY_FROZEN_ROSTER: FrozenRoster = { key: '',status: 'failed',bindings: [] };

/**
 * The one Session that owns this Experiment's frozen roster on this target.
 * opening/active/stopping Sessions still run their frozen configuration; an
 * absent sessionViews snapshot or more than one candidate is ambiguous
 * evidence, never a reason to fall back to the editable draft.
 */
export function experimentRobotSourceSession(
  runtime: ExperimentProcessRuntimeProjection | undefined,
  targetId: string,
  experimentResourceId: string,
): ExperimentSessionView | 'ambiguous' | undefined {
  if (!runtime || !targetId || !experimentResourceId) return undefined;
  if (!runtime.sessionViews) return 'ambiguous';
  const matches = runtime.sessionViews.filter((view) => (
    view.session.targetId === targetId
    && view.session.experimentResourceId === experimentResourceId
    && (view.session.state === 'opening' || view.session.state === 'active' || view.session.state === 'stopping')
  ));
  if (matches.length === 0) return undefined;
  return matches.length === 1 ? matches[0] : 'ambiguous';
}

/**
 * Always-visible simulation/physical source for each draft Robot slot.
 *
 * While an exact Session owns the roster, labels come from its frozen commit
 * (loaded through the existing immutable-commit read); the editable HEAD is
 * never a substitute, and a differing draft only earns a compact next-start
 * hint. Requests are keyed by Session id + commit; a late or aborted response
 * must not paint a previous Session's sources onto new cards.
 */
export function useExperimentRobotSources(input: {
  runtime: ExperimentProcessRuntimeProjection | undefined;
  targetId: string;
  experimentResourceId: string;
  bindings: readonly ExperimentRobotBinding[];
  composition?: RobotAssetKindComposition;
}): { loading: boolean; labels: ReadonlyMap<string,ExperimentRobotSourceLabel> } {
  const session = experimentRobotSourceSession(input.runtime, input.targetId, input.experimentResourceId);
  const sessionView = session && session !== 'ambiguous' ? session : undefined;
  const sessionActive = Boolean(sessionView);
  const commitId = sessionView?.session.experimentCommitId ?? '';
  const digest = sessionView?.session.experimentDigest ?? '';
  const frozenKey = sessionView ? `${sessionView.session.id}:${commitId}` : '';
  const experimentResourceId = input.experimentResourceId;
  const composition = input.composition;
  const [frozen, setFrozen] = useState<FrozenRoster>(EMPTY_FROZEN_ROSTER);

  useEffect(() => {
    if (!sessionActive || !frozenKey) return;
    if (!commitId) {
      setFrozen({ key: frozenKey,status: 'failed',bindings: [] });
      return;
    }
    const controller = new AbortController();
    setFrozen({ key: frozenKey,status: 'loading',bindings: [] });
    getExperimentAtCommit(experimentResourceId, commitId, controller.signal, composition)
      .then((document) => {
        if (controller.signal.aborted) return;
        const belongs = document.head.resourceId === experimentResourceId
          && (!digest || document.head.digest === digest);
        setFrozen(belongs
          ? { key: frozenKey,status: 'ready',bindings: document.spec.robots }
          : { key: frozenKey,status: 'failed',bindings: [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFrozen({ key: frozenKey,status: 'failed',bindings: [] });
      });
    return () => controller.abort();
  }, [sessionActive, frozenKey, commitId, digest, experimentResourceId, composition]);

  const selectedRunMode = input.runtime?.selectedRunMode ?? '';
  const bindings = input.bindings;
  const frozenCurrent = frozen.key === frozenKey ? frozen : undefined;
  const frozenLoading = Boolean(sessionView && commitId)
    && (!frozenCurrent || frozenCurrent.status === 'loading');
  const labels = useMemo(() => {
    const running = session === 'ambiguous' || Boolean(sessionView);
    const frozenReady = Boolean(sessionView) && frozenCurrent?.status === 'ready';
    const frozenBySlot = new Map(
      (frozenReady && frozenCurrent ? frozenCurrent.bindings : []).map((binding) => [binding.id, binding]),
    );
    return new Map(bindings.map((binding) => {
      const frozenBinding = frozenBySlot.get(binding.id);
      const inFrozenRoster = Boolean(
        sessionView && frozenBinding && frozenBinding.ref.resourceId === binding.ref.resourceId,
      );
      return [binding.id, experimentRobotConfigSourceLabel({
        running,
        frozenLoading,
        frozenReady,
        sessionRunMode: sessionView?.session.runMode ?? '',
        selectedRunMode,
        inFrozenRoster,
        draftHybridSource: binding.hybridSource,
        frozenHybridSource: inFrozenRoster ? frozenBinding?.hybridSource : undefined,
      })] as const;
    }));
  }, [session, sessionView, frozenCurrent, bindings, selectedRunMode, frozenLoading]);

  return { loading: frozenLoading, labels };
}
