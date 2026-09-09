import { ChevronDown,ChevronUp,CircleAlert } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import '../../styles/automation-editor-logs-shell.css';
import type { ProcessInstance } from '../execution/executionPublic';
import type { AutomationSpec } from './automationDefinitionContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { isAutomationExecutionRunActive } from './automationRunSummaryModel';
import { AutomationEditorNodeResults,AutomationEditorRunOverview } from './AutomationEditorRunOverview';
import { AutomationEditorRunInspector } from './AutomationEditorRunInspector';
import {
  automationEditorContextIssues,
  automationEditorExecutionSummary,
  automationEditorLogSources,
  automationEditorNodeResults,
  automationEditorPanelID,
  type AutomationDetailView,
  type AutomationRunView,
} from './automationEditorLogModel';
import {
  AUTOMATION_EDITOR_LOG_MIN_HEIGHT,
  automationEditorLogPanelMaxHeight,
  useAutomationEditorLogPanelHeight,
} from './useAutomationEditorLogPanelHeight';

export function AutomationEditorLogs({
  resourceId,
  executionTargetId,
  run,
  detail,
  definition,
  processInstances,
  selectedNodeId,
  expanded,
  onSelectedNodeChange,
  onExpandedChange,
  onPanelHeightChange,
}: {
  resourceId: string;
  executionTargetId: string;
  run?: AutomationRunView;
  detail?: AutomationRunDetail;
  definition: AutomationSpec;
  processInstances: ProcessInstance[];
  selectedNodeId: string;
  expanded: boolean;
  onSelectedNodeChange: (nodeId: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  onPanelHeightChange: (height: number) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const autoSelectedRuns = useRef(new Set<string>());
  const [consoleRunId, setConsoleRunId] = useState('');
  const [viewSelection, setViewSelection] = useState<{ context: string;view: AutomationDetailView }>({ context: '',view: 'data' });
  const [sourceSelection, setSourceSelection] = useState<{ context: string;sourceKey: string }>({ context: '',sourceKey: '' });
  const ownedProcesses = useMemo(() => run
    ? processInstances.filter((instance) => instance.ownerType === 'orchestration-run' && instance.ownerId === run.id)
    : [], [processInstances,run]);
  const nodeResults = useMemo(() => automationEditorNodeResults(definition, detail?.nodeSummaries ?? []), [definition,detail?.nodeSummaries]);
  const sources = useMemo(() => run
    ? automationEditorLogSources(run, definition, ownedProcesses, executionTargetId)
    : [], [definition,executionTargetId,ownedProcesses,run]);
  const selectedResult = selectedNodeId ? nodeResults.find((result) => result.node.id === selectedNodeId) : undefined;
  const runConsoleOpen = Boolean(run && consoleRunId === run.id && !selectedResult);
  const detailOpen = Boolean(selectedResult || runConsoleOpen);
  const contextID = run ? `${run.id}:${selectedResult?.node.id ?? 'run'}` : '';
  const defaultView: AutomationDetailView = selectedResult ? 'data' : 'logs';
  const activeView = viewSelection.context === contextID ? viewSelection.view : defaultView;
  const visibleSources = selectedResult
    ? sources.filter((source) => source.entityType === 'orchestration' || source.nodeId === selectedResult.node.id)
    : sources;
  const defaultSource = selectedResult
    ? visibleSources.find((source) => source.nodeId === selectedResult.node.id) ?? visibleSources[0]
    : visibleSources[0];
  const selectedSourceKey = sourceSelection.context === contextID ? sourceSelection.sourceKey : '';
  const selectedSource = visibleSources.find((source) => source.key === selectedSourceKey) ?? defaultSource;
  const contextIssues = run
    ? automationEditorContextIssues(run, detail, definition, ownedProcesses, selectedResult?.node.id)
    : [];
  const nodeErrors = (detail?.nodeSummaries ?? []).filter((node) => node.status === 'failed' || Boolean(node.error));
  const processErrors = ownedProcesses.filter((instance) => Boolean(instance.lastError));
  const errorCount = nodeErrors.length + processErrors.length;
  const panelID = automationEditorPanelID(resourceId);
  const { panelHeight,startResize,resizeByKeyboard } = useAutomationEditorLogPanelHeight(panelRef);

  useLayoutEffect(() => onPanelHeightChange(panelHeight), [onPanelHeightChange,panelHeight]);

  useEffect(() => {
    if (!expanded || !run || isAutomationExecutionRunActive(run) || selectedNodeId || runConsoleOpen || autoSelectedRuns.current.has(run.id)) return;
    const reported = nodeResults.filter((result) => result.run);
    if (reported.length === 0) return;
    autoSelectedRuns.current.add(run.id);
    const next = reported.find((result) => result.run?.status === 'failed') ?? reported.at(-1);
    if (next) onSelectedNodeChange(next.node.id);
  }, [expanded,nodeResults,onSelectedNodeChange,run,runConsoleOpen,selectedNodeId]);

  function selectNode(nodeID: string) {
    setConsoleRunId('');
    onSelectedNodeChange(selectedNodeId === nodeID ? '' : nodeID);
  }

  function openRunConsole() {
    if (!run) return;
    onSelectedNodeChange('');
    setConsoleRunId(run.id);
  }

  function closeDetails() {
    setConsoleRunId('');
    onSelectedNodeChange('');
  }

  function selectView(view: AutomationDetailView) {
    setViewSelection({ context: contextID,view });
  }

  return (
    <section
      ref={panelRef}
      className="automation-editor-logs"
      data-xgc-expanded={expanded ? 'true' : 'false'}
      data-xgc-detail={detailOpen ? 'open' : 'closed'}
      aria-label="Editor logs"
      data-xgc-role="automation-editor-logs"
      data-xgc-id={run?.id ?? resourceId}
    >
      {expanded && (
        <div
          className="automation-editor-logs-resize-handle"
          role="separator"
          tabIndex={0}
          aria-label="Resize execution panel"
          aria-orientation="horizontal"
          aria-valuemin={AUTOMATION_EDITOR_LOG_MIN_HEIGHT}
          aria-valuemax={automationEditorLogPanelMaxHeight(panelRef.current)}
          aria-valuenow={panelHeight}
          data-xgc-role="automation-editor-logs-resize-handle"
          data-xgc-id={resourceId}
          onPointerDown={startResize}
          onKeyDown={resizeByKeyboard}
        />
      )}

      <header className="automation-editor-logs-header">
        <ControlButton
          className="automation-editor-logs-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={panelID}
          data-xgc-role="automation-editor-logs-toggle"
          data-xgc-id={resourceId}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className="automation-editor-logs-title"><strong>Logs</strong></span>
          <span className="automation-editor-logs-summary">
            {run ? <span>{automationEditorExecutionSummary(run.status, run.startedAt, run.finishedAt ?? run.updatedAt)}</span> : <span>No execution data</span>}
            {errorCount > 0 && <span className="automation-editor-logs-error-count"><CircleAlert size={12} aria-hidden="true" />{errorCount}</span>}
          </span>
          {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
        </ControlButton>
      </header>

      {expanded && (
        <div
          id={panelID}
          className="automation-editor-logs-body"
          role="region"
          aria-label="Current run logs"
          data-xgc-role="automation-editor-logs-content"
          data-xgc-id={run?.id ?? resourceId}
        >
          {!run ? (
            <div className="automation-editor-logs-empty">
              <strong>No execution data yet</strong>
              <span>Run this Automation to inspect its node inputs, outputs, errors, and process logs.</span>
            </div>
          ) : (
            <>
              <aside className="automation-editor-run-pane" data-xgc-density={detailOpen ? 'compact' : 'full'} aria-label="Execution overview">
                <AutomationEditorRunOverview
                  run={run}
                  detail={detail}
                  targetId={executionTargetId}
                  reported={nodeResults.filter((result) => result.run).length}
                  total={nodeResults.length}
                  errorCount={errorCount}
                  compact={detailOpen}
                  onOpenRunLogs={openRunConsole}
                />
                <AutomationEditorNodeResults
                  run={run}
                  detail={detail}
                  results={nodeResults}
                  selectedNodeId={selectedResult?.node.id ?? ''}
                  compact={detailOpen}
                  onSelect={selectNode}
                />
              </aside>

              {detailOpen && (
                <AutomationEditorRunInspector
                  run={run}
                  result={selectedResult}
                  activeView={activeView}
                  issues={contextIssues}
                  sources={visibleSources}
                  selectedSource={selectedSource}
                  onSelectView={selectView}
                  onSelectSource={(sourceKey) => setSourceSelection({ context: contextID,sourceKey })}
                  onClose={closeDetails}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
