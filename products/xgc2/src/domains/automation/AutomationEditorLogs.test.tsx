// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { useState,type ComponentProps } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ProcessInstance } from '../execution/executionPublic';
import type * as ExecutionPublicModule from '../execution/executionPublic';
import { AutomationEditorLogs } from './AutomationEditorLogs';
import type { AutomationRun } from './automationRunContracts';
import type {
  AutomationNodeExecutionSummary,
  AutomationRunDetail,
} from './automationExecutionContracts';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';

const mocks = vi.hoisted(() => ({ logStreams: vi.fn() }));

vi.mock('../execution/executionPublic', async (loadOriginal) => {
  const original = await loadOriginal<typeof ExecutionPublicModule>();
  return {
    ...original,
    ExecutionLogStreams: (props: { targetId: string;entityType: string;entityId: string;follow: boolean }) => {
      mocks.logStreams(props);
      return <div data-testid="execution-log-streams" data-entity-type={props.entityType} data-entity-id={props.entityId} />;
    },
  };
});

describe('AutomationEditorLogs', () => {
  beforeEach(() => {
    mocks.logStreams.mockClear();
    window.localStorage.clear();
  });

  it('keeps the panel collapsed without log requests and exposes resize semantics when expanded', async () => {
    const onExpandedChange = vi.fn();
    const onPanelHeightChange = vi.fn();
    const definition = newAutomationSpec('Mission');
    const { container,rerender } = render(
      <AutomationEditorLogs
        {...baseProps(definition)}
        expanded={false}
        onExpandedChange={onExpandedChange}
        onPanelHeightChange={onPanelHeightChange}
      />,
    );

    const toggle = container.querySelector('[data-xgc-role="automation-editor-logs-toggle"][data-xgc-id="automation-a"]')!;
    const title = toggle.querySelector('.automation-editor-logs-title')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'automation-editor-logs-panel-automation-a');
    expect(title).toHaveTextContent('Logs');
    expect(title.querySelector('svg')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-editor-logs-content"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-editor-logs-resize-handle"]')).toBeNull();
    expect(mocks.logStreams).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(onExpandedChange).toHaveBeenCalledWith(true);

    rerender(
      <AutomationEditorLogs
        {...baseProps(definition)}
        expanded
        onExpandedChange={onExpandedChange}
        onPanelHeightChange={onPanelHeightChange}
      />,
    );
    expect(screen.getByRole('region', { name: 'Current run logs' })).toHaveTextContent('No execution data yet');
    const separator = screen.getByRole('separator', { name: 'Resize execution panel' });
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    const initialHeight = Number(separator.getAttribute('aria-valuenow'));
    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    await waitFor(() => expect(onPanelHeightChange).toHaveBeenLastCalledWith(initialHeight + 24));
    expect(window.localStorage.getItem('xgc.automation.editorLogs.height')).toBe(String(initialHeight + 24));
    expect(mocks.logStreams).not.toHaveBeenCalled();
  });

  it('uses an n8n-style overview first, then opens selected-node data, logs, and errors on demand', () => {
    const { definition,run,detail,child,unrelated } = executionFixture();
    const { container } = render(
      <LogsHarness
        {...baseProps(definition)}
        run={run}
        detail={detail}
        processInstances={[unrelated,child]}
        expanded
      />,
    );

    expect(container.querySelector('[data-xgc-role="automation-editor-run-state"][data-xgc-id="run-current"]')).toHaveTextContent('Run run-currentRunning');
    const toggle = container.querySelector('[data-xgc-role="automation-editor-logs-toggle"]')!;
    expect(toggle).not.toHaveTextContent('run-current');
    expect(toggle).toHaveTextContent('Running in 1.0s');
    expect(container.querySelector('[data-xgc-role="automation-editor-node-detail"]')).toBeNull();
    expect(mocks.logStreams).not.toHaveBeenCalled();

    const results = [...container.querySelectorAll('[data-xgc-role="automation-editor-node-result"]')];
    expect(results.map((node) => node.getAttribute('data-xgc-id'))).toEqual([
      'run-current:start','run-current:worker','run-current:notify','run-current:unreached','run-current:orphan',
    ]);
    expect(results.map((node) => node.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Succeeded'),expect.stringContaining('Running'),expect.stringContaining('Failed'),
      expect.stringContaining('Not run'),expect.stringContaining('Skipped'),
    ]));

    const worker = container.querySelector<HTMLElement>('[data-xgc-role="automation-editor-node-result"][data-xgc-id="run-current:worker"]')!;
    expect(worker.querySelector('button')).toHaveAttribute('data-xgc-appearance', 'ghost');
    fireEvent.click(worker.querySelector('button')!);
    expect(worker).toHaveAttribute('aria-selected', 'true');
    expect(worker.querySelector('button')).toHaveAttribute('data-xgc-appearance', 'default');
    expect(container.querySelector('[data-xgc-role="automation-editor-node-detail"][data-xgc-id="run-current:worker"]')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');
    const input = container.querySelector<HTMLElement>('[data-xgc-role="automation-editor-node-result-input"][data-xgc-id="run-current:worker"]')!;
    const output = container.querySelector<HTMLElement>('[data-xgc-role="automation-editor-node-result-output"][data-xgc-id="run-current:worker"]')!;
    expect(within(input).getByRole('tablist', { name: 'input data view' })).toHaveClass('xgc-tab-strip');
    expect(within(output).getByRole('tablist', { name: 'output data view' })).toHaveClass('xgc-tab-strip');
    fireEvent.click(within(input).getByRole('tab', { name: 'JSON' }));
    fireEvent.click(within(output).getByRole('tab', { name: 'JSON' }));
    expect(input).toHaveTextContent('"mode": "safe"');
    expect(output).toHaveTextContent('"pid": 42');
    expect(mocks.logStreams).not.toHaveBeenCalled();

    const detailTabs = screen.getByRole('tablist', { name: 'Execution detail view' });
    fireEvent.keyDown(detailTabs, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Process logs' })).toHaveAttribute('aria-selected', 'true');
    const source = screen.getByRole('button', { name: 'Log source' });
    const sourceControl = source.closest('[data-xgc-control="select"]');
    fireEvent.click(source);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Automation run · running','Worker process · failed',
    ]);
    expect(sourceControl).toHaveAttribute('data-value', 'process-instance:process-worker');
    fireEvent.click(screen.getByRole('option', { name: 'Worker process · failed' }));
    expect(screen.getByTestId('execution-log-streams')).toHaveAttribute('data-entity-type', 'process-instance');
    expect(screen.getByTestId('execution-log-streams')).toHaveAttribute('data-entity-id', 'process-worker');
    expect(mocks.logStreams).toHaveBeenLastCalledWith(expect.objectContaining({ entityId: 'process-worker',follow: true }));

    fireEvent.click(source);
    fireEvent.click(screen.getByRole('option', { name: 'Automation run · running' }));
    expect(mocks.logStreams).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: 'orchestration',entityId: 'run-current' }));

    fireEvent.click(detailTabs.querySelector('[role="tab"][data-tab-value="errors"]')!);
    expect(screen.queryByTestId('execution-log-streams')).not.toBeInTheDocument();
    const issues = container.querySelector('[data-xgc-role="automation-editor-log-source-errors"][data-xgc-id="run-current:worker"]')!;
    expect(issues).toHaveTextContent('Worker processworker terminated');
    expect(issues).toHaveTextContent('Worker process readinessworker never became ready');
    expect(issues).not.toHaveTextContent('notification failed');

    fireEvent.click(worker.querySelector('button')!);
    expect(container.querySelector('[data-xgc-role="automation-editor-node-detail"]')).toBeNull();
    expect(worker).toHaveAttribute('aria-selected', 'false');
  });

  it('opens a run-level console with all owned processes while excluding unrelated ones', () => {
    const { definition,run,detail,child,unrelated } = executionFixture();
    const { container } = render(
      <LogsHarness
        {...baseProps(definition)}
        run={run}
        detail={detail}
        processInstances={[unrelated,child]}
        expanded
      />,
    );

    fireEvent.click(container.querySelector('[data-xgc-role="automation-editor-open-run-logs"][data-xgc-id="run-current"]')!);
    expect(container.querySelector('[data-xgc-role="automation-editor-node-detail"][data-xgc-id="run-current:run"]')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Process logs' })).toHaveAttribute('aria-selected', 'true');
    const source = screen.getByRole('button', { name: 'Log source' });
    fireEvent.click(source);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Automation run · running','Worker process · failed',
    ]);
    expect(mocks.logStreams).toHaveBeenLastCalledWith(expect.objectContaining({ entityId: 'run-current',follow: true }));

    fireEvent.click(screen.getByRole('tablist', { name: 'Execution detail view' }).querySelector('[role="tab"][data-tab-value="errors"]')!);
    const issues = container.querySelector('[data-xgc-role="automation-editor-log-source-errors"][data-xgc-id="run-current:run"]')!;
    expect(issues).toHaveTextContent('Notify operatornotification failed');
    expect(issues).toHaveTextContent('Worker processworker terminated');
  });

  it('keeps cached node results visible when refreshing execution data fails', () => {
    const { definition,run,detail } = executionFixture();
    const { container } = render(
      <LogsHarness
        {...baseProps(definition)}
        run={run}
        detail={{ ...detail,error: 'backend temporarily unavailable' }}
        expanded
      />,
    );

    const overview = container.querySelector('[data-xgc-role="automation-editor-run-state"][data-xgc-id="run-current"]')!;
    expect(overview).toHaveTextContent('Data Refresh failed');
    expect(overview.querySelector('[aria-label="Execution data refresh failed"]')).toHaveAttribute('title', 'backend temporarily unavailable');
    expect(container.querySelector('[data-xgc-role="automation-editor-node-result"][data-xgc-id="run-current:start"]')).toHaveTextContent('Succeeded');
    expect(container.querySelector('[data-xgc-role="automation-editor-node-results"] > header')).not.toHaveTextContent('Unavailable');
  });

  it('auto-selects the failed node after a completed execution and does not follow historical logs', async () => {
    const { definition,run,detail } = executionFixture();
    const failedRun = { ...run,status: 'failed' as const,finishedAt: timestamp };
    const { container } = render(
      <LogsHarness
        {...baseProps(definition)}
        run={failedRun}
        detail={detail}
        expanded
      />,
    );

    await waitFor(() => expect(container.querySelector('[data-xgc-role="automation-editor-node-result"][data-xgc-id="run-current:notify"]')).toHaveAttribute('aria-selected', 'true'));
    expect(container.querySelector('[data-xgc-role="automation-editor-node-detail"][data-xgc-id="run-current:notify"]')).not.toBeNull();
    const output = container.querySelector('[data-xgc-role="automation-editor-node-result-output"][data-xgc-id="run-current:notify"]')!;
    expect(output).toHaveTextContent('permanentnotification failed');
    expect(output).not.toHaveTextContent('No persisted output');
    fireEvent.click(screen.getByRole('tablist', { name: 'Execution detail view' }).querySelector('[role="tab"][data-tab-value="logs"]')!);
    expect(mocks.logStreams).toHaveBeenLastCalledWith(expect.objectContaining({ entityId: failedRun.id,follow: false }));
    fireEvent.click(screen.getByRole('tablist', { name: 'Execution detail view' }).querySelector('[role="tab"][data-tab-value="errors"]')!);
    expect(container.querySelector('[data-xgc-role="automation-editor-log-source-error"][data-xgc-id="run-current:node:notify"]')).toHaveTextContent('notification failed');
  });
});

function LogsHarness(props: Omit<ComponentProps<typeof AutomationEditorLogs>,'selectedNodeId' | 'onSelectedNodeChange' | 'onPanelHeightChange'>) {
  const [selectedNodeId, setSelectedNodeId] = useState('');
  return <AutomationEditorLogs {...props} selectedNodeId={selectedNodeId} onSelectedNodeChange={setSelectedNodeId} onPanelHeightChange={vi.fn()} />;
}

function baseProps(definition = newAutomationSpec('Mission')): Pick<
  ComponentProps<typeof AutomationEditorLogs>,
  'resourceId' | 'executionTargetId' | 'definition' | 'processInstances' | 'selectedNodeId' | 'onSelectedNodeChange' | 'onExpandedChange' | 'onPanelHeightChange'
> {
  return {
    resourceId: 'automation-a',executionTargetId: 'local',definition,processInstances: [],selectedNodeId: '',
    onSelectedNodeChange: vi.fn(),onExpandedChange: vi.fn(),onPanelHeightChange: vi.fn(),
  };
}

function executionFixture() {
  const definition = newAutomationSpec('Mission');
  definition.nodes = [
    { ...newAutomationNode('trigger.manual'),id: 'start',displayName: 'Manual trigger' },
    { ...newAutomationNode('process.run-definition'),id: 'worker',displayName: 'Worker process' },
    { ...newAutomationNode('notification'),id: 'notify',displayName: 'Notify operator' },
    { ...newAutomationNode('condition'),id: 'unreached',displayName: 'Unreached branch' },
  ];
  const run = runFixture();
  const detail: AutomationRunDetail = {
    invocations: [],
    nodeSummaries: [
      nodeFixture(run.id, 'start', 'trigger.manual', 'succeeded', { inputs: false,output: 0,route: 'default' }),
      nodeFixture(run.id, 'worker', 'process.run-definition', 'running', { inputs: { mode: 'safe' },output: { pid: 42 },route: 'work',attemptCount: 2 }),
      nodeFixture(run.id, 'notify', 'notification', 'failed', { errorClass: 'permanent',error: 'notification failed' }),
      nodeFixture(run.id, 'orphan', 'transform', 'skipped', { output: [] }),
    ],
    loading: false,error: '',
  };
  const child = processFixture({
    id: 'process-worker',ownerId: run.id,scope: 'automation/automation-a/node/worker',observedState: 'failed',
    readiness: { status: 'failing',message: 'worker never became ready' },lastError: 'worker terminated',
  });
  const unrelated = processFixture({ id: 'process-other',ownerId: 'run-other',scope: 'automation/automation-b/node/other' });
  return { definition,run,detail,child,unrelated };
}

const timestamp = '2026-07-15T02:00:00Z';

function runFixture(patch: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: 'run-current',targetId: 'local',automationResourceId: 'automation-a',definitionId: 'runtime-definition',definitionVersion: 1,actionId:'run',actionVersion:1,
    definitionDigest: 'd'.repeat(64),
    sourceKind: 'automation',
    sourceRef: { domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-a',version: 1,digest: 'a'.repeat(64) },
    status: 'running',revision: 1,parameters: {},admissionMode: 'limited',admissionScope: 'root',
    admissionKey: 'definition:runtime-definition',admissionLimit: 1,admissionOnConflict: 'queue',
    createdAt: timestamp,startedAt: timestamp,updatedAt: '2026-07-15T02:00:01Z',
    ...patch,
    configDigest: patch.configDigest ?? 'a'.repeat(64),executionPlanDigest: patch.executionPlanDigest ?? 'b'.repeat(64),registryDigest: patch.registryDigest ?? 'c'.repeat(64),
    acceptedAt: patch.acceptedAt ?? timestamp,
    rootRunId: patch.rootRunId ?? patch.id ?? 'run-current',depth: patch.depth ?? 0,
    correlationId: patch.correlationId ?? patch.rootRunId ?? patch.id ?? 'run-current',
    executionModel: 'orchestration-occurrence-v1',
  };
}

function nodeFixture(
  runId: string,
  nodeId: string,
  kind: string,
  status: AutomationNodeExecutionSummary['status'],
  patch: Partial<AutomationNodeExecutionSummary> = {},
): AutomationNodeExecutionSummary {
  return {
    runId,nodeId,kind,status,attemptCount: 1,
    occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
    startedAt: timestamp,updatedAt: '2026-07-15T02:00:00.250Z',revision: 1,...patch,
  };
}

function processFixture(patch: Partial<ProcessInstance> = {}): ProcessInstance {
  return {
    id: 'process-a',targetId: 'local',definitionId: 'worker',definitionVersion: '1.0.0',definitionDigest: 'p'.repeat(64),
    ownerType: 'orchestration-run',ownerId: 'run-current',scope: 'automation/automation-a/node/worker',parameters: {},driver: 'host',
    desiredState: 'running',observedState: 'running',readiness: { status: 'passing' },liveness: { status: 'passing' },
    revision: 1,restartCount: 0,createdAt: timestamp,updatedAt: timestamp,
    ...patch,
  };
}
