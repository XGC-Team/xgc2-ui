import { useEffect,useMemo,useRef,type CSSProperties } from 'react';
import '../../styles/automation-workspace-shell.css';
import type { AutomationDefinitionWorkspaceProps } from './AutomationDefinitionWorkspace.types';
import { AutomationEditorLogs } from './AutomationEditorLogs';
import { AutomationExecutionHistory } from './AutomationExecutionHistory';
import { AutomationGraph } from './AutomationGraphView';
import { AutomationNodeDialog } from './AutomationNodeDialog';
import { AutomationNodeLibraryDrawer } from './AutomationNodeLibraryDrawer';
import { AutomationRunParameterDialog } from './AutomationRunParameterDialog';
import {
  AutomationWorkspaceMutationMessages,
  AutomationWorkspaceProtectionNotice,
} from './AutomationWorkspaceMessages';
import { AutomationWorkspaceTopbar } from './AutomationWorkspaceTopbar';
import { AutomationWorkspaceTriggerPanel } from './AutomationWorkspaceTriggerPanel';
import { buildAutomationNodeLibrary } from './automationNodeLibrary';
import { useAutomationDefinitionEditSession } from './useAutomationDefinitionEditSession';
import { useAutomationDefinitionGraphWorkspace } from './useAutomationDefinitionGraphWorkspace';
import { useAutomationDefinitionRuntimeWorkspace } from './useAutomationDefinitionRuntimeWorkspace';
import { useAutomationTriggerAuthoring } from './useAutomationTriggerAuthoring';
import { automationActionForEntry,automationPrimaryAction } from './automationSpecModel';

export function AutomationDefinitionWorkspace({
  document,authoring,execution,triggers,
}: AutomationDefinitionWorkspaceProps) {
  const {
    catalog,processDefinitions = [],automationDocuments = [],
    mcpConnections = [],mcpCatalogs = {},nodeComposition,onBack,onCommit,
  } = authoring;
  const libraryItems = useMemo(
    () => buildAutomationNodeLibrary(catalog, processDefinitions, nodeComposition),
    [catalog,processDefinitions,nodeComposition],
  );
  const edit = useAutomationDefinitionEditSession({
    document,catalog,libraryItems,nodeComposition,onBack,onCommit,
  });
  const trigger = useAutomationTriggerAuthoring({
    document,
    draft: edit.draft,
    dirty: edit.dirty,
    canEdit: edit.canEdit,
    capability: triggers,
    persistDraft: edit.persistDraft,
    onClearMutationMessages: edit.clearMutationMessages,
    onMutationError: edit.reportMutationError,
  });
  const runtime = useAutomationDefinitionRuntimeWorkspace({
    document,
    draft: edit.draft,
    dirty: edit.dirty,
    canEdit: edit.canEdit,
    archived: edit.archived,
    adoptionRevision: edit.adoptionRevision,
    entrypointNodeId: trigger.effectiveEntrypointNodeId,
    triggerNodeCount: trigger.triggerNodes.length,
    triggerKind: trigger.triggerKind,
    saving: edit.saving,
    triggerBusy: trigger.busy,
    capability: execution,
    persistDraft: edit.persistDraft,
    onError: edit.setError,
    onMutationError: edit.reportMutationError,
  });
  const graph = useAutomationDefinitionGraphWorkspace({
    document,
    draft: edit.draft,
    canEdit: edit.canEdit,
    adoptionRevision: edit.adoptionRevision,
    hasCallTrigger: trigger.hasCallTrigger,
    authoring: {
      catalog,libraryItems,automationDocuments,mcpConnections,mcpCatalogs,nodeComposition,
    },
    runtime: {
      targetId: runtime.targetId,
      processInstances: runtime.processInstances,
      workspaceView: runtime.workspaceView,
      busy: runtime.busy,
      runStartedRevision: runtime.runStartedRevision,
      editorRun: runtime.editorRun,
      editorRunDetail: runtime.editorRunDetail,
      editorActiveRuntimeNodeIds: runtime.editorActiveRuntimeNodeIds,
      logsExpanded: runtime.logsExpanded,
      logsPanelHeight: runtime.logsPanelHeight,
      setLogsExpanded: runtime.setLogsExpanded,
      setLogsPanelHeight: runtime.setLogsPanelHeight,
      prepareRun: runtime.prepareRun,
    },
    commitChange: edit.commitChange,
    onError: edit.setError,
    onSave: () => void edit.saveDefinition(Boolean(trigger.busy || runtime.runBusy)).catch(() => undefined),
    onUndo: edit.undo,
    onRedo: edit.redo,
  });
  const resourceId = document.head.resourceId;
  const editorRun = runtime.editorRun;
  const nodeDialogNode = graph.nodeDialogNode;
  const runDialogDocument = runtime.runDialogDocument;
  const canRunToNode = !edit.archived && trigger.triggerKind === 'trigger.manual' && !runtime.busy;
  const selectedAction = automationActionForEntry(edit.draft, trigger.effectiveEntrypointNodeId)
    ?? automationPrimaryAction(edit.draft);
  const appliedSourceRef = useRef<typeof execution.sourceLocation>(undefined);
  const sourceLocation = execution.sourceLocation;
  const openSourceNode = graph.openNode;
  const changeSourceView = runtime.changeWorkspaceView;
  useEffect(() => {
    if (!sourceLocation || sourceLocation === appliedSourceRef.current) return;
    appliedSourceRef.current = sourceLocation;
    if (!sourceLocation.runId) {
      changeSourceView('editor');
      if (sourceLocation.nodeId) openSourceNode(sourceLocation.nodeId);
    }
  }, [changeSourceView,openSourceNode,sourceLocation]);

  return (
    <div
      className="automation-workflow-host xgc-workspace-full-span"
      data-xgc-role="automation-definition-detail"
      data-xgc-id={resourceId}
      data-xgc-protection={edit.protection}
      data-xgc-readonly={edit.readOnly ? 'true' : undefined}
    >
      <AutomationWorkspaceTopbar
        resourceId={resourceId}
        view={runtime.workspaceView}
        action={selectedAction}
        canEdit={edit.canEdit}
        busy={runtime.busy}
        dirty={edit.dirty}
        archived={edit.archived}
        editorRunId={editorRun?.id}
        editorRunActive={runtime.editorRunActive}
        editorRunStopping={runtime.editorRunStopping}
        triggerKind={trigger.triggerKind}
        onViewChange={runtime.changeWorkspaceView}
        onActionChange={(action) => edit.commitChange((current) => ({
          ...current,actions: current.actions.map((candidate) => candidate.id === action.id ? action : candidate),
        }))}
        onSave={() => edit.saveDefinition(Boolean(trigger.busy || runtime.runBusy))}
        onStop={() => { if (editorRun) void runtime.stopRun(editorRun); }}
        onPrepareRun={() => void runtime.prepareRun()}
      />
      {edit.protectedResource && <AutomationWorkspaceProtectionNotice resourceId={resourceId} />}
      {runtime.workspaceView === 'editor' && (
        <section
          className="automation-workspace-editor"
          data-xgc-logs-expanded={runtime.logsExpanded ? 'true' : 'false'}
          style={runtime.logsExpanded
            ? { '--automation-editor-logs-height': `${runtime.logsPanelHeight}px` } as CSSProperties
            : undefined}
          id={`automation-workspace-editor-${resourceId}`}
          role="tabpanel"
          aria-labelledby={`automation-workspace-editor-tab-${resourceId}`}
          data-xgc-role="automation-workspace-panel"
          data-xgc-id="editor"
        >
          <div
            ref={graph.graphHostRef}
            className="automation-workflow-canvas"
            data-xgc-role="automation-workflow-canvas"
            data-xgc-id={resourceId}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) graph.clearSelection();
            }}
          >
            <AutomationGraph
              definition={edit.draft}
              catalog={catalog}
              nodeComposition={nodeComposition}
              nodeSummaries={runtime.editorRunDetail?.nodeSummaries}
              activeRuntimeNodeIds={runtime.editorActiveRuntimeNodeIds}
              editable={edit.canEdit}
              autoLayout={Boolean(document.head.system)}
              selectedNodeId={graph.selectedNodeId}
              selectedEdgeId={graph.selectedEdgeId}
              positions={graph.positions}
              onReady={graph.restoreViewport}
              onViewportChange={graph.saveViewport}
              onTidyUp={graph.tidyNodes}
              onOpenLibrary={graph.toggleNodeLibrary}
              onAddStickyNote={graph.addStickyNote}
              onStickyNoteChange={graph.changeStickyNote}
              onStickyNoteDelete={graph.deleteStickyNote}
              onElementsDelete={graph.deleteElements}
              libraryOpen={graph.libraryOpen}
              controlsId={resourceId}
              onNodeSelect={graph.selectNode}
              onNodeOpen={graph.openNode}
              canRunToNode={canRunToNode}
              onNodeRunTo={(nodeId) => void runtime.prepareRun(nodeId)}
              onNodeDuplicate={graph.duplicateNode}
              onNodeDisplayNameChange={graph.changeNodeDisplayName}
              onEdgeSelect={graph.selectEdge}
              onEdgeInsert={graph.insertNodeOnEdge}
              onOutputAdd={graph.addNodeFromOutput}
              onSelectionChange={graph.changeGraphSelection}
              onSelectionClear={graph.clearSelection}
              onConnect={graph.connect}
              onNodesDelete={graph.deleteNodes}
              onEdgesDelete={graph.deleteEdges}
              onNodePositionChange={graph.moveNode}
              onLibraryDrop={graph.addLibraryNodeAt}
            />
          </div>
          <AutomationEditorLogs
            resourceId={resourceId}
            executionTargetId={runtime.editorRunDetail?.run?.targetId ?? graph.executionTargetId}
            run={runtime.editorRun}
            detail={runtime.editorRunDetail}
            definition={runtime.editorRunDetail?.snapshot?.automationSpec ?? edit.draft}
            processInstances={runtime.processInstances}
            selectedNodeId={graph.selectedNodeId}
            expanded={runtime.logsExpanded}
            onSelectedNodeChange={graph.selectLogNode}
            onExpandedChange={runtime.setLogsExpanded}
            onPanelHeightChange={runtime.setLogsPanelHeight}
          />
        </section>
      )}
      {runtime.workspaceView === 'editor' && (
        <AutomationWorkspaceTriggerPanel
          resourceId={resourceId}
          targetId={execution.targetId ?? graph.executionTargetId}
          triggerNodes={trigger.triggerNodes}
          effectiveEntrypointNodeId={trigger.effectiveEntrypointNodeId}
          selectedEntrypoint={trigger.selectedEntrypoint}
          activation={trigger.activation}
          activationCredential={trigger.activationCredential}
          testListenerSession={trigger.testListenerSession}
          activationDraftMismatch={trigger.activationDraftMismatch}
          busy={runtime.busy}
          archived={edit.archived}
          onEntrypointChange={trigger.selectEntrypoint}
          onRunOnce={trigger.runOnce}
          onActivate={trigger.activate}
          onDeactivate={trigger.deactivate}
          onDismissActivationCredential={trigger.dismissActivationCredential}
          onStartListening={trigger.startListening}
          onCancelListening={trigger.cancelListening}
          onSubmitTestEvent={trigger.submitTestEvent}
        />
      )}
      {runtime.workspaceView === 'executions' && (
        <section
          className="automation-workspace-executions"
          id={`automation-workspace-executions-${resourceId}`}
          role="tabpanel"
          aria-labelledby={`automation-workspace-executions-tab-${resourceId}`}
          data-xgc-role="automation-workspace-panel"
          data-xgc-id="executions"
        >
          <AutomationExecutionHistory
            resourceId={resourceId}
            sourceLocation={execution.sourceLocation}
            entries={runtime.definitionHistoryEntries}
            complete={runtime.historyComplete}
            unavailableSources={runtime.historyUnavailableSources}
            retryingIngressEventIds={runtime.retryingIngressEventIds}
            ingressRetryErrors={runtime.ingressRetryErrors}
            ingressTransitionLedger={runtime.selectedIngressTransitionLedger}
            selectedEntry={runtime.selectedHistoryEntry}
            selectedRun={runtime.selectedRun}
            detail={runtime.selectedRunDetail}
            runDetailsById={runtime.runDetailsById}
            catalog={catalog}
            processInstances={runtime.processInstances}
            relatedRuns={runtime.definitionRuns}
            streamState={runtime.streamState}
            busy={Boolean(runtime.busy)}
            hasMoreRuns={runtime.hasMoreRuns}
            loadingMore={runtime.runsLoadingMore}
            onSelect={runtime.selectRun}
            onRefreshRun={runtime.refreshExecutionRun}
            onLoadMore={runtime.loadMoreRuns}
            onStop={runtime.stopRun}
            onRetryIngress={runtime.retryExecutionIngress}
            onLoadMoreIngressTransitions={runtime.loadMoreIngressTransitions}
            onOpenRelatedRun={runtime.openRelatedRun}
            onOpenRunById={runtime.openRelatedRunById}
          />
        </section>
      )}
      <AutomationWorkspaceMutationMessages
        resourceId={resourceId}
        error={edit.error}
        conflict={edit.conflict}
        onDismissError={() => edit.setError('')}
        onDismissConflict={() => edit.setConflict('')}
      />
      {edit.canEdit && graph.libraryOpen && (
        <AutomationNodeLibraryDrawer
          resourceId={resourceId}
          dataXgcRole="automation-node-library"
          dataXgcId={resourceId}
          items={graph.defaultLibraryItems}
          nodeComposition={nodeComposition}
          onAdd={graph.addLibraryNode}
          onClose={graph.closeNodeLibrary}
        />
      )}
      {nodeDialogNode && (
        <AutomationNodeDialog
          key={graph.nodeDialogNodeId}
          node={nodeDialogNode}
          sourceNodeId={graph.nodeDialogNodeId}
          title={graph.nodeDialogLibraryItem?.label}
          catalog={graph.nodeDialogCatalog}
          parameterSchema={graph.nodeDialogParameterSchema}
          parameterPath={graph.nodeDialogParameterPath}
          parameterOptions={graph.nodeDialogParameterOptions}
          automationDocuments={automationDocuments}
          executionTargetId={graph.executionTargetId}
          nodeSummary={runtime.editorRunDetail?.nodeSummaries
            .find((node) => node.nodeId === graph.nodeDialogNodeId)}
          run={runtime.editorRunDetail?.run}
          inputSources={graph.nodeDialogInputSources}
          runtimeLoading={Boolean(runtime.editorRunDetail?.loading)}
          runtimeError={runtime.editorRunDetail?.error ?? ''}
          editable={edit.canEdit}
          canRun={canRunToNode}
          running={runtime.busy === 'run'}
          nodeComposition={nodeComposition}
          onChange={graph.changeNodeDialog}
          onRunToNode={() => void runtime.prepareRun(graph.nodeDialogNodeId)}
          onClose={graph.closeNodeDialog}
          onError={edit.setError}
        />
      )}
      {runDialogDocument && (
        <AutomationRunParameterDialog
          document={runDialogDocument}
          entrypointNodeId={trigger.effectiveEntrypointNodeId}
          onClose={runtime.closeRunDialog}
          onRun={(parameters) => runtime.startPreparedRun(runDialogDocument, parameters)}
        />
      )}
      {edit.confirmationDialog}
    </div>
  );
}
