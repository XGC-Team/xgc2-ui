import { request } from '../../../api/http';
import { queryString } from '../../../shared/url';

export type TaskLogRow = {
  offset: string;
  jobId: string;
  sequence: string;
  eventType: string;
  level: string;
  commandId?: string;
  payload?: unknown;
  createdAt: string;
};

export type TaskLogPage = {
  rows: TaskLogRow[];
  total: number;
};

export function listTaskLogPage(params: {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<TaskLogPage> {
  const page = Math.max(1, Math.trunc(params.page));
  const pageSize = allowedTaskLogPageSize(params.pageSize) ? params.pageSize : 20;
  return request<unknown>(`/audit/task-logs${queryString({
    q: params.q ?? '',
    status: params.status ?? 'all',
    page,
    pageSize,
  })}`).then(decodeTaskLogPage);
}

function allowedTaskLogPageSize(pageSize: number): boolean {
  switch (pageSize) {
    case 10:
    case 20:
    case 50:
    case 100:
      return true;
    default:
      return false;
  }
}

function decodeTaskLogPage(value: unknown): TaskLogPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid task log page: expected an object.');
  }
  const page = value as { rows?: unknown; total?: unknown };
  if (!Array.isArray(page.rows)) throw new Error('Invalid task log page: rows must be an array.');
  if (typeof page.total !== 'number' || !Number.isInteger(page.total) || page.total < 0) {
    throw new Error('Invalid task log page: total must be a non-negative integer.');
  }
  return {
    rows: page.rows.map(decodeTaskLogRow),
    total: page.total,
  };
}

function decodeTaskLogRow(value: unknown): TaskLogRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid task log row.');
  }
  const row = value as Record<string, unknown>;
  const offset = decodeDecimalUintString(row.offset, 'offset');
  const sequence = decodeDecimalUintString(row.sequence, 'sequence');
  if (typeof row.jobId !== 'string' || typeof row.eventType !== 'string'
    || typeof row.level !== 'string' || typeof row.createdAt !== 'string') {
    throw new Error('Invalid task log row fields.');
  }
  return {
    offset,
    jobId: row.jobId,
    sequence,
    eventType: row.eventType,
    level: row.level,
    commandId: typeof row.commandId === 'string' ? row.commandId : undefined,
    payload: row.payload,
    createdAt: row.createdAt,
  };
}

/** Accept only non-empty decimal digit strings (safe for uint64 beyond MAX_SAFE_INTEGER). */
export function decodeDecimalUintString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    throw new Error(`Invalid task log ${field}: expected decimal string.`);
  }
  return value;
}
