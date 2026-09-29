import { useEffect } from 'react';
import {
  AutomationGraph,
  projectAutomationGraphRuntime,
  type AutomationDocument,
  type AutomationNodeCatalogEntry,
  type AutomationRunDetail,
} from '../../domains/automation/automationPublic';

export function ScientificGalleryWorkflowView({
  panelId,
  workflow,
  detail,
  catalog,
  loadRunDetail,
}: {
  panelId: string;
  workflow?: AutomationDocument;
  detail?: AutomationRunDetail;
  catalog: AutomationNodeCatalogEntry[];
  loadRunDetail?: (id: string,expectedRevision?: number) => Promise<AutomationRunDetail>;
}) {
  const runId = detail?.run?.id;
  useEffect(() => {
    if (runId && loadRunDetail && !detail?.snapshot && !detail?.loading && !detail?.error) {
      void loadRunDetail(runId,detail.run?.revision);
    }
  },[detail?.error,detail?.loading,detail?.run?.revision,detail?.snapshot,loadRunDetail,runId]);
  if (!workflow) {
    return (
      <div
        className="scientific-gallery-workflow"
        data-state="empty"
        data-xgc-id={panelId}
        data-xgc-role="scientific-gallery-workflow"
      />
    );
  }
  const graphRuntime = projectAutomationGraphRuntime(detail);
  return (
    <div
      className="scientific-gallery-workflow"
      data-state="ready"
      data-xgc-id={panelId}
      data-xgc-role="scientific-gallery-workflow"
    >
      <AutomationGraph
        activeRuntimeNodeIds={graphRuntime.activeRuntimeNodeIds}
        catalog={catalog}
        controlsId={`scientific-gallery-${panelId}-${workflow.head.resourceId}`}
        definition={detail?.snapshot?.automationSpec ?? workflow.spec}
        editable={false}
        nodeRuntimeFacts={graphRuntime.nodeRuntimeFacts}
        nodeSummaries={detail?.nodeSummaries ?? []}
      />
    </div>
  );
}
