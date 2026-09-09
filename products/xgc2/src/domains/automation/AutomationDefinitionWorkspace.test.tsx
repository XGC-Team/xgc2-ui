// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ProcessDefinition } from '../execution/executionPublic';
import type * as ExecutionPublicModule from '../execution/executionPublic';
import { AutomationDefinitionWorkspace } from './AutomationDefinitionWorkspace';
import { automationCatalogTraits,type BuiltinAutomationCatalogKind } from './automationCatalogTestFixtures';
import type {
  AutomationDocument,
  AutomationSpec,
} from './automationDefinitionContracts';
import type { AutomationActivation } from './automationTriggerContracts';
import type { AutomationRun } from './automationRunContracts';
import type {
  AutomationNodeExecutionSummary,
  AutomationRunDetail,
} from './automationExecutionContracts';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';
import { AutomationCommitConflict } from './automationErrorModel';
import type { AutomationExecutionHistoryEntry,AutomationExecutionRunSummary,AutomationRunControl } from './automationHistoryTypes';

const graphMocks = vi.hoisted(() => ({ setViewport: vi.fn(),fitView: vi.fn().mockResolvedValue(true),logStreams: vi.fn() }));

vi.mock('../execution/executionPublic', async (loadOriginal) => {
  const original = await loadOriginal<typeof ExecutionPublicModule>();
  return {
    ...original,
    ExecutionLogStreams: (props: { targetId: string;entityType: string;entityId: string;follow: boolean }) => {
      graphMocks.logStreams(props);
      return <div data-testid="workspace-log-streams" data-entity-id={props.entityId} />;
    },
  };
});

vi.mock('./AutomationGraphView', () => ({
  AutomationGraph: ({ definition,nodeSummaries,activeRuntimeNodeIds,autoLayout,canRunToNode,onNodeSelect,onNodeOpen,onNodeRunTo,onNodeDuplicate,onNodeDisplayNameChange,onNodesDelete,onElementsDelete,onSelectionChange,onConnect,onEdgeInsert,onOutputAdd,onNodePositionChange,onReady,onViewportChange,onTidyUp,onOpenLibrary,onAddStickyNote,onLibraryDrop,controlsId }: {
    definition: AutomationSpec;
    nodeSummaries?: AutomationNodeExecutionSummary[];
    activeRuntimeNodeIds?: readonly string[];
    autoLayout?: boolean;
    canRunToNode?: boolean;
    onNodeSelect?: (id: string) => void;
    onNodeOpen?: (id: string) => void;
    onNodeRunTo?: (id: string) => void;
    onNodeDuplicate?: (id: string) => void;
    onNodeDisplayNameChange?: (id: string, displayName: string) => void;
    onNodesDelete?: (ids: string[]) => void;
    onElementsDelete?: (selection: { nodeIds: string[];edgeIds: string[];stickyNoteIds: string[] }) => void;
    onSelectionChange?: (selection: { nodeIds: string[];edgeIds: string[];stickyNoteIds: string[] }) => void;
    onConnect?: (from: string, to: string, sourcePort?: string) => void;
    onEdgeInsert?: (id: string, position: { x: number;y: number }) => void;
    onOutputAdd?: (id: string, sourcePort: string, position: { x: number;y: number }) => void;
    onNodePositionChange?: (id: string, position: { x: number;y: number }) => void;
    onReady?: (instance: { setViewport: typeof graphMocks.setViewport;fitView: typeof graphMocks.fitView;screenToFlowPosition: (point: { x: number;y: number }) => { x: number;y: number } }) => void;
    onViewportChange?: (viewport: { x: number;y: number;zoom: number }) => void;
    onTidyUp?: (positions: Record<string,{ x: number;y: number }>) => void;
    onOpenLibrary?: () => void;
    onAddStickyNote?: () => void;
    onLibraryDrop?: (itemId: string, position: { x: number;y: number }) => void;
    controlsId?: string;
  }) => (
    <div data-testid="automation-graph" data-xgc-layout={autoLayout ? 'automatic' : 'persisted'}>
      <output data-testid="graph-node-count">{definition.nodes.length}</output>
      <output data-testid="graph-node-ids">{definition.nodes.map((node) => node.id).join(',')}</output>
      <output data-testid="graph-node-display-names">{definition.nodes.map((node) => `${node.id}:${node.displayName}`).join(',')}</output>
      <output data-testid="graph-node-parameters">{JSON.stringify(Object.fromEntries(definition.nodes.map((node) => [node.id,node.parameters])))}</output>
      <output data-testid="graph-node-positions">{definition.nodes.map((node) => `${node.id}:${JSON.stringify(node.position ?? null)}`).join(',')}</output>
      <output data-testid="graph-edge-ids">{definition.edges.map((edge) => edge.id).join(',')}</output>
      <output data-testid="graph-edge-endpoints">{definition.edges.map((edge) => `${edge.id}:${edge.from}->${edge.to}`).join(',')}</output>
      <output data-testid="graph-edges-json">{JSON.stringify(definition.edges)}</output>
      <output data-testid="graph-sticky-count">{definition.stickyNotes.length}</output>
      <output data-testid="graph-sticky-ids">{definition.stickyNotes.map((note) => note.id).join(',')}</output>
      <output data-testid="graph-node-summaries">{nodeSummaries?.map((node) => `${node.runId}:${node.nodeId}:${node.status}`).join(',') ?? ''}</output>
      <output data-testid="graph-active-runtime-nodes">{activeRuntimeNodeIds?.join(',') ?? ''}</output>
      {definition.nodes.map((node) => <span key={node.id}>
        <button type="button" data-testid={`graph-node-${node.id}`} onClick={() => onNodeSelect?.(node.id)} onDoubleClick={() => onNodeOpen?.(node.id)}>{node.id}</button>
        <button type="button" data-testid={`graph-run-to-${node.id}`} disabled={!canRunToNode} onClick={() => onNodeRunTo?.(node.id)}>Run to {node.id}</button>
        <button type="button" data-testid={`graph-duplicate-${node.id}`} onClick={() => onNodeDuplicate?.(node.id)}>Duplicate {node.id}</button>
        <button type="button" data-testid={`graph-rename-${node.id}`} onClick={() => onNodeDisplayNameChange?.(node.id, `${node.displayName} renamed`)}>Rename {node.id}</button>
        <button type="button" data-testid={`graph-delete-${node.id}`} onClick={() => onNodesDelete?.([node.id])}>Delete {node.id}</button>
        <button type="button" data-testid={`graph-add-from-${node.id}`} onClick={() => onOutputAdd?.(node.id, 'main', { x: 240,y: 80 })}>Add from {node.id}</button>
        <button type="button" data-testid={`graph-delete-selection-${node.id}`} onClick={() => onElementsDelete?.({
          nodeIds: [node.id],
          edgeIds: definition.edges.filter((edge) => edge.from === node.id || edge.to === node.id).map((edge) => edge.id),
          stickyNoteIds: [],
        })}>Delete selection {node.id}</button>
      </span>)}
      {definition.nodes.length >= 2 && <button type="button" data-testid="graph-connect-first-second" onClick={() => onConnect?.(definition.nodes[0].id, definition.nodes[1].id)}>Connect first to second</button>}
      {definition.nodes.length >= 2 && <button type="button" data-testid="graph-select-first-second" onClick={() => onSelectionChange?.({
        nodeIds: definition.nodes.slice(0, 2).map((node) => node.id),
        edgeIds: definition.edges.filter((edge) => definition.nodes.slice(0, 2).every((node) => edge.from === node.id || edge.to === node.id)).map((edge) => edge.id),
        stickyNoteIds: [],
      })}>Select first and second</button>}
      {definition.nodes.length >= 2 && <button type="button" data-testid="graph-connect-first-second-true" onClick={() => onConnect?.(definition.nodes[0].id, definition.nodes[1].id, 'true')}>Connect first true to second</button>}
      {definition.nodes.length >= 3 && <button type="button" data-testid="graph-connect-third-second-main" onClick={() => onConnect?.(definition.nodes[2].id, definition.nodes[1].id, 'main')}>Connect third main to second</button>}
      {definition.nodes.length >= 3 && <button type="button" data-testid="graph-connect-third-second-kept" onClick={() => onConnect?.(definition.nodes[2].id, definition.nodes[1].id, 'kept')}>Connect third kept to second</button>}
      {definition.nodes.length >= 3 && <button type="button" data-testid="graph-connect-third-first-main" onClick={() => onConnect?.(definition.nodes[2].id, definition.nodes[0].id, 'main')}>Connect third main to first</button>}
      {definition.edges.map((edge) => <span key={edge.id}>
        <button type="button" data-testid={`graph-insert-${edge.id}`} onClick={() => onEdgeInsert?.(edge.id, { x: 135,y: 75 })}>Insert on {edge.id}</button>
      </span>)}
      <button type="button" data-testid="graph-move-node" onClick={() => onNodePositionChange?.(definition.nodes[0]?.id ?? '', { x: 42,y: 21 })}>Move node</button>
      <button type="button" data-testid="graph-save-viewport" onClick={() => onViewportChange?.({ x: 12,y: 34,zoom: .8 })}>Save viewport</button>
      <button type="button" data-testid="graph-ready" onClick={() => onReady?.({ setViewport: graphMocks.setViewport,fitView: graphMocks.fitView,screenToFlowPosition: (point) => point })}>Graph ready</button>
      <button type="button" data-testid="graph-tidy" onClick={() => onTidyUp?.({ start: { x: 0,y: 0 },second: { x: 180,y: 0 } })}>Tidy graph</button>
      <button type="button" data-xgc-role="automation-node-library-open" data-xgc-id={controlsId} onClick={onOpenLibrary}>Add node</button>
      <button type="button" data-testid="graph-drop-roscore" onClick={() => onLibraryDrop?.('process-preset:roscore', { x: 150,y: 90 })}>Drop ROS core</button>
      <button type="button" data-testid="graph-drop-bridge" onClick={() => onLibraryDrop?.('process-preset:foxglove-bridge', { x: 180,y: 120 })}>Drop bridge</button>
      <button type="button" data-xgc-role="automation-sticky-note-add" data-xgc-id={controlsId} onClick={onAddStickyNote}>Add sticky note</button>
    </div>
  ),
}));

describe('AutomationDefinitionWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('authors structured Admission state after a completed manual run', async () => {
    const document = fixture('commit-1', 'Parallel mission');
    document.spec.actions[0]!.inputSchema.fields = [{ name: 'robot',kind: 'string' }];
    const active = runFixture({ id: 'run-completed',status: 'succeeded',admissionMode: 'parallel' });
    const started = runFixture({ id: 'run-next',status: 'running',createdAt: '2026-07-14T03:00:00Z',admissionMode: 'parallel' });
    const onRun = vi.fn().mockResolvedValue(started);
    const onCommit = vi.fn().mockResolvedValue(document);
    const { container } = renderWorkspace(document, { runs: [active],onRun,onCommit }).view;
    fireEvent.click(container.querySelector(
      '[data-xgc-role="automation-admission-summary"][data-xgc-id="automation-a"]',
    )!);
    expect(container.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveAttribute('aria-expanded', 'true');
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-popover"]')).toHaveAttribute('role', 'dialog');
    const admissionMode = globalThis.document.querySelector<HTMLElement>(
      '[data-xgc-role="automation-admission-mode"][data-xgc-id="automation-a"]',
    )!;
    const parallelMode = within(admissionMode).getByRole('button', { name: 'Parallel' });
    const singletonMode = within(admissionMode).getByRole('button', { name: 'Singleton' });
    const limitedMode = within(admissionMode).getByRole('button', { name: 'Limited' });

    expect(parallelMode).toHaveAttribute('aria-pressed', 'true');
    expect(singletonMode).toHaveAttribute('aria-pressed', 'false');
    expect(limitedMode).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-xgc-role="automation-definition-active-run-select"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Run parameters for Parallel mission' })).getByRole('button', { name: 'Start run' }));
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(document, {}, undefined, 'run'));

    fireEvent.click(singletonMode);
    expect(parallelMode).toHaveAttribute('aria-pressed', 'false');
    expect(singletonMode).toHaveAttribute('aria-pressed', 'true');
    expect(limitedMode).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveTextContent('Singleton');
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-scope-field"]')).toBeNull();
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-limit-field"]')).toBeNull();
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-conflict-field"]')).not.toBeNull();

    fireEvent.click(limitedMode);
    expect(singletonMode).toHaveAttribute('aria-pressed', 'false');
    expect(limitedMode).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveTextContent('Limited · 2');
    const admissionSummary = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-admission-summary"][data-xgc-id="automation-a"]',
    )!;
    const scopeTrigger = screen.getByRole('button', { name: 'Run admission scope' });
    fireEvent.click(scopeTrigger);
    expect(screen.getByRole('listbox')).not.toBeNull();

    await act(async () => {
      fireEvent.keyDown(globalThis.document, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-popover"]')).toHaveAttribute('role', 'dialog');
    expect(scopeTrigger).toHaveFocus();

    await act(async () => {
      fireEvent.keyDown(globalThis.document, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-popover"]')).toBeNull();
    expect(admissionSummary).toHaveFocus();
    fireEvent.click(admissionSummary);
    chooseSelectOption('Run admission scope', 'Key parameter');
    fireEvent.change(globalThis.document.querySelector('[data-xgc-role="automation-admission-limit"] input')!, { target: { value: '3' } });
    chooseSelectOption('Run admission conflict behavior', 'Reject');
    chooseSelectOption('Run admission applies to', 'Root runs only');
    fireEvent.change(globalThis.document.querySelector('[data-xgc-role="automation-admission-key-expression"] input')!, { target: { value: '/robot' } });
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-next"]')).not.toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-save"][data-xgc-id="automation-a"]')!);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ actions: [expect.objectContaining({ admission: { concurrency: {
        scope: 'key',limit: 3,keyExpression: '/robot',onConflict: 'reject',appliesTo: 'root',
      } } })] }),
      'Update Automation definition',
    ));
  });

  it('normalizes a root-only workflow limit before presenting Singleton', async () => {
    const document = fixture('commit-1', 'Root-limited mission');
    document.spec.actions[0]!.admission = {
      concurrency: { scope: 'workflow',limit: 1,onConflict: 'reject',appliesTo: 'root' },
    };
    const onCommit = vi.fn().mockResolvedValue(document);
    const { container } = renderWorkspace(document, { onCommit }).view;
    fireEvent.click(container.querySelector(
      '[data-xgc-role="automation-admission-summary"][data-xgc-id="automation-a"]',
    )!);
    const admissionMode = globalThis.document.querySelector<HTMLElement>(
      '[data-xgc-role="automation-admission-mode"][data-xgc-id="automation-a"]',
    )!;
    const singletonMode = within(admissionMode).getByRole('button', { name: 'Singleton' });
    const limitedMode = within(admissionMode).getByRole('button', { name: 'Limited' });

    expect(container.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveTextContent('Limited · 1');
    expect(singletonMode).toHaveAttribute('aria-pressed', 'false');
    expect(limitedMode).toHaveAttribute('aria-pressed', 'true');
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-scope-field"]')).not.toBeNull();
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-limit-field"]')).not.toBeNull();

    fireEvent.click(singletonMode);

    expect(container.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveTextContent('Singleton');
    expect(singletonMode).toHaveAttribute('aria-pressed', 'true');
    expect(limitedMode).toHaveAttribute('aria-pressed', 'false');
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-scope-field"]')).toBeNull();
    expect(globalThis.document.querySelector('[data-xgc-role="automation-admission-limit-field"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-definition-save"][data-xgc-id="automation-a"]')!);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ actions: [expect.objectContaining({ admission: { concurrency: {
        scope: 'workflow',limit: 1,onConflict: 'reject',appliesTo: 'all',
      } } })] }),
      'Update Automation definition',
    ));
  });

  it.each([
    ['trigger.schedule','automation-trigger-run-once'],
    ['trigger.form-submission','automation-test-listener-start'],
    ['trigger.chat-message','automation-test-listener-start'],
    ['trigger.webhook','automation-test-listener-start'],
  ])('removes root Run for %s and exposes only its trigger-aware interaction', (kind, role) => {
    const document = fixture('commit-1', kind);
    document.spec.nodes[0] = { ...document.spec.nodes[0],kind };

    const { container } = renderWorkspace(document).view;

    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(container.querySelector(`[data-xgc-role="${role}"]`)).not.toBeNull();
  });

  it('omits the trigger dock for a call-only workflow without local controls', () => {
    const document = fixture('commit-1', 'trigger.automation-call');
    document.spec.nodes[0] = { ...document.spec.nodes[0],kind: 'trigger.automation-call' };

    const { container } = renderWorkspace(document).view;

    // The selector already says "When called"; no second callout may render.
    expect(container.querySelector('[data-xgc-role="automation-call-only-info"]')).toBeNull();
    expect(container).not.toHaveTextContent('Called by parent workflow');

    // Target context belongs to the global selector. A call-only workflow has
    // no local trigger control, so it must not leave an empty framed dock.
    expect(container.querySelector('[data-xgc-role="automation-activation-target"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-entrypoints"]')).toBeNull();
  });

  it('requires an explicit entrypoint for multi-trigger definitions and routes actions by node id', async () => {
    const document = fixture('commit-1', 'Multi entrypoint');
    document.spec.nodes.push({
      ...newAutomationNode('trigger.webhook'),id: 'webhook-entry',displayName: 'Incoming webhook',
    });
    const onActivate = vi.fn().mockResolvedValue(undefined);
    const onRun = vi.fn().mockResolvedValue(runFixture({ id: 'run-manual-entrypoint' }));
    const { container } = renderWorkspace(document, { onActivate,onRun }).view;
    const selector = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-trigger-entrypoint-select"][data-xgc-id="automation-a"]',
    )!;

    expect(selector).toHaveAttribute('data-value', '');
    const entrypointDock = container.querySelector('[data-xgc-role="automation-trigger-entrypoints"][data-xgc-id="automation-a"]');
    expect(entrypointDock).toHaveAttribute('data-xgc-layout', 'shell');
    expect(entrypointDock).not.toHaveTextContent('Target');
    expect(entrypointDock).not.toHaveTextContent('local');
    expect(container.querySelector('[data-xgc-role="automation-activation-target"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-entrypoint-required"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-trigger-controls"]')).toBeNull();

    fireEvent.click(within(selector).getByRole('button', { name: 'Trigger entrypoint' }));
    fireEvent.click(screen.getByRole('option', { name: /Incoming webhook/ }));
    expect(container.querySelector('[data-xgc-role="automation-trigger-controls"][data-xgc-id="webhook-entry"]'))
      .not.toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-trigger-activate"][data-xgc-id="webhook-entry"]')!);
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith(document, 'webhook-entry'));

    fireEvent.click(within(selector).getByRole('button', { name: 'Trigger entrypoint' }));
    fireEvent.click(screen.getByRole('option', { name: /trigger\.manual · Manual/ }));
    expect(container.querySelector('[data-xgc-role="automation-trigger-controls"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!);
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(document, {}, undefined, 'run'));
  });

  it('shows the current event-triggered run as Stop in Editor', () => {
    const document = fixture('commit-1', 'Schedule');
    document.spec.nodes[0] = { ...document.spec.nodes[0],kind: 'trigger.schedule' };
    const active = runFixture({ id: 'run-schedule' });

    const { container } = renderWorkspace(document, { runs: [active] }).view;

    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-schedule"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-active-run-select"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-schedule"]')).not.toBeNull();
  });

  it('commits a dirty schedule draft before queuing Run once against the saved commit', async () => {
    const document = fixture('commit-1', 'Schedule');
    document.spec.nodes[0] = { ...document.spec.nodes[0],kind: 'trigger.schedule' };
    const saved = fixture('commit-2', 'Schedule');
    saved.spec.nodes[0] = { ...saved.spec.nodes[0],kind: 'trigger.schedule',position: { x: 42,y: 21 } };
    const onCommit = vi.fn().mockResolvedValue(saved);
    const onRunOnce = vi.fn().mockResolvedValue({ eventId: 'event-schedule' });
    const { container } = renderWorkspace(document, { onCommit,onRunOnce }).view;

    fireEvent.click(screen.getByTestId('graph-move-node'));
    fireEvent.click(container.querySelector('[data-xgc-role="automation-trigger-run-once"]')!);

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ nodes: [expect.objectContaining({ id: 'start',position: { x: 42,y: 21 } })] }),
      'Run Automation trigger once',
    ));
    await waitFor(() => expect(onRunOnce).toHaveBeenCalledWith(saved, 'start'));
  });

  it('marks a live activation as different as soon as the operator edits its pinned commit', () => {
    const document = fixture('commit-1', 'Webhook');
    document.spec.nodes[0] = { ...document.spec.nodes[0],kind: 'trigger.webhook' };
    const activation = activationFixture();
    const { container } = renderWorkspace(document, { activations: [activation] }).view;

    expect(container.querySelector('[data-xgc-role="automation-trigger-version-drift"]')).toBeNull();
    fireEvent.click(screen.getByTestId('graph-move-node'));
    expect(container.querySelector('[data-xgc-role="automation-trigger-version-drift"]')).not.toBeNull();
  });

  it('keeps the log dock collapsed on errors until the user opens it', async () => {
    const failed = runFixture({ id: 'run-failed',status: 'failed',createdAt: '2026-07-14T03:00:00Z' });
    const detail: AutomationRunDetail = {
      run: failed,
      invocations: [],
      nodeSummaries: [{
        runId: failed.id,nodeId: 'start',kind: 'trigger.manual',status: 'failed',attemptCount: 1,
        occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 1,
        errorClass: 'permanent',error: 'trigger failed',updatedAt: failed.updatedAt,revision: 2,
      }],
      loading: false,error: '',
    };
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), {
      runs: [failed],runDetailsById: { [failed.id]: detail },onRefreshRun: vi.fn().mockResolvedValue(detail),
    }).view;

    const toggle = container.querySelector('[data-xgc-role="automation-editor-logs-toggle"]')!;
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
    expect(container.querySelector('[data-xgc-role="automation-editor-logs-content"]')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(container.querySelector('[data-xgc-role="automation-editor-node-result"][data-xgc-id="run-failed:start"]')).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByRole('tablist', { name: 'Execution detail view' }).querySelector('[role="tab"][data-tab-value="errors"]')!);
    expect(container.querySelector('[data-xgc-role="automation-editor-log-source-error"][data-xgc-id="run-failed:node:start"]')).toHaveTextContent('trigger failed');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-xgc-role="automation-editor-logs-content"]')).toBeNull();
  });

  it('defaults to Editor and returns from History without losing draft history', () => {
    const newest = runFixture({ id: 'run-newest',status: 'succeeded',createdAt: '2026-07-14T03:00:00Z' });
    const older = runFixture({ id: 'run-older',status: 'succeeded',createdAt: '2026-07-14T01:00:00Z' });
    const otherResource = runFixture({ id: 'run-other-resource',resourceId: 'automation-b',createdAt: '2026-07-14T04:00:00Z' });
    const otherBranch = runFixture({ id: 'run-other-branch',branch: 'candidate',createdAt: '2026-07-14T05:00:00Z' });
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), {
      runs: [older,otherResource,newest,otherBranch],
      onRefreshRun: vi.fn().mockResolvedValue(emptyRunDetail()),
    }).view;

    expect(container.querySelector('[data-xgc-role="automation-workspace-view-switch"][data-xgc-id="automation-a"]'))
      .toHaveClass('automation-pane-tabs','automation-workspace-view-switch');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('data-xgc-id', 'executions');
    expect(container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="editor"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="executions"]')).toBeNull();

    fireEvent.click(screen.getByTestId('graph-move-node'));
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:{"x":42,"y":21}');

    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    const executions = container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="executions"]')!;
    expect(container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="editor"]')).toBeNull();
    expect([...executions.querySelectorAll('[data-xgc-role="automation-execution-row"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual(['run-other-branch','run-newest','run-older']);

    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="editor"]')!);
    expect(container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="editor"]')).not.toBeNull();
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:{"x":42,"y":21}');
    pressUndo();
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:null');
  });

  it('loads a selected historical execution and keeps it selected while the active run updates', async () => {
    const document = fixture('commit-1', 'Mission');
    const active = runFixture({ id: 'run-active',status: 'running',revision: 1,createdAt: '2026-07-14T03:00:00Z' });
    const older = runFixture({ id: 'run-older',status: 'succeeded',revision: 4,createdAt: '2026-07-14T01:00:00Z' });
    const olderDetail = runDetailFixture('run-older', 'succeeded');
    const onRefreshRun = vi.fn().mockResolvedValue(olderDetail);
    const releaseRunDetail=vi.fn();
    const onRetainRunDetail=vi.fn(() => releaseRunDetail);
    const { props,view } = renderWorkspace(document, {
      runs: [active,older],onRefreshRun,onRetainRunDetail,
    });

    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-execution-row"][data-xgc-id="run-older"]')!);
    await waitFor(() => expect(onRefreshRun).toHaveBeenCalledWith('run-older'));
    await waitFor(() => expect(onRetainRunDetail).toHaveBeenLastCalledWith('run-older'));
    expect(releaseRunDetail).toHaveBeenCalled();

    view.rerender(<>
      <TestTopbar />
      <AutomationDefinitionWorkspace
        {...props}
        document={document}
        execution={{
          ...props.execution,
          historyEntries: historyEntriesFromRuns([active,older]),
          runDetailsById: { 'run-older': olderDetail },
        }}
      />
    </>);
    let executions = view.container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="executions"]')!;
    expect(executions.querySelector('[data-xgc-role="automation-execution-detail"][data-xgc-id="run-older"]')).not.toBeNull();
    const node = executions.querySelector('[data-xgc-role="automation-execution-node"][data-xgc-id="run-older:start"]');
    expect(node).toHaveTextContent('succeeded');

    const stopping = { ...active,status: 'stopping' as const,revision: 2,updatedAt: '2026-07-14T03:01:00Z' };
    view.rerender(<>
      <TestTopbar />
      <AutomationDefinitionWorkspace
        {...props}
        document={document}
        execution={{
          ...props.execution,
          historyEntries: historyEntriesFromRuns([stopping,older]),
          runDetailsById: { 'run-older': olderDetail },
        }}
      />
    </>);
    executions = view.container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="executions"]')!;
    expect(executions.querySelector('[data-xgc-role="automation-execution-row"][data-xgc-id="run-active"]')).toHaveTextContent('Stopping');
    expect(executions.querySelector('[data-xgc-role="automation-execution-row"][data-xgc-id="run-older"]')).toHaveAttribute('aria-current', 'true');
    expect(executions.querySelector('[data-xgc-role="automation-execution-detail"][data-xgc-id="run-older"]')).not.toBeNull();
  });

  it('keeps the preallocated Run selection and React row stable while ingress upgrades to a Run', async () => {
    const document = fixture('commit-1', 'Mission');
    const pending = ingressHistoryEntry('pending');
    const onRefreshRun = vi.fn().mockResolvedValue(emptyRunDetail());
    const { props,view } = renderWorkspace(document, { historyEntries: [pending],onRefreshRun });

    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    const row = view.container.querySelector<HTMLElement>(
      `[data-xgc-role="automation-execution-row"][data-xgc-id="${pending.id}"]`,
    )!;
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(onRefreshRun).not.toHaveBeenCalled();

    const run = runFixture({ id: pending.runId,status: 'running',createdAt: pending.acceptedAt });
    const upgraded = historyEntriesFromRuns([run])[0];
    view.rerender(<>
      <TestTopbar />
      <AutomationDefinitionWorkspace
        {...props}
        document={document}
        execution={{ ...props.execution,historyEntries: [upgraded] }}
      />
    </>);

    const upgradedRow = view.container.querySelector<HTMLElement>(
      `[data-xgc-role="automation-execution-row"][data-xgc-id="${pending.id}"]`,
    )!;
    expect(upgradedRow).toBe(row);
    expect(upgradedRow).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(onRefreshRun).toHaveBeenCalledWith(pending.runId));
  });

  it('loads ingress transitions once per selected revision and aborts stale pages', async () => {
    const document = fixture('commit-1', 'Mission');
    const pending = ingressHistoryEntry('pending');
    const signals: Array<AbortSignal | undefined> = [];
    const onLoadIngressTransitions = vi.fn((_entryId: string, signal?: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>(() => undefined);
    });
    const { props,view } = renderWorkspace(document, { historyEntries: [pending],onLoadIngressTransitions });

    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    await waitFor(() => expect(onLoadIngressTransitions).toHaveBeenCalledTimes(1));

    const sameRevision = { ...pending,ingress: { ...pending.ingress! } };
    view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace
      {...props}
      document={document}
      execution={{ ...props.execution,historyEntries: [sameRevision] }}
    /></>);
    await act(async () => Promise.resolve());
    expect(onLoadIngressTransitions).toHaveBeenCalledTimes(1);

    const nextRevision = { ...sameRevision,ingress: { ...sameRevision.ingress!,revision: 2,status: 'claimed' as const } };
    view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace
      {...props}
      document={document}
      execution={{ ...props.execution,historyEntries: [nextRevision] }}
    /></>);
    await waitFor(() => expect(onLoadIngressTransitions).toHaveBeenCalledTimes(2));
    expect(signals[0]?.aborted).toBe(true);

    view.unmount();
    expect(signals[1]?.aborted).toBe(true);
  });

  it('shows every current run alongside completed history and stops a run by its stable ID', async () => {
    const newest = runFixture({ id: 'run-current-newest',status: 'running',createdAt: '2026-07-14T03:00:00Z' });
    const older = runFixture({ id: 'run-current-older',status: 'queued',createdAt: '2026-07-14T02:00:00Z' });
    const completed = runFixture({ id: 'run-completed',status: 'succeeded',createdAt: '2026-07-14T01:00:00Z' });
    const onStop = vi.fn().mockImplementation(async (run: AutomationRun) => ({ ...run,status: 'stopping' as const }));
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), {
      runs: [completed,older,newest],onStop,
    }).view;

    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    const executions = container.querySelector<HTMLElement>('[data-xgc-role="automation-workspace-panel"][data-xgc-id="executions"]')!;
    expect([...executions.querySelectorAll('[data-xgc-role="automation-execution-row"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual([
      'run-current-newest','run-current-older','run-completed',
    ]);
    expect([...executions.querySelectorAll('[data-xgc-role="automation-active-run"]')]
      .map((run) => run.getAttribute('data-xgc-id'))).toEqual([
      'run-current-newest','run-current-older',
    ]);

    fireEvent.click(executions.querySelector(
      '[data-xgc-role="automation-run-stop"][data-xgc-id="run-current-older"]',
    )!);
    await waitFor(() => expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: older.id,status: older.status,revision: older.revision })));
    expect(onStop).not.toHaveBeenCalledWith(newest);
  });

  it('starts a parameterless Automation in Editor and projects the current run onto the graph', async () => {
    const document = fixture('commit-1', 'Mission');
    const started = runFixture({ id: 'run-started',status: 'running',createdAt: '2026-07-14T06:00:00Z' });
    const startedDetail = runDetailFixture(started.id, 'waiting');
    const onRun = vi.fn().mockResolvedValue(started);
    const { props,view } = renderWorkspace(document, { onRun });

    expect(view.container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="editor"]')).not.toBeNull();
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!);

    await waitFor(() => expect(onRun).toHaveBeenCalledWith(document, {}, undefined, 'run'));
    expect(view.container.querySelector('[data-xgc-role="automation-editor-logs-toggle"]')).toHaveAttribute('aria-expanded', 'false');
    expect(view.container.querySelector('[data-xgc-role="automation-run-parameter-dialog"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="editor"]')).not.toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-workspace-panel"][data-xgc-id="executions"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-definition-active-run-select"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-started"]')).not.toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    await waitFor(() => expect(props.execution.onRefreshRun).toHaveBeenCalledWith(started.id));

    view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace
      {...props}
      document={document}
      execution={{
        ...props.execution,
        historyEntries: historyEntriesFromRuns([started]),
        runDetailsById: { [started.id]: startedDetail },
      }}
    /></>);
    expect(screen.getByTestId('graph-node-summaries')).toHaveTextContent('run-started:start:waiting');
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-editor-logs-toggle"]')!);
    expect(view.container.querySelector('[data-xgc-role="automation-editor-run-state"][data-xgc-id="run-started"]')).toHaveTextContent('Running');
    expect(view.container.querySelector('[data-xgc-role="automation-editor-node-result"][data-xgc-id="run-started:start"]')).toHaveTextContent('Waiting');
    expect(view.container.querySelector('[data-xgc-role="automation-editor-node-detail"]')).toBeNull();
    expect(screen.queryByTestId('workspace-log-streams')).not.toBeInTheDocument();

    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-editor-open-run-logs"][data-xgc-id="run-started"]')!);
    expect(view.container.querySelector('[data-xgc-role="automation-editor-log-viewer"][data-xgc-id="run-started"]')).not.toBeNull();
    expect(screen.getByTestId('workspace-log-streams')).toHaveAttribute('data-entity-id', 'run-started');
    expect(graphMocks.logStreams).toHaveBeenLastCalledWith(expect.objectContaining({
      targetId: 'local',entityType: 'orchestration',entityId: 'run-started',follow: true,
    }));
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    expect(view.container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-started"]')).not.toBeNull();
  });

  it('keeps protected Automations read-only while preserving Run and Stop', async () => {
    const document = fixture('commit-1', 'Protected mission');
    document.head.system = true;
    document.spec.actions[0]!.admission = {
      concurrency: { scope: 'workflow',limit: 1,onConflict: 'queue',appliesTo: 'all' },
    };
    localStorage.setItem('xgc.automation.viewport.automation-a', JSON.stringify({ x: 500,y: 500,zoom: .4 }));
    const active = runFixture({ id: 'run-protected',status: 'running',createdAt: '2026-07-14T06:00:00Z' });
    const onRun = vi.fn().mockResolvedValue(active);
    const onStop = vi.fn().mockResolvedValue({ ...active,status: 'stopping' });
    const { props,view } = renderWorkspace(document, { onRun,onStop });
    const host = view.container.querySelector('[data-xgc-role="automation-definition-detail"][data-xgc-id="automation-a"]')!;

    expect(host).toHaveAttribute('data-xgc-protection', 'system');
    expect(host).toHaveAttribute('data-xgc-readonly', 'true');
    expect(screen.getByTestId('automation-graph')).toHaveAttribute('data-xgc-layout', 'automatic');
    expect(view.container.querySelector('[data-xgc-role="automation-definition-readonly"][data-xgc-id="automation-a"]')).toHaveTextContent('still run it');
    expect(view.container.querySelector('[data-xgc-role="automation-definition-save"]')).toBeNull();
    const admission = view.container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-admission-editor"][data-xgc-id="automation-a"]',
    )!;
    expect(admission).toHaveTextContent('Singleton');
    expect(admission).not.toHaveTextContent('Admission:');
    expect(admission.tagName).toBe('DIV');
    expect(admission).toHaveAttribute('data-xgc-readonly', 'true');
    expect(admission.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveAttribute('aria-disabled', 'true');
    expect(admission.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveAttribute(
      'aria-label',
      'Run admission: Singleton. One workflow run at a time; additional runs wait in queue.',
    );
    expect(admission.querySelector('[data-xgc-role="automation-admission-fields"]')).toBeNull();

    fireEvent.click(screen.getByTestId('graph-ready'));
    await waitFor(() => expect(graphMocks.fitView).toHaveBeenCalledWith({ padding: 0.18,maxZoom: 1.25,duration: 0 }));
    expect(graphMocks.setViewport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('graph-delete-start'));
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    expect(view.container.querySelector('[data-xgc-role="automation-node-library"]')).toBeNull();

    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!);
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(document, {}, undefined, 'run'));

    view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace
      {...props}
      document={document}
      execution={{ ...props.execution,historyEntries: historyEntriesFromRuns([active]) }}
    /></>);
    expect(view.container.querySelector('[data-xgc-role="automation-active-edit-notice"]')).toBeNull();
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-protected"]')!);
    await waitFor(() => expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: active.id,status: active.status,revision: active.revision })));
  });

  it('renders template Admission as a static summary', () => {
    const document = fixture('commit-1', 'Template mission');
    document.head.system = true;
    document.spec.metadata.tags = ['template'];
    const { view } = renderWorkspace(document);

    const host = view.container.querySelector('[data-xgc-role="automation-definition-detail"][data-xgc-id="automation-a"]')!;
    const admission = view.container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-admission-editor"][data-xgc-id="automation-a"]',
    )!;
    expect(host).toHaveAttribute('data-xgc-protection', 'template');
    expect(admission.tagName).toBe('DIV');
    expect(admission).toHaveAttribute('data-xgc-readonly', 'true');
    expect(admission).toHaveTextContent('Parallel');
    expect(admission.querySelector('[data-xgc-role="automation-admission-summary"]')).toHaveAttribute('aria-disabled', 'true');
    expect(admission.querySelector('[data-xgc-role="automation-admission-fields"]')).toBeNull();
  });

  it('keeps the run-parameter dialog when the Automation declares an input', () => {
    const document = fixture('commit-1', 'Mission');
    document.spec.actions[0]!.inputSchema.fields = [{ name: 'mode',label: 'Mode',kind: 'string' }];
    const onRun = vi.fn();
    const { view } = renderWorkspace(document, { onRun });

    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]')!);

    expect(view.container.querySelector('[data-xgc-role="automation-run-parameter-dialog"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(onRun).not.toHaveBeenCalled();
  });

  it('edits the next draft and stops the current run from Editor', async () => {
    const document = fixture('commit-1', 'Mission');
    const active = runFixture({ id: 'run-active',status: 'running',createdAt: '2026-07-14T03:00:00Z' });
    const onStop = vi.fn().mockResolvedValue({ ...active,status: 'stopping' });
    const { view } = renderWorkspace(document, {
      runs: [active],
      onStop,
      onRefreshRun: vi.fn().mockResolvedValue(emptyRunDetail()),
    });

    expect(view.container.querySelector('[data-xgc-role="automation-active-edit-notice"]')).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-definition-active-run-select"]')).toBeNull();
    const stop = view.container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-active"]')!;
    expect(stop).not.toBeDisabled();
    expect(view.container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    fireEvent.click(screen.getByTestId('graph-delete-start'));
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('0');
    expect(view.container.querySelector('[data-xgc-role="automation-definition-save"]')).not.toBeDisabled();
    fireEvent.click(stop);
    await waitFor(() => expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: active.id,status: active.status,revision: active.revision })));
  });

  it('keeps the current Editor action stopping until the run reaches a terminal state', async () => {
    const document = fixture('commit-1', 'Mission');
    const active = runFixture({ id: 'run-active',status: 'running',createdAt: '2026-07-14T03:00:00Z' });
    let resolveStop!: (run: AutomationRun) => void;
    const onStop = vi.fn(() => new Promise<AutomationRun>((resolve) => { resolveStop = resolve; }));
    const { props,view } = renderWorkspace(document, { runs: [active],onStop });
    const { container } = view;

    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-active"]')!);

    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="automation-run-stopping"][data-xgc-id="run-active"]'),
    ).toBeDisabled());
    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    await act(async () => resolveStop({ ...active,status: 'stopping' }));
    expect(container.querySelector(
      '[data-xgc-role="automation-run-stopping"][data-xgc-id="run-active"]',
    )).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();

    const stopped = { ...active,status: 'stopped' as const,revision: active.revision + 2 };
    view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace
      {...props}
      document={document}
      execution={{ ...props.execution,historyEntries: historyEntriesFromRuns([stopped]) }}
    /></>);
    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="automation-run-open"][data-xgc-id="automation-a"]'),
    ).not.toBeNull());
  });

  it('shows a disabled Stopping action for the current Editor run', () => {
    const stopping = runFixture({ id: 'run-stopping',status: 'stopping',createdAt: '2026-07-14T03:00:00Z' });
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), { runs: [stopping] }).view;

    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stopping"][data-xgc-id="run-stopping"]')).toBeDisabled();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-stopping"]')).toBeDisabled();
  });

  it('lists concurrent active runs and stops by stable run ID in History', async () => {
    const running = runFixture({ id: 'run-running',status: 'running',createdAt: '2026-07-14T03:00:00Z' });
    const stopping = runFixture({ id: 'run-stopping',status: 'stopping',createdAt: '2026-07-14T04:00:00Z' });
    const runningDetail = runDetailFixture(running.id, 'waiting');
    const stoppingDetail = runDetailFixture(stopping.id, 'running');
    const onStop = vi.fn(async (_run: AutomationRunControl) => ({ ...running,status: 'stopping' as const }));
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), {
      runs: [stopping,running],runDetailsById: { [running.id]: runningDetail,[stopping.id]: stoppingDetail },onStop,
    }).view;

    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-active-run-select"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stopping"][data-xgc-id="run-stopping"]')).toBeDisabled();
    expect(screen.getByTestId('graph-node-summaries')).toHaveTextContent('run-stopping:start:running');

    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    expect([...container.querySelectorAll('[data-xgc-role="automation-active-run"]')].map((row) => row.getAttribute('data-xgc-id')))
      .toEqual(['run-stopping','run-running']);
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-running"]')).toBeEnabled();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-stopping"]')).toBeDisabled();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-running"]')!);
    await waitFor(() => expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: running.id,status: running.status,revision: running.revision })));
    expect(onStop).not.toHaveBeenCalledWith(stopping);
  });

  it('presents a waiting run with an active supervised process as Active on the latest workflow board', async () => {
    const run = runFixture({ id: 'run-supervised',status: 'waiting',createdAt: '2026-07-20T05:00:00Z' });
    const detail = activeRuntimeDetailFixture(run, 'service');
    const document = fixture('commit-1', 'ROS Core');
    const service = managedProcessNode();
    service.id = 'service';
    document.spec.nodes.push(service);
    document.spec.edges.push({ id: 'start-service',from: 'start',to: 'service',condition: 'success' });
    const onRefreshRun = vi.fn().mockResolvedValue(detail);
    const { container } = renderWorkspace(document, {
      runs: [run],runDetailsById: { [run.id]: detail },onRefreshRun,
    }).view;

    expect(container.querySelector('[data-xgc-role="automation-definition-active-run-select"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-supervised"]')).toBeEnabled();
    expect(container.querySelector('[data-xgc-role="automation-run-open"]')).toBeNull();
    expect(screen.getByTestId('graph-active-runtime-nodes')).toHaveTextContent('service');
    await waitFor(() => expect(onRefreshRun).toHaveBeenCalledWith(run.id));
    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    const historyRun = container.querySelector<HTMLElement>('[data-xgc-role="automation-active-run"][data-xgc-id="run-supervised"]')!;
    expect(historyRun).toHaveAttribute('data-xgc-status', 'active');
    expect(historyRun).toHaveAttribute('data-xgc-engine-status', 'waiting');
  });

  it('loads a waiting Run detail once per revision without fixed polling across stream state changes', async () => {
    const run = runFixture({ id: 'run-waiting',status: 'waiting',createdAt: '2026-07-20T05:00:00Z' });
    const detail = activeRuntimeDetailFixture(run, 'service');
    const onRefreshRun = vi.fn().mockResolvedValue(detail);
    const { props,view } = renderWorkspace(fixture('commit-1', 'ROS Core'), {
      runs: [run],runDetailsById: { [run.id]: detail },streamState: 'connected',onRefreshRun,
    });
    await waitFor(() => expect(onRefreshRun).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(onRefreshRun).toHaveBeenCalledTimes(1);

      view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace
        {...props}
        document={fixture('commit-1', 'ROS Core')}
        execution={{ ...props.execution,streamState: 'disconnected' }}
      /></>);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(onRefreshRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the explicitly selected History run visible when returning to Editor', () => {
    const newest = runFixture({ id: 'run-newest',status: 'succeeded',createdAt: '2026-07-14T03:00:00Z' });
    const older = runFixture({ id: 'run-older',status: 'failed',createdAt: '2026-07-14T01:00:00Z' });
    const newestDetail = runDetailFixture(newest.id, 'succeeded');
    const olderDetail = runDetailFixture(older.id, 'failed');
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), {
      runs: [older,newest],
      runDetailsById: { [newest.id]: newestDetail,[older.id]: olderDetail },
    }).view;

    expect(screen.getByTestId('graph-node-summaries')).toHaveTextContent('run-newest:start:succeeded');
    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-execution-row"][data-xgc-id="run-older"]')!);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="editor"]')!);

    expect(screen.getByTestId('graph-node-summaries')).toHaveTextContent('run-older:start:failed');
    expect(screen.getByTestId('graph-node-summaries')).not.toHaveTextContent('run-newest');
  });

  it('shows and controls an Experiment-sourced run in the Automation history', () => {
    const direct = runFixture({ id: 'run-experiment',createdAt: '2026-07-14T04:00:00Z' });
    const experimentRun: AutomationRun = {
      ...direct,
      sourceKind: 'experiment',
      sourceRef: {
        domain: 'experiment',resourceId: 'deleted-experiment',branch: 'main',commitId: 'experiment-1',version: 7,digest: 'e'.repeat(64),
      },
      automationRef: {
        domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 1,digest: 'a'.repeat(64),
      },
    };
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), { runs: [experimentRun] }).view;

    expect(container.querySelector('[data-xgc-role="automation-active-edit-notice"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-experiment"]')).not.toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-workspace-view"][data-xgc-id="executions"]')!);
    expect(container.querySelector('[data-xgc-role="automation-execution-row"][data-xgc-id="run-experiment"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"][data-xgc-id="run-experiment"]')).not.toBeNull();
  });

  it('adds trusted nodes with undo and redo while visibly tracking a dirty draft', () => {
    const { container } = renderWorkspace().view;
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-library-open"]')!);

    expect(container.querySelector('[data-xgc-role="automation-node-library"]')).not.toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-catalog-category"][data-xgc-id="ros1"]')!);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="process-preset:roscore"]')!);
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('2');
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('roscore:ROS 1 master');
    expect(container.querySelector('[data-xgc-role="automation-node-library"]')).toBeNull();
    const nodeDialog = screen.getByRole('dialog', { name: 'Node roscore' });
    expect(nodeDialog).toHaveAttribute('data-xgc-role', 'automation-node-dialog');
    expect(nodeDialog).toHaveAttribute('data-xgc-id', 'roscore');
    expect(nodeDialog).toHaveClass('automation-node-dialog');
    const chrome = nodeDialog.querySelector<HTMLElement>('[data-xgc-role="automation-node-dialog-chrome"][data-xgc-id="roscore"]')!;
    const runThrough = nodeDialog.querySelector<HTMLElement>('[data-xgc-role="automation-run-through-node"][data-xgc-id="roscore"]')!;
    expect(chrome).toContainElement(runThrough);
    const propertyTabs = nodeDialog.querySelector('[data-xgc-role="automation-node-property-tabs"]');
    expect(propertyTabs).toHaveClass('automation-node-property-tabs', 'automation-node-pane-tabs', 'xgc-tab-strip');
    expect(propertyTabs).not.toHaveAttribute('data-xgc-size', 'compact');
    expect(propertyTabs).not.toHaveAttribute('data-xgc-variant', 'underline');
    const inputTabs = nodeDialog.querySelector('[data-xgc-role="automation-runtime-view-mode"][data-xgc-id="input:schema"]')?.closest('[role="tablist"]');
    const outputTabs = nodeDialog.querySelector('[data-xgc-role="automation-runtime-view-mode"][data-xgc-id="output:schema"]')?.closest('[role="tablist"]');
    expect(inputTabs).toHaveClass('automation-node-pane-tabs', 'xgc-tab-strip');
    expect(outputTabs).toHaveClass('automation-node-pane-tabs', 'xgc-tab-strip');
    expect(outputTabs).not.toHaveAttribute('data-xgc-size', 'compact');
    expect(nodeDialog.querySelector('[data-xgc-role="automation-node-property-tab"][data-xgc-id="roscore:settings"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-definition-save"]')).not.toBeDisabled();

    pressUndo();
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');
    expect(container.querySelector('[data-xgc-role="automation-definition-save"]')).toBeDisabled();
    pressRedo();
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('2');
    expect(container.querySelector('[data-xgc-role="automation-definition-save"]')).not.toBeDisabled();
  });

  it('creates a default connection without exposing edge properties', () => {
    const document = fixture('commit-1', 'Mission');
    document.spec.nodes.push({ ...newAutomationNode('notification'),id: 'notify' });
    const { container } = renderWorkspace(document).view;

    fireEvent.click(screen.getByTestId('graph-connect-first-second'));

    expect(screen.getByTestId('graph-edge-endpoints')).toHaveTextContent('start-notify:start->notify');
    expect(container.querySelector('[data-xgc-role="automation-edge-dialog"]')).toBeNull();
  });

  it('stores named control handles as routes and keeps Merge connections ordinary', () => {
    const routed = fixture('commit-1', 'Routed mission');
    routed.spec.nodes = [
      { ...newAutomationNode('condition'),id: 'condition' },
      { ...newAutomationNode('notification'),id: 'notify' },
    ];
    const routedView = renderWorkspace(routed).view;
    fireEvent.click(screen.getByTestId('graph-connect-first-second-true'));
    expect(JSON.parse(screen.getByTestId('graph-edges-json').textContent ?? '[]')).toEqual([
      expect.objectContaining({ from: 'condition',to: 'notify',route: 'true',condition: 'success' }),
    ]);
    expect(screen.getByTestId('graph-edges-json')).not.toHaveTextContent('sourcePort');
    routedView.unmount();

    const merged = fixture('commit-1', 'Merged mission');
    merged.spec.nodes.push({ ...newAutomationNode('merge'),id: 'join' });
    renderWorkspace(merged);
    fireEvent.click(screen.getByTestId('graph-connect-first-second'));
    expect(JSON.parse(screen.getByTestId('graph-edges-json').textContent ?? '[]')).toEqual([
      expect.objectContaining({ from: 'start',to: 'join',condition: 'success' }),
    ]);
  });

  it('rejects every connection that would make the authoring graph cyclic', () => {
    const document = fixture('commit-1', 'DAG mission');
    document.spec.nodes.push(
      { ...newAutomationNode('delay'),id: 'step' },
      { ...newAutomationNode('filter'),id: 'body' },
    );
    document.spec.edges = [
      { id: 'start-step',from: 'start',to: 'step',condition: 'success' },
      { id: 'step-body',from: 'step',to: 'body',condition: 'success' },
    ];
    renderWorkspace(document);

    fireEvent.click(screen.getByTestId('graph-connect-third-second-kept'));
    const edges = JSON.parse(screen.getByTestId('graph-edges-json').textContent ?? '[]') as AutomationSpec['edges'];
    expect(edges).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Automation graphs must remain acyclic');
  });

  it('drops multiple process presets that share one runtime kind by unique library item ID', () => {
    renderWorkspace();

    fireEvent.click(screen.getByTestId('graph-drop-roscore'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Node roscore' })).getByRole('button', { name: 'Close node dialog' }));
    fireEvent.click(screen.getByTestId('graph-drop-bridge'));

    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('roscore:ROS 1 master');
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('foxglove-bridge:Foxglove bridge');
    expect(screen.getByTestId('graph-node-parameters')).toHaveTextContent('"definitionId":"roscore"');
    expect(screen.getByTestId('graph-node-parameters')).toHaveTextContent('"definitionId":"foxglove-bridge"');
  });

  it('publishes the stable library item ID when a preset drag begins', () => {
    const { container } = renderWorkspace().view;
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-catalog-category"][data-xgc-id="ros1"]')!);
    const item = container.querySelector<HTMLElement>('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="process-preset:roscore"]')!;
    const icon = item.querySelector<HTMLElement>('.automation-library-catalog-icon[data-xgc-id="process-preset:roscore"]')!;
    const values = new Map<string,string>();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: (type: string, value: string) => values.set(type, value),
    };

    fireEvent.dragStart(item, { dataTransfer });

    expect(item).toHaveAttribute('draggable', 'true');
    expect(icon).not.toHaveAttribute('data-xgc-icon-tone');
    expect(icon.querySelector('.lucide-network')).not.toBeNull();
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(values.get('text/xgc-automation-node-library-item')).toBe('process-preset:roscore');
  });

  it('discovers draggable INPUT fields from the explicit upstream output schema before any run', () => {
    const document = fixture('commit-1', 'Schema authoring');
    document.spec.nodes.push(
      { ...newAutomationNode('asset.experiment-robots'),id: 'robot-source' },
      { ...newAutomationNode('notification', { message: '' }),id: 'consumer' },
    );
    document.spec.edges = [
      { id: 'start-robots',from: 'start',to: 'robot-source',condition: 'success' },
      { id: 'robots-consumer',from: 'robot-source',to: 'consumer',condition: 'success' },
    ];
    const catalog = [
      {
        kind: 'asset.experiment-robots',typeVersion: 1,label: 'Current Experiment Robots',category: 'Asset',traits: automationCatalogTraits('asset.experiment-robots'),
        parameterSchema: { type: 'object',properties: {} },
        outputSchema: {
          type: 'object',properties: {
            selectedRobots: { type: 'array',items: { type: 'object',properties: { initialPose: { type: 'object',properties: { x: { type: 'number' } } } } } },
          },
        },
      },
      {
        kind: 'notification',typeVersion: 2,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),
        parameterSchema: { type: 'object',properties: { message: { type: 'string','x-xgc-expression': true } } },
      },
    ];
    renderWorkspace(document, { catalog,processDefinitions: [] });

    fireEvent.doubleClick(screen.getByTestId('graph-node-consumer'));
    const dialog = screen.getByRole('dialog', { name: 'Node consumer' });
    const input = dialog.querySelector<HTMLElement>('[data-xgc-role="automation-node-input"]')!;
    expect(within(input).getByTitle('Drag $.selectedRobots[0].initialPose.x to an Expression field')).toBeInTheDocument();
    expect(input).not.toHaveTextContent('No execution selected');
  });

  it('selects a called Automation by name while excluding the current and archived definitions', () => {
    const document = fixture('commit-1', 'Caller workflow');
    document.spec.nodes.push({
      ...newAutomationNode('automation.call', { automationId: '',branch: 'main',mode: 'sync',criticality: 'required',inputMode: 'configured',parameters: {} }, 'Call Automation', 4),
      id: 'call-automation',
    });
    document.spec.edges = [{ id: 'start-call',from: 'start',to: 'call-automation',condition: 'success' }];
    const callCatalog = {
      kind: 'automation.call',typeVersion: 4,label: 'Call Automation',category: 'Control',traits: automationCatalogTraits('automation.call'),
      parameterSchema: {
        type: 'object',required: ['automationId','branch','mode','criticality','inputMode','parameters'],properties: {
          automationId: { type: 'string',title: 'Automation' },
          branch: { type: 'string',title: 'Branch',default: 'main' },
          mode: { type: 'string',title: 'Mode',enum: ['sync','async'],default: 'sync' },
          criticality: { type: 'string',enum: ['required','auxiliary'],default: 'required' },
          inputMode: { type: 'string',enum: ['configured'],default: 'configured' },
          parameters: { type: 'object',title: 'Parameters',default: {} },
        },
      },
    };
    const current = automationDocumentFixture('automation-a', 'Caller workflow');
    const callee = automationDocumentFixture('automation-b', '航迹规划');
    callee.spec.actions[0]!.inputSchema.fields = [{
      name: 'roscoreUrl',label: 'ROS Core URL',kind: 'string',required: true,
      string: { default: 'wss://ros.example.test/socket' },
    }];
    const duplicateName = automationDocumentFixture('automation-c', '航迹规划');
    const archived = automationDocumentFixture('automation-archived', 'Archived workflow');
    archived.head.archived = true;
    const incompatibleTarget = automationDocumentFixture('automation-remote', 'Remote workflow');
    incompatibleTarget.spec.targetPolicy.executionTargetId = 'remote-agent';
    const base = renderWorkspace();
    const baseCatalog = base.props.authoring.catalog;
    base.view.unmount();
    renderWorkspace(document, {
      catalog: [...baseCatalog,callCatalog],
      automationDocuments: [current,callee,duplicateName,archived,incompatibleTarget],
    });

    fireEvent.doubleClick(screen.getByTestId('graph-node-call-automation'));
    const dialog = screen.getByRole('dialog', { name: 'Node call-automation' });
    const automation = within(dialog).getByRole('button', { name: 'Automation' });
    expect(automation).toHaveTextContent('Select an option');
    fireEvent.click(automation);
    const options = screen.getAllByRole('option');
    expect(options.map((option) => [option.textContent,option.getAttribute('data-xgc-id')])).toEqual([
      ['航迹规划 · automation-b','call-automation:automationId:"automation-b"'],
      ['航迹规划 · automation-c','call-automation:automationId:"automation-c"'],
    ]);
    expect(dialog).not.toHaveTextContent('Caller workflow');
    expect(dialog).not.toHaveTextContent('Archived workflow');
    expect(dialog).not.toHaveTextContent('Remote workflow');
    fireEvent.click(screen.getByRole('option', { name: '航迹规划 · automation-b' }));
    expect(screen.getByTestId('graph-node-parameters')).toHaveTextContent('"automationId":"automation-b"');
    expect(within(dialog).getByLabelText('ROS Core URL')).toHaveValue('wss://ros.example.test/socket');
    const inputMode = within(dialog).getByRole('group', { name: 'ROS Core URL value source' });
    fireEvent.click(within(inputMode).getByRole('button', { name: 'Expression' }));
    expect(within(dialog).getByLabelText('ROS Core URL expression')).toHaveValue('{{ $input.roscoreUrl }}');
  });

  it('offers Return only while a When called workflow still needs one', () => {
    const catalog = [
      { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object' } },
      { kind: 'trigger.automation-call',typeVersion: 1,label: 'When called',category: 'trigger',traits: automationCatalogTraits('trigger.automation-call'),parameterSchema: { type: 'object' } },
      { kind: 'automation.return',typeVersion: 1,label: 'Return from automation',category: 'automation',traits: automationCatalogTraits('automation.return'),parameterSchema: { type: 'object' },outputPorts: [] },
    ];
    const ordinary = renderWorkspace(fixture('commit-1', 'Ordinary workflow'), { catalog,processDefinitions: [] }).view;
    fireEvent.click(ordinary.container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    let library = screen.getByRole('dialog', { name: 'Node library' });
    fireEvent.change(within(library).getByRole('searchbox', { name: 'Search nodes' }), { target: { value: 'return' } });
    expect(library.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="automation.return"]')).toBeNull();
    ordinary.unmount();

    const calledDocument = fixture('commit-1', 'Called workflow');
    calledDocument.spec.nodes = [
      { ...newAutomationNode('trigger.automation-call'),id: 'called' },
      { ...newAutomationNode('trigger.manual'),id: 'manual' },
    ];
    const called = renderWorkspace(calledDocument, { catalog,processDefinitions: [] }).view;
    fireEvent.click(called.container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    library = screen.getByRole('dialog', { name: 'Node library' });
    fireEvent.change(within(library).getByRole('searchbox', { name: 'Search nodes' }), { target: { value: 'return' } });
    fireEvent.click(library.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="automation.return"]')!);
    expect(screen.getByTestId('graph-node-automation-return')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close node dialog' }));

    fireEvent.click(called.container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    library = screen.getByRole('dialog', { name: 'Node library' });
    fireEvent.change(within(library).getByRole('searchbox', { name: 'Search nodes' }), { target: { value: 'return' } });
    expect(library.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="automation.return"]')).toBeNull();
  });

  it('hides unsupported infrastructure entries from the default library', () => {
    const catalog = [
      { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object' } },
      { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'action',traits: automationCatalogTraits('notification'),parameterSchema: { type: 'object' } },
      ...managedCatalog(),
    ];
    const { container } = renderWorkspace(fixture('commit-1', 'Curated library'), {
      catalog,
      processDefinitions: [processDefinition('vrpn-server', 'VRPN server')],
    }).view;
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    const dialog = screen.getByRole('dialog', { name: 'Node library' });
    const search = within(dialog).getByRole('searchbox', { name: 'Search nodes' });

    expect(dialog.querySelector('[data-xgc-role="automation-node-catalog-category"][data-xgc-id="infrastructure"]')).toBeNull();
    fireEvent.change(search, { target: { value: 'vrpn' } });
    expect(dialog.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="process-preset:vrpn-server"]')).toBeNull();
  });

  it('lists all five event sources in the Trigger category', () => {
    const { container } = renderWorkspace().view;
    fireEvent.click(container.querySelector('[data-xgc-role="automation-node-library-open"]')!);
    const dialog = screen.getByRole('dialog', { name: 'Node library' });
    const triggerCategory = dialog.querySelector<HTMLElement>('[data-xgc-role="automation-node-catalog-category"][data-xgc-id="trigger"]')!;
    expect(triggerCategory.querySelector('.automation-library-category-copy > small')).toHaveTextContent('Start from a manual action or external event');
    fireEvent.click(triggerCategory);

    const triggerBack = dialog.querySelector<HTMLElement>('[data-xgc-role="automation-node-catalog-back"][data-xgc-id="trigger"]')!;
    expect(triggerBack).toHaveAccessibleName('Back to categories');
    expect(dialog.querySelector('[data-xgc-role="automation-node-catalog-category-description"][data-xgc-id="trigger"]')).toHaveTextContent('Start from a manual action or external event');

    const triggerIDs = [...dialog.querySelectorAll('[data-xgc-role="automation-node-catalog-item"]')]
      .map((item) => item.getAttribute('data-xgc-id'));
    expect(triggerIDs).toEqual([
      'trigger.manual',
      'trigger.chat-message',
      'trigger.form-submission',
      'trigger.webhook',
      'trigger.schedule',
    ]);
    expect(dialog).toHaveTextContent('Manual trigger');
    expect(dialog).toHaveTextContent('On form submission');
    expect(dialog).toHaveTextContent('On chat message');
    expect(dialog).toHaveTextContent('On webhook call');
  });

  it('keeps selection separate from opening node properties', () => {
    renderWorkspace();

    fireEvent.click(screen.getByTestId('graph-node-start'));
    expect(screen.queryByRole('dialog', { name: 'Node start' })).toBeNull();

    fireEvent.doubleClick(screen.getByTestId('graph-node-start'));
    expect(screen.getByRole('dialog', { name: 'Node start' })).toBeInTheDocument();
  });

  it('routes hover-menu duplicate and delete actions through reversible draft history', () => {
    renderWorkspace();

    fireEvent.click(screen.getByTestId('graph-duplicate-start'));
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('2');
    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,trigger-manual');
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('trigger-manual:trigger.manual copy');

    fireEvent.click(screen.getByTestId('graph-delete-trigger-manual'));
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');
    pressUndo();
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('2');
  });

  it('copies and pastes the selected canvas node with Ctrl/Cmd+C and Ctrl/Cmd+V', () => {
    const document = fixture('commit-1', 'Mission');
    document.spec.nodes[0].position = { x: 12,y: 24 };
    renderWorkspace(document);

    fireEvent.click(screen.getByTestId('graph-node-start'));
    fireEvent.keyDown(window, { key: 'c',ctrlKey: true });
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');
    fireEvent.keyDown(window, { key: 'v',ctrlKey: true });

    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,trigger-manual');
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('trigger-manual:trigger.manual copy');
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('trigger-manual:{"x":48,"y":60}');
    pressUndo();
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');

    fireEvent.keyDown(window, { key: 'v',metaKey: true });
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('2');
  });

  it('copies a canvas selection with its internal edges and assigns fresh identities on paste', () => {
    const document = fixture('commit-1', 'Mission');
    document.spec.nodes[0].position = { x: 12,y: 24 };
    document.spec.nodes.push({
      ...newAutomationNode('notification', { message: 'Ready' }, 'Notify operator'),
      id: 'notice',
      position: { x: 180,y: 60 },
    });
    document.spec.edges = [{
      id: 'start-notice',from: 'start',to: 'notice',condition: 'success',
    }];
    renderWorkspace(document);

    fireEvent.click(screen.getByTestId('graph-select-first-second'));
    fireEvent.keyDown(window, { key: 'c',ctrlKey: true });
    fireEvent.keyDown(window, { key: 'v',ctrlKey: true });

    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,notice,trigger-manual,notification');
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('trigger-manual:{"x":48,"y":60}');
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('notification:{"x":216,"y":96}');
    expect(screen.getByTestId('graph-edge-endpoints')).toHaveTextContent('trigger-manual-notification:trigger-manual->notification');
    expect(screen.getByTestId('graph-edges-json')).toHaveTextContent('"condition":"success"');

    pressUndo();
    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,notice');
    expect(screen.getByTestId('graph-edge-ids')).toHaveTextContent('start-notice');
  });

  it('leaves Ctrl+C to the browser when text is selected while a canvas node remains selected', () => {
    renderWorkspace();
    fireEvent.click(screen.getByTestId('graph-node-start'));
    const text = screen.getByTestId('graph-node-display-names');
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const copyEvent = new KeyboardEvent('keydown', {
      key: 'c',ctrlKey: true,bubbles: true,cancelable: true,
    });
    window.dispatchEvent(copyEvent);

    expect(copyEvent.defaultPrevented).toBe(false);
    fireEvent.keyDown(window, { key: 'v',ctrlKey: true });
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');
    selection?.removeAllRanges();
  });

  it('applies and persists an inline display-name change as one undoable draft change', async () => {
    const onCommit = vi.fn().mockImplementation(async (_document: AutomationDocument, spec: AutomationSpec) => ({
      ...fixture('commit-2', spec.metadata.name),
      spec,
    }));
    const { container } = renderWorkspace(fixture('commit-1', 'Mission'), { onCommit }).view;

    fireEvent.click(screen.getByTestId('graph-rename-start'));
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('start:trigger.manual renamed');
    expect(container.querySelector('[data-xgc-role="automation-definition-save"]')).not.toBeDisabled();

    pressUndo();
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('start:trigger.manual');

    pressRedo();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    const saved = onCommit.mock.calls[0][1] as AutomationSpec;
    expect(saved.nodes[0]).toEqual(expect.objectContaining({
      id: 'start',
      displayName: 'trigger.manual renamed',
    }));
  });

  it('edits a node display name without changing its stable ID or connected edges', () => {
    const document = fixture('commit-1', 'Named mission');
    document.spec.nodes = [
      { ...newAutomationNode('trigger.manual', {}, 'Start'),id: 'start' },
      { ...managedProcessNode('roscore', 'ROS master'),id: 'process-01' },
      { ...newAutomationNode('notification', {}, 'Finished'),id: 'finish' },
    ];
    document.spec.edges = [
      { id: 'start-process',from: 'start',to: 'process-01',condition: 'success' },
      { id: 'process-finish',from: 'process-01',to: 'finish',condition: 'success' },
    ];
    renderWorkspace(document);
    fireEvent.doubleClick(screen.getByTestId('graph-node-process-01'));

    const dialog = screen.getByRole('dialog', { name: 'Node process-01' });
    expect(dialog.querySelector('[data-xgc-role="automation-node-id"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-kind"]')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Node name'), { target: { value: 'Primary ROS master' } });

    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('process-01:Primary ROS master');
    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,process-01,finish');
    expect(screen.getByTestId('graph-edge-endpoints')).toHaveTextContent('start-process:start->process-01,process-finish:process-01->finish');

    pressUndo();
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('process-01:ROS master');
    expect(screen.getByTestId('graph-edge-endpoints')).toHaveTextContent('start-process:start->process-01,process-finish:process-01->finish');
  });

  it('derives an open node dialog from the undoable draft instead of retaining a second node copy', () => {
    const document = fixture('commit-1', 'Single source draft');
    document.spec.nodes.push({ ...newAutomationNode('notification', { message: 'Ready' }, 'Original node'),id: 'notice' });
    document.spec.edges = [{ id: 'start-notice',from: 'start',to: 'notice',condition: 'success' }];
    renderWorkspace(document);

    fireEvent.doubleClick(screen.getByTestId('graph-node-notice'));
    const dialog = screen.getByRole('dialog', { name: 'Node notice' });
    const name = within(dialog).getByLabelText('Node name');
    fireEvent.change(name, { target: { value: 'Changed node' } });
    expect(name).toHaveValue('Changed node');

    pressUndo();
    expect(within(dialog).getByLabelText('Node name')).toHaveValue('Original node');
    expect(screen.getByTestId('graph-node-display-names')).toHaveTextContent('notice:Original node');
  });

  it('inserts a catalog node into a hovered connection as one graph change', () => {
    const document = fixture('commit-1', 'Connected mission');
    document.spec.nodes.push({ ...managedProcessNode('foxglove-bridge', 'Foxglove bridge'),id: 'target' });
    document.spec.edges = [{ id: 'start-target',from: 'start',to: 'target',condition: 'success' }];
    renderWorkspace(document);

    fireEvent.click(screen.getByTestId('graph-insert-start-target'));
    const library = screen.getByRole('dialog', { name: 'Node library' });
    fireEvent.click(library.querySelector('[data-xgc-role="automation-node-catalog-category"][data-xgc-id="ros1"]')!);
    fireEvent.click(library.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="process-preset:roscore"]')!);

    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('3');
    expect(screen.getByTestId('graph-edge-ids')).toHaveTextContent('start-roscore,roscore-target');
    expect(screen.getByTestId('graph-edges-json')).not.toHaveTextContent('"required"');
    fireEvent.click(screen.getByRole('button', { name: 'Close node dialog' }));
    pressUndo();
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('2');
    expect(screen.getByTestId('graph-edge-ids')).toHaveTextContent('start-target');
    expect(screen.getByTestId('graph-edges-json')).not.toHaveTextContent('"required"');
  });

  it('adds and connects a catalog node from an unconnected output', () => {
    renderWorkspace();

    fireEvent.click(screen.getByTestId('graph-add-from-start'));
    const library = screen.getByRole('dialog', { name: 'Node library' });
    fireEvent.click(library.querySelector('[data-xgc-role="automation-node-catalog-category"][data-xgc-id="ros1"]')!);
    fireEvent.click(library.querySelector('[data-xgc-role="automation-node-catalog-item"][data-xgc-id="process-preset:roscore"]')!);

    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,roscore');
    expect(screen.getByTestId('graph-edge-endpoints')).toHaveTextContent('start-roscore:start->roscore');
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('roscore:{"x":240,"y":80}');
  });

  it('deletes a selected node and its connected edges as one undoable graph change', () => {
    const document = fixture('commit-1', 'Connected mission');
    document.spec.nodes.push({ ...newAutomationNode('notification'),id: 'target' });
    document.spec.edges = [{ id: 'start-target',from: 'start',to: 'target',condition: 'success' }];
    renderWorkspace(document);

    fireEvent.click(screen.getByTestId('graph-delete-selection-start'));
    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('target');
    expect(screen.getByTestId('graph-edge-ids')).toHaveTextContent('');

    pressUndo();
    expect(screen.getByTestId('graph-node-ids')).toHaveTextContent('start,target');
    expect(screen.getByTestId('graph-edge-ids')).toHaveTextContent('start-target');
  });

  it('keeps deletion outside node properties and removes the canvas node immediately', () => {
    renderWorkspace();
    fireEvent.doubleClick(screen.getByTestId('graph-node-start'));

    const dialog = screen.getByRole('dialog', { name: 'Node start' });
    expect(dialog.querySelector('[data-xgc-role="automation-node-dialog-panes"]')).toHaveAttribute('data-xgc-pane-count', '2');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Settings' }));
    expect(within(dialog).queryByRole('button', { name: 'Remove node' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Apply deletion' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close node dialog' }));

    fireEvent.click(screen.getByTestId('graph-delete-start'));
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('0');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    pressUndo();
    expect(screen.getByTestId('graph-node-count')).toHaveTextContent('1');
  });

  it('runs the selected node and its upstream dependencies from the node dialog', async () => {
    const document = fixture('commit-1', 'Run through node');
    document.spec.nodes.push(
      { ...newAutomationNode('notification'),id: 'target' },
      { ...newAutomationNode('notification'),id: 'after' },
    );
    document.spec.edges = [
      { id: 'start-target',from: 'start',to: 'target',condition: 'success' },
      { id: 'target-after',from: 'target',to: 'after',condition: 'success' },
    ];
    const run = runFixture({ id: 'run-through-target',throughNodeId: 'target' });
    const onRun = vi.fn().mockResolvedValue(run);
    renderWorkspace(document, { onRun });

    fireEvent.doubleClick(screen.getByTestId('graph-node-target'));
    const dialog = screen.getByRole('dialog', { name: 'Node target' });
    const runButton = within(dialog).getByRole('button', { name: 'Run to this node' });
    expect(dialog.querySelector('[data-xgc-role="automation-node-dialog-chrome"][data-xgc-id="target"]'))
      .toContainElement(runButton);
    expect(runButton).not.toBeDisabled();
    fireEvent.click(runButton);

    await waitFor(() => expect(onRun).toHaveBeenCalledWith(document, {}, 'target', 'run'));
  });

  it('runs through a node directly from its canvas hover action', async () => {
    const document = fixture('commit-1', 'Run through node from canvas');
    document.spec.nodes.push({ ...newAutomationNode('notification'),id: 'target' });
    document.spec.edges = [{ id: 'start-target',from: 'start',to: 'target',condition: 'success' }];
    const onRun = vi.fn().mockResolvedValue(runFixture({ id: 'run-through-target',throughNodeId: 'target' }));
    renderWorkspace(document, { onRun });

    const runToTarget = screen.getByTestId('graph-run-to-target');
    expect(runToTarget).not.toBeDisabled();
    fireEvent.click(runToTarget);

    await waitFor(() => expect(onRun).toHaveBeenCalledWith(document, {}, 'target', 'run'));
  });

  it('shows manual-trigger parameters without exposing internal node identity', () => {
    renderWorkspace();
    fireEvent.doubleClick(screen.getByTestId('graph-node-start'));

    const dialog = screen.getByRole('dialog', { name: 'Node start' });
    expect(dialog.querySelector('[data-xgc-role="automation-node-input"]')).toBeNull();
    expect(within(dialog).queryByText('Last input')).toBeNull();
    expect(within(dialog).queryByText('No run selected')).toBeNull();
    expect(within(dialog).queryByText('No input yet')).toBeNull();
    expect(within(dialog).queryByText('Starts when you run the Automation')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('This trigger has no type-specific runtime parameters.')).not.toBeInTheDocument();
    expect(dialog.querySelector('[data-xgc-role="automation-manual-trigger-info"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-run-through-node"][data-xgc-id="start"]')).toBeNull();
    expect(within(dialog).getByRole('tab', { name: 'Parameters' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'false');
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameters"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-retry"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-id"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-kind"]')).toBeNull();

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Settings' }));
    expect(dialog.querySelector('[data-xgc-role="automation-node-id"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-retry"]')).not.toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-manual-trigger-info"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-output"][data-xgc-id="start"]')).toHaveTextContent('No trigger output');
  });

  it('shows a schedule trigger as typed scheduling controls without an input column', () => {
    const document = fixture('commit-1', 'Scheduled mission');
    document.spec.nodes = [{
      ...newAutomationNode('trigger.schedule', { kind: 'cron',expression: '0 9 * * 1-5',timezone: 'Asia/Shanghai',parameters: {} }),
      id: 'schedule',
    }];
    const catalog = [{
      kind: 'trigger.schedule',typeVersion: 1,label: 'Schedule trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.schedule'),parameterSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string',enum: ['cron','once'] },
          expression: { type: 'string' },
          timezone: { type: 'string' },
          parameters: { type: 'object' },
        },
      },
    }];
    renderWorkspace(document, { catalog });
    fireEvent.doubleClick(screen.getByTestId('graph-node-schedule'));

    const dialog = screen.getByRole('dialog', { name: 'Node schedule' });
    expect(dialog.querySelector('[data-xgc-role="automation-node-dialog-panes"]')).toHaveAttribute('data-xgc-pane-count', '2');
    expect(dialog.querySelector('[data-xgc-role="automation-node-input"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-run-through-node"][data-xgc-id="schedule"]')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Trigger type' })).toHaveTextContent('Cron schedule');
    expect(dialog.querySelector('[data-xgc-id="schedule:expression"] input')).toHaveValue('0 9 * * 1-5');
    expect(dialog.querySelector('[data-xgc-id="schedule:timezone"] input')).toHaveValue('Asia/Shanghai');
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="schedule:parameters"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-retry"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-output"][data-xgc-id="schedule"]')).toHaveTextContent('No trigger output');
  });

  it('shows empty form, chat, and webhook triggers without placeholder UI or parameter sections', () => {
    const document = fixture('commit-1', 'Event mission');
    document.spec.nodes = [
      { ...newAutomationNode('trigger.form-submission'),id: 'form' },
      { ...newAutomationNode('trigger.chat-message'),id: 'chat' },
      { ...newAutomationNode('trigger.webhook'),id: 'webhook' },
    ];
    const catalog = [
      eventTriggerCatalogEntry('trigger.form-submission', 'On form submission'),
      eventTriggerCatalogEntry('trigger.chat-message', 'On chat message'),
      eventTriggerCatalogEntry('trigger.webhook', 'On webhook call'),
    ];
    renderWorkspace(document, { catalog });

    for (const nodeID of ['form','chat','webhook'] as const) {
      fireEvent.doubleClick(screen.getByTestId(`graph-node-${nodeID}`));
      const dialog = screen.getByRole('dialog', { name: `Node ${nodeID}` });
      expect(dialog.querySelector('[data-xgc-role="automation-node-input"]')).toBeNull();
      expect(dialog.querySelector(`[data-xgc-role="automation-event-trigger-info"][data-xgc-id="${nodeID}"]`)).toBeNull();
      expect(dialog.querySelector('[data-xgc-role="automation-manual-trigger-info"]')).toBeNull();
      expect(dialog.querySelector(`[data-xgc-role="automation-node-parameters"][data-xgc-id="${nodeID}"]`)).toBeNull();
      expect(dialog.querySelector(`[data-xgc-role="automation-run-through-node"][data-xgc-id="${nodeID}"]`)).toBeNull();
      expect(dialog.querySelector(`[data-xgc-role="automation-node-output"][data-xgc-id="${nodeID}"]`)).toHaveTextContent('No trigger output');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close node dialog' }));
    }
  });

  it('keeps editable registered parameters for hosted event triggers', () => {
    const document = fixture('commit-1', 'Parameterized event mission');
    document.spec.nodes = [{ ...newAutomationNode('trigger.chat-message', { channel: 'operations' }),id: 'chat' }];
    const catalog = [{
      ...eventTriggerCatalogEntry('trigger.chat-message', 'On chat message'),
      parameterSchema: { type: 'object',properties: { channel: { type: 'string',title: 'Channel' } },additionalProperties: false },
    }];
    renderWorkspace(document, { catalog });

    fireEvent.doubleClick(screen.getByTestId('graph-node-chat'));
    const dialog = screen.getByRole('dialog', { name: 'Node chat' });

    expect(dialog.querySelector('[data-xgc-role="automation-event-trigger-info"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameters"][data-xgc-id="chat"]')).not.toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="chat:channel"] input')).toHaveValue('operations');
  });

  it('uses one selected execution for upstream input, parameters, and node output', async () => {
    const document = fixture('commit-1', 'Process mission');
    document.spec.nodes.push({ ...managedProcessNode(),id: 'process' });
    document.spec.edges = [{ id: 'start-process',from: 'start',to: 'process',condition: 'success' }];
    const run = runFixture({ id: 'run-process',status: 'succeeded',createdAt: '2026-07-14T07:00:00Z' });
    const detail: AutomationRunDetail = {
      run,
      invocations: [],
      nodeSummaries: [{
        runId: run.id,nodeId: 'process',kind: 'process.run-definition',status: 'succeeded',attemptCount: 1,
        occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
        inputs: { start: { ready: true } },output: { observedState: 'running' },route: 'success',
        updatedAt: '2026-07-14T07:00:01Z',revision: 3,
      }],
      loading: false,error: '',
    };
    const onRefreshRun = vi.fn().mockResolvedValue(detail);
    renderWorkspace(document, {
      catalog: managedCatalog(),
      runs: [run],runDetailsById: { [run.id]: detail },onRefreshRun,
    });

    fireEvent.doubleClick(screen.getByTestId('graph-node-process'));

    const dialog = screen.getByRole('dialog', { name: 'Node process' });
    expect(dialog.querySelector('[data-xgc-role="automation-node-dialog-panes"]')).toHaveAttribute('data-xgc-pane-count', '3');
    const input = dialog.querySelector<HTMLElement>('[data-xgc-role="automation-node-input"][data-xgc-id="process"]')!;
    const output = dialog.querySelector<HTMLElement>('[data-xgc-role="automation-node-output"][data-xgc-id="process"]')!;
    expect(input).not.toHaveTextContent('trigger.manual · start');
    expect(within(input).getByRole('tab', { name: 'Schema' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(input).getByRole('tab', { name: 'JSON' }));
    expect(input).toHaveTextContent('"ready": true');
    expect(dialog.querySelector('[data-xgc-role="automation-selection-inspector"][data-xgc-id="process"]')).not.toBeNull();
    expect(within(output).getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true');
    expect(output).toHaveTextContent('observedState');
    expect(output).toHaveTextContent('running');
    expect(dialog.querySelector('[data-xgc-role="automation-node-runtime-meta"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-summary-select"]')).toBeNull();
    expect(within(dialog).queryByLabelText('Execution')).not.toBeInTheDocument();
    await waitFor(() => expect(onRefreshRun).toHaveBeenCalledWith(run.id));
  });

  it('shows only the latest input and output execution context in the node dialog', async () => {
    const document = fixture('commit-1', 'Process mission');
    document.spec.nodes.push({ ...managedProcessNode(),id: 'process' });
    document.spec.edges = [{ id: 'start-process',from: 'start',to: 'process',condition: 'success' }];
    const newest = runFixture({ id: 'run-newest',status: 'succeeded',createdAt: '2026-07-14T08:00:00Z' });
    const older = runFixture({ id: 'run-older',status: 'failed',createdAt: '2026-07-14T07:00:00Z' });
    const details: Record<string,AutomationRunDetail> = {
      [newest.id]: {
        run: newest,
        invocations: [],
        nodeSummaries: [{
          runId: newest.id,nodeId: 'process',kind: 'process.run-definition',status: 'succeeded',attemptCount: 1,
          occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
          inputs: { start: { sequence: 2 } },output: { observedState: 'running' },route: 'success',
          updatedAt: newest.updatedAt,revision: 2,
        }],loading: false,error: '',
      },
      [older.id]: {
        run: older,
        invocations: [],
        nodeSummaries: [{
          runId: older.id,nodeId: 'process',kind: 'process.run-definition',status: 'failed',attemptCount: 2,
          occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 1,
          inputs: { start: { sequence: 1 } },output: { observedState: 'failed' },route: 'failure',
          updatedAt: older.updatedAt,revision: 4,
        }],loading: false,error: '',
      },
    };
    const onRefreshRun = vi.fn().mockResolvedValue(undefined);
    renderWorkspace(document, {
      catalog: managedCatalog(),
      runs: [older,newest],runDetailsById: details,onRefreshRun,
    });

    fireEvent.doubleClick(screen.getByTestId('graph-node-process'));
    const dialog = screen.getByRole('dialog', { name: 'Node process' });
    expect(within(dialog).queryByLabelText('Execution')).not.toBeInTheDocument();
    expect(dialog.querySelector('[data-xgc-role="automation-node-output"]')).toHaveTextContent('running');
    expect(dialog.querySelector('[data-xgc-role="automation-node-output"]')).not.toHaveTextContent('failed');
    await waitFor(() => expect(onRefreshRun).toHaveBeenCalledWith(newest.id));
  });

  it('keeps typed Parameters and common Settings tabs for read-only process nodes', () => {
    const document = fixture('commit-1', 'Process mission');
    document.head.archived = true;
    document.spec.nodes = [{ ...managedProcessNode(),id: 'process' }];
    renderWorkspace(document, {
      catalog: managedCatalog(),
    });
    fireEvent.doubleClick(screen.getByTestId('graph-node-process'));

    const dialog = screen.getByRole('dialog', { name: 'Node process' });
    const parameters = within(dialog).getByRole('tab', { name: 'Parameters' });
    const settings = within(dialog).getByRole('tab', { name: 'Settings' });
    expect(parameters).toHaveAttribute('aria-selected', 'true');
    expect(settings).toHaveAttribute('aria-selected', 'false');
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="process:port"] input')).toHaveValue(11311);
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="process:port"] input')).toHaveAttribute('readonly');
    expect(dialog).not.toHaveTextContent(/instanceId|definitionId|definitionDigest/);
    expect(dialog.querySelector('[data-xgc-role="automation-node-id"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-kind"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-compensation"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-input"][data-xgc-id="process"]')).toHaveTextContent('No execution selected');
    expect(dialog.querySelector('[data-xgc-role="automation-node-output"][data-xgc-id="process"]')).toHaveTextContent('No execution selected');

    fireEvent.click(settings);
    expect(dialog.querySelector('[data-xgc-role="automation-node-parameter"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-id"]')).toBeNull();
    expect(dialog.querySelector('[data-xgc-role="automation-node-kind"]')).toBeNull();
    expect(within(dialog).queryByRole('switch')).toBeNull();
    expect(dialog.querySelectorAll('[data-xgc-role="automation-node-retry"] input:disabled')).toHaveLength(3);
    expect(dialog.querySelector('[data-xgc-role="automation-node-compensation"]')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Remove node' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(dialog.querySelector('footer')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Close node dialog' })).toBeInTheDocument();
  });

  it('warns before leaving a dirty draft and restores the Automation viewport', () => {
    renderWorkspace();
    fireEvent.click(screen.getByTestId('graph-move-node'));

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByTestId('graph-save-viewport'));
    expect(localStorage.getItem('xgc.automation.viewport.automation-a')).toBe(JSON.stringify({ x: 12,y: 34,zoom: .8 }));
    fireEvent.click(screen.getByTestId('graph-ready'));
    expect(graphMocks.setViewport).toHaveBeenCalledWith({ x: 12,y: 34,zoom: .8 }, { duration: 0 });
  });

  it('uses the same guarded back action for the global Automation breadcrumb', async () => {
    const { props } = renderWorkspace();

    fireEvent.click(screen.getByTestId('graph-move-node'));
    act(() => window.dispatchEvent(new CustomEvent('xgc:automation-list')));

    let confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Discard the unsaved Automation draft and return to the list?');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(props.authoring.onBack).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new CustomEvent('xgc:automation-list')));
    confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(props.authoring.onBack).toHaveBeenCalledOnce());
  });

  it('records a tidy-up as one reversible draft change', () => {
    const document = fixture('commit-1', 'Mission');
    const second = managedProcessNode('foxglove-bridge', 'Foxglove bridge');
    second.id = 'second';
    document.spec.nodes.push(second);
    const { container } = renderWorkspace(document).view;

    fireEvent.click(screen.getByTestId('graph-tidy'));

    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:{"x":0,"y":0},second:{"x":180,"y":0}');
    expect(container.querySelector('[data-xgc-role="automation-definition-save"]')).not.toBeDisabled();

    pressUndo();
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:null,second:null');
  });

  it('keeps an operator draft after a concurrent save conflict loads a newer document', async () => {
    const original = fixture('commit-1', 'Mission');
    const latest = fixture('commit-2', 'Server update');
    const onCommit = vi.fn().mockRejectedValue(new AutomationCommitConflict('409 branch head conflict', latest));
    const { props,view } = renderWorkspace(original, { onCommit });

    fireEvent.click(screen.getByTestId('graph-move-node'));
    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:{"x":42,"y":21}');
    fireEvent.click(view.container.querySelector('[data-xgc-role="automation-definition-save"]')!);

    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    await waitFor(() => expect(view.container.querySelector('[data-xgc-role="automation-save-conflict"]')).not.toBeNull());
    view.rerender(<><TestTopbar /><AutomationDefinitionWorkspace {...props} document={latest} /></>);

    expect(screen.getByTestId('graph-node-positions')).toHaveTextContent('start:{"x":42,"y":21}');
    expect(view.container.querySelector('[data-xgc-role="automation-definition-detail"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-save-conflict"][data-xgc-id="automation-a"]')).not.toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-save-conflict"][data-xgc-id="automation-a"]')).not.toHaveTextContent(/branch|commit|revision/i);
  });
});

function chooseSelectOption(controlName: string, optionName: string) {
  fireEvent.click(screen.getByRole('button', { name: controlName }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

function renderWorkspace(document = fixture('commit-1', 'Mission'), overrides: WorkspaceOverrides = {}) {
  const { runs: fixtureRuns = [] } = overrides;
  const props: WorkspaceProps = {
    authoring: {
      catalog: overrides.catalog ?? [
        { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object' } },
        { kind: 'trigger.schedule',typeVersion: 2,label: 'Schedule trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.schedule'),parameterSchema: { type: 'object' } },
        eventTriggerCatalogEntry('trigger.form-submission', 'On form submission'),
        eventTriggerCatalogEntry('trigger.chat-message', 'On chat message'),
        eventTriggerCatalogEntry('trigger.webhook', 'On webhook call'),
        { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Ground station',traits: automationCatalogTraits('notification'),parameterSchema: { type: 'object' } },
        {
          kind: 'process.run-definition',typeVersion: 1,label: 'Run process definition',category: 'Process',traits: automationCatalogTraits('process.run-definition'),canCompensate: true,
          parameterSchema: { type: 'object',required: ['definitionId','parameters'],properties: { definitionId: { type: 'string' },definitionDigest: { type: 'string' },parameters: { type: 'object' } } },
        },
      ],
      processDefinitions: overrides.processDefinitions
        ?? [processDefinition('roscore', 'ROS 1 master'),processDefinition('foxglove-bridge', 'Foxglove bridge')],
      automationDocuments: overrides.automationDocuments,
      mcpConnections: overrides.mcpConnections,
      mcpCatalogs: overrides.mcpCatalogs,
      nodeComposition: overrides.nodeComposition,
      onBack: overrides.onBack ?? vi.fn(),
      onCommit: overrides.onCommit ?? vi.fn().mockResolvedValue(document),
    },
    execution: {
      targetId: overrides.targetId,
      processInstances: overrides.processInstances,
      preferredRunId: overrides.preferredRunId,
      historyEntries: overrides.historyEntries ?? historyEntriesFromRuns(fixtureRuns),
      historyComplete: overrides.historyComplete,
      historyUnavailableSources: overrides.historyUnavailableSources,
      retryingIngressEventIds: overrides.retryingIngressEventIds,
      ingressRetryErrors: overrides.ingressRetryErrors,
      ingressTransitionLedgers: overrides.ingressTransitionLedgers,
      hasMoreRuns: overrides.hasMoreRuns,
      runsLoadingMore: overrides.runsLoadingMore,
      runDetailsById: overrides.runDetailsById ?? {},
      streamState: overrides.streamState,
      onRun: overrides.onRun ?? vi.fn(),
      onStop: overrides.onStop ?? vi.fn(),
      onRefreshRun: overrides.onRefreshRun ?? vi.fn().mockResolvedValue(emptyRunDetail()),
      onRetainRunDetail:overrides.onRetainRunDetail??vi.fn(() => vi.fn()),
      onLoadMoreRuns: overrides.onLoadMoreRuns,
      onLoadRun: overrides.onLoadRun,
      onOpenRelatedRun: overrides.onOpenRelatedRun,
      onExecutionHistoryVisibilityChange: overrides.onExecutionHistoryVisibilityChange,
      onRetryExecutionIngress: overrides.onRetryExecutionIngress,
      onLoadIngressTransitions: overrides.onLoadIngressTransitions,
      onLoadMoreIngressTransitions: overrides.onLoadMoreIngressTransitions,
    },
    triggers: {
      activations: overrides.activations,
      activationCredentials: overrides.activationCredentials,
      testListenerSessions: overrides.testListenerSessions,
      onActivate: overrides.onActivate ?? vi.fn().mockResolvedValue(undefined),
      onDeactivate: overrides.onDeactivate ?? vi.fn().mockResolvedValue(undefined),
      onDismissActivationCredential: overrides.onDismissActivationCredential ?? vi.fn(),
      onStartTestListener: overrides.onStartTestListener ?? vi.fn().mockResolvedValue(undefined),
      onCancelTestListener: overrides.onCancelTestListener ?? vi.fn().mockResolvedValue(undefined),
      onSubmitTestEvent: overrides.onSubmitTestEvent ?? vi.fn().mockResolvedValue({ eventId: 'event-test' }),
      onRunOnce: overrides.onRunOnce ?? vi.fn().mockResolvedValue({ eventId: 'event-run-once' }),
    },
  };
  return { props,view: render(<><TestTopbar /><AutomationDefinitionWorkspace {...props} document={document} /></>) };
}

function TestTopbar() {
  return <header className="topbar"><div id="xgc-page-topbar-actions" /></header>;
}

type WorkspaceProps = Omit<Parameters<typeof AutomationDefinitionWorkspace>[0], 'document'>;
type WorkspaceOverrides = Partial<
  WorkspaceProps['authoring'] & WorkspaceProps['execution'] & WorkspaceProps['triggers']
> & { runs?: AutomationRun[] };

function historyEntriesFromRuns(runs: AutomationRun[]): AutomationExecutionHistoryEntry[] {
  return runs.map((run) => {
    const summary: AutomationExecutionRunSummary = {
      id: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,
      definitionId: run.definitionId,definitionVersion: run.definitionVersion,
      actionId:run.actionId,actionVersion:run.actionVersion,
      configDigest: run.configDigest,executionPlanDigest: run.executionPlanDigest,registryDigest: run.registryDigest,definitionDigest: run.definitionDigest,
      executionModel: run.executionModel,sourceKind: run.sourceKind,sourceRef: run.sourceRef,status: run.status,revision: run.revision,
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),...(run.rootRunId ? { rootRunId: run.rootRunId } : {}),
      ...(run.callNodeId ? { callNodeId: run.callNodeId } : {}),...(run.throughNodeId ? { throughNodeId: run.throughNodeId } : {}),
      ...(run.depth === undefined ? {} : { depth: run.depth }),admissionMode: run.admissionMode,admissionScope: run.admissionScope,
      ...(run.admissionLimit === undefined ? {} : { admissionLimit: run.admissionLimit }),
      ...(run.admissionOnConflict ? { admissionOnConflict: run.admissionOnConflict } : {}),
      ...(run.replacesRunId ? { replacesRunId: run.replacesRunId } : {}),
      ...(run.triggerInvocation ? { triggerInvocation: run.triggerInvocation } : {}),
      acceptedAt: run.createdAt,createdAt: run.createdAt,...(run.startedAt ? { startedAt: run.startedAt } : {}),
      updatedAt: run.updatedAt,...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    };
    return { id: run.id,runId: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,acceptedAt: run.createdAt,phase: 'run',run: summary };
  });
}

function ingressHistoryEntry(status: 'pending' | 'claimed' | 'dispatched' | 'dead_letter' | 'abandoned'):
AutomationExecutionHistoryEntry {
  const acceptedAt = '2026-07-14T03:00:00Z';
  return {
    id: 'run-ingress',runId: 'run-ingress',targetId: 'local',automationResourceId: 'automation-a',acceptedAt,
    phase: 'ingress',ingress: {
      eventId: 'event-ingress',revision: 1,status,sourceKind: 'webhook',entrypointNodeId: 'start',
      triggerKind: 'trigger.webhook',attemptCount: 0,occurredAt: acceptedAt,receivedAt: acceptedAt,runId: 'run-ingress',
    },
  };
}

function eventTriggerCatalogEntry(kind: BuiltinAutomationCatalogKind, label: string) {
  return { kind,typeVersion: 1,label,category: 'Trigger',traits: automationCatalogTraits(kind),parameterSchema: { type: 'object',additionalProperties: false } };
}

function pressUndo() {
  fireEvent.keyDown(window, { key: 'z',ctrlKey: true });
}

function pressRedo() {
  fireEvent.keyDown(window, { key: 'z',ctrlKey: true,shiftKey: true });
}

function fixture(commitId: string, name: string): AutomationDocument {
  const timestamp = '2026-07-14T00:00:00Z';
  const spec = newAutomationSpec(name);
  spec.nodes = [newAutomationNode('trigger.manual')];
  spec.nodes[0].id = 'start';
  spec.actions[0]!.entryNodeId = 'start';
  const version = commitId === 'commit-1' ? 1 : 2;
  return {
    head: {
      domain: 'automation',resourceId: 'automation-a',name,description: '',tags: [],mainCommitId: commitId,
      currentVersion: version,digest: 'a'.repeat(64),revision: version,createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'automation',resourceId: 'automation-a',name: 'main',headCommitId: commitId,
      headVersion: version,revision: version,createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}

function activationFixture(): AutomationActivation {
  return {
    resourceId: 'automation-a',revision: 1,desiredState: 'active',observedState: 'active',
    pinnedRef: {
      domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 1,digest: 'a'.repeat(64),
    },
    targetId: 'local',entrypointNodeId: 'start',triggerKind: 'trigger.webhook',triggerVersion: 1,
    publicId: 'production-public',requiredCapabilities: [],reachability: 'reachable',lastObservedAt: '2026-07-14T00:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
  };
}

function runFixture({
  id,
  status = 'running',
  revision = 1,
  createdAt = '2026-07-14T01:00:00Z',
  resourceId = 'automation-a',
  branch = 'main',
  throughNodeId = '',
  admissionMode = 'limited',
}: {
  id: string;
  status?: AutomationRun['status'];
  revision?: number;
  createdAt?: string;
  resourceId?: string;
  branch?: string;
  throughNodeId?: string;
  admissionMode?: AutomationRun['admissionMode'];
}): AutomationRun {
  return {
    id,
    targetId: 'local',
    automationResourceId: resourceId,
    definitionId: `definition-${id}`,
    definitionVersion: 1,
    actionId:'run',actionVersion:1,
    configDigest: 'a'.repeat(64),
    executionPlanDigest: 'b'.repeat(64),
    registryDigest: 'c'.repeat(64),
    definitionDigest: 'd'.repeat(64),
    executionModel: 'orchestration-occurrence-v1',
    sourceKind: 'automation',
    sourceRef: {
      domain: 'automation',resourceId,branch,commitId: `${resourceId}-commit`,version: 1,digest: 'd'.repeat(64),
    },
    status,
    revision,
    rootRunId: id,
    depth: 0,
    correlationId: id,
    parameters: {},
    admissionMode,
    admissionScope: 'root',
    ...(admissionMode === 'limited' ? {
      admissionKey: `definition:${id}`,admissionLimit: 1,admissionOnConflict: 'queue' as const,
    } : {}),
    ...(throughNodeId ? { throughNodeId } : {}),
    acceptedAt: createdAt,
    createdAt,
    startedAt: createdAt,
    updatedAt: createdAt,
    ...(status === 'succeeded' ? { finishedAt: createdAt } : {}),
  };
}

function runDetailFixture(runId: string, status: AutomationNodeExecutionSummary['status']): AutomationRunDetail {
  return {
    invocations: [],
    nodeSummaries: [{
      runId,nodeId: 'start',kind: 'trigger.manual',status,attemptCount: 1,
      occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: status === 'failed' ? 1 : 0,
      updatedAt: '2026-07-14T01:00:01Z',revision: 2,
    }],

    loading: false,
    error: '',
  };
}

function activeRuntimeDetailFixture(run: AutomationRun, nodeId: string): AutomationRunDetail {
  const invocationId = `${run.id}:${nodeId}:invocation`;
  return {
    run,
    invocations: [{
      id: invocationId,runId: run.id,nodeId,kind: 'process.run-definition',status: 'succeeded',compensationStatus: 'none',
      createdAt: run.createdAt,updatedAt: run.updatedAt,revision: 1,attempts: [],inputRefs: [],outputRefs: [],
    }],
    nodeSummaries: [{
      runId: run.id,nodeId,kind: 'process.run-definition',status: 'succeeded',attemptCount: 1,
      occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
      updatedAt: run.updatedAt,revision: 1,
    }],
    loading: false,error: '',
    relations: {
      runId: run.id,childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],resources: [],
      runtimes: [{
        id: `${run.id}:runtime`,targetId: run.targetId,groupId: `${run.id}:group`,runId: run.id,invocationId,
        bindingKey: 'process',backendKind: 'process-instance',backendId: 'roscore',ownership: 'owned',relation: 'supervised',
        cleanupPolicy: 'stop',ownerType: 'automation-run',ownerId: run.id,state: 'active',
        createdAt: run.createdAt,updatedAt: run.updatedAt,revision: 1,
      }],
    },
  };
}

function emptyRunDetail(): AutomationRunDetail {
  return { invocations: [],nodeSummaries: [],loading: false,error: '' };
}

function managedProcessNode(definitionId = 'roscore', label = 'ROS 1 master') {
  return newAutomationNode('process.run-definition', {
    definitionId,definitionDigest: `digest-${definitionId}`,parameters: { port: definitionId === 'roscore' ? 11311 : 8765 },
  }, label);
}

function managedCatalog() {
  return [{
    kind: 'process.run-definition',typeVersion: 1,label: 'Run process definition',category: 'Process',traits: automationCatalogTraits('process.run-definition'),canCompensate: true,
    parameterSchema: { type: 'object',required: ['definitionId','parameters'],properties: { definitionId: { type: 'string' },definitionDigest: { type: 'string' },parameters: { type: 'object' } } },
  }];
}

function processDefinition(id: string, label: string): ProcessDefinition {
  return {
    id,version: '1.0.0',label,description: `${label} description`,drivers: ['host'],
    parameters: { properties: { port: { type: 'integer',default: id === 'roscore' ? 11311 : 8765 } },additionalProperties: false },
    command: { executable: `/trusted/${id}` },
    readiness: { kind: 'process',interval: 1,timeout: 1,successThreshold: 1,failureThreshold: 1 },
    liveness: { kind: 'process',interval: 1,timeout: 1,successThreshold: 1,failureThreshold: 1 },
    stop: { gracePeriod: 1 },restart: { mode: 'never',maxRestarts: 0,backoff: 0 },digest: `digest-${id}`,
  };
}

function automationDocumentFixture(resourceId: string, name: string): AutomationDocument {
  const document = fixture('commit-1', name);
  document.head = { ...document.head,resourceId,name };
  document.branch = { ...document.branch,resourceId };
  return document;
}
