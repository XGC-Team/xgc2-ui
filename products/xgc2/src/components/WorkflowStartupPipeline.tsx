import { useEffect,useRef,useState } from 'react';
import '../styles/workflow-startup-pipeline.css';
import {
  prefersReducedMotion,
  WORKFLOW_STARTUP_CATCH_UP_PLAYBACK_RATE,
  workflowStartupRailState,
  workflowStartupSendingDestinationReady,
  workflowStartupWidthCopy,
  type WorkflowStartupPhase,
  type WorkflowStartupStage,
  type WorkflowStartupWidthCopy,
} from './workflowStartupPipelineModel';

export function WorkflowStartupPipeline({
  id,
  role = 'workflow-startup-pipeline',
  title,
  phase,
  stages,
  paused = false,
  hidden = false,
  generation,
  onPresentationComplete,
}: {
  id: string;
  role?: string;
  title: string;
  phase: WorkflowStartupPhase;
  stages: readonly WorkflowStartupStage[];
  paused?: boolean;
  hidden?: boolean;
  generation?: string;
  onPresentationComplete?: (generation: string) => void;
}) {
  const busy = phase === 'starting' || phase === 'stopping';
  const generationKey = generation || id;
  const persistKey = `${id}::${generationKey}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [, setPlayedVersion] = useState(0);
  const notifyRef = useRef('');
  const persist = useRef<{
    key: string;
    lastReadyIndex: number;
    sendingId: string;
    played: Set<string>;
    copy: WorkflowStartupWidthCopy;
    armedSendingId: string;
    destReadyAtSendStart: boolean;
    durationLocked: Set<string>;
  }>({
    key: persistKey,
    lastReadyIndex: -1,
    sendingId: '',
    played: new Set(),
    copy: { titles: [], facts: [] },
    armedSendingId: '',
    destReadyAtSendStart: false,
    durationLocked: new Set(),
  });
  if (persist.current.key !== persistKey) {
    persist.current = {
      key: persistKey,
      lastReadyIndex: -1,
      sendingId: '',
      played: new Set(),
      copy: { titles: [], facts: [] },
      armedSendingId: '',
      destReadyAtSendStart: false,
      durationLocked: new Set(),
    };
    notifyRef.current = '';
  } else if (phase === 'stopped') {
    persist.current.lastReadyIndex = -1;
    persist.current.sendingId = '';
    persist.current.played = new Set();
    persist.current.armedSendingId = '';
    persist.current.destReadyAtSendStart = false;
    persist.current.durationLocked = new Set();
    notifyRef.current = '';
  }
  let rails = workflowStartupRailState(
    phase,
    stages,
    persist.current.lastReadyIndex,
    persist.current.sendingId,
    persist.current.played,
  );
  const snapRemaining = prefersReducedMotion() && !paused;
  if ((paused || snapRemaining) && rails.sendingId) {
    let guard = 0;
    do {
      persist.current.played.add(rails.sendingId);
      persist.current.sendingId = '';
      rails = workflowStartupRailState(
        phase,
        stages,
        persist.current.lastReadyIndex,
        '',
        persist.current.played,
      );
      guard += 1;
    } while (snapRemaining && rails.sendingId && guard < stages.length);
  }
  const destReady = workflowStartupSendingDestinationReady(stages, rails.sendingId);
  if (persist.current.armedSendingId !== rails.sendingId) {
    persist.current.armedSendingId = rails.sendingId;
    persist.current.destReadyAtSendStart = destReady;
  }
  if (rails.sendingId && destReady && !persist.current.destReadyAtSendStart) {
    persist.current.durationLocked.add(rails.sendingId);
  }
  persist.current.lastReadyIndex = rails.lastReadyIndex;
  persist.current.sendingId = rails.sendingId;
  persist.current.copy = workflowStartupWidthCopy(title, stages, persist.current.copy);

  useEffect(() => {
    if (hidden || paused || !onPresentationComplete || !rails.visualComplete) return;
    if (notifyRef.current === generationKey) return;
    let cancelled = false;
    let innerId = 0;
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        if (cancelled || notifyRef.current === generationKey) return;
        notifyRef.current = generationKey;
        onPresentationComplete(generationKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerId);
      cancelAnimationFrame(innerId);
    };
  }, [generationKey,hidden,onPresentationComplete,paused,rails.visualComplete]);

  useEffect(() => {
    if (hidden || paused || !rails.sendingId) return;
    if (!persist.current.durationLocked.has(rails.sendingId)) return;
    const root = rootRef.current;
    if (!root) return;
    const send = root.querySelector(`[data-xgc-startup-send="${rails.sendingId}"]`);
    if (!(send instanceof HTMLElement) || typeof send.getAnimations !== 'function') return;
    for (const animation of send.getAnimations()) {
      if (animation.playState === 'running') {
        animation.playbackRate = Math.max(
          animation.playbackRate,
          WORKFLOW_STARTUP_CATCH_UP_PLAYBACK_RATE,
        );
      }
    }
  }, [hidden,paused,rails.sendingId,destReady]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onAnimationEnd = (event: Event) => {
      const animation = event as AnimationEvent;
      if (isStartupSendHead(animation)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const stageId = target.getAttribute('data-xgc-startup-send');
      if (!stageId) return;
      if (persist.current.played.has(stageId) && persist.current.sendingId !== stageId) return;
      persist.current.played.add(stageId);
      persist.current.sendingId = '';
      setPlayedVersion((value) => value + 1);
    };
    node.addEventListener('animationend', onAnimationEnd, true);
    return () => node.removeEventListener('animationend', onAnimationEnd, true);
  }, []);

  return (
    <div
      ref={rootRef}
      className="workflow-startup-pipeline"
      data-xgc-role={role}
      data-xgc-id={id}
      data-xgc-generation={generationKey}
      data-xgc-facts-ready={rails.factsReady ? 'true' : 'false'}
      data-xgc-visual-complete={rails.visualComplete ? 'true' : 'false'}
      data-state={phase}
      hidden={hidden || undefined}
      aria-busy={busy || undefined}
      aria-label={title}
    >
      <div className="workflow-startup-pipeline-frame">
        <header className="workflow-startup-pipeline-header">
          <strong data-xgc-role={`${role}-title`} data-xgc-id={id}>{title}</strong>
        </header>
        <ol className="workflow-startup-pipeline-stages">
          <li className="workflow-startup-pipeline-sizer" aria-hidden="true">
            <span className="workflow-startup-pipeline-mark" />
            <span className="workflow-startup-pipeline-body">
              {persist.current.copy.titles.map((sample) => (
                <span
                  key={`title:${sample}`}
                  className="workflow-startup-pipeline-sizer-line workflow-startup-pipeline-heading"
                  data-sample={sample}
                />
              ))}
              {persist.current.copy.facts.map((sample) => (
                <span
                  key={`fact:${sample}`}
                  className="workflow-startup-pipeline-sizer-line workflow-startup-pipeline-fact"
                  data-sample={sample}
                />
              ))}
            </span>
          </li>
          {stages.map((stage,index) => (
            <li
              key={stage.id}
              className="workflow-startup-pipeline-stage"
              data-xgc-role={`${role}-stage`}
              data-xgc-id={`${id}:${stage.id}`}
              data-xgc-status={stage.status}
              data-current={stage.id === rails.currentId ? 'true' : 'false'}
              title={stage.detail || undefined}
            >
              <span className="workflow-startup-pipeline-mark" aria-hidden="true">{stage.icon}</span>
              {index < stages.length - 1 ? (
                <span
                  className="workflow-startup-pipeline-rail"
                  aria-hidden="true"
                  data-sending={stage.id === rails.sendingId ? 'true' : 'false'}
                  data-passed={rails.passed.has(stage.id) ? 'true' : 'false'}
                  data-catch-up={catchUpSending(stage.id, rails.sendingId, destReady, persist.current) ? 'true' : 'false'}
                >
                  <span
                    className="workflow-startup-pipeline-send"
                    data-xgc-startup-send={stage.id}
                  />
                </span>
              ) : null}
              <span className="workflow-startup-pipeline-body">
                <strong
                  className="workflow-startup-pipeline-heading"
                  data-xgc-role={`${role}-stage-title`}
                  data-xgc-id={`${id}:${stage.id}`}
                >
                  {stage.title}
                </strong>
                <span
                  className="workflow-startup-pipeline-fact"
                  data-xgc-role={`${role}-stage-fact`}
                  data-xgc-id={`${id}:${stage.id}`}
                >
                  {stage.fact}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function catchUpSending(
  stageId: string,
  sendingId: string,
  destReady: boolean,
  persist: { durationLocked: ReadonlySet<string> },
) {
  return destReady
    && stageId === sendingId
    && !persist.durationLocked.has(stageId);
}

function isStartupSendHead(event: Pick<AnimationEvent,'animationName' | 'pseudoElement'>) {
  if (event.pseudoElement === '::after' || event.pseudoElement === '::before') return true;
  return event.animationName === 'workflow-startup-send-head';
}
