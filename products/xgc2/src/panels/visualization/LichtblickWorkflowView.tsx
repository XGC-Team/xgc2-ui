import { ExperimentStartupGraphView } from '../../domains/experiment/experimentPublic';
import type { ExperimentProcessRuntimeProjection } from '../../domains/experiment/experimentPublic';

export function LichtblickWorkflowView({ panelId,runtime,workflowResourceId }: {
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
      className="lichtblick-workflow-view"
      dataXgcRole="lichtblick-workflow-view"
      dataXgcId={panelId}
    />
  );
}
