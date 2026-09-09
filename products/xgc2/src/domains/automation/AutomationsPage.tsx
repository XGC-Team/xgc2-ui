import { useMemo,useState } from 'react';
import { EmptyState } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useDeferRouteReady,useProductRouteVisible } from '../../shared/routeReady';
import { WorkspaceBusyOverlay } from '../../shared/WorkspaceBusyOverlay';
import { configAssetTagsIssue } from '../../shared/configAssetTags';
import '../../styles/automation-page.css';
import '../../styles/automation-workspace-shell.css';
import { ConfigAssetTagDialog } from '../assets/assetsPublic';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import { useExecutionTarget } from '../execution/executionPublic';
import { useGroundStationErrorNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import { AutomationDefinitionWorkspace } from './AutomationDefinitionWorkspace';
import { AutomationDefinitionsList } from './AutomationDefinitionsList';
import { CreateAutomationResourceDrawer,DuplicateAutomationDrawer } from './AutomationResourceDrawers';
import { AutomationRunParameterDialog } from './AutomationRunParameterDialog';
import { automationExecutionTargetId,type AutomationDocument } from './automationDefinitionContracts';
import { filterAutomationDocumentsForExecutionTarget } from './automationTargetCatalogModel';
import { isAutomationTriggerKind } from './automationTriggerContracts';
import { useAutomationListExecutionHistory } from './useAutomationListExecutionHistory';
import { useAutomationListExecutionActions } from './useAutomationListExecutionActions';
import { useAutomationPageNavigation } from './useAutomationPageNavigation';
import { useAutomationSourceNavigation } from './useAutomationSourceNavigation';
import { useAutomationPageResources } from './useAutomationPageResources';
import { useAutomationPageSelection } from './useAutomationPageSelection';
import { useAutomationResourceLifecycle } from './useAutomationResourceLifecycle';
import { useAutomationWorkspace } from './useAutomationWorkspace';
import { automationEntrypointFactsForResource } from './automationTriggerState';
import { folderMessage } from './automationPageModel';
import { AutomationCommitConflict } from './automationErrorModel';
import { automationCatalogTags,mergeAutomationCatalogTags } from './automationCatalogTags';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

export function AutomationsPage({ targetId,resourceId,nodeComposition,onOpenDocument,onCloseDocument,onInvalidDocument }: {
  targetId: string;
  resourceId?: string;
  nodeComposition?: AutomationNodeWebComposition;
  onOpenDocument?: (resourceId: string) => void;
  onCloseDocument?: () => void;
  onInvalidDocument?: () => void;
}) {
  const t = useAutomationAuthoringText();
  const routeVisible = useProductRouteVisible();
  const workspace = useAutomationWorkspace(targetId, nodeComposition);
  const [tagEditor,setTagEditor] = useState<AutomationDocument | null>(null);
  const [tagError,setTagError] = useState('');
  // Catalog projection follows the selected execution host. Core authoring is
  // still the store; the list is not a single global bag across hosts.
  const targetDocuments = useMemo(
    () => filterAutomationDocumentsForExecutionTarget(workspace.documents, targetId),
    [targetId,workspace.documents],
  );
  const selected = useAutomationPageSelection({
    targetId,
    resourceId,
    workspaceSelected: workspace.selected,
    selectionNotFound: workspace.selectionResourceId === resourceId && workspace.selectionNotFound,
    openDocument: workspace.open,
    closeDocument: workspace.close,
    onInvalidDocument,
  });
  const sourceNavigation = useAutomationSourceNavigation({
    targetId,openDocument: workspace.open,onOpenDocument,loadRunDetail: workspace.loadRunDetail,
  });
  const navigation = useAutomationPageNavigation({
    openDocument: workspace.open,
    closeDocument: workspace.close,
    onOpenDocument,
    onCloseDocument,
    onClearSourceLocation: sourceNavigation.clearSourceLocation,
  });
  const executionActions = useAutomationListExecutionActions({
    executeDocument: workspace.runDocument,
    stopExecution: workspace.stop,
  });
  const resourceLifecycle = useAutomationResourceLifecycle({
    targetId,
    lifecycle: {
      create: workspace.create,
      duplicate: workspace.duplicate,
      archive: workspace.archive,
      move: workspace.move,
      addNamespace: workspace.addNamespace,
      renameNamespace: workspace.renameNamespace,
      archiveNamespace: workspace.archiveNamespace,
    },
    onCreated: (createdResourceId) => onOpenDocument?.(createdResourceId),
  });
  // Exact document reads establish authoring truth even if the catalog request
  // failed. The selection owner checks its execution target policy directly.
  const editingDocument = resourceLifecycle.automationDraft?.document ?? selected;
  const loadingSelection = Boolean(resourceId) && !editingDocument
    && (workspace.selectionResourceId !== resourceId || workspace.selectionLoading);
  useDeferRouteReady(resourceId ? loadingSelection : !workspace.documentsLoaded && !workspace.documentsError);
  const executionTarget = useExecutionTarget(editingDocument
    ? automationExecutionTargetId(editingDocument.spec.targetPolicy, targetId)
    : targetId);
  useAutomationPageResources({
    catalog: workspace.catalog,
    refreshMCPConnections: workspace.refreshMCPConnections,
  });
  const listVisible = routeVisible && !resourceId && !editingDocument;
  const latestRunsByResourceId = useAutomationListExecutionHistory({
    visible: listVisible,
    documents: targetDocuments,
    runSummaries: workspace.runSummaries,
    refreshExecutionHistory: workspace.refreshExecutionHistory,
  });
  const listError = folderMessage(tagError
    || resourceLifecycle.mutationError
    || executionActions.executionError
    || navigation.navigationError
    || workspace.documentsError
    || workspace.namespacesError
    || workspace.catalogError
    || workspace.activationsError
    || workspace.error);
  const currentTagEditor = tagEditor
    ? targetDocuments.find((item) => item.head.resourceId === tagEditor.head.resourceId) ?? tagEditor
    : null;

  async function updateAutomationTags(target: AutomationDocument, catalogTags: string[]) {
    const tags = mergeAutomationCatalogTags(target.spec.metadata.tags, catalogTags);
    const tagIssue = configAssetTagsIssue(tags);
    if (tagIssue) {
      setTagError(tagIssue);
      return;
    }
    setTagError('');
    try {
      await workspace.commit(
        target,
        { ...target.spec,metadata: { ...target.spec.metadata,tags } },
        'Update Automation tags',
        target.head.namespaceId ?? '',
        false,
      );
      setTagEditor(null);
    } catch (cause) {
      if (cause instanceof AutomationCommitConflict) {
        setTagEditor(null);
        setTagError('The Automation changed elsewhere. The latest data was loaded; reopen tags before editing again.');
      } else {
        setTagError(folderMessage(cause instanceof Error ? cause.message : String(cause)));
      }
    }
  }

  useGroundStationErrorNotification(targetId, listError, {
    title: 'Automations',source: 'automation-definitions',dedupeKey: 'automation-definitions:error',
  });

  if (editingDocument) {
    const isNewDraft = editingDocument === resourceLifecycle.automationDraft?.document;
    return (
      <AutomationDefinitionWorkspace
        document={editingDocument}
        authoring={{
          catalog: workspace.catalog,
          processDefinitions: executionTarget.processDefinitions,
          automationDocuments: targetDocuments,
          mcpConnections: workspace.mcpConnections,
          mcpCatalogs: workspace.mcpCatalogs,
          nodeComposition,
          onBack: isNewDraft ? resourceLifecycle.discardAutomationDraft : navigation.close,
          onCommit: isNewDraft ? resourceLifecycle.saveAutomationDraft : workspace.commit,
        }}
        execution={{
          targetId,
          processInstances: executionTarget.processInstances,
          preferredRunId: sourceNavigation.sourceLocation?.resourceId === editingDocument.head.resourceId
            ? sourceNavigation.sourceLocation.runId : navigation.preferredRunId,
          sourceLocation: sourceNavigation.sourceLocation?.resourceId === editingDocument.head.resourceId
            ? sourceNavigation.sourceLocation : undefined,
          historyEntries: workspace.historyEntries,
          historyComplete: workspace.historyComplete,
          historyUnavailableSources: workspace.historyUnavailableSources,
          retryingIngressEventIds: workspace.retryingIngressEventIds,
          ingressRetryErrors: workspace.ingressRetryErrors,
          ingressTransitionLedgers: workspace.ingressTransitionLedgers,
          hasMoreRuns: workspace.hasMoreRuns,
          runsLoadingMore: workspace.runsLoadingMore,
          runDetailsById: workspace.runDetailsById,
          streamState: workspace.executionStreamState,
          onRun: executionActions.runFromWorkspace,
          onStop: workspace.stop,
          onRefreshRun: workspace.refreshRun,
          onRetainRunDetail:workspace.retainRunDetail,
          onLoadMoreRuns: workspace.loadMoreRuns,
          onExecutionHistoryVisibilityChange: workspace.setExecutionHistoryVisible,
          onRetryExecutionIngress: workspace.retryExecutionIngress,
          onLoadIngressTransitions: workspace.loadIngressTransitions,
          onLoadMoreIngressTransitions: workspace.loadMoreIngressTransitions,
          onLoadRun: workspace.loadRun,
          onOpenRelatedRun: navigation.openRelatedRun,
        }}
        triggers={{
          activations: automationEntrypointFactsForResource(workspace.activations, editingDocument.head.resourceId),
          activationCredentials: automationEntrypointFactsForResource(
            workspace.activationCredentials,
            editingDocument.head.resourceId,
          ),
          testListenerSessions: automationEntrypointFactsForResource(
            workspace.testListeners,
            editingDocument.head.resourceId,
          ),
          onActivate: workspace.activate,
          onDeactivate: workspace.deactivate,
          onDismissActivationCredential: workspace.dismissActivationCredential,
          onStartTestListener: workspace.startTestListener,
          onCancelTestListener: workspace.cancelTestListener,
          onSubmitTestEvent: workspace.submitTestEvent,
          onRunOnce: workspace.runOnce,
        }}
      />
    );
  }

  if (resourceId) {
    const notFound = workspace.selectionResourceId === resourceId && workspace.selectionNotFound;
    const unavailable = !loadingSelection && !notFound && Boolean(workspace.error);
    return (
      <div className="automation-resource-state xgc-workspace-full-span" data-xgc-role="automation-definition-loading" data-xgc-id={resourceId}>
        {loadingSelection ? <WorkspaceBusyOverlay id="automation-document" label={t('Loading Automation')} /> : <EmptyState
          className="automation-resource-empty"
          title={notFound ? t('Automation not found') : t('Automation unavailable')}
          description={unavailable ? t('The Automation could not be loaded. Retry the request or return to the list.') : undefined}
          actions={(
            <>
              {!notFound && <ControlButton
                dataXgcRole="automation-definition-retry" dataXgcId={resourceId}
                onClick={() => { void Promise.allSettled([workspace.open(resourceId),workspace.refresh()]); }}
              >{t('Retry')}</ControlButton>}
              <ControlButton dataXgcRole="automation-definition-back" dataXgcId={resourceId} onClick={navigation.close}>
                {t('Back to Automations')}
              </ControlButton>
            </>
          )}
        />}
      </div>
    );
  }

  return (
    <>
      <AutomationDefinitionsList
        key={targetId}
        targetId={targetId}
        documents={targetDocuments}
        namespaces={workspace.namespaces}
        latestRunsByResourceId={latestRunsByResourceId}
        loading={workspace.documentsLoading || workspace.namespacesLoading}
        startingResourceIds={executionActions.startingResourceIds}
        stoppingRunIds={executionActions.stoppingRunIds}
        onCreate={() => resourceLifecycle.setCreateOpen(true)}
        onOpen={navigation.open}
        onRun={executionActions.run}
        onStop={executionActions.stopLatestRun}
        onDuplicate={resourceLifecycle.duplicateFromList}
        onArchive={(document) => void resourceLifecycle.archive(document)}
        onRenameFolder={(namespace, name) => void resourceLifecycle.renameFolder(namespace, name)}
        onArchiveFolder={(namespace) => void resourceLifecycle.archiveFolder(namespace)}
        onMove={(document, namespaceId) => void resourceLifecycle.move(document, namespaceId)}
        onEditTags={setTagEditor}
        onUpdateTags={(document, tags) => void updateAutomationTags(document, tags)}
      />
      {currentTagEditor && (
        <ConfigAssetTagDialog
          name={currentTagEditor.spec.metadata.name}
          resourceId={currentTagEditor.head.resourceId}
          tags={automationCatalogTags(currentTagEditor.spec.metadata.tags)}
          rolePrefix="automation"
          onClose={() => setTagEditor(null)}
          onSave={(tags) => void updateAutomationTags(currentTagEditor, tags)}
        />
      )}
      {resourceLifecycle.createOpen && (
        <CreateAutomationResourceDrawer
          namespaces={workspace.namespaces}
          canCreateAutomation={workspace.catalog.some((entry) => isAutomationTriggerKind(entry.kind))}
          onClose={() => resourceLifecycle.setCreateOpen(false)}
          onCreateAutomation={resourceLifecycle.createAutomation}
          onCreateFolder={resourceLifecycle.createFolder}
        />
      )}
      {resourceLifecycle.duplicateDocument && (
        <DuplicateAutomationDrawer
          document={resourceLifecycle.duplicateDocument}
          namespaces={workspace.namespaces}
          onClose={() => resourceLifecycle.setDuplicateDocument(null)}
          onDuplicate={resourceLifecycle.duplicateFromDrawer}
        />
      )}
      {executionActions.parameterDocument && (
        <AutomationRunParameterDialog
          document={executionActions.parameterDocument}
          onClose={() => executionActions.setParameterDocument(null)}
          onRun={(parameters) => executionActions.runFromWorkspace(executionActions.parameterDocument!, parameters)}
        />
      )}
      {resourceLifecycle.confirmationDialog}
    </>
  );
}
