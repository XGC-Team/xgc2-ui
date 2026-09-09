import { CodeBlock,EmptyState } from '@xgc2/ui-react';
import { useEffect,useMemo,useState } from 'react';
import {
  AutomationGraph,
  projectAutomationGraphRuntime,
  isAutomationExecutionRunActive,
  type AutomationExecutionHistoryEntry,
  type AutomationRunControl,
  type AutomationRunSummaryView,
} from '../../domains/automation/automationPublic';
import type { PanelActionPortRuntime,PanelPluginProps } from '../types';
import { ControlButton } from '../../components/controls/ControlButton';
import { WorkflowStatusCard } from '../../components/WorkflowStatusCard';
import { useAutomationExecutionText } from '../../domains/automation/automationPublic';
import type { LocalizedText } from '../../shared/localization/localizedText';
import { controlActionGridStyle } from '../../shared/controlActionGrid';
import { workflowTileProgress } from '../../shared/measuredReadyProgress';
import {
  activeAutomationRunsForDocument,
  automationActionButtonLabel,
  automationWorkflowAuditView,
  automationWorkflowControlSwitcherView,
  automationWorkflowHistoryEntries,
  automationWorkflowPanelRuntime,
  automationRunsForDocument,
  configuredAutomationResourceIds,
  type AutomationWorkflowPanelRuntime,
} from './automationWorkflowPanelModel';
import { useOptionalAutomationWorkflowPanelFrame,type AutomationWorkflowOption } from './automationWorkflowPanelFrameState';
import '../../styles/control-action-grid.css';
import '../../styles/automation-workflow-panel.css';

export function AutomationWorkflowControlPanel(props: PanelPluginProps<readonly ['automation','experiment']>) {
  return <AutomationWorkflowPanel {...props} control />;
}

export function AutomationWorkflowAuditPanel(props: PanelPluginProps<readonly ['automation','experiment']>) {
  return <AutomationWorkflowPanel {...props} control={false} />;
}

function AutomationWorkflowPanel({ panel,context,control }: PanelPluginProps<readonly ['automation','experiment']> & { control:boolean }) {
  const frame = useOptionalAutomationWorkflowPanelFrame(panel.id);
  const trace = context.ports.data.trace;
  const runtimePort = context.ports.data.runtime;
  const runtime = useMemo(
    () => automationWorkflowPanelRuntime(runtimePort?.value) ?? automationWorkflowPanelRuntime(trace?.value),
    [runtimePort?.value,trace?.value],
  );
  const actionPorts = useMemo(
    () => Object.values(context.ports.actions).sort((left,right) => left.id.localeCompare(right.id)),
    [context.ports.actions],
  );
  const configuredResourceIds = useMemo(
    () => configuredAutomationResourceIds(panel.options),
    [panel.options],
  );
  const workflowOptions = useMemo(
    () => automationWorkflowOptions(actionPorts,runtime,configuredResourceIds),
    [actionPorts,configuredResourceIds,runtime],
  );
  const frameSetWorkflows = frame?.setWorkflows;
  const frameSelectWorkflow = frame?.selectWorkflow;
  const selectedWorkflowId = frame?.selectedWorkflowId ?? workflowOptions[0]?.id ?? '';
  const frameSelectedRunId = frame?.selectedRunId;
  const setFrameSelectedRunId = frame?.setSelectedRunId;
  const [localSelectedRunId,setLocalSelectedRunId] = useState('');
  const selectedRunId = frameSelectedRunId ?? localSelectedRunId;
  const setSelectedRunId = setFrameSelectedRunId ?? setLocalSelectedRunId;
  const [selectedNodeId,setSelectedNodeId] = useState('');
  const [logsExpanded,setLogsExpanded] = useState(true);

  useEffect(() => {
    if (!frameSetWorkflows || !frameSelectWorkflow) return;
    frameSetWorkflows(workflowOptions);
    if (workflowOptions.length === 0) {
      if (selectedWorkflowId) frameSelectWorkflow('');
      return;
    }
    if (!workflowOptions.some((workflow) => workflow.id === selectedWorkflowId)) {
      frameSelectWorkflow(workflowOptions[0]!.id);
    }
  }, [frameSelectWorkflow,frameSetWorkflows,selectedWorkflowId,workflowOptions]);

  const frameSetView = frame?.setView;
  const frameView = frame?.view;
  useEffect(() => {
    if (!control || !frameSetView || frameView === undefined) return;
    const next = automationWorkflowControlSwitcherView(frameView);
    if (next !== frameView) frameSetView(next);
  }, [control,frameSetView,frameView]);

  const selectedWorkflow = workflowOptions.find((workflow) => workflow.id === selectedWorkflowId)
    ?? workflowOptions[0];
  const selectedResourceId = selectedWorkflow?.resourceId
    ?? configuredResourceIds[0]
    ?? runtime?.documents[0]?.head.resourceId
    ?? '';
  const selectedDocument = runtime?.documents.find((document) => document.head.resourceId === selectedResourceId);
  const runs = selectedDocument
    ? automationRunsForDocument(selectedDocument,runtime?.runSummaries ?? [],automationWorkflowHistoryLimit(panel.options.historyLimit))
    : (runtime?.runSummaries ?? [])
      .filter((run) => run.automationResourceId === selectedResourceId)
      .sort((left,right) => right.createdAt.localeCompare(left.createdAt) || right.revision - left.revision)
      .slice(0,automationWorkflowHistoryLimit(panel.options.historyLimit));
  const activeRuns = selectedDocument
    ? activeAutomationRunsForDocument(selectedDocument,runtime?.runSummaries ?? [])
    : runs.filter((run) => run.status === 'accepted' || run.status === 'queued' || run.status === 'running' || run.status === 'waiting' || run.status === 'stopping');
  const selectedRun = runs.find((run) => run.id === selectedRunId)
    ?? activeRuns.find((run) => actionPorts.some((port) => port.activeInvocation?.id === run.id))
    ?? runs[0];
  const selectedDetail = selectedRun ? runtime?.runDetailsById[selectedRun.id] : undefined;
  const requestedView = frame?.view ?? (control
    ? automationWorkflowControlSwitcherView(panel.options.defaultView)
    : automationWorkflowAuditView(panel.options.defaultView));
  const view = control ? automationWorkflowControlSwitcherView(requestedView) : requestedView;

  return (
    <section
      className="automation-workflow-panel"
      data-xgc-variant={control ? 'control' : 'audit'}
      data-xgc-role={control ? 'automation-workflow-panel' : 'automation-workflow-audit-panel'}
      data-xgc-id={panel.id}
    >
      {view === 'controls' && control && (
        <AutomationWorkflowControlsView panelId={panel.id} actionPorts={actionPorts} />
      )}
      {view === 'whiteboard' && control && (
        <AutomationWorkflowWorkflowView
          panelId={panel.id}
          runtime={runtime}
          document={selectedDocument}
          detail={selectedDetail}
        />
      )}
      {view === 'history' && (
        <AutomationWorkflowHistoryView
          panelId={panel.id}
          resourceId={selectedResourceId || panel.id}
          runtime={runtime}
          selectedRun={selectedRun}
          selectedRunId={selectedRunId}
          setSelectedRunId={setSelectedRunId}
          historyLimit={automationWorkflowHistoryLimit(panel.options.historyLimit)}
          onStop={stopRunForPanel(actionPorts)}
        />
      )}
      {view === 'logs' && (
        <AutomationWorkflowLogsView
          panelId={panel.id}
          resourceId={selectedResourceId || panel.id}
          runtime={runtime}
          document={selectedDocument}
          run={selectedRun}
          detail={selectedDetail}
          selectedNodeId={selectedNodeId}
          onSelectedNodeChange={setSelectedNodeId}
          expanded={logsExpanded}
          onExpandedChange={setLogsExpanded}
        />
      )}
    </section>
  );
}

function AutomationWorkflowControlsView({ panelId,actionPorts }: { panelId:string;actionPorts:PanelActionPortRuntime[] }) {
  const t = useAutomationExecutionText();
  if (actionPorts.length === 0) {
    return <EmptyState appearance="plain" fill title={t('No Actions')} data-xgc-role="automation-workflow-controls-empty" data-xgc-id={panelId} />;
  }
  return (
    <div className="automation-workflow-controls-view" data-xgc-role="automation-workflow-controls-view" data-xgc-id={panelId}>
      <div
        className="xgc-control-action-grid automation-workflow-controls-grid"
        data-xgc-role="automation-workflow-action-grid"
        data-xgc-id={panelId}
        data-xgc-tone-skin="neutral"
        style={controlActionGridStyle({ itemCount:actionPorts.length })}
      >
        {actionPorts.map((port) => (
          <AutomationWorkflowActionCard port={port} key={port.id} />
        ))}
      </div>
    </div>
  );
}

function AutomationWorkflowActionCard({ port }: { port:PanelActionPortRuntime }) {
  const t = useAutomationExecutionText();
  const [busy,setBusy] = useState(false);
  const label = automationActionButtonLabel(port);
  const receipt = port.latestInvocation;
  const active = port.activeInvocation || (receipt && isAutomationExecutionRunActive(receipt) ? receipt : undefined);
  const refusal = port.disabledReason || (!port.connected ? `Action port "${label}" is not connected.` : '');
  const canStop = Boolean(active && port.action?.kind === 'service' && port.action.controls.includes('stop'));
  const status = busy ? (active ? 'stopping' : 'starting')
    : active?.status === 'stopping' ? 'stopping'
      : active ? port.serviceStatus?.state || active.status : 'stopped';
  const failed = !busy && !active && (receipt?.status === 'failed' || receipt?.status === 'rejected');
  const statusDescription = canStop ? t('Stop service') : (refusal || undefined);

  async function invoke() {
    if (busy || (active ? !canStop : refusal)) return;
    setBusy(true);
    try {
      if (active) await port.control(active,'stop',`Stop ${port.label} from its Automation panel port`);
      else await port.invoke({},`Invoke ${port.label} from its Automation panel port`);
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkflowStatusCard
      className="xgc-control-action-card automation-workflow-action-card"
      layout="tile"
      title={label}
      status={failed ? 'failed' : status}
      tone="neutral"
      running={Boolean(active)}
      busy={busy}
      metrics={{ primary:'' }}
      progress={workflowTileProgress({
        active:Boolean(active),
        busy,
        failed,
        occupancy:port.serviceStatus,
      })}
      dataXgcRole="panel-action-invoke"
      dataXgcId={port.id}
      runId={active?.id ?? (failed ? receipt?.id : undefined)}
      ariaLabel={label}
      titleAttr={statusDescription}
      disabled={busy || (active ? !canStop || status === 'stopping' : Boolean(refusal))}
      onClick={() => void invoke()}
    />
  );
}

function AutomationWorkflowWorkflowView({ panelId,runtime,document,detail }: {
  panelId:string;
  runtime:AutomationWorkflowPanelRuntime | undefined;
  document:AutomationWorkflowPanelRuntime['documents'][number] | undefined;
  detail:AutomationWorkflowPanelRuntime['runDetailsById'][string] | undefined;
}) {
  const t = useAutomationExecutionText();
  if (!runtime || !document) return <AutomationWorkflowProjectionEmpty role="automation-workflow-workflow-empty" id={panelId} title={t('Workflow unavailable')} />;
  const graphRuntime = projectAutomationGraphRuntime(detail);
  return (
    <div className="automation-workflow-workflow-view" data-xgc-role="automation-workflow-workflow-view" data-xgc-id={panelId}>
      <AutomationGraph
        definition={document.spec}
        catalog={runtime.catalog}
        nodeSummaries={detail?.nodeSummaries ?? []}
        nodeRuntimeFacts={graphRuntime.nodeRuntimeFacts}
        activeRuntimeNodeIds={graphRuntime.activeRuntimeNodeIds}
        editable={false}
        controlsId={`automation-workflow-${panelId}-${document.head.resourceId}`}
      />
    </div>
  );
}

function AutomationWorkflowHistoryView({ panelId,resourceId,runtime,selectedRun,selectedRunId,setSelectedRunId,historyLimit,onStop }: {
  panelId:string;
  resourceId:string;
  runtime:AutomationWorkflowPanelRuntime | undefined;
  selectedRun:AutomationRunSummaryView | undefined;
  selectedRunId:string;
  setSelectedRunId:(runId:string) => void;
  historyLimit:number;
  onStop:(run:AutomationRunControl) => void | Promise<unknown>;
}) {
  const t = useAutomationExecutionText();
  if (!runtime) return <AutomationWorkflowProjectionEmpty role="automation-workflow-history-empty" id={panelId} title={t('History unavailable')} />;
  const entries = automationWorkflowHistoryEntries(runtime,resourceId,historyLimit);
  const selectedEntry = entries.find((entry) => entry.runId === selectedRunId)
    ?? (selectedRun ? entries.find((entry) => entry.runId === selectedRun.id) : undefined);
  return (
    <div className="automation-workflow-history-view" data-xgc-role="automation-workflow-history-view" data-xgc-id={panelId}>
      <AutomationWorkflowHistoryList
        resourceId={resourceId}
        entries={entries}
        selectedEntry={selectedEntry}
        selectedRun={selectedEntry?.run}
        onSelect={(entryId) => {
          const entry = entries.find((candidate) => candidate.id === entryId);
          setSelectedRunId(entry?.runId ?? '');
        }}
        onRefreshRun={async (runId) => {
          await runtime.loadRunDetail?.(runId,runtime.runDetailsById[runId]?.run?.revision);
        }}
        onStop={onStop}
      />
    </div>
  );
}

function AutomationWorkflowLogsView({ panelId,resourceId,runtime,document,run,detail,selectedNodeId,onSelectedNodeChange,expanded,onExpandedChange }: {
  panelId:string;
  resourceId:string;
  runtime:AutomationWorkflowPanelRuntime | undefined;
  document:AutomationWorkflowPanelRuntime['documents'][number] | undefined;
  run:AutomationRunSummaryView | undefined;
  detail:AutomationWorkflowPanelRuntime['runDetailsById'][string] | undefined;
  selectedNodeId:string;
  onSelectedNodeChange:(nodeId:string) => void;
  expanded:boolean;
  onExpandedChange:(expanded:boolean) => void;
}) {
  const t = useAutomationExecutionText();
  if (!runtime) return <AutomationWorkflowProjectionEmpty role="automation-workflow-logs-empty" id={panelId} title={t('Logs unavailable')} />;
  if (!document || !run) return <AutomationWorkflowProjectionEmpty role="automation-workflow-logs-empty" id={panelId} title={t('No execution')} />;
  return (
    <div className="automation-workflow-logs-view" data-xgc-role="automation-workflow-logs-view" data-xgc-id={panelId}>
      <AutomationWorkflowLogInspector
        resourceId={resourceId}
        runtime={runtime}
        run={run}
        detail={detail}
        definition={document.spec}
        selectedNodeId={selectedNodeId}
        onSelectedNodeChange={onSelectedNodeChange}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      />
    </div>
  );
}

function AutomationWorkflowProjectionEmpty({ role,id,title }: { role:string;id:string;title:string }) {
  return <EmptyState appearance="plain" fill title={title} data-xgc-role={role} data-xgc-id={id} />;
}

function AutomationWorkflowHistoryList({ resourceId,entries,selectedEntry,selectedRun,onSelect,onRefreshRun,onStop }: {
  resourceId:string;
  entries:AutomationExecutionHistoryEntry[];
  selectedEntry?:AutomationExecutionHistoryEntry;
  selectedRun?:AutomationExecutionHistoryEntry['run'];
  onSelect:(entryId:string) => void;
  onRefreshRun:(runId:string) => void | Promise<unknown>;
  onStop:(run:AutomationRunControl) => void | Promise<unknown>;
}) {
  const t = useAutomationExecutionText();
  return (
    <section className="automation-executions-view" data-xgc-role="automation-executions-view" data-xgc-id={resourceId}>
      <aside className="automation-execution-list" aria-label={t('Execution history')} data-xgc-role="automation-execution-list" data-xgc-id={resourceId}>
        <header className="automation-workflow-history-header"><strong>{t('History')}</strong><span>{entries.length}</span></header>
        {entries.map((entry) => (
          <button
            className="automation-workflow-history-row"
            type="button"
            data-xgc-role="automation-execution-row"
            data-xgc-id={entry.id}
            data-xgc-selected={entry.id === selectedEntry?.id ? 'true' : undefined}
            key={entry.id}
            onClick={() => onSelect(entry.id)}
          >
            <strong>{entry.runId}</strong>
            <span>{automationRunStatusText(t,entry.run?.status ?? entry.ingress?.status ?? 'unknown')}</span>
          </button>
        ))}
        {entries.length === 0 && <span className="automation-workflow-history-empty">{t('No history')}</span>}
      </aside>
      <div className="automation-execution-main" data-xgc-role="automation-execution-main" data-xgc-id={resourceId}>
        {selectedRun ? (
          <section className="automation-workflow-history-detail" data-xgc-role="automation-execution-detail" data-xgc-id={selectedRun.id}>
            <header><strong>{selectedRun.id}</strong><span>{automationRunStatusText(t,selectedRun.status)}</span></header>
            <div className="automation-workflow-history-actions">
              {isActiveRunStatus(selectedRun.status) && <ControlButton type="button" dataXgcRole="automation-run-stop" dataXgcId={selectedRun.id} onClick={() => void onStop({ id:selectedRun.id,status:selectedRun.status,revision:selectedRun.revision })}>{t('Stop')}</ControlButton>}
              <ControlButton type="button" dataXgcRole="automation-run-refresh" dataXgcId={selectedRun.id} onClick={() => void onRefreshRun(selectedRun.id)}>{t('Refresh')}</ControlButton>
            </div>
          </section>
        ) : <EmptyState appearance="plain" fill title={t('No execution')} data-xgc-role="automation-execution-empty" data-xgc-id={resourceId} />}
      </div>
    </section>
  );
}

function AutomationWorkflowLogInspector({ resourceId,runtime,run,detail,definition,selectedNodeId,onSelectedNodeChange,expanded,onExpandedChange }: {
  resourceId:string;
  runtime:AutomationWorkflowPanelRuntime;
  run:AutomationRunSummaryView;
  detail:AutomationWorkflowPanelRuntime['runDetailsById'][string] | undefined;
  definition:AutomationWorkflowPanelRuntime['documents'][number]['spec'];
  selectedNodeId:string;
  onSelectedNodeChange:(nodeId:string) => void;
  expanded:boolean;
  onExpandedChange:(expanded:boolean) => void;
}) {
  const t = useAutomationExecutionText();
  const processLogs = (runtime.processInstances ?? []).filter((process) => process.ownerType === 'orchestration-run' && process.ownerId === run.id);
  const payload = {
    run: { id:run.id,status:run.status,revision:run.revision,targetId:run.targetId,automationResourceId:run.automationResourceId },
    definition: { resourceId:definition === undefined ? '' : run.automationResourceId,nodeCount:definition?.nodes.length ?? 0 },
    selectedNodeId,
    nodes: detail?.nodeSummaries ?? [],
    invocations: detail?.invocations ?? [],
    processes: processLogs,
    result: detail?.run?.result,
  };
  return (
    <section className="automation-workflow-log-inspector" data-xgc-role="automation-workflow-log-inspector" data-xgc-id={resourceId}>
      <header className="automation-workflow-logs-header">
        <strong>{t('Logs')}</strong>
        <ControlButton type="button" dataXgcRole="automation-workflow-logs-toggle" dataXgcId={resourceId} onClick={() => onExpandedChange(!expanded)}>{expanded ? t('Hide') : t('Show')}</ControlButton>
      </header>
      {detail?.nodeSummaries.length ? (
        <div className="automation-workflow-log-node-selector" data-xgc-role="automation-workflow-log-node-selector" data-xgc-id={resourceId}>
          {detail.nodeSummaries.map((node) => (
            <ControlButton type="button" dataXgcRole="automation-workflow-log-node" dataXgcId={node.nodeId} key={node.nodeId} onClick={() => onSelectedNodeChange(node.nodeId)}>
              {node.nodeId}
            </ControlButton>
          ))}
        </div>
      ) : null}
      {expanded && (
        <CodeBlock content={JSON.stringify(payload,null,2)} copyable={false} data-xgc-role="automation-workflow-run-logs" data-xgc-id={run.id} language="json" />
      )}
    </section>
  );
}

function automationWorkflowOptions(
  actionPorts:PanelActionPortRuntime[],
  runtime:AutomationWorkflowPanelRuntime | undefined,
  configuredResourceIds:string[],
): AutomationWorkflowOption[] {
  if (actionPorts.length > 0) {
    return actionPorts.map((port) => ({
      id:port.id,
      label:port.action?.label || port.label,
      ...(port.trace.automationResourceId ? { resourceId:port.trace.automationResourceId } : {}),
    }));
  }
  const resourceIds = configuredResourceIds.length > 0
    ? configuredResourceIds
    : runtime?.documents.map((document) => document.head.resourceId) ?? [];
  return [...new Set(resourceIds)].map((resourceId) => ({ id:resourceId,label:resourceId,resourceId }));
}

function stopRunForPanel(actionPorts:PanelActionPortRuntime[]) {
  return async (run:AutomationRunControl) => {
    const port = actionPorts.find((candidate) => candidate.activeInvocation?.id === run.id);
    if (!port?.activeInvocation) return;
    await port.control(port.activeInvocation,'stop',`Stop ${port.label} from its Automation panel`);
  };
}

function isActiveRunStatus(status: AutomationRunSummaryView['status']) {
  return status === 'accepted' || status === 'queued' || status === 'running' || status === 'waiting' || status === 'stopping';
}

function automationWorkflowHistoryLimit(value:unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1,Math.min(50,Math.trunc(value)))
    : 10;
}

function automationRunStatusText(t:LocalizedText,status:string) {
  const source:Record<string,string> = {
    accepted:'Accepted',queued:'Queued',running:'Running',waiting:'Waiting',stopping:'Stopping',
    starting:'Starting',succeeded:'Succeeded',failed:'Failed',canceled:'Canceled',rejected:'Rejected',
    stopped:'Idle',idle:'Idle',unknown:'Unknown',
  };
  return t(source[status] ?? status);
}
