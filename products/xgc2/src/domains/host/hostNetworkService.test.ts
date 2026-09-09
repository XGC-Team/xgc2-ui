import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { getHostNetworkDiagnostics } from './hostNetworkService';

vi.mock('../../api/http',() => ({
  request: vi.fn(),
  withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
}));

describe('hostNetworkService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes Go nil slices so a host with no remote sessions remains renderable', async () => {
    vi.mocked(request).mockResolvedValue({
      dns: { nameServers: ['127.0.0.11'],searchDomains: null,options: null,source: '/etc/resolv.conf' },
      proxy: { httpProxy: '',httpsProxy: '',allProxy: '',noProxy: null,source: '' },
      assignments: null,
      remoteAccess: null,
      collectedAt: '2026-08-09T04:00:00Z',
    });

    const diagnostics = await getHostNetworkDiagnostics({ managedHostId: 'agent-a' });

    expect(diagnostics).toEqual({
      dns: { nameServers: ['127.0.0.11'],searchDomains: [],options: [],source: '/etc/resolv.conf' },
      proxy: { httpProxy: '',httpsProxy: '',allProxy: '',noProxy: [],source: '' },
      assignments: [],remoteAccess: [],collectedAt: '2026-08-09T04:00:00Z',
    });
  });
});
