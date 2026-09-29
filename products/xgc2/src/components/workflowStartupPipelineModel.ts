import type { ReactNode } from 'react';

export type WorkflowStartupPhase = 'stopped' | 'starting' | 'stopping';
export type WorkflowStartupStageStatus = 'idle' | 'pending' | 'active' | 'ready' | 'failed' | 'stopping';

export const WORKFLOW_STARTUP_PROCESS_FACT_STATES = [
  'starting',
  'stopping',
  'stopped',
  'exited',
  'failed',
  'lost',
] as const;

export type WorkflowStartupStage = {
  id: string;
  title: string;
  fact: string;
  status: WorkflowStartupStageStatus;
  icon: ReactNode;
  detail?: string;
  reserve?: readonly string[];
};

export type WorkflowStartupWidthCopy = {
  titles: readonly string[];
  facts: readonly string[];
};

export const WORKFLOW_STARTUP_SEND_DURATION_S = 1.6;
export const WORKFLOW_STARTUP_CATCH_UP_DURATION_S = 0.2;
export const WORKFLOW_STARTUP_CATCH_UP_PLAYBACK_RATE =
  WORKFLOW_STARTUP_SEND_DURATION_S / WORKFLOW_STARTUP_CATCH_UP_DURATION_S;

export type WorkflowStartupRailState = {
  sendingId: string;
  passed: Set<string>;
  lastReadyIndex: number;
  currentId: string;
  visualComplete: boolean;
  factsReady: boolean;
};

export function workflowStartupIdentityFactSamples(
  identity: string,
  renderState: (state: string) => string = (state) => state,
) {
  const trimmed = identity.trim();
  if (!trimmed) return [];
  return [
    trimmed,
    ...WORKFLOW_STARTUP_PROCESS_FACT_STATES.map((state) => `${trimmed} · ${renderState(state)}`),
  ];
}

export function workflowStartupWidthCopy(
  title: string,
  stages: readonly Pick<WorkflowStartupStage,'title'|'fact'|'reserve'>[],
  latched: WorkflowStartupWidthCopy = { titles: [], facts: [] },
): WorkflowStartupWidthCopy {
  return {
    titles: uniqueCopy([title, ...stages.map((stage) => stage.title), ...latched.titles]),
    facts: uniqueCopy([
      ...stages.map((stage) => stage.fact),
      ...stages.flatMap((stage) => stage.reserve ?? []),
      ...latched.facts,
    ]),
  };
}

export function workflowStartupFactsReady(
  phase: WorkflowStartupPhase,
  stages: readonly Pick<WorkflowStartupStage,'status'>[],
) {
  if (phase !== 'starting' || stages.length < 2) return false;
  if (stages.some((stage) => stage.status === 'failed')) return false;
  return stages.every((stage) => stage.status === 'ready');
}

/** Destination of the current send is already a ready fact — do not pad 1.6s. */
export function workflowStartupSendingDestinationReady(
  stages: readonly Pick<WorkflowStartupStage,'id'|'status'>[],
  sendingId: string,
) {
  if (!sendingId) return false;
  const index = stages.findIndex((stage) => stage.id === sendingId);
  return index >= 0 && stages[index + 1]?.status === 'ready';
}

export function workflowStartupPresentationComplete(
  phase: WorkflowStartupPhase,
  stages: readonly Pick<WorkflowStartupStage,'id'|'status'>[],
  played: ReadonlySet<string> = new Set(),
) {
  if (!workflowStartupFactsReady(phase, stages)) return false;
  return stages.slice(0, -1).every((stage) => played.has(stage.id));
}

export function workflowStartupRailState(
  phase: WorkflowStartupPhase,
  stages: readonly Pick<WorkflowStartupStage,'id'|'status'>[],
  lastReadyIndex = -1,
  inflightSendingId = '',
  played: ReadonlySet<string> = new Set(),
): WorkflowStartupRailState {
  const empty = (): WorkflowStartupRailState => ({
    sendingId: '',
    passed: new Set<string>(),
    lastReadyIndex: -1,
    currentId: '',
    visualComplete: false,
    factsReady: false,
  });
  if (phase === 'stopped' || stages.length < 2) return empty();

  let observedReady = -1;
  for (let index = 0; index < stages.length; index += 1) {
    if (stages[index]!.status !== 'ready') break;
    observedReady = index;
  }
  const latchedReady = Math.max(lastReadyIndex, observedReady);

  let waitIndex = latchedReady + 1;
  for (let index = 0; index <= waitIndex && index < stages.length; index += 1) {
    if (stages[index]?.status !== 'failed') continue;
    waitIndex = index;
    break;
  }
  const waiting = waitIndex >= 0 && waitIndex < stages.length ? stages[waitIndex] : undefined;
  const currentAt = (index: number) => (index >= 0 ? stages[index]!.id : '');
  const passed = new Set<string>(played);
  const factsReady = workflowStartupFactsReady(phase, stages);
  const visualComplete = workflowStartupPresentationComplete(phase, stages, played);

  if (phase !== 'starting') {
    return {
      sendingId: '',
      passed,
      lastReadyIndex: latchedReady,
      currentId: currentAt(latchedReady),
      visualComplete: false,
      factsReady: false,
    };
  }
  if (waiting?.status === 'failed') {
    return {
      sendingId: '',
      passed,
      lastReadyIndex: latchedReady,
      currentId: waiting.id,
      visualComplete: false,
      factsReady: false,
    };
  }

  const sendingId = nextStartupSendingId({
    stages,
    waitIndex,
    waiting,
    inflightSendingId,
    played,
    latchedReady,
  });
  return {
    sendingId,
    passed,
    lastReadyIndex: latchedReady,
    currentId: waiting?.status === 'active' ? waiting.id : currentAt(latchedReady),
    visualComplete,
    factsReady,
  };
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function nextStartupSendingId({
  stages,
  waitIndex,
  waiting,
  inflightSendingId,
  played,
  latchedReady,
}: {
  stages: readonly Pick<WorkflowStartupStage,'id'|'status'>[];
  waitIndex: number;
  waiting: Pick<WorkflowStartupStage,'id'|'status'> | undefined;
  inflightSendingId: string;
  played: ReadonlySet<string>;
  latchedReady: number;
}) {
  const inflightIndex = inflightSendingId
    ? stages.findIndex((stage) => stage.id === inflightSendingId)
    : -1;
  const inflightDestination = inflightIndex >= 0 ? stages[inflightIndex + 1] : undefined;
  const inflightOpen = Boolean(
    inflightDestination
    && inflightSendingId
    && !played.has(inflightSendingId)
    && inflightDestination.status !== 'failed'
    && inflightDestination.status !== 'idle'
    && (
      inflightIndex === waitIndex - 1
      || inflightDestination.status === 'ready'
      || inflightDestination.status === 'active'
      || inflightIndex + 1 <= latchedReady
    ),
  );
  if (inflightOpen) return inflightSendingId;

  for (let index = 0; index < stages.length - 1; index += 1) {
    if (played.has(stages[index]!.id)) continue;
    const destination = stages[index + 1]!;
    if (destination.status === 'failed' || destination.status === 'idle') return '';
    if (destination.status === 'pending') {
      if (waiting?.status === 'active' && waitIndex === index + 1) return stages[index]!.id;
      return '';
    }
    if (destination.status === 'ready' || destination.status === 'active' || index + 1 <= latchedReady) {
      return stages[index]!.id;
    }
    return '';
  }
  return '';
}

function uniqueCopy(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}
