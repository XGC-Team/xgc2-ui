import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { listManagedHosts,revokeManagedHost } from './managedHostService';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve(undefined)),
}));

describe('managedHostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses only the read-only registry snapshot and revoke endpoints', async () => {
    await listManagedHosts();
    await revokeManagedHost('agent/a');

    expect(request).toHaveBeenNthCalledWith(1, '/managed-hosts');
    expect(request).toHaveBeenNthCalledWith(2, '/managed-hosts/agent%2Fa', { method: 'DELETE' });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
