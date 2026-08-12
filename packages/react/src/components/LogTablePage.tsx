import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState, Notice } from './Feedback';
import { Input } from './Input';
import { Pagination, type PaginationLabels, Toolbar } from './DataDisplay';
import { SectionHeader } from './Layout';
import { Select } from './FormControls';
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
    options: readonly { label: ReactNode; value: string }[];
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
    <section className="xgc-log-table-page">
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

      <Toolbar className="xgc-log-table-toolbar">
        <div className="xgc-log-table-toolbar-start">
          {status ? (
            <label className="xgc-log-table-filter">
              <span>{copy.status}</span>
              <Select
                aria-label={copy.status}
                onValueChange={status.onChange}
                uiSize="compact"
                value={status.value}
              >
                {status.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>
        <div className="xgc-log-table-toolbar-end">
          <Input
            aria-label={copy.search}
            className="xgc-log-table-search"
            data-xgc-role={roles?.search}
            onValueChange={search.onChange}
            placeholder={search.placeholder}
            type="search"
            uiSize="compact"
            value={search.value}
          />
          <Button disabled={loading} onClick={onRefresh} uiSize="compact">
            {refreshIcon ? <span aria-hidden="true">{refreshIcon}</span> : null}
            {copy.refresh}
          </Button>
        </div>
      </Toolbar>

      {message ? <Notice data-xgc-role={roles?.message} density="compact" tone="danger">{message}</Notice> : null}

      <div className="xgc-log-table-shell" data-xgc-role="log-table-scroll">
        <div className="xgc-log-table" role="table" style={tableStyle}>
          <div className="xgc-log-table-head" role="row">
            {safeColumns.map((column) => <span key={column.id} role="columnheader">{column.title}</span>)}
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
        {!safeRows.length ? (
          <EmptyState
            appearance="plain"
            className="xgc-log-table-empty"
            density="compact"
            title={loading ? copy.loading : emptyText}
          />
        ) : null}
      </div>

      <Pagination
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
