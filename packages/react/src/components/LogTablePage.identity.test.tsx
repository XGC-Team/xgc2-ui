// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogTablePage } from './LogTablePage';

describe('log table busy states and identities', () => {
  it('keeps the toolbar and header mounted while loading without claiming an empty result', () => {
    const props = {
      dataXgcId: 'audit:operation',
      columns: [{ id: 'message', title: 'Message', render: (row: { id: string; message: string }) => row.message }],
      emptyText: 'No logs', getRowId: (row: { id: string }) => row.id,
      onPage: vi.fn(), onPageSize: vi.fn(), onRefresh: vi.fn(), page: 1, pageSize: 20, total: 0,
      search: { onChange: vi.fn(), value: '' },
      status: { onChange: vi.fn(), value: 'all', options: [{ label: 'All', value: 'all' }, { label: 'Errors', value: 'error' }] },
    };
    const { container, rerender } = render(<LogTablePage {...props} rows={[]} loading />);
    const refresh = container.querySelector('[data-xgc-role="log-table-refresh"][data-xgc-id="audit:operation"]');
    const header = screen.getByRole('columnheader', { name: 'Message' });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveTextContent('Refresh');
    expect(refresh).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Loading')).toBeNull();
    expect(screen.queryByText('No logs')).toBeNull();
    expect(container.querySelector('[data-xgc-role="log-table-scroll"][data-xgc-id="audit:operation"]')).toHaveAttribute('aria-busy', 'true');
    rerender(<LogTablePage {...props} rows={[]} />);
    expect(screen.getByText('No logs')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Message' })).toBe(header);
    expect(container.querySelector('[data-xgc-role="log-table-refresh"]')).toBe(refresh);
    fireEvent.click(refresh!);
    expect(props.onRefresh).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fault' } });
    expect(props.search.onChange).toHaveBeenCalledWith('fault');
    fireEvent.click(container.querySelector('[data-xgc-role="log-table-status-trigger"][data-xgc-id="audit:operation"]')!);
    fireEvent.click(screen.getByRole('option', { name: 'Errors' }));
    expect(props.status.onChange).toHaveBeenCalledWith('error');
    rerender(<LogTablePage {...props} rows={[{ id: 'log-1', message: 'Kept entry' }]} loading />);
    expect(screen.getByRole('cell', { name: 'Kept entry' })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="log-table-cell"][data-xgc-id="audit:operation:log-1:message"]')).toHaveTextContent('Kept entry');
    rerender(<LogTablePage {...props} rows={[]} message="Unable to read logs" />);
    expect(screen.getByText('Unable to read logs')).toBeInTheDocument();
    expect(screen.queryByText('No logs')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Message' })).toBe(header);
  });
});
