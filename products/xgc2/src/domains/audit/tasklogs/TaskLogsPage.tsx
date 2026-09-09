import { useEffect } from 'react';
import { usePersistentState } from '../../../hooks/usePersistentState';
import type { AppLanguage } from '../../../shared/localization/languagePreference';
import { LogTablePage, type LogTableColumn, type LogTablePageLabels } from '../../../components/LogTablePage';
import { StatusText } from '@xgc2/ui-react';
import { useTaskLogsResource, type TaskLogRow } from './useTaskLogsResource';
import { useDeferRouteReady } from '../../../shared/routeReady';
import '../audit.css';

export function TaskLogsPage({ language }: { language: AppLanguage }) {
  const [query, setQuery] = usePersistentState('xgc.table.audit.task.search', '', isString);
  const [status, setStatus] = usePersistentState('xgc.table.audit.task.status', 'all', isAuditStatus);
  const [page, setPage] = usePersistentState('xgc.table.audit.task.page', 1, isPositiveInteger);
  const [pageSize, setPageSize] = usePersistentState('xgc.table.audit.task.pageSize', 20, isAuditPageSize);
  const copy = taskLogsCopy[language];

  useEffect(() => {
    setPage(1);
  }, [query, setPage, status]);

  const { logs, total, loading, message, refresh } = useTaskLogsResource({
    q: query,
    status,
    page,
    pageSize,
  });

  useDeferRouteReady(loading && logs.length === 0);

  return (
    <div
      className="audit-page xgc-workspace-full-span"
      data-xgc-role="audit-page"
      data-xgc-tab="task"
      data-xgc-id="task"
    >
      <div className="audit-log-table-page">
      <LogTablePage<TaskLogRow>
        dataXgcId="audit:task"
        search={{ value: query, placeholder: copy.search, onChange: setQuery }}
        status={{ value: status, onChange: setStatus, options: copy.statusOptions }}
        onRefresh={() => void refresh()}
        loading={loading}
        message={message}
        columns={columns(copy)}
        rows={logs}
        getRowId={(log) => log.offset}
        rowRole="audit-task-log-row"
        roles={{
          tabs: 'audit-category-filter',
          search: 'audit-task-search',
          message: 'audit-task-message',
        }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyText={query.trim() || status !== 'all' ? copy.empty.filtered : copy.empty.task}
        labels={copy.table}
      />
      </div>
    </div>
  );
}

const auditStatusValues = new Set(['all', 'info', 'warning', 'error', 'debug']);

function isAuditStatus(value: unknown): value is string {
  return typeof value === 'string' && auditStatusValues.has(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isAuditPageSize(value: unknown): value is number {
  return [10, 20, 50, 100].includes(Number(value));
}

function columns(copy: TaskLogsCopy): Array<LogTableColumn<TaskLogRow>> {
  return [
    { id: 'job', title: copy.columns.job, width: 'wide', render: (log) => <span title={log.jobId}>{log.jobId}</span> },
    { id: 'event', title: copy.columns.event, width: 'wide', render: (log) => <span title={log.eventType}>{log.eventType}</span> },
    { id: 'command', title: copy.columns.command, render: (log) => <span title={log.commandId || '-'}>{log.commandId || '-'}</span> },
    { id: 'status', title: copy.columns.status, width: 'narrow', render: (log) => <TaskStatus log={log} copy={copy} /> },
    { id: 'date', title: copy.columns.date, render: (log) => <span className="audit-timestamp" title={formatTime(log.createdAt)}>{formatTime(log.createdAt)}</span> },
  ];
}

function TaskStatus({ log, copy }: { log: TaskLogRow; copy: TaskLogsCopy }) {
  const level = log.level === 'error' || log.level === 'warning' || log.level === 'debug' ? log.level : 'info';
  const label = level === 'error'
    ? copy.status.error
    : level === 'warning'
      ? copy.status.warning
      : level === 'debug'
        ? copy.status.debug
        : copy.status.info;
  const status = level === 'error' ? 'failed' : level === 'warning' ? 'warning' : 'info';
  return <StatusText status={status} data-xgc-level={level}>{label}</StatusText>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

type TaskLogsCopy = {
  search: string;
  statusOptions: Array<{ value: string; label: string }>;
  status: { info: string; warning: string; error: string; debug: string };
  table: Partial<LogTablePageLabels>;
  columns: { job: string; event: string; command: string; status: string; date: string };
  empty: { task: string; filtered: string };
};

const taskLogsCopy: Record<AppLanguage, TaskLogsCopy> = {
  'en-US': {
    search: 'Search job id, event type or command id',
    statusOptions: [
      { value: 'all', label: 'All levels' },
      { value: 'info', label: 'Info' },
      { value: 'warning', label: 'Warning' },
      { value: 'error', label: 'Error' },
      { value: 'debug', label: 'Debug' },
    ],
    status: { info: 'Info', warning: 'Warning', error: 'Error', debug: 'Debug' },
    table: {
      status: 'Level',
      refresh: 'Refresh',
      total: 'Total',
      pageSizeSuffix: '/ page',
      loading: 'Loading',
      search: 'Search task logs',
    },
    columns: {
      job: 'Job',
      event: 'Event',
      command: 'Command',
      status: 'Level',
      date: 'Date',
    },
    empty: {
      task: 'No task logs yet. Run a job to generate durable job.* execution events.',
      filtered: 'No task logs match the current filters',
    },
  },
  'zh-CN': {
    search: '搜索任务 ID、事件类型或命令 ID',
    statusOptions: [
      { value: 'all', label: '全部级别' },
      { value: 'info', label: '信息' },
      { value: 'warning', label: '警告' },
      { value: 'error', label: '错误' },
      { value: 'debug', label: '调试' },
    ],
    status: { info: '信息', warning: '警告', error: '错误', debug: '调试' },
    table: {
      status: '级别',
      refresh: '刷新',
      total: '总计',
      pageSizeSuffix: '条/页',
      loading: '加载中',
      search: '搜索任务日志',
    },
    columns: {
      job: '任务',
      event: '事件',
      command: '命令',
      status: '级别',
      date: '时间',
    },
    empty: {
      task: '暂无任务日志。运行作业后将生成 job.* 执行事件。',
      filtered: '没有匹配当前筛选条件的任务日志',
    },
  },
};
