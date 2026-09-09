// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ExecutionJob } from '../execution/executionPublic';
import type * as ExecutionPublicModule from '../execution/executionPublic';
import type * as HostPublicModule from '../host/hostPublic';
import { ToolboxPage } from './ToolboxPage';
import {
  listMaintenanceDefinitions,
  submitCleanupAction,
  submitRemoteCleanupAction,
} from './toolboxService';

let jobs: ExecutionJob[] = [];

vi.mock('../execution/executionPublic', async (importOriginal) => {
  const original = await importOriginal<typeof ExecutionPublicModule>();
  return {
    ...original,
    executionRequestId: vi.fn(() => 'request-1'),
    useExecutionTarget: vi.fn(() => ({ jobs })),
  };
});

vi.mock('./toolboxService', () => ({
  listMaintenanceDefinitions: vi.fn(),
  submitCleanupAction: vi.fn(),
  submitRemoteCleanupAction: vi.fn(),
}));

vi.mock('../host/hostPublic', async (importOriginal) => {
  const original = await importOriginal<typeof HostPublicModule>();
  return {
    ...original,
    HostSettingsPanel: ({ actionsEnabled }: { actionsEnabled: boolean }) => (
      <section data-xgc-role="system-host-settings" data-xgc-actions={actionsEnabled ? 'true' : 'false'}>
        Host policy
      </section>
    ),
  };
});

describe('ToolboxPage', () => {
  beforeEach(() => {
    jobs = [];
    vi.clearAllMocks();
    vi.mocked(listMaintenanceDefinitions).mockResolvedValue([definition('cleanup.scan'), definition('cleanup.apply')]);
  });

  it('projects registered maintenance internals as a domain capability', async () => {
    render(<ToolboxPage activeTab="maintenance" targetId="local" language="en-US" />);
    expect(await screen.findByText('Storage cleanup')).toBeInTheDocument();
    expect(screen.getByText(/Built-in maintenance handlers registered on this target/i)).toBeInTheDocument();
    expect(screen.getByText('Scan ROS session logs and Agent cache/tmp, then clean the groups you select.')).toBeInTheDocument();
    expect(screen.queryByText('cleanup.scan')).toBeNull();
    expect(screen.queryByText('cleanup.apply')).toBeNull();
    expect(screen.queryByText(/reconcile|timeout|compensation/i)).toBeNull();
    expect(screen.queryByText('Script library')).toBeNull();
    expect(screen.queryByText('Quick settings')).toBeNull();
  });

  it('opens the cleanup workspace from the registered storage-cleanup capability', async () => {
    const onOpenCleanup = vi.fn();
    render(<ToolboxPage activeTab="maintenance" targetId="local" language="en-US" onOpenCleanup={onOpenCleanup} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open cleanup' }));
    expect(onOpenCleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps the cleanup workspace action-first without redundant heading copy', async () => {
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(container.querySelector('[data-xgc-role="cleanup-section"]')).toHaveAttribute('data-chrome', 'flat');
    expect(screen.queryByText('Storage cleanup')).toBeNull();
    expect(screen.queryByText(/Scan XGC-managed artifacts, recycle data, and execution logs/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument();
  });

  it('keeps Scan and Clean grouped on the right of the System cleanup toolbar', () => {
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="xavier" managedHostId="xavier" language="en-US" maintenanceEnabled requestsAllowed />);
    const toolbar = container.querySelector('.toolbox-toolbar');
    const actions = container.querySelector('[data-xgc-role="cleanup-actions"]');
    expect(actions).not.toBeNull();
    expect(toolbar?.lastElementChild).toBe(actions);
    const roles = [...actions!.querySelectorAll('[data-xgc-role]')].map((node) => node.getAttribute('data-xgc-role'));
    expect(roles).toEqual(['cleanup-scan', 'cleanup-apply']);
    expect(container.querySelector('[data-xgc-role="cleanup-empty"]')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
  });

  it('keeps cleanup summary on the same toolbar row as Scan and Clean', async () => {
    jobs = [{
      ...job('scan-job', 'cleanup.scan', 'succeeded'),
      result: {
        scanDigest: 'digest-1',
        totalBytes: 47 * 1024 * 1024,
        items: [{ id: 'cache', name: 'Cache', sizeBytes: 47 * 1024 * 1024, entryCount: 32, selectedByDefault: true }],
      },
    }];
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(await screen.findByText('Cleanable size')).toBeInTheDocument();
    const toolbar = container.querySelector<HTMLElement>('.toolbox-toolbar');
    const summary = container.querySelector<HTMLElement>('[data-xgc-role="cleanup-summary"]');
    const actions = container.querySelector<HTMLElement>('[data-xgc-role="cleanup-actions"]');
    expect(summary).not.toBeNull();
    expect(toolbar).toContainElement(summary);
    expect(toolbar).toContainElement(actions);
    expect(toolbar?.firstElementChild).toBe(summary);
    expect(toolbar?.lastElementChild).toBe(actions);
    expect(container.querySelector('.toolbox-cleanup-layout > [data-xgc-role="cleanup-summary"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clean' })).toBeInTheDocument();
  });

  it('keeps a supplied performance control at the start of the cleanup toolbar', () => {
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" performanceControl={<button type="button">Performance mode</button>} />);
    const toolbar = container.querySelector('.toolbox-toolbar');
    expect(toolbar?.firstElementChild).toBe(screen.getByRole('button', { name: 'Performance mode' }));
    expect(toolbar?.lastElementChild).toBe(container.querySelector('[data-xgc-role="cleanup-actions"]'));
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clean' })).toBeInTheDocument();
  });

  it('keeps host performance control available when a remote host has no cleanup capability', () => {
    const openPerformance = vi.fn();
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="agent-a" managedHostId="agent-a" language="en-US" maintenanceEnabled={false} performanceControl={<button type="button" onClick={openPerformance}>Performance mode</button>} />);
    const performance = screen.getByRole('button', { name: 'Performance mode' });
    expect(container.querySelector('.toolbox-toolbar')?.firstElementChild).toBe(performance);
    fireEvent.click(performance);
    expect(openPerformance).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Scan' })).not.toBeInTheDocument();
    expect(submitRemoteCleanupAction).not.toHaveBeenCalled();
    expect(listMaintenanceDefinitions).not.toHaveBeenCalled();
  });

  it('renders an empty cleanup table before any scan', () => {
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(container.querySelector('.toolbox-notice')).toBeNull();
    expect(container.querySelector('[data-xgc-role="cleanup-empty"]')).toBeNull();
    expect(container.querySelector('.toolbox-cleanup-layout')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Size' })).toBeInTheDocument();
    const surface = container.querySelector('[data-xgc-role="cleanup-scan-result"]');
    const table = container.querySelector('[data-xgc-role="cleanup-entry-table"]');
    const viewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(surface).toHaveClass('toolbox-table-region');
    expect(surface).toHaveAttribute('data-xgc-surface', 'page');
    expect(surface).not.toHaveAttribute('data-xgc-id');
    expect(table).toHaveAttribute('data-body-scroll', 'true');
    expect(viewport).toHaveAttribute('aria-label', 'Table rows');
    expect(viewport).toHaveAttribute('data-xgc-id', 'cleanup-entry-table');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).not.toContainElement(nameHeader);
    expect(viewport?.children).toHaveLength(0);
    // Same shared SortableDataTable chrome as populated scans: sortable
    // headers stay live and the bulk selection control stays inert.
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sort by Name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Entries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort by Size' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeDisabled();
    expect(container.querySelector('.xgc-data-table-empty')).toBeNull();
    expect(container.querySelector('.xgc-pagination')).toBeNull();
    expect(listMaintenanceDefinitions).not.toHaveBeenCalled();
  });

  it('renders a single cleanup workspace on the System Maintenance all-tab (no stacked catalog)', async () => {
    const { container } = render(<ToolboxPage activeTab="all" targetId="local" language="en-US" />);
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="cleanup-section"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="maintenance-catalog"]')).toBeNull();
    expect(screen.queryByText('Registered maintenance')).toBeNull();
    expect(screen.queryByText('Storage cleanup')).toBeNull();
  });

  it('keeps Host policy off Maintenance cleanup and catalog tabs', () => {
    const cleanup = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(cleanup.container.querySelector('[data-xgc-role="system-host-settings"]')).toBeNull();
    cleanup.unmount();
    const catalog = render(<ToolboxPage activeTab="maintenance" targetId="local" language="en-US" />);
    expect(catalog.container.querySelector('[data-xgc-role="system-host-settings"]')).toBeNull();
    catalog.unmount();
    const all = render(<ToolboxPage activeTab="all" targetId="local" language="en-US" />);
    expect(all.container.querySelector('[data-xgc-role="system-host-settings"]')).toBeNull();
  });

  it('submits a cleanup scan without a transient accepted banner', async () => {
    const accepted = job('scan-job', 'cleanup.scan', 'queued');
    vi.mocked(submitCleanupAction).mockResolvedValue({ job: accepted,receipt: {} as never });
    render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    const scanButton = await screen.findByRole('button', { name: 'Scan' });
    fireEvent.click(scanButton);
    await waitFor(() => expect(submitCleanupAction).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'local',action: 'scan',requestId: 'request-1',idempotencyKey: 'request-1',
    }), {}));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('scan-job')).not.toBeInTheDocument();
  });

  it('keeps the Scan label stable while the execution feed reports it busy', async () => {
    jobs = [job('scan-job', 'cleanup.scan', 'running')];
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.toolbox-notice')).toBeNull();
    expect(screen.queryByText(/Cleanup scan in progress/i)).not.toBeInTheDocument();
  });

  it('keeps the Clean label stable while an apply is running', () => {
    jobs = [job('apply-job', 'cleanup.apply', 'running')];
    render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    const clean = screen.getByRole('button', { name: 'Clean' });
    expect(clean).toBeDisabled();
    expect(clean).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Cleaning…')).not.toBeInTheDocument();
  });

  it('surfaces the latest completed apply result', async () => {
    jobs = [{
      ...job('apply-job', 'cleanup.apply', 'succeeded'),
      result: {
        scanDigest: 'digest-1',
        totalBytes: 2048,
        totalItems: 4,
        applied: [{ id: 'cache', removedBytes: 2048, removedItems: 4 }],
      },
    }];
    render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(await screen.findByText('Last cleaned')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('uses the last successful scan digest for cleanup.apply', async () => {
    jobs = [{
      ...job('scan-job', 'cleanup.scan', 'succeeded'),
      result: { scanDigest: 'digest-1',totalBytes: 1024,items: [{ id: 'cache',name: 'Cache',sizeBytes: 1024,entryCount: 3 }] },
    }];
    const accepted = job('apply-job', 'cleanup.apply', 'queued');
    vi.mocked(submitCleanupAction).mockResolvedValue({ job: accepted,receipt: {} as never });
    render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    const cleanButton = await screen.findByRole('button', { name: 'Clean' });
    fireEvent.click(cleanButton);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clean' }));
    await waitFor(() => expect(submitCleanupAction).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'local',action: 'apply',ids: ['cache'],scanDigest: 'digest-1',
    }), {}));
  });

  it('leaves diagnostic log groups unselected unless the backend recommends them', async () => {
    jobs = [{
      ...job('scan-job', 'cleanup.scan', 'succeeded'),
      result: {
        scanDigest: 'digest-1',
        totalBytes: 3072,
        items: [
          { id: 'job-artifacts',name: 'Job artifacts',sizeBytes: 1024,entryCount: 1,selectedByDefault: true },
          { id: 'automation-logs',name: 'Automation logs',sizeBytes: 2048,entryCount: 8,selectedByDefault: false },
        ],
      },
    }];
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);

    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clean' })).toBeEnabled();
    expect(container.querySelector('[data-xgc-id="job-artifacts"]')).toHaveAttribute('data-xgc-selected','true');
    expect(container.querySelector('[data-xgc-id="automation-logs"]')).not.toHaveAttribute('data-xgc-selected');
  });

  it('hides zero-only scan metrics and never offers a zero-byte cleanup', async () => {
    jobs = [{
      ...job('empty-scan', 'cleanup.scan', 'succeeded'),
      result: {
        scanDigest: 'empty-digest',
        totalBytes: 0,
        items: [
          { id: 'job-artifacts',name: 'Job artifacts',sizeBytes: 0,entryCount: 0,selectedByDefault: true },
          { id: 'host-recycle',name: 'Host recycle bin',sizeBytes: 0,entryCount: 0,selectedByDefault: true },
        ],
      },
    }];
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);

    expect(container.querySelector('[data-xgc-role="cleanup-summary"]')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: /selected:/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clean' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clean 0 B' })).toBeNull();
    expect(screen.queryByText('Nothing cleanable')).toBeNull();
  });

  it('selects every non-empty group from the shared table header checkbox', async () => {
    jobs = [{
      ...job('mixed-scan', 'cleanup.scan', 'succeeded'),
      result: {
        scanDigest: 'mixed-digest',
        totalBytes: 3072,
        items: [
          { id: 'job-artifacts',name: 'Job artifacts',sizeBytes: 1024,entryCount: 1,selectedByDefault: true },
          { id: 'automation-logs',name: 'Automation logs',sizeBytes: 2048,entryCount: 8,selectedByDefault: false },
          { id: 'host-recycle',name: 'Host recycle bin',sizeBytes: 0,entryCount: 0,selectedByDefault: true },
        ],
      },
    }];
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);

    expect(await screen.findByRole('button', { name: 'Clean' })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Clean' })).toBeEnabled();
    expect(container.querySelector('[data-xgc-id="automation-logs"]')).toHaveAttribute('data-xgc-selected','true');
    expect(container.querySelector('[data-xgc-id="host-recycle"]')).toBeNull();
  });

  it('preserves manual selection for the same scan and resets it for a new digest', async () => {
    const items = [
      { id: 'cache-a',name: 'Cache A',sizeBytes: 1024,entryCount: 2 },
      { id: 'cache-b',name: 'Cache B',sizeBytes: 2048,entryCount: 3 },
    ];
    jobs = [{
      ...job('scan-job-1', 'cleanup.scan', 'succeeded'),
      result: { scanDigest: 'digest-1',totalBytes: 3072,items },
    }];
    const { container,rerender } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    await screen.findByText('2 selected');

    const cacheA = container.querySelector<HTMLElement>('[data-xgc-role="cleanup-entry"][data-xgc-id="cache-a"]');
    expect(cacheA).not.toBeNull();
    fireEvent.click(cacheA!);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    jobs = [{
      ...job('scan-job-1-refresh', 'cleanup.scan', 'succeeded'),
      result: { scanDigest: 'digest-1',totalBytes: 3072,items: [...items] },
    }];
    rerender(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    jobs = [{
      ...job('scan-job-2', 'cleanup.scan', 'succeeded'),
      result: { scanDigest: 'digest-2',totalBytes: 3072,items: [...items] },
    }];
    rerender(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    await waitFor(() => expect(screen.getByText('2 selected')).toBeInTheDocument());
  });

  it('resets cleanup selection when the target changes even if scan digests collide', async () => {
    jobs = [{
      ...job('scan-local', 'cleanup.scan', 'succeeded'),
      result: { scanDigest: 'shared-digest',totalBytes: 1024,items: [{ id: 'local-cache',name: 'Local',sizeBytes: 1024,entryCount: 1 }] },
    }];
    const { rerender } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    await screen.findByRole('button', { name: 'Clean' });

    jobs = [{
      ...job('scan-agent', 'cleanup.scan', 'succeeded'),
      targetId: 'agent-a',
      result: { scanDigest: 'shared-digest',totalBytes: 4096,items: [{ id: 'agent-cache',name: 'Agent',sizeBytes: 4096,entryCount: 2 }] },
    }];
    rerender(<ToolboxPage activeTab="cleanup" targetId="agent-a" language="en-US" />);

    expect(await screen.findByRole('button', { name: 'Clean' })).toBeEnabled();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('does not publish a completed action across a Core routing boundary', async () => {
    let resolveSubmit!: (value: ReturnType<typeof acceptedResponse>) => void;
    vi.mocked(submitCleanupAction).mockImplementationOnce(() => new Promise((resolve) => { resolveSubmit = resolve; }));
    const { rerender } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled();

    rerender(<ToolboxPage activeTab="cleanup" targetId="local" targetCoreId="remote-core" language="en-US" />);
    await act(async () => resolveSubmit(acceptedResponse('scan-old-target', 'cleanup.scan')));

    expect(screen.queryByRole('status')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled());
  });

  it('does not submit an apply confirmed after its target session changed', async () => {
    jobs = [{
      ...job('scan-local', 'cleanup.scan', 'succeeded'),
      result: { scanDigest: 'digest-local',totalBytes: 1024,items: [{ id: 'cache',name: 'Cache',sizeBytes: 1024,entryCount: 1 }] },
    }];
    const { rerender } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clean' }));
    const confirmation = within(screen.getByRole('alertdialog'));

    rerender(<ToolboxPage activeTab="cleanup" targetId="local" targetCoreId="remote-core" language="en-US" />);
    fireEvent.click(confirmation.getByRole('button', { name: 'Clean' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(submitCleanupAction).not.toHaveBeenCalled();
  });

  it('remote agent scan uses submitRemoteCleanupAction (not local typed jobs)', async () => {
    vi.mocked(submitRemoteCleanupAction).mockResolvedValue({
      mode: 'remote',
      action: 'scan',
      scan: {
        scanDigest: 'sha256:agent-scan',
        collectedAt: '2026-08-08T00:00:00Z',
        totalBytes: 2048,
        entries: [{ id: 'agent-cache',name: 'Agent cache',sizeBytes: 2048,entryCount: 2 }],
      },
    });
    render(
      <ToolboxPage
        activeTab="cleanup"
        targetId="thor-b2"
        managedHostId="thor-b2"
        language="en-US"
        maintenanceEnabled
        requestsAllowed
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(submitRemoteCleanupAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scan',
        requestId: 'request-1',
        idempotencyKey: 'request-1',
      }),
      expect.objectContaining({ managedHostId: 'thor-b2' }),
    ));
    expect(submitCleanupAction).not.toHaveBeenCalled();
    expect(await screen.findByText('Agent cache')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clean' })).toBeEnabled();
  });

  it('keeps a short cleanup table in a body-scroll viewport instead of shrinking to its rows', async () => {
    const scanDigest = 'digest-1';
    jobs = [{
      ...job('scan-job', 'cleanup.scan', 'succeeded'),
      result: {
        scanDigest,
        totalBytes: 1024,
        items: [{ id: 'job-artifacts',name: 'Job artifacts',sizeBytes: 1024,entryCount: 30,selectedByDefault: true }],
      },
    }];
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(await screen.findByText('Job artifacts')).toBeInTheDocument();
    const table = container.querySelector('[data-xgc-role="cleanup-entry-table"]');
    const surface = container.querySelector('[data-xgc-role="cleanup-scan-result"]');
    const viewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(table).toHaveAttribute('data-body-scroll', 'true');
    expect(surface).toHaveClass('toolbox-table-region');
    expect(surface).toHaveAttribute('data-xgc-surface', 'page');
    expect(surface).toHaveAttribute('data-xgc-id', scanDigest);
    expect(viewport).toHaveAttribute('aria-label', 'Table rows');
    expect(viewport).toHaveAttribute('data-xgc-id', 'cleanup-entry-table');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toContainElement(screen.getByRole('cell', { name: 'Job artifacts' }));
    expect(viewport).not.toContainElement(nameHeader);
    expect(container.querySelectorAll('[data-xgc-role="cleanup-entry"]')).toHaveLength(1);
    expect(container.querySelector('.xgc-pagination')).toBeNull();
    expect(container.querySelector('.toolbox-scroll-region')).toBeNull();
    expect(container.querySelector('.toolbox-notice')).toBeNull();
  });

  it('does not render a toolbox notice when the maintenance catalog times out', async () => {
    vi.mocked(listMaintenanceDefinitions).mockRejectedValue(
      new Error('request timeout after 8000ms: /toolbox/maintenance'),
    );
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    await waitFor(() => expect(listMaintenanceDefinitions).not.toHaveBeenCalled());
    expect(container.querySelector('.toolbox-notice')).toBeNull();
    expect(container.querySelector('.xgc-notice')).toBeNull();
    expect(screen.queryByText(/request timeout after 8000ms/i)).not.toBeInTheDocument();
  });

  it('reports a failed scan on the Scan button instead of a page notice', async () => {
    vi.mocked(submitCleanupAction).mockRejectedValue(
      new Error('request timeout after 8000ms: /toolbox/maintenance/cleanup/actions'),
    );
    const { container } = render(<ToolboxPage activeTab="cleanup" targetId="local" language="en-US" />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => expect(container.querySelector('[data-xgc-role="cleanup-scan"]')).toHaveAttribute('data-xgc-failed', 'true'));
    expect(container.querySelector('.toolbox-notice')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveAttribute('title', 'request timeout after 8000ms: /toolbox/maintenance/cleanup/actions');
  });
});

function definition(kind: string) {
  return { kind,parameterSchema: {},timeout: 60_000_000_000,retry: {},recovery: 'reconcile',compensateOnFailure: false };
}

function job(id: string, kind: string, status: ExecutionJob['status']): ExecutionJob {
  return {
    id,targetId: 'local',kind,status,revision: 1,parameters: {},currentAttempt: 0,maxAttempts: 1,recovery: 'interrupt',
    createdAt: '2026-07-12T00:00:00Z',queuedAt: '2026-07-12T00:00:00Z',updatedAt: '2026-07-12T00:00:00Z',
  };
}

function acceptedResponse(id: string, kind: string) {
  return { job: job(id, kind, 'queued'),receipt: {} as never };
}
