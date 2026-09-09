import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { listAuditLogPage } from './auditService';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({ rows: [],total: 0 })),
}));

describe('auditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests server-side audit pagination and status filtering', async () => {
    await listAuditLogPage({ domain: 'panel',category: 'operation',q: 'orchestration',status: 'error',page: 2,pageSize: 20 });

    expect(request).toHaveBeenCalledWith('/audit/logs?domain=panel&category=operation&q=orchestration&status=error&page=2&pageSize=20');
  });

  it('rejects array responses instead of adapting an obsolete protocol', async () => {
    vi.mocked(request).mockResolvedValueOnce([{ id: 'log-1' }]);

    await expect(listAuditLogPage({ domain: 'panel',page: 1,pageSize: 20 })).rejects.toThrow(/expected an object/);
  });

  it('rejects malformed page responses instead of hiding contract errors', async () => {
    vi.mocked(request).mockResolvedValueOnce({ total: 4 });

    await expect(listAuditLogPage({ domain: 'panel',page: 1,pageSize: 20 })).rejects.toThrow(/rows must be an array/);
  });
});
