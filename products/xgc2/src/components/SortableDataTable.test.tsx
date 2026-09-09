// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SortableDataTable } from './SortableDataTable';

describe('SortableDataTable markable viewport', () => {
  it('stamps the table entity id onto the row viewport', () => {
    const { container } = render(
      <SortableDataTable
        bodyScroll
        bodyScrollLabel="Table rows"
        className="xgc-host-file-list"
        columns={[{ id: 'name', header: 'Name', cell: (row: { name: string }) => row.name }]}
        data-xgc-id="host-files"
        data-xgc-role="host-file-table"
        getRowProps={(row) => ({ 'data-xgc-role': 'host-file-row', 'data-xgc-id': row.name })}
        rowKey={(row) => row.name}
        rows={[{ name: 'a.txt' }]}
      />,
    );
    const viewport = container.querySelector('[data-xgc-role="data-table-row-viewport"]');
    expect(viewport).toHaveAttribute('aria-label', 'Table rows');
    expect(viewport).toHaveAttribute('data-xgc-id', 'host-files');
    expect(screen.getByRole('cell', { name: 'a.txt' })).toBeInTheDocument();
  });

  it('keeps distinct viewport ids when two body-scroll tables share the document', () => {
    const { container } = render(
      <>
        <SortableDataTable
          bodyScroll
          columns={[{ id: 'name', header: 'Name', cell: (row: { name: string }) => row.name }]}
          data-xgc-id="host-files"
          rowKey={(row) => row.name}
          rows={[{ name: 'a.txt' }]}
        />
        <SortableDataTable
          bodyScroll
          columns={[{ id: 'pid', header: 'PID', cell: (row: { pid: string }) => row.pid }]}
          data-xgc-id="host-process-table"
          rowKey={(row) => row.pid}
          rows={[{ pid: '1' }]}
        />
      </>,
    );
    const viewports = container.querySelectorAll('[data-xgc-role="data-table-row-viewport"]');
    expect(viewports).toHaveLength(2);
    expect(viewports[0]).toHaveAttribute('data-xgc-id', 'host-files');
    expect(viewports[1]).toHaveAttribute('data-xgc-id', 'host-process-table');
    expect(container.querySelectorAll('[data-xgc-role="data-table-row-viewport"][data-xgc-id="host-files"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-xgc-role="data-table-row-viewport"][data-xgc-id="host-process-table"]')).toHaveLength(1);
  });
});
