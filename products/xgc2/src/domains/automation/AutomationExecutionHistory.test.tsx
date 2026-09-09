// @vitest-environment jsdom

import { fireEvent,render,screen,within } from '@testing-library/react';
import { beforeAll,describe,expect,it,vi } from 'vitest';
import type { ProcessInstance } from '../execution/executionPublic';
import { AutomationExecutionHistory } from './AutomationExecutionHistory';
import type { AutomationRun } from './automationRunContracts';
import type {
  AutomationNodeInvocation,
  AutomationNodeExecutionSummary,
  AutomationRunDetail,
} from './automationExecutionContracts';
import type { AutomationExecutionHistoryEntry,AutomationExecutionRunSummary,AutomationIngressTransitionLedger } from './automationHistoryTypes';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';

beforeAll(() => {
  class TestResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe(target: Element) {
      Object.defineProperty(target, 'offsetWidth', { configurable: true,value: 112 });
      Object.defineProperty(target, 'offsetHeight', { configurable: true,value: 92 });
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true,value: TestResizeObserver,writable: true });
  if (!globalThis.DOMMatrixReadOnly) {
    Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
      configurable: true,value: class TestDOMMatrixReadOnly { m22 = 1; },
    });
  }
});

describe('AutomationExecutionHistory', () => {
  it('renders the stable empty state without exposing runtime actions', () => {
    const { container } = renderHistory({ runs: [] });

    expect(container.querySelector('[data-xgc-role="automation-executions-view"][data-xgc-id="automation-a"]')).not.toBeNull();
    const view = container.querySelector<HTMLElement>('[data-xgc-role="automation-executions-view"][data-xgc-id="automation-a"]')!;
    const main = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-main"][data-xgc-id="automation-a"]')!;
    const empty = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-empty"][data-xgc-id="automation-a"]')!;
    expect(view).toHaveAttribute('data-empty', 'true');
    expect(container.querySelector('[data-xgc-role="automation-execution-list"][data-xgc-id="automation-a"]')).toBeNull();
    expect(main).not.toBeNull();
    expect(empty).toHaveTextContent('No execution history');
    expect(main).toContainElement(empty);
    expect(container.querySelector('[data-xgc-role="automation-execution-detail"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-active-run"]')).toBeNull();
  });

  it('keeps partial empty Agent history unavailable instead of claiming a first run', () => {
    const { container } = renderHistory({
      runs: [],complete: false,unavailableSources: ['agent'],
    });

    expect(container.querySelector(
      '[data-xgc-role="automation-execution-history-partial"][data-xgc-id="automation-a"]',
    )).toHaveTextContent('Agent execution history is temporarily unavailable');
    expect(container.querySelector(
      '[data-xgc-role="automation-execution-history-unavailable"][data-xgc-id="automation-a"]',
    )).toHaveTextContent('Execution history unavailable');
    expect(container.querySelector('[data-xgc-role="automation-execution-empty"]')).toBeNull();
    expect(container).not.toHaveTextContent('Run this Automation to create its first execution record.');
  });

  it('exposes the durable execution stream state beside the cached Run count', () => {
    const { container,rerender } = renderHistory({ runs: [runFixture()],streamState: 'replaying' });
    const selector = '[data-xgc-role="automation-execution-stream-state"][data-xgc-id="automation-a"]';
    expect(container.querySelector(selector)).toHaveTextContent('Replaying');
    expect(container.querySelector(selector)).toHaveAttribute('title', expect.stringContaining('durable execution events'));

    rerender(<AutomationExecutionHistory
      resourceId="automation-a"
      entries={historyEntriesFromRuns([runFixture()])}
      catalog={[]}
      busy={false}
      streamState="connecting"
      onSelect={vi.fn()}
      onRefreshRun={vi.fn()}
      onStop={vi.fn()}
    />);
    expect(container.querySelector(selector)).toHaveTextContent('Connecting');
    expect(container.querySelector(selector)).toHaveAttribute('title', expect.stringContaining('Connecting to durable execution updates'));

    rerender(<AutomationExecutionHistory
      resourceId="automation-a"
      entries={historyEntriesFromRuns([runFixture()])}
      catalog={[]}
      busy={false}
      streamState="connected"
      onSelect={vi.fn()}
      onRefreshRun={vi.fn()}
      onStop={vi.fn()}
    />);
    expect(container.querySelector(selector)).toBeNull();
  });

  it('loads older definition-scoped executions from the stable history control', () => {
    const onLoadMore = vi.fn();
    const { container,rerender } = renderHistory({
      runs: [runFixture()],hasMoreRuns: true,onLoadMore,
    });
    const selector = '[data-xgc-role="automation-execution-load-more"][data-xgc-id="automation-a"]';
    const loadMore = container.querySelector<HTMLButtonElement>(selector)!;
    expect(loadMore).toHaveTextContent('Load older executions');
    fireEvent.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<AutomationExecutionHistory
      resourceId="automation-a"
      entries={historyEntriesFromRuns([runFixture()])}
      catalog={[]}
      busy={false}
      hasMoreRuns
      loadingMore
      onSelect={vi.fn()}
      onRefreshRun={vi.fn()}
      onLoadMore={onLoadMore}
      onStop={vi.fn()}
    />);
    expect(container.querySelector<HTMLButtonElement>(selector)).toBeDisabled();
    expect(container.querySelector(selector)).toHaveTextContent('Load older executions');
  });

  it('renders every ingress state, reports partial Agent history and retries the exact dead-letter event', () => {
    const entries = (['pending','claimed','dispatched','dead_letter','abandoned'] as const)
      .map((status, index) => ingressHistoryEntry(status, index));
    const dead = entries.find((entry) => entry.ingress?.status === 'dead_letter')!;
    const onRetryIngress = vi.fn();
    const onLoadMoreIngressTransitions = vi.fn();
    const ingressTransitionLedger = transitionLedger(dead);
    const { container } = renderHistory({
      entries,selectedEntry: dead,complete: false,unavailableSources: ['agent'],onRetryIngress,
      ingressTransitionLedger,onLoadMoreIngressTransitions,
      ingressRetryErrors: { [dead.ingress!.eventId]: '403 Forbidden' },
    });

    expect([...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')]).toHaveLength(5);
    for (const status of ['pending','claimed','dispatched','dead_letter','abandoned']) {
      expect(container.querySelector(`[data-xgc-role="automation-execution-row"] .automation-execution-status[data-status="${status}"]`)).not.toBeNull();
    }
    const statusFilter = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-status-filter"]')!;
    chooseSelectOption(statusFilter, 'In progress');
    expect([...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')]
      .map((row) => row.getAttribute('data-xgc-id')).sort()).toEqual(['run-ingress-claimed','run-ingress-pending']);
    chooseSelectOption(statusFilter, 'Terminal');
    expect([...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')]).toHaveLength(3);
    chooseSelectOption(statusFilter, 'All statuses');
    expect(container.querySelector('[data-xgc-role="automation-execution-history-partial"][data-xgc-id="automation-a"]'))
      .toHaveTextContent('Agent execution history is temporarily unavailable');
    const retry = container.querySelector<HTMLButtonElement>(
      `[data-xgc-role="automation-ingress-retry"][data-xgc-id="${dead.ingress!.eventId}"]`,
    )!;
    const technical = container.querySelector<HTMLDetailsElement>(
      `[data-xgc-role="automation-ingress-technical-details"][data-xgc-id="${dead.id}"]`,
    )!;
    expect(technical).not.toHaveAttribute('open');
    expect(technical.querySelector('[data-xgc-role="automation-ingress-run-id"]')).toHaveTextContent(dead.runId);
    expect(technical.querySelector('[data-xgc-role="automation-ingress-event-id"]')).toHaveTextContent(dead.ingress!.eventId);
    expect(technical).toHaveTextContent('Attempts1');
    expect(technical).toHaveTextContent('Revision2');
    fireEvent.click(retry);
    expect(onRetryIngress).toHaveBeenCalledWith(dead.id);
    expect(container.querySelector(`[data-xgc-role="automation-ingress-retry-error"][data-xgc-id="${dead.ingress!.eventId}"]`))
      .toHaveTextContent('403 Forbidden');
    const transition = container.querySelector<HTMLElement>(
      `[data-xgc-role="automation-ingress-transition"][data-xgc-id="${dead.ingress!.eventId}:2"]`,
    )!;
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-revision"]')).toHaveTextContent('Revision 2');
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-kind"]')).toHaveTextContent('dead_lettered');
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-state"]')).toHaveTextContent('claimed → dead_letter');
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-attempt"]')).toHaveTextContent('1');
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-failure"]')).toHaveTextContent('dispatch_failed');
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-actor"]')).toHaveTextContent('dispatcher');
    expect(transition.querySelector('[data-xgc-role="automation-ingress-transition-time"] time')).toHaveAttribute('dateTime', dead.acceptedAt);
    fireEvent.click(container.querySelector('[data-xgc-role="automation-ingress-transitions-load-more"]')!);
    expect(onLoadMoreIngressTransitions).toHaveBeenCalledWith(dead.id);
  });

  it('shows a partial Agent transition ledger without inventing transition rows', () => {
    const pending = ingressHistoryEntry('pending', 0);
    const ledger: AutomationIngressTransitionLedger = {
      runId: pending.runId,automationResourceId: pending.automationResourceId,eventId: pending.ingress!.eventId,
      transitions: [],complete: false,unavailableSources: ['agent'],loading: false,loadingMore: false,error: '',
    };
    const { container } = renderHistory({ entries: [pending],selectedEntry: pending,ingressTransitionLedger: ledger });
    expect(container.querySelector(
      `[data-xgc-role="automation-ingress-transitions-partial"][data-xgc-id="${pending.ingress!.eventId}"]`,
    )).toHaveTextContent('temporarily unavailable');
    expect(container.querySelector('[data-xgc-role="automation-ingress-transition"]')).toBeNull();
  });

  it('shows a busy retry control without exposing a Run detail refresh for ingress-only history', () => {
    const dead = ingressHistoryEntry('dead_letter', 1);
    const onRefreshRun = vi.fn();
    const { container } = renderHistory({
      entries: [dead],selectedEntry: dead,retryingIngressEventIds: [dead.ingress!.eventId],
      onRetryIngress: vi.fn(),onRefreshRun,
    });
    expect(container.querySelector('[data-xgc-role="automation-ingress-retry"]')).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="automation-run-detail-refresh"]')).toBeNull();
    expect(onRefreshRun).not.toHaveBeenCalled();
  });

  it('keeps active-run control separate from a selected historical run and shows persisted node facts', () => {
    const historical = runFixture({ id: 'run-historical',status: 'succeeded',createdAt: '2026-07-14T08:00:00Z',sourceRef: { ...sourceRef,version: 1 } });
    const active = runFixture({ id: 'run-active',status: 'running',createdAt: '2026-07-14T08:02:00Z',sourceRef: { ...sourceRef,version: 2 } });
    const onSelect = vi.fn();
    const onRefreshRun = vi.fn();
    const onStop = vi.fn();
    const detail: AutomationRunDetail = {
      invocations: [],
      nodeSummaries: [nodeFixture({
        runId: historical.id,nodeId: 'launch',kind: 'process.run-definition',status: 'failed',attemptCount: 2,
        inputs: { definitionId: 'roscore',parameters: { port: 11311 } },output: { observed: 'failed' },route: 'failure',revision: 7,
        errorClass: 'permanent',error: 'readiness failed',
      })],
      loading: false,error: '',
    };
    const { container } = renderHistory({
      runs: [active,historical],selectedRun: historical,detail,onSelect,onRefreshRun,onStop,
    });

    const rows = [...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')];
    expect(rows.map((row) => row.getAttribute('data-xgc-id'))).toEqual(['run-active','run-historical']);
    expect(rows[0]).toHaveAttribute('data-xgc-appearance', 'ghost');
    expect(rows[1]).toHaveAttribute('data-xgc-appearance', 'default');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(rows[0]).toHaveTextContent('Running');
    fireEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith(active.id);

    const selected = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-detail"][data-xgc-id="run-historical"]')!;
    const activeBar = container.querySelector<HTMLElement>('[data-xgc-role="automation-active-run"][data-xgc-id="run-active"]')!;
    const main = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-main"][data-xgc-id="automation-a"]')!;
    const list = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-list"][data-xgc-id="automation-a"]')!;
    expect(selected.querySelector('[data-xgc-role="automation-run-status"]')).toHaveTextContent('Succeeded');
    expect(selected.querySelector('[data-xgc-role="automation-run-details"][data-xgc-id="run-historical"]')).toHaveTextContent('Run details');
    expect(selected.querySelector('[data-xgc-role="automation-step-logs"][data-xgc-id="run-historical"]')).toHaveTextContent('Step logs');
    expect(within(selected).queryByRole('button', { name: /^Stop run/ })).toBeNull();
    expect(activeBar).toHaveTextContent('Running now');
    expect(main).toContainElement(activeBar);
    expect(list).not.toContainElement(activeBar);
    fireEvent.click(within(activeBar).getByRole('button', { name: 'Stop run run-active' }));
    expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: active.id,status: active.status,revision: active.revision }));

    const node = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-node"][data-xgc-id="run-historical:launch"]')!;
    expect(node).toHaveTextContent('launch');
    expect(node).toHaveTextContent('process.run-definition');
    expect(node).toHaveTextContent('Attempt 2');
    expect(node).toHaveTextContent('Routefailure');
    expect(node).toHaveTextContent('Revision7');
    const input = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-node-input"][data-xgc-id="run-historical:launch"]')!;
    const output = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-node-output"][data-xgc-id="run-historical:launch"]')!;
    expect(within(input).getByRole('tablist', { name: 'input data view' })).toHaveClass('xgc-tab-strip');
    expect(within(output).getByRole('tablist', { name: 'output data view' })).toHaveClass('xgc-tab-strip');
    fireEvent.click(within(input).getByRole('tab', { name: 'JSON' }));
    fireEvent.click(within(output).getByRole('tab', { name: 'JSON' }));
    expect(input).toHaveTextContent('"definitionId": "roscore"');
    expect(output).toHaveTextContent('permanentreadiness failed');
    expect(output).not.toHaveTextContent('"observed": "failed"');

    expect(within(selected).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(onRefreshRun).not.toHaveBeenCalled();
  });

  it('shows every concurrently supervised run as independently Active', () => {
    const newest = runFixture({ id: 'run-active-newest',status: 'waiting',createdAt: '2026-07-20T05:02:00Z' });
    const older = runFixture({ id: 'run-active-older',status: 'waiting',createdAt: '2026-07-20T05:01:00Z' });
    const newestDetail = activeRuntimeDetail(newest, 'service');
    const olderDetail = activeRuntimeDetail(older, 'service');
    const { container } = renderHistory({
      runs: [older,newest],selectedRun: newest,detail: newestDetail,
      runDetailsById: { [newest.id]: newestDetail,[older.id]: olderDetail },
    });

    for (const run of [newest,older]) {
      const rowStatus = container.querySelector<HTMLElement>(
        `[data-xgc-role="automation-execution-row"][data-xgc-id="${run.id}"] [data-xgc-role="automation-run-status"]`,
      )!;
      expect(rowStatus).toHaveTextContent('Active');
      expect(rowStatus).toHaveAttribute('data-xgc-engine-status', 'waiting');
      expect(rowStatus.querySelector('.lucide-loader-circle')).toBeNull();

      const activeBar = container.querySelector<HTMLElement>(
        `[data-xgc-role="automation-active-run"][data-xgc-id="${run.id}"]`,
      )!;
      expect(activeBar).toHaveAttribute('data-xgc-status', 'active');
      expect(activeBar).toHaveAttribute('data-xgc-engine-status', 'waiting');
      expect(activeBar).toHaveTextContent('Active supervised runtime');
      expect(activeBar.querySelector(`[data-xgc-role="automation-active-run-id"][data-xgc-id="${run.id}"]`))
        .toHaveAttribute('title', run.id);
      expect(activeBar.querySelector('.automation-execution-status .lucide-loader-circle')).toBeNull();
      expect(activeBar.querySelector(`[data-xgc-role="automation-run-stop"][data-xgc-id="${run.id}"]`)).toBeEnabled();
    }

    const selectedStatus = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-execution-detail"][data-xgc-id="run-active-newest"] [data-xgc-role="automation-run-status"]',
    )!;
    expect(selectedStatus).toHaveTextContent('Active');
    expect(selectedStatus.querySelector('.lucide-loader-circle')).toBeNull();
    const selectedDetail = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-detail"][data-xgc-id="run-active-newest"]')!;
    expect(within(selectedDetail).getByText('Status').parentElement).toHaveTextContent('StatusActive');
    const technical = selectedDetail.querySelector<HTMLDetailsElement>(
      '[data-xgc-role="automation-run-technical-details"][data-xgc-id="run-active-newest"]',
    )!;
    expect(technical).not.toHaveAttribute('open');
    expect(within(technical).getByText('Engine status').parentElement).toHaveTextContent('Engine statuswaiting');
  });

  it('disables stop once the active run is already stopping', () => {
    const stopping = runFixture({ id: 'run-stopping',status: 'stopping' });
    const onStop = vi.fn();
    renderHistory({ runs: [stopping],selectedRun: stopping,onStop });

    const stop = screen.getByRole('button', { name: 'Stop run run-stopping' });
    expect(stop).toBeDisabled();
    expect(stop).toHaveTextContent('Stopping');
    fireEvent.click(stop);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('renders stopped and cleanup-failed termination facts separately from the free-text reason', () => {
    const stopped = runFixture({
      id: 'run-stopped',status: 'stopped',terminationKind: 'stopped',reason: 'operator requested maintenance',
    });
    const cleanupFailed = runFixture({
      id: 'run-cleanup-failed',status: 'failed',terminationKind: 'stopped',primaryError: undefined,
      cleanupErrors: ['runtime controller did not acknowledge SIGTERM'],reason: 'operator requested maintenance',
    });
    const { container } = renderHistory({
      runs: [stopped,cleanupFailed],selectedRun: cleanupFailed,
      detail: { run: cleanupFailed,invocations: [],nodeSummaries: [],loading: false,error: '' },
    });

    expect(container.querySelector('[data-xgc-role="automation-execution-row"][data-xgc-id="run-stopped"]'))
      .toHaveTextContent('Stopped');
    expect(container.querySelector('[data-xgc-role="automation-active-runs"]')).toBeNull();
    const termination = container.querySelector(
      '[data-xgc-role="automation-run-termination"][data-xgc-id="run-cleanup-failed"]',
    );
    expect(termination).toHaveTextContent('Terminationstopped');
    expect(termination).toHaveTextContent('operator requested maintenance');
    expect(container.querySelector('[data-xgc-role="automation-run-primary-error"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-cleanup-errors"][data-xgc-id="run-cleanup-failed"]'))
      .toHaveTextContent('runtime controller did not acknowledge SIGTERM');
    const planDigest = container.querySelector(
      '[data-xgc-role="automation-run-digest"][data-xgc-id="run-cleanup-failed:plan"]',
    );
    expect(planDigest).toHaveTextContent('b'.repeat(64));
    expect(planDigest?.querySelector('code')).toHaveAttribute('title', 'b'.repeat(64));
  });

  it('preserves durable identities for every non-terminal and terminal run and stops the requested run', () => {
    const accepted = runFixture({ id: 'run-accepted',status: 'accepted',createdAt: '2026-07-14T08:05:00Z',startedAt: undefined });
    const queued = runFixture({ id: 'run-queued',status: 'queued',createdAt: '2026-07-14T08:04:00Z',startedAt: undefined });
    const running = runFixture({ id: 'run-running',status: 'running',createdAt: '2026-07-14T08:03:00Z' });
    const waiting = runFixture({ id: 'run-waiting',status: 'waiting',createdAt: '2026-07-14T08:02:00Z' });
    const stopping = runFixture({ id: 'run-stopping',status: 'stopping',createdAt: '2026-07-14T08:01:00Z' });
    const succeeded = runFixture({ id: 'run-succeeded',status: 'succeeded',createdAt: '2026-07-14T08:00:00Z' });
    const stopped = runFixture({ id: 'run-stopped',status: 'stopped',createdAt: '2026-07-14T07:59:00Z' });
    const onStop = vi.fn();
    const { container } = renderHistory({
      runs: [accepted,queued,running,waiting,stopping,succeeded,stopped],selectedRun: succeeded,onStop,
    });

    expect([...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual([
      'run-accepted','run-queued','run-running','run-waiting','run-stopping','run-succeeded','run-stopped',
    ]);
    for (const run of [accepted,queued,running,waiting,stopping,succeeded,stopped]) {
      expect(container.querySelector(
        `[data-xgc-role="automation-execution-row-time"][data-xgc-id="${run.id}"]`,
      )).not.toHaveAttribute('title');
    }
    const currentRuns = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-active-runs"][data-xgc-id="automation-a"]',
    )!;
    expect(currentRuns).toHaveAttribute('aria-label', '5 in-progress runs');
    expect([...within(currentRuns).getAllByRole('region')]
      .map((region) => region.getAttribute('data-xgc-id'))).toEqual([
      'run-accepted','run-queued','run-running','run-waiting','run-stopping',
    ]);
    expect(container.querySelector('[data-xgc-role="automation-active-run"][data-xgc-id="run-succeeded"]')).toBeNull();

    expect(within(currentRuns).getByRole('region', { name: 'Accepted run run-accepted' })).toHaveTextContent('Admission accepted');
    expect(within(currentRuns).getByRole('region', { name: 'Queued run run-queued' })).toHaveTextContent('Waiting for an admission slot');
    expect(within(currentRuns).getByRole('region', { name: 'Running run run-running' })).toHaveTextContent('Workflow tasks are executing');
    expect(within(currentRuns).getByRole('region', { name: 'Waiting run run-waiting' })).toHaveTextContent('durable event resumes');

    fireEvent.click(within(currentRuns).getByRole('button', { name: 'Stop run run-queued' }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith(expect.objectContaining({ id: queued.id,status: queued.status,revision: queued.revision }));
    expect(within(currentRuns).getByRole('button', { name: 'Stop run run-stopping' })).toBeDisabled();
  });

  it('orders every active and terminal run newest-first with a stable run-ID tie break', () => {
    const runs = [
      runFixture({ id: 'run-terminal-z',status: 'failed',createdAt: '2026-07-14T08:01:00Z' }),
      runFixture({ id: 'run-waiting',status: 'waiting',createdAt: '2026-07-14T08:04:00Z' }),
      runFixture({ id: 'run-terminal-a',status: 'succeeded',createdAt: '2026-07-14T08:01:00Z' }),
      runFixture({ id: 'run-stopping',status: 'stopping',createdAt: '2026-07-14T08:02:00Z' }),
      runFixture({ id: 'run-queued',status: 'queued',createdAt: '2026-07-14T08:05:00Z',startedAt: undefined }),
      runFixture({ id: 'run-running',status: 'running',createdAt: '2026-07-14T08:03:00Z' }),
      runFixture({ id: 'run-canceled',status: 'canceled',createdAt: '2026-07-14T08:00:00Z' }),
    ];
    const { container } = renderHistory({ runs,selectedRun: runs[0] });

    expect([...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')]
      .map((row) => row.getAttribute('data-xgc-id'))).toEqual([
      'run-queued','run-waiting','run-running','run-stopping',
      'run-terminal-z','run-terminal-a','run-canceled',
    ]);
    expect(container.querySelectorAll('[data-xgc-role="automation-active-run"]')).toHaveLength(4);
    expect(container.querySelector('[data-xgc-role="automation-execution-visible-count"][data-xgc-id="automation-a"]'))
      .toHaveTextContent('7');
  });

  it('filters the cached view by status and relationship without changing a hidden selection', () => {
    const selected = runFixture({
      id: 'run-selected-root',status: 'succeeded',createdAt: '2026-07-14T08:01:00Z',
      sourceRef: { ...sourceRef,version: 7 },throughNodeId: 'manual-entry',
    });
    const rootRunning = runFixture({ id: 'run-root-running',status: 'running',createdAt: '2026-07-14T08:04:00Z' });
    const childWaiting = runFixture({
      id: 'run-child-waiting',status: 'waiting',createdAt: '2026-07-14T08:03:00Z',
      parentRunId: rootRunning.id,rootRunId: rootRunning.id,callNodeId: 'call-worker',depth: 1,
    });
    const childFailed = runFixture({
      id: 'run-child-failed',status: 'failed',createdAt: '2026-07-14T08:02:00Z',
      parentRunId: rootRunning.id,rootRunId: rootRunning.id,callNodeId: 'call-worker',depth: 1,
    });
    const onSelect = vi.fn();
    const { container } = renderHistory({
      runs: [childFailed,selected,rootRunning,childWaiting],selectedRun: selected,onSelect,
    });
    const status = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-status-filter"]')!;
    const relationship = container.querySelector<HTMLElement>('[data-xgc-role="automation-execution-relationship-filter"]')!;
    const filterDisclosure = container.querySelector<HTMLDetailsElement>(
      '[data-xgc-role="automation-execution-filter-disclosure"][data-xgc-id="automation-a"]',
    )!;
    const rowIDs = () => [...container.querySelectorAll('[data-xgc-role="automation-execution-row"]')]
      .map((row) => row.getAttribute('data-xgc-id'));

    expect(rowIDs()).toEqual(['run-root-running','run-child-waiting','run-child-failed','run-selected-root']);
    expect(filterDisclosure).not.toHaveAttribute('open');
    chooseSelectOption(status, 'In progress');
    expect(filterDisclosure).toHaveAttribute('open');
    expect(rowIDs()).toEqual(['run-root-running','run-child-waiting']);
    expect(container.querySelector('[data-xgc-role="automation-execution-detail"][data-xgc-id="run-selected-root"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-execution-selected-filtered"][data-xgc-id="run-selected-root"]'))
      .toHaveTextContent('Selected execution remains open');
    expect(onSelect).not.toHaveBeenCalled();

    chooseSelectOption(relationship, 'Child runs');
    expect(rowIDs()).toEqual(['run-child-waiting']);
    chooseSelectOption(status, 'Failed');
    expect(rowIDs()).toEqual(['run-child-failed']);
    chooseSelectOption(status, 'Terminal');
    expect(rowIDs()).toEqual(['run-child-failed']);
    expect(container.querySelector('[data-xgc-role="automation-active-runs"]')).toBeNull();

    chooseSelectOption(relationship, 'Root runs');
    expect(rowIDs()).toEqual(['run-selected-root']);
    chooseSelectOption(status, 'Waiting');
    expect(rowIDs()).toEqual([]);
    expect(container.querySelector('[data-xgc-role="automation-execution-filter-empty"][data-xgc-id="automation-a"]'))
      .toHaveTextContent('Change a filter to show cached runs');
    expect(container.querySelector('[data-xgc-role="automation-execution-detail"][data-xgc-id="run-selected-root"]')).not.toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    chooseSelectOption(status, 'All statuses');
    chooseSelectOption(relationship, 'All runs');
    expect(rowIDs()).toEqual(['run-root-running','run-child-waiting','run-child-failed','run-selected-root']);
    expect(container.querySelector('[data-xgc-role="automation-execution-selected-filtered"]')).toBeNull();

    expect(container.querySelector('[data-xgc-role="automation-run-entry"][data-xgc-id="run-selected-root"]'))
      .toHaveTextContent('Manual trigger');
    expect(container.querySelector('[data-xgc-role="automation-run-relation"][data-xgc-id="run-selected-root"]'))
      .toHaveTextContent('Manual trigger');
    expect(container.querySelector('[data-xgc-role="automation-run-version"][data-xgc-id="run-selected-root"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-entry"][data-xgc-id="run-child-waiting"]'))
      .toHaveTextContent('Called workflow');
    expect(container.querySelector('[data-xgc-role="automation-child-run-label"][data-xgc-id="run-child-waiting"]'))
      .toHaveTextContent('Called workflow');
    const technical = container.querySelector<HTMLDetailsElement>(
      '[data-xgc-role="automation-run-technical-details"][data-xgc-id="run-selected-root"]',
    )!;
    expect(technical).not.toHaveAttribute('open');
    expect(technical.querySelector('[data-xgc-role="automation-run-id"][data-xgc-id="run-selected-root"]'))
      .toHaveTextContent('run-selected-root');
    expect(technical).toHaveTextContent('VersionDefinition v1');
    expect(technical).toHaveTextContent('RelationshipRoot run');
  });

  it('renders a rejected invocation as terminal admission history', () => {
    const rejected = runFixture({
      id: 'run-rejected',status: 'rejected',reason: 'Run Automation definition',
      createdAt: '2026-07-14T08:04:00Z',updatedAt: '2026-07-14T08:04:00Z',finishedAt: '2026-07-14T08:04:00Z',
    });
    const { container } = renderHistory({ runs: [rejected],selectedRun: rejected });

    const row = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-execution-row"][data-xgc-id="run-rejected"]',
    )!;
    expect(row.querySelector('.automation-execution-status')).toHaveAttribute('data-status', 'rejected');
    expect(row).toHaveTextContent('Rejected');
    expect(row).not.toHaveTextContent('Queued');
    expect(container.querySelector('[data-xgc-role="automation-active-runs"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-stop"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-run-rejection"][data-xgc-id="run-rejected"]'))
      .toHaveTextContent('recorded, but admission policy did not allow it to start');
  });

  it('shows durable replacement admission lineage and opens the replaced run', () => {
    const replaced = runFixture({ id: 'run-replaced',status: 'stopping' });
    const replacement = runFixture({
      id: 'run-replacement',status: 'queued',startedAt: undefined,finishedAt: undefined,
      admissionOnConflict: 'replace',replacesRunId: replaced.id,
    });
    const onOpenRelatedRun = vi.fn();
    const { container } = renderHistory({
      runs: [replacement],selectedRun: replacement,relatedRuns: [replacement,replaced],onOpenRelatedRun,
    });

    const detail = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-execution-detail"][data-xgc-id="run-replacement"]',
    )!;
    expect(detail.querySelector('[data-xgc-role="automation-run-technical-details"]'))
      .toHaveTextContent('Admissionreplace on conflict · limit 1 · root');
    const relationships = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-run-relationships"][data-xgc-id="run-replacement"]',
    )!;
    expect(relationships).toHaveTextContent('Replaced run');
    fireEvent.click(within(relationships).getByRole('button', { name: 'Run run-replaced' }));
    expect(onOpenRelatedRun).toHaveBeenCalledWith(replaced);
  });

  it('shows parent/root execution context, result data, and opens a loaded related run', () => {
    const parent = runFixture({ id: 'run-parent',sourceRef: { ...sourceRef,resourceId: 'automation-parent' } });
    const root = runFixture({ id: 'run-root',sourceRef: { ...sourceRef,resourceId: 'automation-root' } });
    const child = runFixture({
      id: 'run-child',parentRunId: parent.id,rootRunId: root.id,callNodeId: 'call-mapping',depth: 2,
      correlationId: 'correlation-1234567890',result: { accepted: true,count: 3 },
    });
    const onOpenRelatedRun = vi.fn();
    const { container } = renderHistory({
      runs: [child],selectedRun: child,relatedRuns: [child,parent,root],onOpenRelatedRun,
      detail: { run: child,invocations: [],nodeSummaries: [],loading: false,error: '' },
    });

    expect(container.querySelector('[data-xgc-role="automation-run-entry"][data-xgc-id="run-child"]')).toHaveTextContent('Called workflow');
    const relationships = container.querySelector<HTMLElement>('[data-xgc-role="automation-run-relationships"][data-xgc-id="run-child"]')!;
    expect(relationships).toHaveTextContent('Parent run');
    expect(relationships).toHaveTextContent('Root run');
    fireEvent.click(within(relationships).getByRole('button', { name: 'Run run-parent' }));
    expect(onOpenRelatedRun).toHaveBeenCalledWith(parent);

    const technical = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-run-technical-details"][data-xgc-id="run-child"]',
    )!;
    expect(technical.querySelector('[data-xgc-role="automation-run-call-node"]')).toHaveTextContent('call-mapping');
    expect(technical.querySelector('[data-xgc-role="automation-run-correlation"]')).toHaveTextContent('correlation-1234567890');
    expect(technical).toHaveTextContent('Call depth2');

    const result = container.querySelector('[data-xgc-role="automation-run-result-value"][data-xgc-id="run-child"]');
    expect(result).toHaveTextContent('"accepted": true');
    expect(result).toHaveTextContent('"count": 3');
  });

  it('keeps the trigger label concise and retains durable identity in technical details', () => {
    const run = runFixture({
      id: 'run-triggered',
      triggerInvocation: {
        eventId: 'event-1234567890',nodeId: 'webhook-entry',kind: 'trigger.webhook',
        sessionId: 'listener-1234567890',occurredAt: '2026-07-19T10:11:12.000Z',
      },
    });
    const { container } = renderHistory({ runs: [run],selectedRun: run });

    const historyEntry = container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-run-entry"][data-xgc-id="run-triggered"]',
    )!;
    expect(historyEntry).toHaveTextContent('Webhook trigger');
    expect(historyEntry).not.toHaveTextContent('webhook-entry');

    const detail = container.querySelector('[data-xgc-role="automation-execution-detail"]');
    expect(detail).toHaveTextContent('EntryWebhook trigger');
    const trigger = container.querySelector(
      '[data-xgc-role="automation-run-trigger-invocation"][data-xgc-id="run-triggered"]',
    );
    expect(trigger).toHaveTextContent('Eventevent-1234567890');
    expect(trigger).toHaveTextContent('Entrypointwebhook-entry');
    expect(trigger).toHaveTextContent('Sessionlistener-1234567890');
  });

  it('does not present a root run as a relationship to itself', () => {
    const root = runFixture({ id: 'run-root',rootRunId: 'run-root',depth: 0 });
    const { container } = renderHistory({ runs: [root],selectedRun: root,relatedRuns: [root] });

    expect(container.querySelector('[data-xgc-role="automation-run-relationships"]')).toBeNull();
  });

  it('discovers direct child runs from a selected caller and opens the child workflow', () => {
    const parent = runFixture({ id: 'run-parent',rootRunId: 'run-parent',depth: 0 });
    const child = runFixture({
      id: 'run-child',parentRunId: parent.id,rootRunId: parent.id,callNodeId: 'call-mapping',depth: 1,
      sourceRef: { ...sourceRef,resourceId: 'automation-child' },
    });
    const onOpenRelatedRun = vi.fn();
    const { container } = renderHistory({
      runs: [parent],selectedRun: parent,relatedRuns: [parent,child],onOpenRelatedRun,
    });

    const relationships = container.querySelector<HTMLElement>('[data-xgc-role="automation-run-relationships"][data-xgc-id="run-parent"]')!;
    expect(relationships).toHaveTextContent('Child run');
    fireEvent.click(within(relationships).getByRole('button', { name: 'Run run-child' }));
    expect(onOpenRelatedRun).toHaveBeenCalledWith(child);
  });

  it('navigates authoritative relations to their exact invocation and child Run', () => {
    const run = runFixture({ id: 'run-relations' });
    const invocation = invocationFixture(run.id, 'call-child', 'waiting');
    const onOpenRunById = vi.fn();
    const detail: AutomationRunDetail = {
	  invocations: [invocation],nodeSummaries: [],loading: false,error: '',
      relations: {
        runId: run.id,
        childRuns: [{
          id: 'child-link',targetId: 'local',rootRunId: run.id,parentRunId: run.id,parentInvocationId: invocation.id,
          callNodeId: 'call-child',ordinal: 0,childRunId: 'child-run',ownerRunId: run.id,childDefinitionId: 'child-definition',
          childDefinitionVersion: 1,childConfigDigest: 'a'.repeat(64),childExecutionPlanDigest: 'b'.repeat(64),
          childRegistryDigest: 'c'.repeat(64),childDefinitionDigest: 'd'.repeat(64),triggerNodeId: 'called',relation: 'attached',
          waitPolicy: 'wait',cancelPolicy: 'cascade',resultPolicy: 'propagate',createdAt: run.createdAt,updatedAt: run.updatedAt,revision: 1,
        }],
        childRunGroups: [],childRunGroupMembers: [],
        waits: [{
          id: 'wait-child',generation: 1,type: 'child',subjectId: 'child-run',runId: run.id,invocationId: invocation.id,
          attemptId: invocation.attempts[0].id,state: 'pending',reason: 'child completion',createdAt: run.createdAt,updatedAt: run.updatedAt,revision: 1,
        }],
        effects: [],runtimeGroups: [],runtimes: [],resources: [],
      },
    };
    const { container } = renderHistory({ runs: [run],selectedRun: run,detail,onOpenRunById });

    const occurrenceOpen = container.querySelector(
      `[data-xgc-role="automation-node-occurrence-open"][data-xgc-id="${run.id}:call-child"]`,
    )!;
    expect(container.querySelector(
      `[data-xgc-role="automation-node-occurrences"][data-xgc-id="${run.id}"]`,
    )).toHaveTextContent('1 total · 1 active · 0 failed');
    fireEvent.click(occurrenceOpen);
    expect(container.querySelector(
      `[data-xgc-role="automation-node-occurrences-drawer"][data-xgc-id="${run.id}:call-child"]`,
    )).not.toBeNull();

    fireEvent.click(container.querySelector('[data-xgc-role="automation-child-run-open"][data-xgc-id="child-run"]')!);
    expect(onOpenRunById).toHaveBeenCalledWith('child-run');
    const wait = container.querySelector('[data-xgc-role="automation-wait-relation"][data-xgc-id="wait-child"]')!;
    fireEvent.click(wait.querySelector('[data-xgc-role="automation-relation-invocation-open"]')!);
    expect(container.querySelector(`[data-xgc-role="automation-node-occurrences-drawer"][data-xgc-id="${run.id}:call-child"]`)).not.toBeNull();
    expect(container.querySelector(`[data-xgc-role="automation-node-occurrence"][data-xgc-id="${invocation.id}"]`))
      .toHaveAttribute('aria-current', 'true');
    expect(container.querySelector(`[data-xgc-role="automation-occurrence-relations"][data-xgc-id="${invocation.id}"]`))
      .toHaveTextContent('child wait');
  });

  it('renders node status on the immutable canvas captured for the selected run', () => {
    const run = runFixture({ id: 'run-pinned',sourceRef: { ...sourceRef,commitId: 'commit-pinned',version: 3 } });
    const spec = newAutomationSpec('Pinned workflow');
    spec.nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'start',displayName: 'Pinned start',position: { x: 0,y: 0 } },
      { ...newAutomationNode('notification', { message: 'done' }),id: 'notify',displayName: 'Pinned notification',position: { x: 260,y: 0 } },
    ];
    spec.edges = [{ id: 'start-notify',from: 'start',to: 'notify',condition: 'success' }];
    const detail: AutomationRunDetail = {
      invocations: [
        invocationFixture(run.id, 'start', 'succeeded'),
        invocationFixture(run.id, 'notify', 'running'),
      ],
      nodeSummaries: [nodeFixture({ runId: run.id,nodeId: 'start',status: 'succeeded' }),nodeFixture({ runId: run.id,nodeId: 'notify',kind: 'notification',status: 'running' })],
      loading: false,error: '',
      snapshot: {
        runId: run.id,targetId: run.targetId,sourceKind: 'automation',sourceRef: run.sourceRef,
        automationRef: { ...sourceRef,commitId: 'commit-pinned',version: 3 },automationSpec: spec,
        assetContext: { schemaVersion: 1 },
        definitionDigest: run.definitionDigest,digest: 'e'.repeat(64),createdAt: run.createdAt,
      },
    };
    const { container } = renderHistory({ runs: [run],selectedRun: run,detail });

    const technical = container.querySelector(
      '[data-xgc-role="automation-run-technical-details"][data-xgc-id="run-pinned"]',
    );
    expect(technical).toHaveTextContent('Pinned version3');
    expect(technical?.querySelector('[data-xgc-role="automation-run-snapshot-commit"]'))
      .toHaveTextContent('commit-pinned');
    expect(container.querySelector('[data-xgc-role="automation-node-display-name"][data-xgc-id="start"]')).toHaveTextContent('Pinned start');
    expect(container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="start"]')).toHaveAttribute('data-xgc-status', 'succeeded');
    expect(container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="notify"]')).toHaveAttribute('data-xgc-status', 'running');
    expect(container.querySelector('[data-xgc-role="automation-node-aggregate"][data-xgc-id="notify"]'))
      .toHaveAttribute('aria-label', '1 invocation, 1 active, 0 failed');

    fireEvent.click(container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="notify"]')!);
    expect(container.querySelector('[data-xgc-role="automation-node-occurrences-drawer"][data-xgc-id="run-pinned:notify"]'))
      .toHaveTextContent('Node execution details');
    expect(container.querySelectorAll('[data-xgc-role="automation-node-occurrence"]')).toHaveLength(1);
  });

  it('shows the active supervised process animation on the History workflow while relations are catching up', () => {
    const run = runFixture({ id: 'run-gazebo-client',status: 'waiting',finishedAt: undefined });
    const spec = newAutomationSpec('Gazebo Client');
    spec.nodes = [{
      ...newAutomationNode('process.run-definition', {
        definitionId: 'gazebo-client',definitionDigest: 'd'.repeat(64),runtimeLifecycle: 'supervised',parameters: {},
      }),
      id: 'service',displayName: 'Start Gazebo Client',position: { x: 0,y: 0 },
    }];
    const detail: AutomationRunDetail = {
      run,invocations: [invocationFixture(run.id, 'service', 'succeeded')],
      nodeSummaries: [nodeFixture({ runId: run.id,nodeId: 'service',kind: 'process.run-definition',status: 'succeeded' })],
      loading: false,error: '',
      snapshot: {
        runId: run.id,targetId: run.targetId,sourceKind: 'automation',sourceRef: run.sourceRef,
        automationRef: sourceRef,automationSpec: spec,assetContext: { schemaVersion: 1 },
        definitionDigest: run.definitionDigest,digest: 'e'.repeat(64),createdAt: run.createdAt,
      },
    };
    const process: ProcessInstance = {
      id: 'process-gazebo-client',targetId: 'local',definitionId: 'gazebo-client',definitionVersion: '1.0.0',
      definitionDigest: 'd'.repeat(64),ownerType: 'orchestration-run',ownerId: run.id,
      scope: 'automation/automation-a/invocation/opaque',parameters: {},driver: 'host',
      desiredState: 'running',observedState: 'running',readiness: { status: 'passing' },liveness: { status: 'passing' },
      revision: 3,restartCount: 0,startedAt: run.startedAt,createdAt: run.createdAt,updatedAt: run.updatedAt,
    };
    const { container } = renderHistory({ runs: [run],selectedRun: run,detail,processInstances: [process] });

    const service = container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="service"]');
    expect(service).toHaveAttribute('data-xgc-status', 'active');
    expect(service).toHaveAttribute('data-xgc-runtime-state', 'active');
    expect(service?.querySelector('[data-xgc-role="automation-node-tile"]')).not.toHaveAttribute('data-running');
    expect(service?.querySelector('[data-xgc-role="automation-node-status"]')).toHaveTextContent('running');
  });

  it('shows refresh only beside a failed detail load and disables mutations while busy', () => {
    const run = runFixture({ id: 'run-active',status: 'waiting' });
    renderHistory({
      runs: [run],selectedRun: run,
      detail: { invocations: [],nodeSummaries: [],loading: false,error: 'detail unavailable' },
      busy: true,
    });

    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop run run-active' })).toBeDisabled();
  });
});

type HistoryTestOverrides = Omit<Partial<Parameters<typeof AutomationExecutionHistory>[0]>,'entries'> & {
  runs?: AutomationRun[];
  entries?: AutomationExecutionHistoryEntry[];
};

function renderHistory({ runs = [],entries = historyEntriesFromRuns(runs),selectedRun,...overrides }: HistoryTestOverrides = {}) {
  return render(<AutomationExecutionHistory
    resourceId="automation-a"
    entries={entries}
    selectedEntry={entries.find((entry) => entry.id === selectedRun?.id) ?? entries[0]}
    selectedRun={selectedRun}
    catalog={[]}
    busy={false}
    onSelect={vi.fn()}
    onRefreshRun={vi.fn()}
    onStop={vi.fn()}
    {...overrides}
  />);
}

function historyEntriesFromRuns(runs: AutomationRun[]): AutomationExecutionHistoryEntry[] {
  return runs.map((run) => {
    const summary: AutomationExecutionRunSummary = {
      id: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,
      definitionId: run.definitionId,definitionVersion: run.definitionVersion,
      actionId:run.actionId,actionVersion:run.actionVersion,
      configDigest: run.configDigest,executionPlanDigest: run.executionPlanDigest,registryDigest: run.registryDigest,definitionDigest: run.definitionDigest,
      executionModel: run.executionModel,sourceKind: run.sourceKind,sourceRef: run.sourceRef,status: run.status,revision: run.revision,
      ...(run.terminationKind ? { terminationKind: run.terminationKind } : {}),
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
      ...(run.rootRunId ? { rootRunId: run.rootRunId } : {}),
      ...(run.callNodeId ? { callNodeId: run.callNodeId } : {}),
      ...(run.throughNodeId ? { throughNodeId: run.throughNodeId } : {}),
      ...(run.depth === undefined ? {} : { depth: run.depth }),
      admissionMode: run.admissionMode,admissionScope: run.admissionScope,
      ...(run.admissionLimit === undefined ? {} : { admissionLimit: run.admissionLimit }),
      ...(run.admissionOnConflict ? { admissionOnConflict: run.admissionOnConflict } : {}),
      ...(run.replacesRunId ? { replacesRunId: run.replacesRunId } : {}),
      ...(run.triggerInvocation ? { triggerInvocation: run.triggerInvocation } : {}),
      acceptedAt: run.createdAt,createdAt: run.createdAt,...(run.startedAt ? { startedAt: run.startedAt } : {}),
      updatedAt: run.updatedAt,...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    };
    return {
      id: run.id,runId: run.id,targetId: run.targetId,automationResourceId: run.automationResourceId,
      acceptedAt: run.createdAt,phase: 'run',run: summary,
    };
  });
}

function ingressHistoryEntry(
  status: 'pending' | 'claimed' | 'dispatched' | 'dead_letter' | 'abandoned',
  index: number,
): AutomationExecutionHistoryEntry {
  const acceptedAt = `2026-07-14T08:00:0${index}Z`;
  const runId = `run-ingress-${status}`;
  return {
    id: runId,runId,targetId: 'local',automationResourceId: 'automation-a',acceptedAt,phase: 'ingress',
    ingress: {
      eventId: `event-${status}`,revision: 2,status,sourceKind: 'webhook',entrypointNodeId: 'webhook-entry',
      triggerKind: 'trigger.webhook',attemptCount: status === 'pending' ? 0 : 1,
      occurredAt: acceptedAt,receivedAt: acceptedAt,runId,
    },
  };
}

function transitionLedger(entry: AutomationExecutionHistoryEntry): AutomationIngressTransitionLedger {
  return {
    runId: entry.runId,automationResourceId: entry.automationResourceId,eventId: entry.ingress!.eventId,
    transitions: [
      {
        eventId: entry.ingress!.eventId,revision: 1,kind: 'accepted',toStatus: 'pending',attemptCount: 0,
        actor: 'source_adapter',occurredAt: entry.acceptedAt,
      },
      {
        eventId: entry.ingress!.eventId,revision: 2,kind: 'dead_lettered',fromStatus: 'claimed',toStatus: 'dead_letter',
        attemptCount: 1,failureCode: 'dispatch_failed',actor: 'dispatcher',occurredAt: entry.acceptedAt,
      },
    ],
    nextAfterRevision: 2,complete: true,loading: false,loadingMore: false,error: '',
  };
}

const sourceRef = {
  domain: 'automation' as const,resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 1,digest: 'd'.repeat(64),
};

function runFixture(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const status = overrides.status ?? 'succeeded';
  return {
    id: 'run-active',targetId: 'local',automationResourceId: 'automation-a',definitionId: 'runtime-definition',definitionVersion: 1,actionId:'run',actionVersion:1,
    definitionDigest: 'd'.repeat(64),
    sourceKind: 'automation',sourceRef,status: 'succeeded',revision: 1,parameters: {},
    admissionMode: 'limited',admissionScope: 'root',admissionKey: 'definition:runtime-definition',admissionLimit: 1,admissionOnConflict: 'queue',
    createdAt: '2026-07-14T08:00:00Z',startedAt: '2026-07-14T08:00:01Z',updatedAt: '2026-07-14T08:01:00Z',finishedAt: '2026-07-14T08:01:00Z',
    ...overrides,
    configDigest: overrides.configDigest ?? 'a'.repeat(64),executionPlanDigest: overrides.executionPlanDigest ?? 'b'.repeat(64),registryDigest: overrides.registryDigest ?? 'c'.repeat(64),
    acceptedAt: overrides.acceptedAt ?? '2026-07-14T08:00:00Z',
    rootRunId: overrides.rootRunId ?? overrides.id ?? 'run-active',depth: overrides.depth ?? 0,
    correlationId: overrides.correlationId ?? overrides.rootRunId ?? overrides.id ?? 'run-active',
    executionModel: 'orchestration-occurrence-v1',
    terminationKind: overrides.terminationKind ?? runTerminationKind(status),
    ...(status === 'failed' && (overrides.terminationKind ?? 'failed') === 'failed'
      ? { primaryError: overrides.primaryError ?? 'test failure' }
      : {}),
  };
}

function runTerminationKind(status: AutomationRun['status']): AutomationRun['terminationKind'] {
  switch (status) {
    case 'stopping': return 'stopped';
    case 'succeeded': return 'completed';
    case 'failed': return 'failed';
    case 'canceled': return 'canceled';
    case 'stopped': return 'stopped';
    case 'rejected': return 'rejected';
    default: return undefined;
  }
}

function nodeFixture(overrides: Partial<AutomationNodeExecutionSummary> = {}): AutomationNodeExecutionSummary {
  return {
    runId: 'run-active',nodeId: 'start',kind: 'trigger.manual',status: 'succeeded',attemptCount: 1,
    occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
    updatedAt: '2026-07-14T08:00:02Z',revision: 1,...overrides,
  };
}

function invocationFixture(
  runId: string,
  nodeId: string,
  status: AutomationNodeInvocation['status'],
): AutomationNodeInvocation {
  const id = `${runId}:${nodeId}:invocation`;
  return {
    id,runId,nodeId,kind: nodeId === 'start' ? 'trigger.manual' : 'notification',status,compensationStatus: 'none',
    createdAt: '2026-07-14T08:00:00Z',updatedAt: '2026-07-14T08:00:02Z',revision: 1,
    attempts: [{
      id: `${id}:attempt-1`,runId,invocationId: id,phase: 'execution',number: 1,
      status: status === 'succeeded' ? 'succeeded' : 'running',
      createdAt: '2026-07-14T08:00:00Z',updatedAt: '2026-07-14T08:00:02Z',revision: 1,
    }],
    inputRefs: [],outputRefs: [],
  };
}

function activeRuntimeDetail(run: AutomationRun, nodeId: string): AutomationRunDetail {
  const invocation = invocationFixture(run.id, nodeId, 'succeeded');
  return {
    run,invocations: [invocation],nodeSummaries: [nodeFixture({
      runId: run.id,nodeId,kind: 'process.run-definition',status: 'succeeded',
    })],loading: false,error: '',
    relations: {
      runId: run.id,childRuns: [],childRunGroups: [],childRunGroupMembers: [],waits: [],effects: [],runtimeGroups: [],resources: [],
      runtimes: [{
        id: `${run.id}:runtime`,targetId: run.targetId,groupId: `${run.id}:group`,runId: run.id,invocationId: invocation.id,
        bindingKey: 'process',backendKind: 'process-instance',backendId: `process-${run.id}`,ownership: 'owned',relation: 'supervised',
        cleanupPolicy: 'stop',ownerType: 'automation-run',ownerId: run.id,state: 'active',
        createdAt: run.createdAt,updatedAt: run.updatedAt,revision: 1,
      }],
    },
  };
}

function chooseSelectOption(control: HTMLElement, optionName: string) {
  fireEvent.click(within(control).getByRole('button'));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}
