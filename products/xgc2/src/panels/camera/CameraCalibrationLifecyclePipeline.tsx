import { Aperture,Camera,CircleDot,Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import { WorkflowStartupPipeline } from '../../components/WorkflowStartupPipeline';
import {
  WORKFLOW_STARTUP_PROCESS_FACT_STATES,
  workflowStartupIdentityFactSamples,
  type WorkflowStartupStage,
} from '../../components/workflowStartupPipelineModel';
import { useCameraText } from './cameraMessages';
import type {
  IntrinsicLifecyclePhase,
  IntrinsicLifecycleStage,
  IntrinsicLifecycleStageId,
} from './cameraIntrinsicWorkspaceModel';

const STAGE_TITLE: Record<IntrinsicLifecycleStageId,string> = {
  run: 'Run',
  camera: 'Camera',
  media: 'Media',
  calibrator: 'Calibrator',
};

export function CameraCalibrationLifecyclePipeline({
  panelId,
  role = 'camera-calibration-lifecycle',
  title = 'Calibration pipeline',
  phase,
  stages,
}: {
  panelId: string;
  role?: string;
  title?: string;
  phase: IntrinsicLifecyclePhase;
  stages: readonly IntrinsicLifecycleStage[];
}) {
  const t = useCameraText();
  return (
    <WorkflowStartupPipeline
      id={panelId}
      role={role}
      title={t(title)}
      phase={phase}
      stages={stages.map((stage) => presentStage(stage,t))}
    />
  );
}

function presentStage(
  stage: IntrinsicLifecycleStage,
  t: ReturnType<typeof useCameraText>,
): WorkflowStartupStage {
  return {
    id: stage.id,
    title: t(STAGE_TITLE[stage.id]),
    fact: stageFact(stage,t),
    reserve: stageReserve(stage,t),
    status: stage.status,
    icon: stageIcon(stage.id),
    detail: stage.detail,
  };
}

function stageFact(
  stage: IntrinsicLifecycleStage,
  t: ReturnType<typeof useCameraText>,
) {
  if (stage.id === 'run') {
    if (stage.status === 'stopping') return t('Stopping');
    if (stage.status === 'ready' || stage.status === 'active') return t('Admitted');
    return t('No run');
  }
  if (stage.id === 'calibrator') {
    if (stage.status === 'failed') return t('failed');
    if (stage.observedState && stage.observedState !== 'running') return t(stage.observedState);
    if (stage.status === 'ready') return t('ready');
    return t('Idle');
  }
  const identity = stage.identity?.trim();
  if (!identity) return stage.id === 'media' ? t('No Media Edge') : t('No source');
  if (stage.observedState && stage.observedState !== 'running' && stage.status !== 'idle') {
    return `${identity} · ${t(stage.observedState)}`;
  }
  return identity;
}

function stageReserve(
  stage: IntrinsicLifecycleStage,
  t: ReturnType<typeof useCameraText>,
) {
  if (stage.id === 'run') return [t('Stopping'), t('Admitted'), t('No run')];
  if (stage.id === 'calibrator') {
    return [
      t('failed'),
      t('ready'),
      t('Idle'),
      ...WORKFLOW_STARTUP_PROCESS_FACT_STATES.map((state) => t(state)),
    ];
  }
  const missing = stage.id === 'media' ? t('No Media Edge') : t('No source');
  const identity = stage.identity?.trim();
  if (!identity) return [missing];
  return [missing, ...workflowStartupIdentityFactSamples(identity,(state) => t(state))];
}

function stageIcon(id: IntrinsicLifecycleStageId): ReactNode {
  const size = 12;
  if (id === 'run') return <CircleDot size={size} />;
  if (id === 'camera') return <Camera size={size} />;
  if (id === 'media') return <Radio size={size} />;
  return <Aperture size={size} />;
}
