import {
  AutomationGraph,
  projectAutomationGraphRuntime,
  type AutomationDocument,
  type AutomationNodeCatalogEntry,
  type AutomationRunDetail,
} from '../../domains/automation/automationPublic';
import { useCameraText } from './cameraMessages';

export function CameraCalibrationWorkflowView({
  kind,
  panelId,
  workflow,
  detail,
  catalog,
}: {
  kind: 'intrinsic' | 'extrinsic';
  panelId: string;
  workflow?: AutomationDocument;
  detail?: AutomationRunDetail;
  catalog: AutomationNodeCatalogEntry[];
}) {
  const t = useCameraText();
  if (!workflow) {
    return (
      <div
        className="panels-camera-calibration-state"
        data-xgc-role="camera-calibration-workflow-state"
        data-xgc-id={`${kind}:${panelId}`}
        data-state="empty"
      />
    );
  }
  const degraded = Boolean(detail && !detail.snapshot);
  const graphRuntime = projectAutomationGraphRuntime(detail);

  return (
    <div
      className="panels-camera-calibration-workflow-view"
      data-xgc-role="camera-calibration-workflow"
      data-xgc-id={`${kind}:${panelId}`}
      data-state={degraded ? 'degraded' : 'ready'}
    >
      {degraded && <p data-xgc-role="camera-calibration-workflow-state" data-xgc-id={`${kind}:${panelId}`}>
        {t('Live immutable Run snapshot is not loaded; showing the current authored definition.')}
      </p>}
      <AutomationGraph
        definition={detail?.snapshot?.automationSpec ?? workflow.spec}
        catalog={catalog}
        nodeSummaries={detail?.nodeSummaries ?? []}
        nodeRuntimeFacts={graphRuntime.nodeRuntimeFacts}
        activeRuntimeNodeIds={graphRuntime.activeRuntimeNodeIds}
        editable={false}
        controlsId={`camera-${kind}-${panelId}-${workflow.head.resourceId}`}
      />
    </div>
  );
}
