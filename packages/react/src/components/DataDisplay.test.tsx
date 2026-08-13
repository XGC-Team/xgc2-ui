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

  it('renders statistic and toolbar content', () => {
    const onSelect = vi.fn();
    render(<><StatCard label="Packages" value="42" detail="focal" /><StatCardButton label="Failures" value="2" onClick={onSelect} /><Toolbar>Filters</Toolbar></>);
    expect(screen.getByText('42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Failures2/i }));
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
