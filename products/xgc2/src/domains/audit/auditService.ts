import { request } from '../../api/http';
import { clampLimit,queryString } from '../../shared/url';
import type { AuditDomain,AuditLog } from './auditModel';

export type AuditLogPage = {
  rows: AuditLog[];
  total: number;
};

export function listAuditLogPage(params: {
  domain: AuditDomain;
  category?: string;
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<AuditLogPage> {
  return request<unknown>(`/audit/logs${queryString({
    domain: params.domain,
    category: params.category ?? 'all',
    q: params.q ?? '',
    status: params.status ?? 'all',
    page: Math.max(1, Math.trunc(params.page)),
    pageSize: clampLimit(params.pageSize),
  })}`).then(decodeAuditLogPage);
}

function decodeAuditLogPage(value: unknown): AuditLogPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid audit log page: expected an object.');
  }
  const page = value as { rows?: unknown; total?: unknown };
  if (!Array.isArray(page.rows)) throw new Error('Invalid audit log page: rows must be an array.');
  if (typeof page.total !== 'number' || !Number.isInteger(page.total) || page.total < 0) {
    throw new Error('Invalid audit log page: total must be a non-negative integer.');
  }
  return { rows: page.rows as AuditLog[],total: page.total };
}
