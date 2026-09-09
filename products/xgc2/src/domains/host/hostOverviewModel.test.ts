import { describe,expect,it } from 'vitest';
import type { HostOverview } from './hostModel';
import {
  appendTrendPoint,
  hostLoadPercent,
  hostLoadPressure,
  hostResourcePressure,
  parseLoadAverage,
} from './hostOverviewModel';
import { formatBytes,formatUptime } from './hostFormatting';
import { isKernelLikeProcess,prettyDistro } from './hostOverviewService';

describe('hostOverviewModel', () => {
  it('formats host storage values for compact display', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('classifies resource and load pressure using CPU-normalized load', () => {
    expect(hostResourcePressure(50)).toBe('normal');
    expect(hostResourcePressure(80)).toBe('elevated');
    expect(hostResourcePressure(95)).toBe('critical');
    // Normalized by CPU count: load 5.62 on 32 threads is lightly loaded, not 100%.
    expect(hostLoadPercent(5.62, 32)).toBeCloseTo((5.62 / 32) * 100, 5);
    expect(hostLoadPercent(5.62, 32)).toBeLessThan(25);
    expect(hostLoadPercent(4, 1)).toBe(100);
    expect(hostLoadPercent(0.5, 0)).toBe(50);
    expect(hostLoadPercent(Number.NaN)).toBe(0);
    expect(hostLoadPressure(0.2, 8)).toBe('normal');
    expect(hostLoadPressure(6.5, 8)).toBe('elevated');
    expect(hostLoadPressure(7.5, 8)).toBe('critical');
    expect(hostLoadPressure(Number.NaN)).toBe('normal');
  });

  it('appends trend points and clamps reset counters to zero rate', () => {
    const previous = overview('2026-05-18T00:00:00Z',{ diskReadBytes: 1000,diskWriteBytes: 1000,networkRxBytes: 1000,networkTxBytes: 1000,diskDeviceCount: 1,networkIfaceCount: 1 });
    const next = overview('2026-05-18T00:00:10Z',{ diskReadBytes: 2000,diskWriteBytes: 900,networkRxBytes: 1600,networkTxBytes: 1300,diskDeviceCount: 1,networkIfaceCount: 1 });
    const [point] = appendTrendPoint([],previous,next);
    expect(parseLoadAverage('1.25 0.50 0.25 4/100')).toEqual(['1.25','0.50','0.25']);
    expect(point).toEqual(expect.objectContaining({ diskReadRate: 100,diskWriteRate: 0,networkRxRate: 60,networkTxRate: 30 }));
  });

  it('formats distro labels for Core pretty names and Agent GOOS', () => {
    expect(prettyDistro('Ubuntu 20.04.6 LTS','amd64')).toContain('Ubuntu');
    expect(prettyDistro('linux','arm64')).toBe('Linux · arm64');
    expect(prettyDistro('linux','')).toBe('Linux');
  });

  it('formats uptime from seconds and /proc style', () => {
    expect(formatUptime(13510)).toMatch(/h/);
    expect(formatUptime('13510s')).toMatch(/h/);
    expect(formatUptime('21824.69 645459.88')).toMatch(/d|h/);
  });

  it('filters kernel-like processes out of Overview tops', () => {
    expect(isKernelLikeProcess({
      pid: 84,ppid: 2,name: 'ktimers/8',user: 'root',threads: 0,cpuPercent: 0.01,
      state: 'S',cpuTime: '',memory: 0,connections: 0,startTime: '',command: 'ktimers/8',
    })).toBe(true);
    expect(isKernelLikeProcess({
      pid: 900,ppid: 1,name: 'xgc-agent',user: 'thor',threads: 1,cpuPercent: 0.5,
      state: 'S',cpuTime: '',memory: 50_000_000,connections: 2,startTime: '',command: './bin/xgc-agent',
    })).toBe(false);
  });
});

function overview(collectedAt: string,io: HostOverview['io']): HostOverview {
  return {
    hostname: 'test',
    distro: 'Linux',
    os: 'linux',
    arch: 'amd64',
    kernel: '6.0',
    uptime: '1h',
    loadAverage: '1.25 0.50 0.25',
    cpu: '1 CPU',
    memory: { totalBytes: 1,availableBytes: 1,usedBytes: 0,usedPercent: 0 },
    disk: { path: '/',totalBytes: 1,freeBytes: 1,usedBytes: 0,usedPercent: 0,filesystem: 'ext4',mountOptions: '' },
    io,
    networkInterfaces: [],
    topCpuProcesses: [],
    topMemoryProcesses: [],
    topNetworkProcesses: [],
    collectedAt,
    commands: {},
  };
}
