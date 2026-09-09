// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { HostProcess } from '../hostModel';
import { HostProcessesSystemLeaf } from './processes';

const hostApi = vi.hoisted(() => ({
  getHostProcesses: vi.fn(),
  killHostProcess: vi.fn(),
}));

vi.mock('../hostProcessActions',() => hostApi);

describe('HostProcessesSystemLeaf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hostApi.getHostProcesses.mockResolvedValue([
      processFixture({ pid: 10,name: 'low-cpu',cpuPercent: 1,memory: 100 }),
      processFixture({ pid: 20,name: 'high-cpu',cpuPercent: 9,memory: 50 }),
      processFixture({ pid: 30,name: 'mid-cpu',cpuPercent: 4,memory: 200 }),
    ]);
    hostApi.killHostProcess.mockResolvedValue({ pid: 20 });
  });

  it('uses the remote process identity and refreshes after termination', async () => {
    hostApi.getHostProcesses.mockResolvedValue([processFixture({ pid: 42,name: 'remote-process' })]);
    render(
      <HostProcessesSystemLeaf
        executionTargetId="agent-a"
        managedHostId="agent-a"
        isRemote
        requestsAllowed
        actionsEnabled
      />,
    );

    expect((await screen.findAllByText('remote-process')).length).toBeGreaterThan(0);
    expect(hostApi.getHostProcesses).toHaveBeenCalledWith({ managedHostId: 'agent-a' });

    fireEvent.click(screen.getByRole('button',{ name: 'End' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button',{ name: 'End process' }));

    await waitFor(() => expect(hostApi.killHostProcess).toHaveBeenCalledWith(42,{
      managedHostId: 'agent-a',
      startTicks: 99,
      signal: 'term',
    }));
    await waitFor(() => expect(hostApi.getHostProcesses).toHaveBeenCalledTimes(2));
  });

  it('sorts by header click (default CPU desc, then Name asc)', async () => {
    const { container } = render(
      <HostProcessesSystemLeaf
        executionTargetId="agent-a"
        managedHostId="agent-a"
        isRemote
        requestsAllowed
        actionsEnabled
      />,
    );

    await waitFor(() => expect(hostApi.getHostProcesses).toHaveBeenCalled());
    await waitFor(() => {
      expect(container.querySelectorAll('[data-xgc-role="host-process-row"]')).toHaveLength(3);
    });
    const toolbar = container.querySelector('[data-xgc-role="host-runtime-toolbar"]');
    expect(container.querySelector('[data-xgc-role="host-runtime-section"]')).toHaveAttribute('data-xgc-id','processes');
    expect(toolbar).toHaveAttribute('data-xgc-id','processes');
    expect(toolbar?.firstElementChild).toHaveAttribute('data-xgc-role','host-runtime-search-group');
    const searchControl = container.querySelector('[data-xgc-role="host-runtime-search"][data-xgc-id="processes"]');
    expect(searchControl).toContainElement(screen.getByRole('searchbox', { name: 'Search PID, user, process' }));
    expect(searchControl).toHaveAttribute('data-size', 'compact');
    expect(toolbar?.lastElementChild).toHaveAttribute('data-xgc-role','host-runtime-actions');
    expect(container.querySelector('[data-xgc-role="host-runtime-refresh"]')).toHaveAttribute('data-xgc-size','compact');
    expect(container.querySelector('[data-xgc-role="host-runtime-refresh"]')).toHaveAttribute('data-xgc-id','processes');
    expect(container.querySelector('[data-xgc-role="host-process-end"][data-xgc-id="20"]')).not.toBeNull();
    const rows = () => [...container.querySelectorAll('[data-xgc-role="host-process-row"]')]
      .map((row) => row.getAttribute('data-xgc-id'));
    // Default sort: CPU descending → 20, 30, 10
    expect(rows()).toEqual(['20','30','10']);
    expect(container.querySelector('[data-xgc-role="host-process-row"] strong')).toBeNull();

    fireEvent.click(screen.getByRole('button',{ name: 'Sort by Name' }));
    expect(rows()).toEqual(['20','10','30']); // high, low, mid alphabetically
    expect(screen.getByRole('columnheader',{ name: 'Name' }))
      .toHaveAttribute('aria-sort','ascending');
  });

  it('focuses the exact Overview PID and sorts by the originating resource metric', async () => {
    const onClearRuntimeProcessFocus = vi.fn();
    const { container } = render(
      <HostProcessesSystemLeaf
        executionTargetId="agent-a"
        managedHostId="agent-a"
        isRemote
        requestsAllowed
        actionsEnabled
        runtimeProcessFocus={{ requestId: 7,pid: 30,name: 'mid-cpu',metric: 'memory' }}
        onClearRuntimeProcessFocus={onClearRuntimeProcessFocus}
      />,
    );

    await waitFor(() => expect(hostApi.getHostProcesses).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelectorAll('[data-xgc-role="host-process-row"]')).toHaveLength(1));
    expect(container.querySelector('[data-xgc-role="host-process-row"][data-xgc-id="30"]'))
      .toHaveAttribute('data-xgc-focused','true');
    expect(screen.getByRole('columnheader',{ name: 'Memory' }))
      .toHaveAttribute('aria-sort','descending');
    expect(screen.getByPlaceholderText('Search PID, user, process')).toHaveValue('30');

    fireEvent.click(screen.getByRole('button',{ name: 'PID 30' }));
    expect(onClearRuntimeProcessFocus).toHaveBeenCalledWith(7);
    await waitFor(() => expect(container.querySelectorAll('[data-xgc-role="host-process-row"]')).toHaveLength(3));
  });
});

function processFixture(partial: Partial<HostProcess> & { pid: number;name: string }): HostProcess {
  return {
    startTicks: 99,
    ppid: 1,
    threads: 2,
    user: 'operator',
    cpuPercent: 1,
    state: 'running',
    cpuTime: '1s',
    memory: 1024,
    connections: 1,
    startTime: '2026-07-23T00:00:00Z',
    command: partial.name,
    ...partial,
  };
}
