export type AuditDomain = 'panel' | 'login' | 'access';

export type AuditCategory = 'operation' | 'access' | 'system' | 'ssh' | string;

export type AuditLog = {
  id: string;
  domain: AuditDomain | string;
  category: AuditCategory;
  level: 'info' | 'warning' | 'error' | string;
  actor: string;
  target: string;
  action: string;
  message: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  metadata: string;
  createdAt: string;
};
