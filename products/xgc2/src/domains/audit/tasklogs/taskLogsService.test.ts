import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '../../../api/http';
import { decodeDecimalUintString, listTaskLogPage } from './taskLogsService';

vi.mock('../../../api/http', () => ({
  request: vi.fn(),
}));

describe('listTaskLogPage', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
    vi.mocked(request).mockResolvedValue({
      rows: [{
        offset: '18446744073709551614',
        jobId: 'job-1',
        sequence: '18446744073709551615',
        eventType: 'job.queued',
        level: 'info',
        commandId: 'cmd-1',
        createdAt: '2026-05-20T00:00:00.000Z',
      }],
      total: 1,
    });
  });

  it('calls the typed task-logs endpoint and decodes decimal uint64 strings', async () => {
    const page = await listTaskLogPage({ q: 'job-1', status: 'info', page: 2, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/audit/task-logs?q=job-1&status=info&page=2&pageSize=20');
    expect(page.total).toBe(1);
    expect(page.rows[0]?.offset).toBe('18446744073709551614');
    expect(page.rows[0]?.sequence).toBe('18446744073709551615');
    expect(page.rows[0]?.level).toBe('info');
    expect(page.rows[0]?.eventType).toBe('job.queued');
  });

  it('rejects numeric offset/sequence above safe integer as malformed wire shape', async () => {
    vi.mocked(request).mockResolvedValue({
      rows: [{
        offset: Number.MAX_SAFE_INTEGER + 2,
        jobId: 'job-1',
        sequence: 1,
        eventType: 'job.queued',
        level: 'info',
        createdAt: '2026-05-20T00:00:00.000Z',
      }],
      total: 1,
    });
    await expect(listTaskLogPage({ page: 1, pageSize: 20 }))
      .rejects.toThrow(/expected decimal string/);
  });

  it('rejects malformed decimal strings', () => {
    expect(() => decodeDecimalUintString('', 'offset')).toThrow(/decimal string/);
    expect(() => decodeDecimalUintString('12a', 'offset')).toThrow(/decimal string/);
    expect(() => decodeDecimalUintString(-1 as unknown as string, 'sequence')).toThrow(/decimal string/);
    expect(decodeDecimalUintString('18446744073709551615', 'sequence')).toBe('18446744073709551615');
  });
});
