import { useCallback,useEffect,useState } from 'react';
import { listAuditLogPage } from './auditLogActions';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import type { AuditDomain,AuditLog } from './auditModel';
import { LogTablePage,type LogTableColumn,type LogTablePageLabels } from '../../components/LogTablePage';
import { useDeferRouteReady } from '../../shared/routeReady';
import './audit.css';

export type AuditTab = 'operation' | 'access' | 'system' | 'login';

export function AuditPage({ activeTab, language }: { activeTab: AuditTab; language: AppLanguage }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = usePersistentState('xgc.table.audit.search', '', isString);
  const [status, setStatus] = usePersistentState('xgc.table.audit.status', 'all', isAuditStatus);
  const [page, setPage] = usePersistentState('xgc.table.audit.page', 1, isPositiveInteger);
  const [pageSize, setPageSize] = usePersistentState('xgc.table.audit.pageSize', 20, isAuditPageSize);

  const domain: AuditDomain = activeTab === 'login' ? 'login' : 'panel';
  const category = activeTab === 'login' ? 'ssh' : activeTab;
  const copy = auditCopy[language];
  const statusOptions = copy.statusOptions;
  const beginRequest = useLatestAsyncRequest(JSON.stringify([domain, category, query, status, page, pageSize]));

  const loadLogs = useCallback(async () => {
    const isCurrent = beginRequest();
    setLoading(true);
    try {
      const result = await listAuditLogPage({ domain, category, q: query, status, page, pageSize });
      if (!isCurrent()) return;
      setLogs(result.rows);
      setTotal(result.total);
      setMessage('');
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [beginRequest, category, domain, page, pageSize, query, status]);

  useEffect(() => {
    setPage(1);
  }, [category, domain, query, setPage, status]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useDeferRouteReady(loading && logs.length === 0);
  const columns = domain === 'login' ? loginColumns(copy) : panelColumns(copy);

  return (
    <div
      className="audit-page xgc-workspace-full-span"
      data-xgc-role="audit-page"
      data-xgc-tab={activeTab}
      data-xgc-id={activeTab}
    >
      <div className="audit-log-table-page">
      <LogTablePage<AuditLog>
        dataXgcId={`audit:${activeTab}`}
        search={{ value: query, placeholder: domain === 'login' ? copy.searchLogin : copy.searchPanel, onChange: setQuery }}
        status={{ value: status, onChange: setStatus, options: statusOptions }}
        onRefresh={() => void loadLogs()}
        loading={loading}
        message={message}
        columns={columns}
        rows={logs}
        getRowId={(log) => log.id}
        rowRole="audit-log-row"
        roles={{
          tabs: 'audit-category-filter',
          search: 'audit-search',
          message: 'audit-message',
        }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        emptyText={auditEmptyText(copy, domain, category, status, query)}
        labels={copy.table}
      />
      </div>
    </div>
  );
}

const auditStatusValues = new Set(['all', 'info', 'warning', 'error']);

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

function auditEmptyText(copy: AuditCopy, domain: AuditDomain, category: string, status: string, query: string) {
  if (query.trim() || status !== 'all') {
    return copy.empty.filtered;
  }
  if (domain === 'login') {
    return copy.empty.login;
  }
  if (category === 'operation') {
    return copy.empty.operation;
  }
  if (category === 'access') {
    return copy.empty.access;
  }
  if (category === 'system') {
    return copy.empty.system;
  }
  return copy.empty.generic;
}

function panelColumns(copy: AuditCopy): Array<LogTableColumn<AuditLog>> {
  return [
    { id: 'resource', title: copy.columns.resource, width: 'narrow', render: (log) => <span className="audit-category">{log.category}</span> },
    { id: 'operation', title: copy.columns.operation, width: 'wide', render: (log) => <span title={log.message || log.action}>{log.message || log.action}</span> },
    { id: 'target', title: copy.columns.target, width: 'wide', render: (log) => <span title={log.target || log.path || '-'}>{log.target || log.path || '-'}</span> },
    { id: 'operator', title: copy.columns.operator, render: (log) => <span title={`${log.actor || 'operator'} · ${log.ip || '-'}`}>{log.actor || 'operator'} · {log.ip || '-'}</span> },
    { id: 'status', title: copy.columns.status, width: 'narrow', render: (log) => <AuditStatus log={log} copy={copy} /> },
    { id: 'date', title: copy.columns.date, render: (log) => <span className="audit-timestamp" title={formatTime(log.createdAt)}>{formatTime(log.createdAt)}</span> },
  ];
}

function loginColumns(copy: AuditCopy): Array<LogTableColumn<AuditLog>> {
  return [
    { id: 'ip', title: copy.columns.loginIp, render: (log) => <span>{log.ip || '-'}</span> },
    { id: 'host', title: copy.columns.host, width: 'wide', render: (log) => <span title={log.target || '-'}>{log.target || '-'}</span> },
    { id: 'mode', title: copy.columns.action, render: (log) => <span title={log.action}>{log.action}</span> },
    { id: 'status', title: copy.columns.status, width: 'narrow', render: (log) => <AuditStatus log={log} copy={copy} /> },
    { id: 'message', title: copy.columns.message, width: 'wide', render: (log) => <span title={log.message || '-'}>{log.message || '-'}</span> },
    { id: 'date', title: copy.columns.date, render: (log) => <span className="audit-timestamp" title={formatTime(log.createdAt)}>{formatTime(log.createdAt)}</span> },
  ];
}

function AuditStatus({ log, copy }: { log: AuditLog; copy: AuditCopy }) {
  const label = log.level === 'error' ? copy.status.failed : log.level === 'warning' ? copy.status.warning : copy.status.success;
  // Table cells share one body typeface; status stays plain readable text
  // with no per-severity color fork inside tabular data.
  return <span>{label}</span>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

type PanelAuditCategory = 'operation' | 'access' | 'system';

type AuditCopy = {
  searchPanel: string;
  searchLogin: string;
  statusOptions: Array<{ value: string; label: string }>;
  status: {
    success: string;
    warning: string;
    failed: string;
  };
  table: Partial<LogTablePageLabels>;
  columns: {
    resource: string;
    operation: string;
    target: string;
    operator: string;
    status: string;
    date: string;
    loginIp: string;
    host: string;
    action: string;
    message: string;
  };
  empty: Record<PanelAuditCategory | 'login' | 'filtered' | 'generic', string>;
};

const auditCopy: Record<AppLanguage, AuditCopy> = {
  'en-US': {
    searchPanel: 'Search resource, action, path or message',
    searchLogin: 'Search IP, host, action or message',
    statusOptions: [
      { value: 'all', label: 'All status' },
      { value: 'info', label: 'Success' },
      { value: 'warning', label: 'Warning' },
      { value: 'error', label: 'Failed' },
    ],
    status: {
      success: 'Success',
      warning: 'Warning',
      failed: 'Failed',
    },
    table: {
      status: 'Status',
      refresh: 'Refresh',
      total: 'Total',
      pageSizeSuffix: '/ page',
      loading: 'Loading',
      search: 'Search audit logs',
    },
    columns: {
      resource: 'Resource',
      operation: 'Operation',
      target: 'Target',
      operator: 'Operator',
      status: 'Status',
      date: 'Date',
      loginIp: 'Login IP',
      host: 'Host',
      action: 'Action',
      message: 'Message',
    },
    empty: {
      filtered: 'No logs match the current filters',
      login: 'No SSH login records yet',
      operation: 'No operation logs yet. Create, edit, save, delete, run, install, or stop a resource to generate one.',
      access: 'No API access logs yet',
      system: 'No system logs yet',
      generic: 'No logs yet',
    },
  },
  'zh-CN': {
    searchPanel: '搜索资源、操作、路径或消息',
    searchLogin: '搜索 IP、主机、操作或消息',
    statusOptions: [
      { value: 'all', label: '全部状态' },
      { value: 'info', label: '成功' },
      { value: 'warning', label: '警告' },
      { value: 'error', label: '失败' },
    ],
    status: {
      success: '成功',
      warning: '警告',
      failed: '失败',
    },
    table: {
      status: '状态',
      refresh: '刷新',
      total: '总计',
      pageSizeSuffix: '条/页',
      loading: '加载中',
      search: '搜索审计日志',
    },
    columns: {
      resource: '资源',
      operation: '操作',
      target: '目标',
      operator: '操作员',
      status: '状态',
      date: '时间',
      loginIp: '登录 IP',
      host: '主机',
      action: '动作',
      message: '消息',
    },
    empty: {
      filtered: '没有符合当前筛选条件的日志',
      login: '暂无 SSH 登录记录',
      operation: '暂无操作日志。创建、编辑、保存、删除、运行、安装或停止资源后会生成记录。',
      access: '暂无 API 访问日志',
      system: '暂无系统日志',
      generic: '暂无日志',
    },
  },
};
