import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,withTerminalAuth } from '../../api/http';
import {
  compressHostFile,
  copyHostFile,
  createHostFile,
  deleteHostFile,
  downloadHostFile,
  getHostFileContent,
  getHostFiles,
  getHostRecycle,
  restoreHostRecycle,
  saveHostFileContent,
  uploadHostFile,
} from './hostFileActions';
import { listHostLogSources } from './hostLogActions';
import { getHostListeningPorts } from './hostNetworkActions';
import { getHostOverview } from './hostOverviewActions';
import {
  getHostProcesses,
  killHostProcess,
} from './hostProcessActions';
import {
  getHostSSH,
  operateHostSSH,
} from './hostSSHActions';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({})),
  withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
}));

describe('host leaf actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds host file query strings with terminal auth', async () => {
    await getHostFiles('/tmp/a b', true, 'x/y', { targetCoreId: 'core-1' });

    expect(withTerminalAuth).toHaveBeenCalledWith({ targetCoreId: 'core-1' });
    expect(request).toHaveBeenCalledWith(
      '/host/files?path=%2Ftmp%2Fa+b&hidden=true&search=x%2Fy',
      undefined,
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
  });

  it('uses the typed SSH operation path', async () => {
    await operateHostSSH('restart');

    expect(request).toHaveBeenCalledWith('/host/ssh/restart', { method: 'POST' }, { auth: 'terminal' });
  });

  it('routes managed host file reads and writes through the core managed-host API', async () => {
    await getHostFiles('~', false, '', { managedHostId: 'agent-a' });
    await getHostFileContent('~/hello.txt', { managedHostId: 'agent-a' });
    await saveHostFileContent('~/hello.txt', 'hello from agent-a', { managedHostId: 'agent-a' });

    expect(request).toHaveBeenNthCalledWith(1, '/managed-hosts/agent-a/fs/list?path=%7E&hidden=false&search=', undefined, { managedHostId: 'agent-a',auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(2, '/managed-hosts/agent-a/fs/read?path=%7E%2Fhello.txt', undefined, { managedHostId: 'agent-a',auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(3, '/managed-hosts/agent-a/fs/write', { method: 'PUT', body: JSON.stringify({ path: '~/hello.txt', content: 'hello from agent-a' }) }, { managedHostId: 'agent-a',auth: 'terminal' });
  });

  it('uses managed-host mkdir/write/read for agent create/download/upload', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ path: '/srv/robot/a.txt' })
      .mockResolvedValueOnce({ path: '/srv/robot/newdir' })
      .mockResolvedValueOnce({ path: '/srv/robot/cfg.yaml', content: 'k: v', size: 4 })
      .mockResolvedValueOnce({ path: '/srv/robot/up.txt' });

    await createHostFile('/srv/robot/a.txt', false, '', { managedHostId: 'agent-a' });
    await createHostFile('/srv/robot/newdir', true, '', { managedHostId: 'agent-a' });
    const blob = await downloadHostFile('/srv/robot/cfg.yaml', { managedHostId: 'agent-a' });
    expect(await blob.text()).toBe('k: v');
    await uploadHostFile('/srv/robot', new File(['hello'], 'up.txt', { type: 'text/plain' }), { managedHostId: 'agent-a' });

    expect(vi.mocked(request).mock.calls.map((call) => call[0])).toEqual([
      '/managed-hosts/agent-a/fs/write',
      '/managed-hosts/agent-a/fs/mkdir',
      '/managed-hosts/agent-a/fs/read?path=%2Fsrv%2Frobot%2Fcfg.yaml',
      '/managed-hosts/agent-a/fs/write',
    ]);
  });

  it('keeps local Core delete recoverable while Agent delete stays permanent', async () => {
    await deleteHostFile('/tmp/local file',{ targetCoreId: 'core-1' });
    await getHostRecycle({ targetCoreId: 'core-1' });
    await restoreHostRecycle('recycle/1',{ targetCoreId: 'core-1' });
    await deleteHostFile('/tmp/remote file',{ targetCoreId: 'core-1',managedHostId: 'agent-a' });

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/host/files?path=%2Ftmp%2Flocal+file',
      { method: 'DELETE' },
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/host/files/recycle',
      undefined,
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/host/files/recycle/restore',
      { method: 'POST',body: JSON.stringify({ path: 'recycle/1' }) },
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      '/managed-hosts/agent-a/fs?path=%2Ftmp%2Fremote+file',
      { method: 'DELETE' },
      { targetCoreId: 'core-1',managedHostId: 'agent-a',auth: 'terminal' },
    );
  });

  it('uses the managed-host API only for the remote overview', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      hostname: 'agent-a',
      os: 'linux',
      arch: 'amd64',
      cpuCount: 4,
      load1: 1,
      load5: 0.5,
      load15: 0.25,
      totalMemoryBytes: 100,
      availableMemoryBytes: 40,
      uptimeSeconds: 12,
      collectedAt: 'now',
      kernel: 'test',
      rootDiskTotalBytes: 100,
      rootDiskAvailableBytes: 40,
    });
    const overview = await getHostOverview({ managedHostId: 'agent-a' });

    expect(overview.memory.usedBytes).toBe(60);
    expect(request).toHaveBeenNthCalledWith(1, '/managed-hosts/agent-a/overview', undefined, { managedHostId: 'agent-a',auth: 'terminal' });
  });

  it('routes remote processes/network/terminate/ssh/logs through managed-host paths', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ processes: [{ identity: { pid: 9, startTicks: 11 }, name: 'bash', user: 'operator', state: 'sleeping', ppid: 1, cpuPercent: 0, memoryBytes: 1, command: 'bash' }], nextPageToken: '' })
      .mockResolvedValueOnce([{ protocol: 'tcp', localAddress: '0.0.0.0', localPort: 22, pid: 1, processName: 'sshd', state: 'listen' }])
      .mockResolvedValueOnce({ identity: { pid: 9 }, terminated: true })
      .mockResolvedValueOnce({ active: true, enabled: true, config: { port: 22, listenAddress: '0.0.0.0', passwordAuthentication: true, pubkeyAuthentication: true, permitRootLogin: false, useDNS: false } })
      .mockResolvedValueOnce([{ id: 'syslog', path: '/var/log/syslog', size: 1, modTime: 'now' }]);

    const processes = await getHostProcesses({ managedHostId: 'agent-a' });
    const ports = await getHostListeningPorts({ managedHostId: 'agent-a' });
    await killHostProcess(9, { managedHostId: 'agent-a', startTicks: 11, signal: 'term' });
    const ssh = await getHostSSH({ managedHostId: 'agent-a' });
    await listHostLogSources({ managedHostId: 'agent-a' });

    expect(processes[0]).toEqual(expect.objectContaining({ pid: 9, startTicks: 11, name: 'bash' }));
    expect(ports[0]).toEqual(expect.objectContaining({ local: '0.0.0.0:22', process: 'sshd' }));
    expect(ssh.remoteTyped).toBe(true);
    expect(vi.mocked(request).mock.calls.map((call) => call[0])).toEqual([
      '/managed-hosts/agent-a/processes?pageSize=200',
      '/managed-hosts/agent-a/network/listening-sockets',
      '/managed-hosts/agent-a/processes/9/terminate',
      '/managed-hosts/agent-a/ssh',
      '/managed-hosts/agent-a/log-sources',
    ]);
    expect(JSON.parse(String((vi.mocked(request).mock.calls[2][1] as RequestInit).body))).toEqual({
      startTicks: 11,
      signal: 'term',
    });
  });

  it('submits durable copy and compression operations', async () => {
    await copyHostFile(['/tmp/src'], '/tmp/dst');
    await compressHostFile(['/tmp/src'], '/tmp', 'bundle');

    expect(vi.mocked(request).mock.calls[0][0]).toBe('/host/files/actions/copy');
    expect(vi.mocked(request).mock.calls[1][0]).toBe('/host/files/actions/compress');
    const copyRequest = vi.mocked(request).mock.calls[0][1] as RequestInit;
    const compressRequest = vi.mocked(request).mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(copyRequest.body))).toEqual(expect.objectContaining({ sources: ['/tmp/src'],destination: '/tmp/dst',overwrite: false }));
    expect(JSON.parse(String(compressRequest.body))).toEqual(expect.objectContaining({ sources: ['/tmp/src'],destination: '/tmp/bundle.zip',overwrite: false }));
    expect(copyRequest.headers).toEqual(expect.objectContaining({ 'X-Request-ID': expect.any(String),'Idempotency-Key': expect.any(String) }));
  });
});
