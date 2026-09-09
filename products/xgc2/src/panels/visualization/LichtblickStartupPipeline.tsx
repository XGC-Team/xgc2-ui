import { CircleDot,Network,Scan } from 'lucide-react';
import type { ReactNode } from 'react';
import { WorkflowStartupPipeline } from '../../components/WorkflowStartupPipeline';
import {
  workflowStartupIdentityFactSamples,
  type WorkflowStartupStage,
} from '../../components/workflowStartupPipelineModel';
import {
  LICHTBLICK_BRIDGE_PROCESS_DEFINITION_ID,
  LICHTBLICK_WEB_PROCESS_DEFINITION_ID,
  projectLichtblickStartup,
  type LichtblickStartupStage,
  type LichtblickStartupStageId,
} from './lichtblickStartupPipeline';

const STAGE_TITLE: Record<LichtblickStartupStageId,string> = {
  run: 'Run',
  viewer: 'Viewer',
  bridge: 'Bridge',
};

const RUN_FACTS = ['No run','Admitted','unavailable','Stopping'] as const;

export function LichtblickStartupPipeline({
  panelId,
  ...input
}: {
  panelId: string;
} & Parameters<typeof projectLichtblickStartup>[0]) {
  const projected = projectLichtblickStartup(input);
  return (
    <WorkflowStartupPipeline
      id={panelId}
      role="lichtblick-empty-state"
      title="Lichtblick"
      phase={projected.phase}
      stages={projected.stages.map(presentStage)}
    />
  );
}

function presentStage(stage: LichtblickStartupStage): WorkflowStartupStage {
  return {
    id: stage.id,
    title: STAGE_TITLE[stage.id],
    fact: stageFact(stage),
    reserve: stageReserve(stage),
    status: stage.status,
    icon: stageIcon(stage.id),
    detail: stage.detail,
  };
}

function stageFact(stage: LichtblickStartupStage) {
  if (stage.id === 'run') {
    if (stage.status === 'failed') return 'unavailable';
    if (stage.status === 'stopping') return 'Stopping';
    if (stage.status === 'ready' || stage.status === 'active') return 'Admitted';
    return 'No run';
  }
  const missing = stage.id === 'viewer' ? 'No viewer' : 'No bridge';
  const identity = stage.identity?.trim();
  if (!identity) return missing;
  if (stage.observedState && stage.observedState !== 'running' && stage.status !== 'idle') {
    return `${identity} · ${stage.observedState}`;
  }
  return identity;
}

function stageReserve(stage: LichtblickStartupStage) {
  if (stage.id === 'run') return [...RUN_FACTS];
  const missing = stage.id === 'viewer' ? 'No viewer' : 'No bridge';
  const identity = stage.identity?.trim()
    || (stage.id === 'viewer' ? LICHTBLICK_WEB_PROCESS_DEFINITION_ID : LICHTBLICK_BRIDGE_PROCESS_DEFINITION_ID);
  return [missing, ...workflowStartupIdentityFactSamples(identity)];
}

function stageIcon(id: LichtblickStartupStageId): ReactNode {
  const size = 12;
  if (id === 'run') return <CircleDot size={size} />;
  if (id === 'viewer') return <Scan size={size} />;
  return <Network size={size} />;
}
