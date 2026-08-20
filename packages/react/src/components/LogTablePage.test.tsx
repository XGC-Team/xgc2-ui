// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogTablePage, type LogTableColumn } from './LogTablePage';

type Row = { id: string; message: string };
const columns: LogTableColumn<Row>[] = [
  { id: 'message', render: (row) => row.message, title: 'Message', width: 'wide' },
];

function renderPage(rows: Row[] = []) {
  const onSearch = vi.fn();
  const onRefresh = vi.fn();
  const result = render(
    <LogTablePage
      columns={columns}
      emptyText="No logs"
      getRowId={(row) => row.id}
      onPage={vi.fn()}
      onPageSize={vi.fn()}
      onRefresh={onRefresh}
      page={1}
      pageSize={20}
      rows={rows}
      search={{ onChange: onSearch, placeholder: 'Filter logs', value: '' }}
      title="Audit logs"
      total={rows.length}
      roles={{ search: 'audit-search' }}
    />,
  );
  return { ...result, onRefresh, onSearch };
}

describe('LogTablePage', () => {
  it('keeps dense rows in a dedicated scroll region with a sticky table header', () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ id: String(index), message: `row ${index}` }));
    const { container } = renderPage(rows);
    const shell = container.querySelector('[data-xgc-role="log-table-scroll"]');
    expect(shell).toHaveClass('xgc-log-table-shell');
    expect(shell?.querySelectorAll('.xgc-log-table-row')).toHaveLength(80);
    expect(screen.getByRole('columnheader', { name: 'Message' })).toBeInTheDocument();
  });

  it('owns empty, search, refresh, and pagination controls', () => {
    const { container, onRefresh, onSearch } = renderPage();
    expect(screen.getByText('No logs')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search logs' }), { target: { value: 'error' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onSearch).toHaveBeenCalledWith('error');
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('searchbox')).toHaveAttribute('data-xgc-role', 'audit-search');
    expect(screen.getByLabelText('Rows per page')).toBeInTheDocument();
    expect(container.querySelector('.xgc-pagination')).not.toBeNull();
    expect(container.querySelector('.xgc-log-table-head')).not.toBeNull();
  });

  it('keeps the page header to one title and puts tabs in the action area', () => {
    render(
      <LogTablePage
        activeTab="audit"
        columns={columns}
        getRowId={(row) => row.id}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
        onRefresh={vi.fn()}
        onTabChange={vi.fn()}
        page={1}
        pageSize={20}
        rows={[]}
        search={{ onChange: vi.fn(), value: '' }}
        tabs={[{ label: 'Audit', value: 'audit' }, { label: 'Tasks', value: 'tasks' }]}
        title="Operations"
        total={0}
      />,
    );
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('tablist', { name: 'Operations' })).toBeInTheDocument();
  });
});
