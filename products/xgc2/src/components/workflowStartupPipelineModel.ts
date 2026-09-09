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

export function workflowStartupRailState(
  phase: WorkflowStartupPhase,
  stages: readonly Pick<WorkflowStartupStage,'id'|'status'>[],
  lastReadyIndex = -1,
  inflightSendingId = '',
) {
  if (phase === 'stopped' || stages.length < 2) {
    return { sendingId: '', passed: new Set<string>(), lastReadyIndex: -1, currentId: '' };
  }

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

  const passedFor = (sendingId: string) => {
    const passed = new Set<string>();
    for (let index = 0; index < stages.length - 1; index += 1) {
      if (stages[index]!.id === sendingId) continue;
      const destination = stages[index + 1]?.status;
      if (destination === 'ready' || destination === 'failed' || index + 1 <= latchedReady) {
        passed.add(stages[index]!.id);
      }
    }
    return passed;
  };

  if (phase !== 'starting') {
    return { sendingId: '', passed: passedFor(''), lastReadyIndex: latchedReady, currentId: currentAt(latchedReady) };
  }
  if (!waiting || waiting.status === 'failed') {
    return {
      sendingId: '',
      passed: passedFor(''),
      lastReadyIndex: latchedReady,
      currentId: waiting?.id ?? currentAt(latchedReady),
    };
  }

  const inflightIndex = inflightSendingId
    ? stages.findIndex((stage) => stage.id === inflightSendingId)
    : -1;
  const inflightDestination = inflightIndex >= 0 ? stages[inflightIndex + 1] : undefined;
  const inflightOpen = Boolean(
    inflightDestination
    && inflightIndex === waitIndex - 1
    && inflightDestination.status !== 'ready'
    && inflightDestination.status !== 'failed',
  );
  if (waiting.status !== 'active' && !inflightOpen) {
    return { sendingId: '', passed: passedFor(''), lastReadyIndex: latchedReady, currentId: currentAt(latchedReady) };
  }

  const sendingId = inflightOpen
    ? inflightSendingId
    : waitIndex > 0 ? stages[waitIndex - 1]!.id : '';
  return {
    sendingId,
    passed: passedFor(sendingId),
    lastReadyIndex: latchedReady,
    currentId: waiting.status === 'active' ? waiting.id : currentAt(latchedReady),
  };
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
