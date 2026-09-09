// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AuditPage } from './AuditPage';
import { listAuditLogPage } from './auditService';

vi.mock('./auditService', () => ({
  listAuditLogPage: vi.fn(),
}));

describe('AuditPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(listAuditLogPage).mockReset();
  });

  it('localizes audit table controls and columns', async () => {
    vi.mocked(listAuditLogPage).mockResolvedValue({
      rows: [
        {
          id: 'log-1',
          domain: 'panel',
          category: 'operation',
          level: 'info',
          action: 'update',
          target: 'experiment',
          actor: 'station-main',
          ip: '127.0.0.1',
          method: 'POST',
          status: 200,
          durationMs: 12,
          metadata: '{}',
          message: 'Update experiment',
          path: '',
          createdAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      total: 1,
    });

    const { container } = render(<AuditPage activeTab="operation" language="zh-CN" />);

    // Sidebar already labels the tab; the page body no longer repeats a large heading.
    expect(screen.queryByRole('heading', { name: '操作日志' })).toBeNull();
    expect(await screen.findByText('全部状态')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument();
    expect(screen.getByLabelText('搜索审计日志')).toBeInTheDocument();
    expect(screen.getByText('资源')).toBeInTheDocument();
    expect(screen.getByText('操作')).toBeInTheDocument();
    expect(screen.getByText('目标')).toBeInTheDocument();
    expect(screen.getByText('操作员')).toBeInTheDocument();
    expect(screen.getAllByText('成功').length).toBeGreaterThan(0);
    expect(screen.getByText('总计 1')).toBeInTheDocument();
    const row = container.querySelector('[data-xgc-role="audit-log-row"]');
    expect(row?.querySelector('strong')).toBeNull();
    expect(row?.querySelector('.xgc-status-text')).toBeNull();
    expect(row?.querySelector('.xgc-status-badge')).toBeNull();
    expect(row).toHaveTextContent('成功');
    expect(container.querySelector('[data-xgc-role="log-table-refresh"][data-xgc-id="audit:operation"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="log-table-status-trigger"][data-xgc-id="audit:operation"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="audit-search"][data-xgc-id="audit:operation"]')).toBe(screen.getByRole('searchbox'));
    expect(container.querySelector('[data-xgc-role="log-table-scroll"][data-xgc-id="audit:operation"]')).toBeInTheDocument();
    expect(screen.getByText('Update experiment')).toHaveAttribute('title', 'Update experiment');
    expect(container.querySelector('.xgc-pagination')).not.toBeNull();
    expect(container.querySelector('.xgc-log-table-head')).not.toBeNull();
    await waitFor(() => expect(listAuditLogPage).toHaveBeenCalledWith(expect.objectContaining({ category: 'operation' })));
  });

  it.each(['resolve', 'reject'] as const)('ignores a stale tab request that later %ss', async (settlement) => {
    const stale = deferred<Awaited<ReturnType<typeof listAuditLogPage>>>();
    const current = deferred<Awaited<ReturnType<typeof listAuditLogPage>>>();
    vi.mocked(listAuditLogPage).mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    const { rerender } = render(<AuditPage activeTab="operation" language="en-US" />);
    rerender(<AuditPage activeTab="system" language="en-US" />);

    await act(async () => {
      if (settlement === 'resolve') stale.resolve({ rows: [], total: 99 });
      else stale.reject(new Error('Stale operation failure'));
      await stale.promise.catch(() => undefined);
    });
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Stale operation failure')).toBeNull();
    expect(screen.queryByText('Total 99')).toBeNull();

    await act(async () => { current.resolve({ rows: [], total: 0 }); });
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByText('Total 0')).toBeInTheDocument();
  });

  it('keeps a later filter result when the older response finishes last', async () => {
    const stale = deferred<Awaited<ReturnType<typeof listAuditLogPage>>>();
    const current = deferred<Awaited<ReturnType<typeof listAuditLogPage>>>();
    vi.mocked(listAuditLogPage).mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
    render(<AuditPage activeTab="operation" language="en-US" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'current' } });
    await act(async () => { current.resolve({ rows: [], total: 7 }); });
    expect(screen.getByText('Total 7')).toBeInTheDocument();
    await act(async () => { stale.resolve({ rows: [], total: 99 }); });
    expect(screen.getByText('Total 7')).toBeInTheDocument();
    expect(screen.queryByText('Total 99')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
