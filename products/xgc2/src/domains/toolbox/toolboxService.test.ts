import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import {
  listMaintenanceDefinitions,
  submitCleanupAction,
  submitRemoteCleanupAction,
} from './toolboxService';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({})),
  withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
}));

describe('toolboxService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists only backend-registered maintenance definitions', async () => {
    await listMaintenanceDefinitions({ targetCoreId: 'core-1' });
    expect(request).toHaveBeenCalledWith('/toolbox/maintenance', undefined, { targetCoreId: 'core-1',auth: 'terminal' });
  });

  it('submits a typed cleanup action with command identity headers', async () => {
    const body = {
      targetId: 'local',action: 'apply' as const,ids: ['cache'],scanDigest: 'sha256:digest',
      requestId: 'request-1',idempotencyKey: 'request-1',reason: 'operator cleanup apply',
    };
    await submitCleanupAction(body);
    expect(request).toHaveBeenCalledWith('/toolbox/maintenance/cleanup/actions', {
      method: 'POST',
      headers: { 'X-Request-ID': 'request-1','Idempotency-Key': 'request-1' },
      body: JSON.stringify(body),
    }, { auth: 'terminal',timeoutMs: 60_000 });
  });

  it('rejects local submit when managedHostId is set (remote must use remote path)', async () => {
    await expect(submitCleanupAction({
      targetId: 'thor-b2',action: 'scan',requestId: 'r1',idempotencyKey: 'r1',reason: 't',
    }, { managedHostId: 'thor-b2' })).rejects.toThrow(/Remote cleanup must use submitRemoteCleanupAction/);
    expect(request).not.toHaveBeenCalled();
  });

  it('remote scan sends targetId equal to managedHostId query identity', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      mode: 'remote',
      action: 'scan',
      scan: {
        scanDigest: 'sha256:scan',
        collectedAt: '2026-08-08T00:00:00Z',
        totalBytes: 1024,
        entries: [{ id: 'cache',name: 'Cache',sizeBytes: 1024,entryCount: 1 }],
      },
    });
    const result = await submitRemoteCleanupAction({
      action: 'scan',
      requestId: 'request-remote-1',
      idempotencyKey: 'request-remote-1',
      reason: 'operator cleanup scan',
    }, { managedHostId: 'thor-b2' });
    expect(request).toHaveBeenCalledWith(
      '/toolbox/maintenance/cleanup/actions?managedHostId=thor-b2',
      {
        method: 'POST',
        headers: { 'X-Request-ID': 'request-remote-1','Idempotency-Key': 'request-remote-1' },
        body: JSON.stringify({
          action: 'scan',
          targetId: 'thor-b2',
          requestId: 'request-remote-1',
          idempotencyKey: 'request-remote-1',
          reason: 'operator cleanup scan',
        }),
      },
      { managedHostId: 'thor-b2',auth: 'terminal',timeoutMs: 60_000 },
    );
    expect(result.action).toBe('scan');
    if (result.action === 'scan') {
      expect(result.scan.scanDigest).toBe('sha256:scan');
    }
  });
});
