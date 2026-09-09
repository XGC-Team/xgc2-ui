import {
  LogTablePage as SharedLogTablePage,
  type LogTableColumn as SharedLogTableColumn,
  type LogTablePageProps as SharedLogTablePageProps,
} from '@xgc2/ui-react';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export type LogTableColumn<Row> = SharedLogTableColumn<Row>;

export type LogTablePageLabels = {
  loading: string;
  pageSizeSuffix: string;
  refresh: string;
  search: string;
  status: string;
  total: string;
};

export type LogTablePageProps<Row> = Omit<
  SharedLogTablePageProps<Row>,
  'labels' | 'paginationLabels' | 'refreshIcon' | 'tabs'
> & {
  labels?: Partial<LogTablePageLabels>;
  tabs?: Array<{ id: string; label: ReactNode }>;
};

const defaultLabels: LogTablePageLabels = {
  loading: 'Loading',
  pageSizeSuffix: '/ page',
  refresh: 'Refresh',
  search: 'Search logs',
  status: 'Status',
  total: 'Total',
};

/** Compatibility boundary while Audit and Task Logs move to the family component API. */
export function LogTablePage<Row>({ labels, rows, tabs, ...props }: LogTablePageProps<Row>) {
  const copy = { ...defaultLabels, ...labels };
  return (
    <SharedLogTablePage
      {...props}
      labels={{
        loading: copy.loading,
        refresh: copy.refresh,
        search: copy.search,
        status: copy.status,
      }}
      paginationLabels={{
        pageSizeSuffix: copy.pageSizeSuffix,
        total: copy.total,
      }}
      refreshIcon={<RefreshCw size={14} />}
      rows={Array.isArray(rows) ? rows : []}
      tabs={tabs?.map((tab) => ({ label: tab.label, value: tab.id }))}
    />
  );
}
