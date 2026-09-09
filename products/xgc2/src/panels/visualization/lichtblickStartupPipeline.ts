import type { ProcessInstance } from '../../domains/execution/executionPublic';
import type { WorkflowStartupPhase,WorkflowStartupStageStatus } from '../../components/workflowStartupPipelineModel';

export const LICHTBLICK_WEB_PROCESS_DEFINITION_ID = 'lichtblick-web';
export const LICHTBLICK_BRIDGE_PROCESS_DEFINITION_ID = 'foxglove-bridge';

export type LichtblickStartupStageId = 'run' | 'viewer' | 'bridge';

export type LichtblickStartupStage = {
  id: LichtblickStartupStageId;
  status: WorkflowStartupStageStatus;
  identity?: string;
  observedState?: ProcessInstance['observedState'];
  detail?: string;
};

export function projectLichtblickStartup(input: {
  phase: WorkflowStartupPhase;
  runActive: boolean;
  runtimeError?: string;
  viewer?: ProcessInstance;
  bridge?: ProcessInstance;
}): { phase: WorkflowStartupPhase; stages: LichtblickStartupStage[] } {
  const error = input.runtimeError?.trim() ?? '';
  const run: LichtblickStartupStage = {
    id: 'run',
    status: error ? 'failed'
      : input.phase === 'stopped' ? 'idle'
      : input.phase === 'stopping' ? 'stopping'
      : input.runActive ? 'ready' : 'pending',
    ...(error ? { detail: error } : {}),
  };
  return {
    phase: input.phase,
    stages: [run,processStage('viewer',input.viewer,input.phase),processStage('bridge',input.bridge,input.phase)],
  };
}

function processStage(
  id: Exclude<LichtblickStartupStageId,'run'>,
  process: ProcessInstance | undefined,
  phase: WorkflowStartupPhase,
): LichtblickStartupStage {
  const detail = process?.lastError?.trim();
  const extra = {
    ...(process ? { identity: process.definitionId,observedState: process.observedState } : {}),
    ...(detail ? { detail } : {}),
  };
  if (phase === 'stopped') return { id,status:'idle',...extra };
  if (phase === 'stopping') return { id,status:'stopping',...extra };
  if (process && processReady(process)) return { id,status:'ready',...extra };
  if (process) return { id,status:'active',...extra };
  return { id,status:'pending',...extra };
}

function processReady(process: ProcessInstance) {
  return process.desiredState === 'running'
    && process.observedState === 'running'
    && process.readiness.status === 'passing';
}
