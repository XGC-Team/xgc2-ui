import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock, DataTable, Pagination, SortableDataTable, StatCard, StatCardButton, Toolbar } from './DataDisplay';

describe('data display primitives', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves native table semantics inside the shared container', () => {
    render(
      <DataTable>
        <table><tbody><tr><td>package-a</td></tr></tbody></table>
      </DataTable>,
    );
    expect(screen.getByRole('table')).toHaveTextContent('package-a');
  });

  it('shows a deliberate empty state without an empty table', () => {
    render(<DataTable empty emptyMessage="No packages"><table /></DataTable>);
    expect(screen.getByText('No packages')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('copies code content through the browser clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CodeBlock label="Install" content="sudo apt-get update" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('sudo apt-get update');
  });

  it('renders safe shared syntax tokens without changing copied content', () => {
    const { container } = render(
      <CodeBlock terminal label="Install" language="shell" content={'sudo apt-get install "$PACKAGE" # install'} />,
    );
    expect(container.querySelectorAll('.xgc-syntax-keyword')).toHaveLength(3);
    expect(container.querySelector('.xgc-syntax-string')).toHaveTextContent('"$PACKAGE"');
    expect(container.querySelector('.xgc-syntax-comment')).toHaveTextContent('# install');
    expect(screen.getByText(/sudo/).closest('code')).toHaveTextContent('sudo apt-get install "$PACKAGE" # install');
  });

  it('owns bounded code viewport density without product CSS reaching into the pre element', () => {
    const { container } = render(<CodeBlock viewport="compact" content="one\ntwo\nthree" />);
    expect(container.querySelector('.xgc-code-block')).toHaveAttribute('data-viewport', 'compact');
  });

  it('memoizes blocks so streaming parents do not re-highlight history', () => {
    expect((CodeBlock as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    const { rerender } = render(<CodeBlock label="Log" language="shell" content="systemctl restart xgc2" />);
    const highlighted = document.querySelector('code[data-language="shell"]')?.innerHTML;
    rerender(<CodeBlock label="Log" language="shell" content="systemctl restart xgc2" />);
    expect(document.querySelector('code[data-language="shell"]')?.innerHTML).toBe(highlighted);
    rerender(<CodeBlock label="Log" language="json" content='{"ok":true}' />);
    expect(document.querySelector('code[data-language="json"]')).not.toBeNull();
  });

  it('renders statistic and toolbar content', () => {
    const onSelect = vi.fn();
    render(<><StatCard label="Packages" value="42" detail="focal" /><StatCardButton label="Failures" value="2" onClick={onSelect} /><Toolbar>Filters</Toolbar></>);
    expect(screen.getByText('42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Failures 2' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('sorts rows and exposes the active direction to assistive technology', () => {
    render(
      <SortableDataTable
        columns={[{ id: 'version', header: 'Version', sortable: true, sortValue: (row) => row.version, cell: (row) => row.version }]}
        defaultSort={{ columnId: 'version', direction: 'ascending' }}
        rowKey={(row) => row.id}
        rows={[{ id: 'b', version: '1.10.0' }, { id: 'a', version: '1.2.0' }]}
      />,
    );
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('1.2.0');
    const header = screen.getByRole('columnheader', { name: /version/i });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Version' }));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('1.10.0');
  });

  it('keeps the header outside the bounded vertical row viewport', () => {
    const { container } = render(
      <SortableDataTable
        bodyScroll
        columns={[{ id: 'package', header: 'Package', cell: (row) => row.name }]}
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]}
      />,
    );
    const tableContainer = container.querySelector('.xgc-data-table');
    const rowViewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    const header = screen.getByRole('columnheader', { name: 'Package' });
    expect(tableContainer).toHaveAttribute('data-body-scroll', 'true');
    expect(rowViewport).toHaveAttribute('aria-label', 'Table rows');
    expect(rowViewport).toHaveAttribute('tabindex', '0');
    expect(rowViewport).toContainElement(screen.getByRole('cell', { name: 'alpha' }));
    expect(rowViewport).not.toContainElement(header);
    expect(container.querySelector('thead')).not.toHaveAttribute('style');
    expect(container.querySelector('.xgc-pagination')).toBeNull();
  });

  it('replaces the table with a message by default when rows are empty', () => {
    const { container } = render(
      <SortableDataTable<{ id: string; name: string }>
        bodyScroll
        columns={[{ id: 'package', header: 'Package', cell: (row) => row.name }]}
        emptyMessage="No packages"
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );
    expect(screen.getByText('No packages')).toBeInTheDocument();
    expect(container.querySelector('.xgc-data-table-empty')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="data-table-row-viewport"]')).toBeNull();
  });

  it('keeps the rendered table chrome when rows are empty in table mode', () => {
    const { container } = render(
      <SortableDataTable<{ id: string; name: string; size: number }>
        bodyScroll
        bodyScrollLabel="Cleanup entries"
        columns={[
          { id: 'name', header: 'Name', sortable: true, sortValue: (row) => row.name, cell: (row) => row.name },
          { id: 'size', header: 'Size', cell: (row) => row.size },
        ]}
        emptyMessage="Nothing cleanable"
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );
    const tableContainer = container.querySelector('.xgc-data-table');
    const rowViewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    // Table chrome survives: real table, column headers, focusable named viewport.
    expect(tableContainer).toHaveAttribute('data-body-scroll', 'true');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Size' })).toBeInTheDocument();
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    expect(rowViewport).toHaveAttribute('aria-label', 'Cleanup entries');
    expect(rowViewport).toHaveAttribute('tabindex', '0');
    expect(rowViewport?.children).toHaveLength(1); // only the empty-state message row
    expect(rowViewport).toContainElement(screen.getByText('Nothing cleanable'));
    expect(rowViewport).not.toContainElement(nameHeader);
    // No duplicate standalone empty block next to the table.
    expect(container.querySelector('.xgc-data-table-empty')).toBeNull();
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('never syncs column widths from the empty-state message row onto the headers', () => {
    const { container, rerender } = render(
      <SortableDataTable<{ id: string; name: string; size: number }>
        bodyScroll
        bodyScrollLabel="Cleanup entries"
        columns={[
          { id: 'name', header: 'Name', sortable: true, sortValue: (row) => row.name, cell: (row) => row.name },
          { id: 'size', header: 'Size', cell: (row) => row.size },
        ]}
        emptyMessage="Nothing cleanable"
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );
    // The colSpan message row exists but must not feed width sync: no header
    // carries an inline width and the message row itself is never observed-sized.
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    const sizeHeader = screen.getByRole('columnheader', { name: 'Size' });
    expect(nameHeader).not.toHaveAttribute('style');
    expect(sizeHeader).not.toHaveAttribute('style');
    expect(container.querySelector('.xgc-data-table-empty-row')).toBeInTheDocument();

    rerender(
      <SortableDataTable<{ id: string; name: string; size: number }>
        bodyScroll
        bodyScrollLabel="Cleanup entries"
        columns={[
          { id: 'name', header: 'Name', sortable: true, sortValue: (row) => row.name, cell: (row) => row.name },
          { id: 'size', header: 'Size', cell: (row) => row.size },
        ]}
        emptyMessage="Nothing cleanable"
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha', size: 1024 }]}
      />,
    );
    // Real data rows resume normal synchronization (widths measured from row cells).
    expect(screen.getByRole('cell', { name: 'alpha' })).toBeInTheDocument();
    expect(container.querySelector('.xgc-data-table-empty-row')).toBeNull();
  });

  it('renders an optional selection header in table mode with an empty viewport', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SortableDataTable<{ id: string; name: string }>
        columns={[{ id: 'name', header: 'Name', cell: (row) => row.name }]}
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[]}
        selection={{
          disabled: true,
          getRowLabel: (row) => `Select ${row.name}`,
          onChange,
          rowHeaderLabel: 'Select all entries',
          selectedRowKeys: new Set(),
        }}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: 'Select all entries' });
    expect(selectAll).toBeInTheDocument();
    expect(selectAll).toBeDisabled();
    expect(container.querySelector('th.xgc-data-table-selection')).toContainElement(selectAll);
    const rowViewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    // A focusable viewport always carries its accessible name (default label here).
    expect(rowViewport).toHaveAttribute('aria-label', 'Table rows');
    expect(rowViewport).toHaveAttribute('tabindex', '0');
    expect(rowViewport).toBeEmptyDOMElement();
    fireEvent.click(selectAll);
    expect(onChange).not.toHaveBeenCalled(); // disabled bulk control stays inert
  });

  it('omits the empty message row inside table mode when no message is given', () => {
    const { container } = render(
      <SortableDataTable<{ id: string; name: string }>
        columns={[{ id: 'name', header: 'Name', cell: (row) => row.name }]}
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );
    expect(container.querySelector('.xgc-data-table-empty-row')).toBeNull();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="data-table-row-viewport"]')).toBeEmptyDOMElement();
  });

  it('transitions between message and populated states without losing table chrome', () => {
    const { rerender } = render(
      <SortableDataTable<{ id: string; name: string }>
        bodyScroll
        columns={[{ id: 'name', header: 'Name', cell: (row) => row.name }]}
        emptyMessage="Nothing here"
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );
    expect(document.querySelector('.xgc-data-table-empty')).toBeNull();
    rerender(
      <SortableDataTable<{ id: string; name: string }>
        bodyScroll
        columns={[{ id: 'name', header: 'Name', cell: (row) => row.name }]}
        emptyMessage="Nothing here"
        emptyMode="table"
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha' }]}
      />,
    );
    const rowViewport = document.querySelector('[data-xgc-role="data-table-row-viewport"]');
    expect(screen.getByRole('cell', { name: 'alpha' })).toBeInTheDocument();
    expect(rowViewport).toHaveAttribute('aria-label', 'Table rows');
    expect(rowViewport).toHaveAttribute('tabindex', '0');
    expect(document.querySelector('.xgc-data-table-empty-row')).toBeNull();
  });

  it('forwards semantic cell metadata without requiring consumer-owned table markup', () => {
    const { container } = render(
      <SortableDataTable
        columns={[{
          id: 'name',
          header: 'Package',
          cell: (row) => row.name,
          cellProps: (row) => ({ className: 'package-cell', title: row.id }),
        }]}
        rowKey={(row) => row.id}
        rows={[{ id: 'alpha-id', name: 'alpha' }]}
      />,
    );
    const cell = screen.getByRole('cell', { name: 'alpha' });
    expect(cell).toHaveClass('package-cell');
    expect(cell).toHaveAttribute('title', 'alpha-id');
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('supports select-all, partial selection, and row selection as one shared behavior', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SortableDataTable
        columns={[{ id: 'name', header: 'Package', cell: (row) => row.name }]}
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]}
        selection={{ selectedRowKeys: new Set(), onChange }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(onChange).toHaveBeenCalledWith(new Set(['a', 'b']));

    rerender(
      <SortableDataTable
        columns={[{ id: 'name', header: 'Package', cell: (row) => row.name }]}
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]}
        selection={{ selectedRowKeys: new Set(['a']), onChange }}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveProperty('indeterminate', true);
    expect(screen.getByRole('row', { name: /alpha/i })).toHaveAttribute('data-selected', 'true');
  });

  it('disables bulk and row selection together and does not bubble checkbox clicks into rows', () => {
    const onChange = vi.fn();
    const onRowClick = vi.fn();
    const { rerender } = render(
      <SortableDataTable
        columns={[{ id: 'name', header: 'Package', cell: (row) => row.name }]}
        getRowProps={() => ({ onClick: onRowClick })}
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha' }]}
        selection={{ disabled: true, selectedRowKeys: new Set(), onChange }}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Select row a' })).toBeDisabled();

    rerender(
      <SortableDataTable
        columns={[{ id: 'name', header: 'Package', cell: (row) => row.name }]}
        getRowProps={() => ({ onClick: onRowClick })}
        rowKey={(row) => row.id}
        rows={[{ id: 'a', name: 'alpha' }]}
        selection={{ selectedRowKeys: new Set(), onChange }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row a' }));
    expect(onChange).toHaveBeenCalledWith(new Set(['a']));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('clamps pagination and delegates page and page-size changes', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        labels={{ pageSizeSuffix: '条/页', total: '总计' }}
        page={9}
        pageSize={20}
        total={43}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByLabelText('Page 3 / 3')).toHaveTextContent('3 / 3');
    expect(screen.getByRole('option', { name: '20 条/页' })).toBeInTheDocument();
    expect(screen.getByText('总计 43')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
