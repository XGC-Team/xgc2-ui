// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { LogTablePage,type LogTableColumn } from './LogTablePage';

type Row = { id: string; message: string };

const columns: Array<LogTableColumn<Row>> = [
  { id: 'message', title: 'Message', render: (row) => row.message },
];

describe('LogTablePage', () => {
  it('renders empty state when rows are missing', () => {
    render(
      <LogTablePage<Row>
        title="Logs"
        search={{ value: '', placeholder: 'Search', onChange: vi.fn() }}
        onRefresh={vi.fn()}
        columns={columns}
        rows={undefined as unknown as Row[]}
        getRowId={(row) => row.id}
        page={1}
        pageSize={20}
        total={0}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
        emptyText="No logs"
      />,
    );

    expect(screen.getByText('No logs')).toBeInTheDocument();
  });

  it('keeps log rows inside the component scroll shell', () => {
    const { container } = render(
      <LogTablePage<Row>
        title="Logs"
        search={{ value: '', placeholder: 'Search', onChange: vi.fn() }}
        onRefresh={vi.fn()}
        columns={columns}
        rows={Array.from({ length: 80 }, (_, index) => ({ id: String(index), message: `row ${index}` }))}
        getRowId={(row) => row.id}
        page={1}
        pageSize={100}
        total={80}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    );

    const shell = container.querySelector('[data-xgc-role="log-table-scroll"]');
    expect(shell).toHaveClass('xgc-log-table-shell');
    expect(shell?.querySelectorAll('.xgc-log-table-row')).toHaveLength(80);
  });

  it('exposes a complete accessible table hierarchy', () => {
    render(
      <LogTablePage<Row>
        title="Logs"
        search={{ value: '', placeholder: 'Search', onChange: vi.fn() }}
        onRefresh={vi.fn()}
        columns={columns}
        rows={[{ id: 'log-1', message: 'ready' }]}
        getRowId={(row) => row.id}
        page={1}
        pageSize={20}
        total={1}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    );

    const table = screen.getByRole('table');
    expect(table).toContainElement(screen.getByRole('columnheader', { name: 'Message' }));
    expect(table).toContainElement(screen.getByRole('cell', { name: 'ready' }));
  });

  it('uses bounded cells and shrinkable grid columns for long log content', () => {
    const boundedColumns: Array<LogTableColumn<Row>> = [
      { id: 'resource', title: 'Resource', width: 'narrow', render: (row) => row.id },
      { id: 'message', title: 'Message', width: 'wide', render: (row) => row.message },
    ];
    const { container } = render(
      <LogTablePage<Row>
        title="Logs"
        search={{ value: '', placeholder: 'Search', onChange: vi.fn() }}
        onRefresh={vi.fn()}
        columns={boundedColumns}
        rows={[{ id: 'log-1', message: 'x'.repeat(240) }]}
        getRowId={(row) => row.id}
        page={1}
        pageSize={20}
        total={1}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
      />,
    );

    const table = container.querySelector('.xgc-log-table') as HTMLElement;
    expect(table.style.getPropertyValue('--xgc-log-table-columns')).toBe('minmax(0, 0.5fr) minmax(0, 1.4fr)');
    expect(container.querySelectorAll('.xgc-log-table-cell')).toHaveLength(2);
    expect(container.querySelector('.xgc-log-table-cell')).toHaveAttribute('data-xgc-width', 'narrow');
  });

  it('accepts localized table control labels', () => {
    const { container } = render(
      <LogTablePage<Row>
        title="日志"
        search={{ value: '', placeholder: '搜索', onChange: vi.fn() }}
        status={{
          value: 'all',
          onChange: vi.fn(),
          options: [{ value: 'all', label: '全部状态' }],
        }}
        onRefresh={vi.fn()}
        loading
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        page={1}
        pageSize={20}
        total={0}
        onPage={vi.fn()}
        onPageSize={vi.fn()}
        labels={{
          status: '状态',
          refresh: '刷新',
          total: '总计',
          pageSizeSuffix: '条/页',
          loading: '加载中',
          search: '搜索日志',
        }}
      />,
    );

    expect(screen.getByText('状态')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument();
    expect(screen.getByLabelText('搜索日志')).toBeInTheDocument();
    expect(screen.queryByText('加载中')).toBeNull();
    expect(container.querySelector('.xgc-log-table-page')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /刷新/ })).toBeDisabled();
    expect(screen.getByText('总计 0')).toBeInTheDocument();
    expect(container.querySelector('.xgc-log-table-toolbar')).toHaveClass('xgc-toolbar');
    expect(screen.getByLabelText('搜索日志').closest('.xgc-input')).toHaveClass('xgc-log-table-search');
    expect(screen.getByLabelText('搜索日志').closest('.xgc-input')).toHaveAttribute('data-size', 'compact');
    expect(screen.getByRole('button', { name: /刷新/ })).toHaveAttribute('data-size', 'compact');
    expect(screen.getByRole('combobox', { name: 'Rows per page' }).closest('.xgc-select')).toHaveAttribute('data-size', 'compact');
    expect(screen.getByRole('option', { name: '20 条/页' })).toBeInTheDocument();
  });
});
