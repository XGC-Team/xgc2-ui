import { describe,expect,it } from 'vitest';
import type { HostOverview } from './hostModel';
import { withNetworkRates } from './hostOverviewModel';

describe('withNetworkRates', () => {
  it('reports zero for the first sample instead of exposing lifetime counters', () => {
    const first = withNetworkRates(null,overview('2026-08-09T00:00:00Z',1000,500));
    expect(first.networkInterfaces[0].rxRateBytesPerSecond).toBe(0);
    expect(first.networkInterfaces[0].txRateBytesPerSecond).toBe(0);
  });

  it('derives current per-NIC and aggregate rates from consecutive samples', () => {
    const first = overview('2026-08-09T00:00:00Z',1000,500);
    const second = withNetworkRates(first,overview('2026-08-09T00:00:02Z',1400,700));
    expect(second.networkInterfaces[0].rxRateBytesPerSecond).toBe(200);
    expect(second.networkInterfaces[0].txRateBytesPerSecond).toBe(100);
    expect(second.io.networkRxRateBytesPerSecond).toBe(200);
    expect(second.io.networkTxRateBytesPerSecond).toBe(100);
  });

  it('does not produce a negative rate when a counter resets', () => {
    const first = overview('2026-08-09T00:00:00Z',1000,500);
    const second = withNetworkRates(first,overview('2026-08-09T00:00:01Z',20,10));
    expect(second.networkInterfaces[0].rxRateBytesPerSecond).toBe(0);
    expect(second.networkInterfaces[0].txRateBytesPerSecond).toBe(0);
  });
});

function overview(collectedAt: string,rxBytes: number,txBytes: number): HostOverview {
  return {
    hostname: 'host',distro: 'Ubuntu',os: 'linux',arch: 'amd64',kernel: 'test',uptime: '1m',
    loadAverage: '0 0 0',cpu: 'cpu',cpuCount: 1,
    memory: { totalBytes: 1,availableBytes: 1,usedBytes: 0,usedPercent: 0 },
    disk: { path: '/',totalBytes: 1,freeBytes: 1,usedBytes: 0,usedPercent: 0,filesystem: 'root',mountOptions: '' },
    io: { diskReadBytes: 0,diskWriteBytes: 0,networkRxBytes: rxBytes,networkTxBytes: txBytes,diskDeviceCount: 0,networkIfaceCount: 1 },
    networkInterfaces: [{ name: 'eth0',up: true,rxBytes,txBytes,address: '192.0.2.1' }],
    topCpuProcesses: [],topMemoryProcesses: [],topNetworkProcesses: [],collectedAt,commands: {},
  };
}
