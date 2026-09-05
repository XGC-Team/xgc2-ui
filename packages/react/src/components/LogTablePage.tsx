import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState, Notice } from './Feedback';
import { Input } from './Input';
import { Pagination, type PaginationLabels, Toolbar } from './DataDisplay';
import { SectionHeader } from './Layout';
import { SelectMenu } from './SelectMenu';
import { Tabs, type TabOption } from './Tabs';

export type LogTableColumn<Row> = {
  id: string;
  render: (row: Row) => ReactNode;
  title: ReactNode;
  width?: 'default' | 'wide' | 'narrow';
};

export type LogTablePageLabels = {
  loading: string;
  refresh: string;
  search: string;
  status: string;
};

export type LogTablePageProps<Row> = {
  activeTab?: string;
  columns: readonly LogTableColumn<Row>[];
  /** Stable page/table entity for control, column and viewport identities. */
  dataXgcId?: string;
  emptyText?: ReactNode;
  getRowId: (row: Row) => string;
  getRowProps?: (row: Row) => HTMLAttributes<HTMLDivElement>;
  labels?: Partial<LogTablePageLabels>;
  loading?: boolean;
  message?: ReactNode;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  onRefresh: () => void;
  onTabChange?: (tab: string) => void;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  paginationLabels?: Partial<PaginationLabels>;
  refreshIcon?: ReactNode;
  roles?: {
    message?: string;
    search?: string;
    tabs?: string;
  };
  rowRole?: string;
  rows: readonly Row[];
  search: {
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  };
  status?: {
    onChange: (value: string) => void;
    options: readonly { label: string; value: string }[];
    value: string;
  };
  tabs?: readonly TabOption[];
  title?: ReactNode;
  total: number;
};

const defaultLabels: LogTablePageLabels = {
  loading: 'Loading',
  refresh: 'Refresh',
  search: 'Search logs',
  status: 'Status',
};

export function LogTablePage<Row>({
  activeTab,
  columns,
  dataXgcId,
  emptyText = 'No records',
  getRowId,
  getRowProps,
  labels,
  loading = false,
  message,
  onPage,
  onPageSize,
  onRefresh,
  onTabChange,
  page,
  pageSize,
  pageSizeOptions,
  paginationLabels,
  refreshIcon,
  roles,
  rowRole,
  rows,
  search,
  status,
  tabs,
  title,
  total,
}: LogTablePageProps<Row>) {
  const copy = { ...defaultLabels, ...labels };
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const tableStyle = {
    '--xgc-log-table-columns': safeColumns.map((column) => (
      column.width === 'wide'
        ? 'minmax(0, 1.4fr)'
        : column.width === 'narrow'
          ? 'minmax(0, 0.5fr)'
          : 'minmax(0, 0.8fr)'
    )).join(' '),
  } as CSSProperties;
  const tabValue = activeTab ?? tabs?.[0]?.value ?? '';

  return (
    <section aria-busy={loading || undefined} className="xgc-log-table-page" data-xgc-role="log-table-page" data-xgc-id={dataXgcId}>
      {title || tabs?.length ? (
        <SectionHeader
          actions={tabs?.length ? (
            <div data-xgc-role={roles?.tabs}>
              <Tabs
                ariaLabel={typeof title === 'string' ? title : 'Log categories'}
                onValueChange={(value) => onTabChange?.(value)}
                options={[...tabs]}
                size="compact"
                value={tabValue}
              />
            </div>
          ) : undefined}
          headingLevel={1}
          title={title}
        />
      ) : null}

      <Toolbar className="xgc-log-table-toolbar" data-xgc-role="log-table-toolbar" data-xgc-id={dataXgcId}>
        <div className="xgc-log-table-toolbar-start">
          {status ? (
            <label className="xgc-log-table-filter">
              <span data-xgc-role="log-table-status-label" data-xgc-id={dataXgcId}>{copy.status}</span>
              <SelectMenu
                ariaLabel={copy.status}
                dataXgcRole="log-table-status"
                dataXgcId={dataXgcId}
                onValueChange={status.onChange}
                options={status.options}
                uiSize="compact"
                value={status.value}
              />
            </label>
          ) : null}
        </div>
        <div className="xgc-log-table-toolbar-end">
          <Input
            aria-label={copy.search}
            className="xgc-log-table-search"
            containerProps={{ 'data-xgc-role': 'log-table-search-control', 'data-xgc-id': dataXgcId }}
            data-xgc-role={roles?.search ?? 'log-table-search'}
            data-xgc-id={dataXgcId}
            onValueChange={search.onChange}
            placeholder={search.placeholder}
            type="search"
            uiSize="compact"
            value={search.value}
          />
          <Button aria-busy={loading || undefined} data-xgc-role="log-table-refresh" data-xgc-id={dataXgcId} disabled={loading} onClick={onRefresh} uiSize="compact">
            {refreshIcon ? <span aria-hidden="true">{refreshIcon}</span> : null}
            {copy.refresh}
          </Button>
        </div>
      </Toolbar>

      {message ? <Notice data-xgc-role={roles?.message ?? 'log-table-message'} data-xgc-id={dataXgcId} density="compact" tone="danger">{message}</Notice> : null}

      <div aria-busy={loading || undefined} className="xgc-log-table-shell" data-xgc-role="log-table-scroll" data-xgc-id={dataXgcId}>
        <div className="xgc-log-table" data-xgc-role="log-table" data-xgc-id={dataXgcId} role="table" style={tableStyle}>
          <div className="xgc-log-table-head" role="row">
            {safeColumns.map((column) => <span data-xgc-role="log-table-column" data-xgc-id={dataXgcId ? `${dataXgcId}:${column.id}` : undefined} key={column.id} role="columnheader">{column.title}</span>)}
          </div>
          {safeRows.map((row) => {
            const rowProps = getRowProps?.(row);
            const id = getRowId(row);
            return (
              <div
                {...rowProps}
                className={`xgc-log-table-row${rowProps?.className ? ` ${rowProps.className}` : ''}`}
                data-xgc-id={id}
                data-xgc-role={rowRole}
                key={id}
                role="row"
              >
                {safeColumns.map((column) => (
                  <div
                    className="xgc-log-table-cell"
                    data-xgc-role="log-table-cell"
                    data-xgc-id={dataXgcId ? `${dataXgcId}:${id}:${column.id}` : undefined}
                    data-width={column.width ?? 'default'}
                    data-xgc-width={column.width ?? 'default'}
                    key={column.id}
                    role="cell"
                  >
                    {column.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {!safeRows.length && !loading && !message ? (
          <EmptyState
            appearance="plain"
            className="xgc-log-table-empty"
            density="compact"
            title={emptyText}
          />
        ) : null}
      </div>

      <Pagination
        data-xgc-role="log-table-pagination"
        data-xgc-id={dataXgcId}
        labels={paginationLabels}
        onPageChange={onPage}
        onPageSizeChange={onPageSize}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        total={total}
      />
    </section>
  );
}
