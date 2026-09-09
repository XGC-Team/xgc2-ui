import { ExperimentStartupGraphView } from '../../domains/experiment/experimentPublic';
import type { ExperimentProcessRuntimeProjection } from '../../domains/experiment/experimentPublic';

export function RobotSimulationWorkflow({ panelId,runtime,workflowResourceId }: {
  panelId: string;
  runtime: ExperimentProcessRuntimeProjection | undefined;
  workflowResourceId:string;
}) {
  return (
    <ExperimentStartupGraphView
      panelId={panelId}
      runtime={runtime}
      workflowResourceIds={workflowResourceId ? [workflowResourceId] : []}
      selectedId={workflowResourceId || undefined}
      className="robot-simulation-workflow"
      dataXgcRole="robot-simulation-workflow-view"
      dataXgcId={panelId}
    />
  );
}
