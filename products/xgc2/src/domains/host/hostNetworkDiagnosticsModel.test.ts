import { describe,expect,it } from 'vitest';
import type { HostNetworkSnapshot } from './hostModel';
import {
  hostNetworkHealthChecks,
  hostNetworkPathChecks,
  isDefaultRoute,
  remoteAccessLabel,
} from './hostNetworkDiagnosticsModel';

describe('hostNetworkDiagnosticsModel', () => {
  it('turns robot network facts into concise actionable health checks', () => {
    const checks = hostNetworkHealthChecks(snapshot());
    expect(checks.find((check) => check.id === 'route')).toEqual(expect.objectContaining({
      value: '2 competing',tone: 'warning',
    }));
    expect(checks.find((check) => check.id === 'addressing')).toEqual(expect.objectContaining({
      value: '1 dynamic',tone: 'warning',
    }));
    expect(checks.find((check) => check.id === 'proxy')).toEqual(expect.objectContaining({
      value: 'Enabled',tone: 'warning',
    }));
    expect(checks.find((check) => check.id === 'remote-access')).toEqual(expect.objectContaining({
      value: '1 SSH · 1 desktop',tone: 'warning',
    }));
  });

  it('recognizes default routes and labels remote access protocols', () => {
    expect(isDefaultRoute({ destination: '0.0.0.0',prefixLength: 0,gateway: '',interfaceName: 'eth0',metric: 0,table: 'main' })).toBe(true);
    expect(isDefaultRoute({ destination: '10.0.0.0',prefixLength: 8,gateway: '',interfaceName: 'eth0',metric: 0,table: 'main' })).toBe(false);
    expect(remoteAccessLabel({ kind: 'ssh' })).toBe('SSH');
    expect(remoteAccessLabel({ kind: 'remoteDesktop' })).toBe('Remote desktop');
  });

  it('flags an internal destination that would be routed to a proxy', () => {
    const checks = hostNetworkPathChecks(snapshot(),'http://camera.robot.lan:8080/stream');
    expect(checks.find((check) => check.id === 'proxy')).toEqual(expect.objectContaining({
      value: 'Internal target uses proxy',tone: 'critical',detail: 'camera.robot.lan → proxy',
    }));
    expect(checks.find((check) => check.id === 'route')).toEqual(expect.objectContaining({
      value: 'Matched',detail: expect.stringContaining('proxy proxy'),
    }));
    expect(checks.find((check) => check.id === 'dns')).toEqual(expect.objectContaining({
      value: 'Configured',detail: expect.stringContaining('proxy via 10.0.0.53'),
    }));
  });

  it('honors exact, suffix, port and CIDR NO_PROXY entries without sending traffic', () => {
    const value = snapshot();
    value.diagnostics.proxy.noProxy = ['.robot.lan','10.0.0.0/8','camera.example:8080'];
    for (const target of ['http://camera.robot.lan','http://10.2.3.4','http://camera.example:8080']) {
      expect(hostNetworkPathChecks(value,target).find((check) => check.id === 'proxy'))
        .toEqual(expect.objectContaining({ value: 'Direct',tone: 'normal' }));
    }
    expect(hostNetworkPathChecks(value,'http://camera.example:8081').find((check) => check.id === 'proxy'))
      .toEqual(expect.objectContaining({ value: 'Via proxy',tone: 'warning' }));
  });
});

function snapshot(): HostNetworkSnapshot {
  return {
    interfaces: [{
      name: 'eth0',up: true,address: '192.168.8.20',rxBytes: 1,txBytes: 2,
      macAddress: '',mtu: 1500,addresses: [{ address: '192.168.8.20',prefixLength: 24,family: 'ipv4' }],
      rxPackets: 1,txPackets: 1,rxErrors: 0,txErrors: 0,
    }],
    routes: [
      { destination: '0.0.0.0',prefixLength: 0,gateway: '192.168.8.1',interfaceName: 'eth0',metric: 100,table: 'main' },
      { destination: '0.0.0.0',prefixLength: 0,gateway: '10.0.0.1',interfaceName: 'wlan0',metric: 600,table: 'main' },
    ],
    listeners: [],
    diagnostics: {
      dns: { nameServers: ['10.0.0.53'],searchDomains: [],options: [],source: '/etc/resolv.conf' },
      proxy: { httpProxy: 'http://proxy:3128',httpsProxy: '',allProxy: '',noProxy: [],source: 'agent environment' },
      assignments: [{ interfaceName: 'eth0',address: '192.168.8.20',mode: 'dynamic',source: 'ip' }],
      remoteAccess: [
        remote({ kind: 'ssh',state: 'active' }),
        remote({ kind: 'remoteDesktop',state: 'active' }),
        remote({ kind: 'ssh',state: 'listening' }),
      ],
      collectedAt: '2026-08-09T00:00:00Z',
    },
  };
}

function remote(partial: Partial<HostNetworkSnapshot['diagnostics']['remoteAccess'][number]>) {
  return {
    kind: 'ssh' as const,state: 'active' as const,protocol: 'tcp',localAddress: '0.0.0.0',localPort: 22,
    remoteAddress: '192.168.8.5',remotePort: 50000,pid: 100,processStartTicks: 1,
    processName: 'sshd',user: 'robot',cpuPercent: 1,memoryBytes: 1024,processCount: 2,
    startedAt: '2026-08-09T00:00:00Z',detectedBy: 'process:sshd',...partial,
  };
}
