import { ExperimentStartupGraphView } from '../../domains/experiment/experimentPublic';
import type { ExperimentProcessRuntimeProjection } from '../../domains/experiment/experimentPublic';

export function GazeboWorldCameraWorkflowView({ panelId,runtime,workflowResourceId }: {
  panelId:string;
  runtime:ExperimentProcessRuntimeProjection|undefined;
  workflowResourceId:string;
}) {
  return (
    <ExperimentStartupGraphView
      panelId={panelId}
      runtime={runtime}
      workflowResourceIds={workflowResourceId ? [workflowResourceId] : []}
      selectedId={workflowResourceId || undefined}
      className="gazebo-world-camera-panel-workflow"
      dataXgcRole="gazebo-world-camera-workflow"
      dataXgcId={panelId}
    />
  );
}
