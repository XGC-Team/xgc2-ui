// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ExecutionSnapshot,ProcessInstance } from './executionModel';
import { emptyExecutionSnapshot } from './executionModel';
import { OperationsPage } from './OperationsPage';
import { processAuditProvenance } from './operationsModel';
import {
  boundExecutionProcessInstances,
  EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT,
} from './executionSnapshotStore';

const mocks = vi.hoisted(() => ({
  snapshot: {} as ExecutionSnapshot,
  operateProcess: vi.fn(() => Promise.resolve()),
  refresh: vi.fn(() => Promise.resolve()),
}));

vi.mock('./useExecutionTarget', () => ({
  useExecutionTarget: () => mocks.snapshot,
  useExecutionActions: () => ({
    operateProcess: mocks.operateProcess,
    refresh: mocks.refresh,
  }),
}));

vi.mock('./ExecutionLogStreams', () => ({
  ExecutionLogStreams: ({ targetId,entityId,follow }: { targetId: string; entityId: string; follow: boolean }) => (
    <div data-testid={`logs-${entityId}`} data-target={targetId} data-follow={String(follow)} />
  ),
}));

describe('OperationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.snapshot = emptyExecutionSnapshot('local');
  });

  it('renders supervised processes as one audit table with runtime, state, provenance and timing', () => {
    const startedAt = new Date(Date.now() - 65_000).toISOString();
    const instance = processInstance({ startedAt });
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [instance],
    };

    const { container } = render(<OperationsPage targetId="local" />);
    const page = container.querySelector('[data-xgc-role="operations-page"][data-xgc-id="local"]');
    const table = container.querySelector('[data-xgc-role="process-audit-table"][data-xgc-id="local"]');
    const row = container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="roscore-1"]');

    expect(page).toHaveClass('xgc-operator-workspace');
    expect(container.querySelector('[data-xgc-role="operations-header"]')).toHaveClass('operations-section');
    expect(container.querySelector('.xgc-data-table.operations-audit-table-shell')).not.toBeNull();
    const toolbar = container.querySelector('[data-xgc-role="operations-toolbar"][data-xgc-id="local"]')!;
    const search = toolbar.querySelector('[data-xgc-role="operations-search"]')!;
    const toolbarActions = toolbar.querySelector('[data-xgc-role="operations-toolbar-actions"][data-xgc-id="local"]')!;
    expect(toolbar.firstElementChild).toBe(search);
    expect(toolbar.lastElementChild).toBe(toolbarActions);
    expect(toolbarActions.querySelector('[data-xgc-role="operations-kill-all"]')).not.toBeNull();
    expect(toolbarActions.querySelector('[data-xgc-role="operations-refresh"]')).not.toBeNull();
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Process / Definition' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Automation / Run / Node' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Process / Definition' })).toBeInTheDocument();
    expect(row).toBeInTheDocument();
    expect(row?.querySelector('[data-xgc-role="process-instance-identity"]')).toHaveTextContent('ROS Coreroscore-1roscore@1');
    expect(row?.querySelector('[data-xgc-role="process-instance-runtime"]')).toHaveTextContent('PID 42host · local');
    expect(row?.querySelector('[data-xgc-role="process-instance-state"]')).toHaveTextContent('runningdesired runningready passing · live passingdependency ready');
    expect(row?.querySelector('[data-xgc-role="process-instance-provenance"]')).toHaveTextContent('Automationauto-7Runrun-42Nodestart-rosOwnerautomation-run · run-42');
    expect(row?.querySelector('[data-xgc-role="process-instance-timing"]')).toHaveTextContent(/1m \d+s1 restart/);
  });

  it('keeps refresh wording stable while loading and gives search its own identity', () => {
    mocks.snapshot = { ...emptyExecutionSnapshot('local'),loading: true };
    const { container } = render(<OperationsPage targetId="local" />);
    const refresh = container.querySelector('[data-xgc-role="operations-refresh"][data-xgc-id="local"]');
    expect(refresh).toHaveTextContent('Refresh');
    expect(refresh).toHaveAttribute('aria-busy', 'true');
    expect(refresh).toBeDisabled();
    expect(screen.queryByText('Loading')).toBeNull();
    expect(screen.getByRole('searchbox')).toHaveAttribute('data-xgc-role', 'operations-search-input');
    expect(screen.getByRole('searchbox')).toHaveAttribute('data-xgc-id', 'operations-search');
  });

  it('keeps one shared table and marked sort controls through empty and populated states', () => {
    const { container,rerender } = render(<OperationsPage targetId="local" />);
    const table = container.querySelector('[data-xgc-role="process-audit-table"][data-xgc-id="local"]');
    const viewport = table?.querySelector('[data-xgc-role="data-table-row-viewport"]');
    const sort = container.querySelector('[data-xgc-role="process-audit-sort"][data-xgc-id="local:process"]')!;
    expect(viewport).toHaveAttribute('data-xgc-id', 'operations:local');
    fireEvent.click(sort);
    expect(sort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    mocks.snapshot = { ...emptyExecutionSnapshot('local'),processDefinitions: [processDefinition()],processInstances: [processInstance()] };
    rerender(<OperationsPage targetId="local" />);
    expect(container.querySelector('[data-xgc-role="process-audit-table"]')).toBe(table);
    expect(table?.querySelector('[data-xgc-role="data-table-row-viewport"]')).toBe(viewport);
    expect(container.querySelector('[data-xgc-role="process-audit-sort"][data-xgc-id="local:process"]')).toBe(sort);
    expect(sort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('renders audit primary values as regular text instead of strong', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [processInstance()],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const table = container.querySelector('[data-xgc-role="process-audit-table"]');
    const row = container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="roscore-1"]');

    expect(table?.querySelectorAll('strong')).toHaveLength(0);
    expect(row?.querySelectorAll('.operations-audit-primary')).toHaveLength(3);
    expect(row?.querySelector('.operations-audit-primary')).toHaveTextContent('ROS Core');
  });

  it('filters the audit table from the left-side process search', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [
        processInstance({ id: 'alpha-process',handle: { pid: 42 } }),
        processInstance({ id: 'beta-process',handle: { pid: 43 } }),
      ],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const search = screen.getByRole('searchbox', { name: 'Search supervised processes' });

    fireEvent.change(search, { target: { value: 'beta' } });
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="alpha-process"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="beta-process"]')).not.toBeNull();

    fireEvent.change(search, { target: { value: 'PID 42' } });
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="alpha-process"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="beta-process"]')).toBeNull();

    fireEvent.change(search, { target: { value: 'missing process' } });
    expect(container.querySelector('[data-xgc-role="process-instance-row"]')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Process / Definition' })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="data-table-row-viewport"]')?.children).toHaveLength(0);
    expect(screen.queryByText('No matching supervised processes')).toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="operations-audit-pagination"]')).toHaveLength(1);
    expect(screen.getByText('Total 0')).toBeInTheDocument();
  });

  it('contains no process authoring, reconfiguration, restart, or deletion entry points', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [processInstance()],
    };

    const { container } = render(<OperationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="process-instance-create"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-edit"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-save"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-save-restart"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-delete"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="process-state-restart"]')).toBeNull();
    expect(screen.queryByText('New process')).toBeNull();
  });

  it('keeps only Stop and Kill runtime controls and preserves confirmation semantics', async () => {
    const instance = processInstance();
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [instance],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const actions = container.querySelector('[data-xgc-role="process-instance-actions"][data-xgc-id="roscore-1"]') as HTMLElement;

    expect(within(actions).getByRole('button', { name: 'Stop ROS Core' })).toBeEnabled();
    expect(within(actions).getByRole('button', { name: 'Kill ROS Core' })).toBeEnabled();
    expect(within(actions).queryByRole('button', { name: /start|restart|configure|delete/i })).toBeNull();

    fireEvent.click(within(actions).getByRole('button', { name: 'Kill ROS Core' }));
    let confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveTextContent('kill ROS Core?');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(mocks.operateProcess).not.toHaveBeenCalled();

    fireEvent.click(within(actions).getByRole('button', { name: 'Stop ROS Core' }));
    confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveTextContent('stop ROS Core?');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'stop' }));
    await waitFor(() => expect(mocks.operateProcess).toHaveBeenCalledWith(instance, 'stop'));

    fireEvent.click(within(actions).getByRole('button', { name: 'Kill ROS Core' }));
    confirmation = screen.getByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'kill' }));
    await waitFor(() => expect(mocks.operateProcess).toHaveBeenCalledWith(instance, 'kill'));
  });

  it('rejects a duplicate process command queued in the same frame', async () => {
    let finish!: () => void;
    mocks.operateProcess.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [processInstance()],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const kill = container.querySelector<HTMLButtonElement>('[data-xgc-role="process-instance-kill"]')!;

    fireEvent.click(kill);
    fireEvent.click(kill);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'kill' }));
    await waitFor(() => expect(mocks.operateProcess).toHaveBeenCalledTimes(1));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'kill' }));

    expect(mocks.operateProcess).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(kill).toBeEnabled());
  });

  it('places Kill all before Refresh and kills only eligible supervised processes after one confirmation', async () => {
    const running = processInstance({ id: 'running-process' });
    const stopping = processInstance({ id: 'stopping-process',desiredState: 'stopped',observedState: 'stopping',handle: { pid: 43 } });
    const stopped = processInstance({ id: 'stopped-process',desiredState: 'stopped',observedState: 'stopped',handle: null });
    const exited = processInstance({ id: 'exited-process',desiredState: 'stopped',observedState: 'exited',handle: { pid: 44 } });
    const noHandle = processInstance({ id: 'no-handle-process',handle: null });
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [stopped,running,noHandle,exited,stopping],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const killAll = container.querySelector<HTMLButtonElement>('[data-xgc-role="operations-kill-all"][data-xgc-id="local"]')!;
    const refresh = container.querySelector<HTMLButtonElement>('[data-xgc-role="operations-refresh"][data-xgc-id="local"]')!;

    expect(killAll).toBeEnabled();
    expect(killAll.nextElementSibling).toBe(refresh);

    fireEvent.click(killAll);
    let confirmation = screen.getByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Kill all 2 supervised processes on local?');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(mocks.operateProcess).not.toHaveBeenCalled();

    fireEvent.click(killAll);
    confirmation = screen.getByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Kill all' }));
    await waitFor(() => expect(mocks.operateProcess).toHaveBeenCalledTimes(2));
    expect(mocks.operateProcess).toHaveBeenCalledWith(running, 'kill', 'operator requested kill all');
    expect(mocks.operateProcess).toHaveBeenCalledWith(stopping, 'kill', 'operator requested kill all');
    expect(mocks.operateProcess).not.toHaveBeenCalledWith(stopped, 'kill', expect.anything());
    expect(mocks.operateProcess).not.toHaveBeenCalledWith(exited, 'kill', expect.anything());
    expect(mocks.operateProcess).not.toHaveBeenCalledWith(noHandle, 'kill', expect.anything());
  });

  it('keeps Kill all busy until every request settles and reports partial failures', async () => {
    let finishFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => { finishFirst = resolve; });
    mocks.operateProcess
      .mockImplementationOnce(() => firstRequest)
      .mockRejectedValueOnce(new Error('kill denied'));
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [processInstance({ id: 'a-process' }),processInstance({ id: 'b-process',handle: { pid: 43 } })],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const killAll = container.querySelector<HTMLButtonElement>('[data-xgc-role="operations-kill-all"][data-xgc-id="local"]')!;
    const refresh = container.querySelector<HTMLButtonElement>('[data-xgc-role="operations-refresh"][data-xgc-id="local"]')!;

    fireEvent.click(killAll);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Kill all' }));
    await waitFor(() => expect(killAll).toHaveAttribute('aria-busy', 'true'));
    expect(killAll).toBeDisabled();
    expect(killAll).toHaveTextContent('Kill all');
    expect(killAll).not.toHaveTextContent('Killing');
    expect(refresh).toBeDisabled();
    for (const button of container.querySelectorAll<HTMLButtonElement>('[data-xgc-role="process-instance-stop"], [data-xgc-role="process-instance-kill"]')) {
      expect(button).toBeDisabled();
    }

    finishFirst();
    await waitFor(() => expect(container.querySelector('[data-xgc-role="operations-message"]')).toHaveTextContent(
      'Kill all completed with 1/2 failure: b-process: kill denied',
    ));
    expect(mocks.operateProcess).toHaveBeenCalledTimes(2);
    expect(killAll).toBeEnabled();
    expect(refresh).toBeEnabled();
  });

  it('disables Stop and Kill for a stopped process while leaving logs available', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [processInstance({ desiredState: 'stopped',observedState: 'stopped',handle: null,stoppedAt: '2026-07-15T02:01:00Z' })],
    };
    const { container } = render(<OperationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="process-instance-stop"]')).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="process-instance-kill"]')).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="process-instance-logs"]')).toBeEnabled();
    expect(container.querySelector('[data-xgc-role="operations-kill-all"]')).toBeDisabled();
  });

  it('allows startup cancellation and keeps Kill available while a process is stopping', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [
        processInstance({ id: 'starting-process',observedState: 'starting' }),
        processInstance({ id: 'stopping-process',desiredState: 'stopped',observedState: 'stopping' }),
      ],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const starting = container.querySelector('[data-xgc-role="process-instance-actions"][data-xgc-id="starting-process"]') as HTMLElement;
    const stopping = container.querySelector('[data-xgc-role="process-instance-actions"][data-xgc-id="stopping-process"]') as HTMLElement;

    expect(within(starting).getByRole('button', { name: 'Stop ROS Core' })).toBeEnabled();
    expect(within(starting).getByRole('button', { name: 'Kill ROS Core' })).toBeEnabled();
    expect(within(stopping).getByRole('button', { name: 'Stop ROS Core' })).toBeDisabled();
    expect(within(stopping).getByRole('button', { name: 'Kill ROS Core' })).toBeEnabled();
  });

  it('opens a read-only runtime and log drawer without loading an immutable authoring definition', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [processInstance()],
    };
    const { container } = render(<OperationsPage targetId="local" />);

    fireEvent.click(screen.getByRole('button', { name: 'View logs for ROS Core' }));
    const detail = container.querySelector('[data-xgc-role="process-audit-detail"][data-xgc-id="roscore-1"]');

    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent('roscore@1');
    expect(detail).toHaveTextContent('PID 42 · host · local');
    expect(screen.getByTestId('logs-roscore-1')).toHaveAttribute('data-target', 'local');
    expect(screen.getByTestId('logs-roscore-1')).toHaveAttribute('data-follow', 'true');
    expect(detail?.querySelector('input, select, textarea')).toBeNull();
    expect(detail?.querySelector('[data-xgc-role="process-instance-save"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close process runtime details' }));
    expect(container.querySelector('[data-xgc-role="process-audit-detail"]')).toBeNull();
  });

  it('shows missing Automation provenance explicitly without claiming an operator process belongs to a run', () => {
    const instance = processInstance({ ownerType: 'operator',ownerId: 'station-1',scope: 'manual' });
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: [instance],
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const provenance = container.querySelector('[data-xgc-role="process-instance-provenance"]');

    expect(provenance).toHaveTextContent('Automation—');
    expect(provenance).toHaveTextContent('Run—');
    expect(provenance).toHaveTextContent('Node—');
    expect(provenance).toHaveTextContent('Owneroperator · station-1');
    expect(provenance?.querySelectorAll('[data-xgc-empty="true"]')).toHaveLength(3);
  });

  it('keeps refresh and errors outside the audit table and shows an empty page with headers', () => {
    mocks.snapshot = { ...emptyExecutionSnapshot('local'),error: 'process stream failed' };
    const { container } = render(<OperationsPage targetId="local" />);
    const region = container.querySelector('[data-xgc-role="execution-process-list"]');

    expect(region).toHaveClass('operations-audit-region');
    expect(region).not.toHaveClass('operations-scroll-region');
    expect(container.querySelector('[data-xgc-role="process-audit-table"]')).not.toHaveAttribute('data-body-scroll');
    expect(container.querySelector('[data-xgc-role="data-table-row-viewport"]')?.children).toHaveLength(0);
    expect(screen.getByRole('columnheader', { name: 'Runtime' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Operations' })).not.toBeInTheDocument();
    expect(screen.queryByText('No supervised processes')).not.toBeInTheDocument();
    expect(region?.contains(container.querySelector('[data-xgc-role="operations-refresh"]'))).toBe(false);
    expect(container.querySelector('[data-xgc-role="operations-message"]')).toHaveTextContent('process stream failed');
    expect(container.querySelectorAll('[data-xgc-role="operations-audit-pagination"]')).toHaveLength(1);

    fireEvent.click(container.querySelector('[data-xgc-role="operations-refresh"]') as HTMLButtonElement);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('pages the audit table from a footer after the table, without a top pager', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions: [processDefinition()],
      processInstances: Array.from({ length: 25 }, (_, index) => processInstance({
        id: `proc-${String(index + 1).padStart(2, '0')}`,
        handle: { pid: index + 1 },
      })),
    };
    const { container } = render(<OperationsPage targetId="local" />);
    const region = container.querySelector('[data-xgc-role="execution-process-list"]')!;
    const table = container.querySelector('[data-xgc-role="process-audit-table"]')!;
    const pagers = container.querySelectorAll('[data-xgc-role="operations-audit-pagination"]');
    const pager = pagers[0] as HTMLElement;

    expect(pagers).toHaveLength(1);
    expect(pager).toHaveAttribute('data-xgc-placement', 'bottom');
    expect(pager.tagName).toBe('FOOTER');
    expect(table.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.lastElementChild).toBe(pager);
    expect(container.querySelector('[data-xgc-role="process-audit-table"]')).not.toHaveAttribute('data-body-scroll');
    expect(container.querySelectorAll('[data-xgc-role="process-instance-row"]')).toHaveLength(20);
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="proc-01"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="proc-21"]')).toBeNull();
    expect(screen.getByText('Total 25')).toBeInTheDocument();

    fireEvent.click(within(pager).getByRole('button', { name: 'Next page' }));
    expect(container.querySelectorAll('[data-xgc-role="process-instance-row"]')).toHaveLength(5);
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="proc-21"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="proc-01"]')).toBeNull();

    fireEvent.click(within(pager).getByRole('button', { name: 'Previous page' }));
    expect(container.querySelector('[data-xgc-role="process-instance-row"][data-xgc-id="proc-01"]')).not.toBeNull();
  });

  it('keeps the current owner Stop evidence visible inside the bounded audit window', () => {
    const history = Array.from(
      { length:EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + 9 },
      (_,index) => processInstance({
        id:`history-${String(index).padStart(3,'0')}`,
        desiredState:'stopped',observedState:'stopped',handle:null,
        stoppedAt:new Date(Date.UTC(2026,7,23,0,index)).toISOString(),
        updatedAt:new Date(Date.UTC(2026,7,23,0,index)).toISOString(),
      }),
    );
    const currentOwner = processInstance({
      id:'000-current-owner',ownerId:'current-run',
      desiredState:'stopped',observedState:'stopped',handle:null,
      stoppedAt:'2026-08-24T03:00:00Z',updatedAt:'2026-08-24T03:00:00Z',
    });
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      processDefinitions:[processDefinition()],
      processInstances:boundExecutionProcessInstances([...history,currentOwner]),
      processInstancesTruncated:true,
    };

    const { container } = render(<OperationsPage targetId="local" />);

    expect(screen.getByText(`Recent ${EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT}`)).toBeInTheDocument();
    expect(screen.queryByText(`Total ${EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT}`)).toBeNull();
    expect(container.querySelector(
      '[data-xgc-role="process-instance-row"][data-xgc-id="000-current-owner"]',
    )).not.toBeNull();
    expect(container.querySelector(
      '[data-xgc-role="process-instance-row"][data-xgc-id="history-000"]',
    )).toBeNull();
  });

  it('does not expose job or event engine internals', () => {
    mocks.snapshot = {
      ...emptyExecutionSnapshot('local'),
      jobs: [{
        id: 'job-1',targetId: 'local',kind: 'cleanup.scan',status: 'queued',revision: 1,
        parameters: {},currentAttempt: 0,maxAttempts: 1,recovery: 'interrupt',
        createdAt: '2026-07-12T00:00:00Z',queuedAt: '2026-07-12T00:00:00Z',updatedAt: '2026-07-12T00:00:00Z',
      }],
      events: [{
        offset: 1,entityType: 'job',entityId: 'job-1',seq: 1,
        type: 'job.queued',level: 'info',payload: {},createdAt: '2026-07-12T00:00:00Z',
      }],
    };
    const { container } = render(<OperationsPage targetId="local" />);

    expect(container.querySelector('[data-xgc-role="execution-job-list"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="execution-event-list"]')).not.toBeInTheDocument();
    expect(screen.queryByText('job.queued')).not.toBeInTheDocument();
  });
});

describe('processAuditProvenance', () => {
  it('derives structured Automation provenance only from explicit owner and scope fields', () => {
    expect(processAuditProvenance(processInstance())).toEqual({
      automation: 'auto-7',run: 'run-42',node: 'start-ros',owner: 'automation-run · run-42',
    });
    expect(processAuditProvenance(processInstance({ ownerType: 'orchestration-run',ownerId: 'run-from-owner',scope: '' }))).toEqual({
      automation: '—',run: 'run-from-owner',node: '—',owner: 'orchestration-run · run-from-owner',
    });
  });
});

function processDefinition() {
  return {
    id: 'roscore',version: '1',label: 'ROS Core',description: '',drivers: ['host','docker'],
    parameters: { properties: {},additionalProperties: false },
    command: { executable: 'roscore' },
    readiness: { kind: 'process' as const,interval: 1,timeout: 1,successThreshold: 1,failureThreshold: 1 },
    liveness: { kind: 'process' as const,interval: 1,timeout: 1,successThreshold: 1,failureThreshold: 1 },
    stop: { gracePeriod: 1 },restart: { mode: 'never' as const,maxRestarts: 0,backoff: 0 },digest: 'sha256:test',
  };
}

function processInstance(overrides: Partial<ProcessInstance> = {}): ProcessInstance {
  return {
    id: 'roscore-1',
    targetId: 'local',
    definitionId: 'roscore',
    definitionVersion: '1',
    definitionDigest: 'sha256:test',
    ownerType: 'automation-run',
    ownerId: 'run-42',
    scope: 'automation:auto-7/run:run-42/node:start-ros',
    parameters: {},
    driver: 'host',
    desiredState: 'running',
    observedState: 'running',
    readiness: { status: 'passing' },
    liveness: { status: 'passing' },
    handle: { pid: 42 },
    revision: 3,
    restartCount: 1,
    transitionReason: 'dependency ready',
    startedAt: '2026-07-15T02:00:00Z',
    createdAt: '2026-07-15T01:59:58Z',
    updatedAt: '2026-07-15T02:00:05Z',
    ...overrides,
  };
}
