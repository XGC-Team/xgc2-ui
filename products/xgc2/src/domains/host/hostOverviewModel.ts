import type { SystemTrendPoint } from '../../shared/systemTrend';
import type { HostOverview } from './hostModel';

export type HostOverviewRefreshInterval = 'off' | '5000' | '10000' | '30000' | '60000';

export const hostOverviewRefreshOptions = [
  { value: 'off',label: 'No auto refresh' },
  { value: '5000',label: 'Every 5s' },
  { value: '10000',label: 'Every 10s' },
  { value: '30000',label: 'Every 30s' },
  { value: '60000',label: 'Every 60s' },
] satisfies Array<{ value: HostOverviewRefreshInterval; label: string }>;

export function isHostOverviewRefreshInterval(value: unknown): value is HostOverviewRefreshInterval {
  return value === 'off' || value === '5000' || value === '10000' || value === '30000' || value === '60000';
}

export function parseLoadAverage(value: string) {
  const parts = value.trim().split(/\s+/).slice(0,3);
  return [parts[0] ?? '0.00',parts[1] ?? '0.00',parts[2] ?? '0.00'];
}

/** Resource pressure for progress chrome (matches shell success / warning / danger). */
export type HostResourcePressure = 'normal' | 'elevated' | 'critical';

export function hostResourcePressure(percent: number): HostResourcePressure {
  if (!Number.isFinite(percent)) return 'normal';
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'elevated';
  return 'normal';
}

/**
 * Normalize 1-minute load average to a 0–100 utilization bar.
 * Linux convention: load ≈ fully busy when load ≈ logical CPU count.
 * (Old scale was load×25, so any load ≥ 4 always showed 100%.)
 */
export function hostLoadPercent(load1: number, cpuCount?: number): number {
  if (!Number.isFinite(load1) || load1 <= 0) return 0;
  const cores = Number.isFinite(cpuCount) && (cpuCount as number) > 0 ? (cpuCount as number) : 1;
  return Math.min(100, (load1 / cores) * 100);
}

/** Load 1m pressure using the same scale as the overview resource bar. */
export function hostLoadPressure(load1: number, cpuCount?: number): HostResourcePressure {
  return hostResourcePressure(hostLoadPercent(load1, cpuCount));
}

export function appendTrendPoint(points: SystemTrendPoint[],previous: HostOverview | null,next: HostOverview) {
  const load = parseLoadAverage(next.loadAverage);
  const point: SystemTrendPoint = {
    time: new Date(next.collectedAt).toLocaleTimeString([], { hour: '2-digit',minute: '2-digit',second: '2-digit' }),
    diskReadRate: 0,
    diskWriteRate: 0,
    networkRxRate: 0,
    networkTxRate: 0,
    load1: Number(load[0]) || 0,
  };
  if (previous?.io) {
    const deltaSeconds = Math.max(1,(new Date(next.collectedAt).getTime() - new Date(previous.collectedAt).getTime()) / 1000);
    point.diskReadRate = positiveRate(next.io.diskReadBytes,previous.io.diskReadBytes,deltaSeconds);
    point.diskWriteRate = positiveRate(next.io.diskWriteBytes,previous.io.diskWriteBytes,deltaSeconds);
    point.networkRxRate = positiveRate(next.io.networkRxBytes,previous.io.networkRxBytes,deltaSeconds);
    point.networkTxRate = positiveRate(next.io.networkTxBytes,previous.io.networkTxBytes,deltaSeconds);
  }
  return [...points,point].slice(-90);
}

/** Convert monotonically increasing NIC counters into current byte rates. */
export function withNetworkRates(previous: HostOverview | null,next: HostOverview): HostOverview {
  const elapsedSeconds = previous
    ? (Date.parse(next.collectedAt) - Date.parse(previous.collectedAt)) / 1000
    : 0;
  const previousByName = new Map((previous?.networkInterfaces ?? []).map((iface) => [iface.name,iface]));
  const networkInterfaces = (next.networkInterfaces ?? []).map((iface) => {
    const before = previousByName.get(iface.name);
    const valid = Boolean(before) && Number.isFinite(elapsedSeconds) && elapsedSeconds > 0;
    const rxDelta = valid ? iface.rxBytes - before!.rxBytes : 0;
    const txDelta = valid ? iface.txBytes - before!.txBytes : 0;
    return {
      ...iface,
      rxRateBytesPerSecond: valid && rxDelta >= 0 ? rxDelta / elapsedSeconds : 0,
      txRateBytesPerSecond: valid && txDelta >= 0 ? txDelta / elapsedSeconds : 0,
    };
  });
  return {
    ...next,
    networkInterfaces,
    io: {
      ...next.io,
      networkRxRateBytesPerSecond: networkInterfaces.reduce((sum,iface) => sum + (iface.rxRateBytesPerSecond || 0),0),
      networkTxRateBytesPerSecond: networkInterfaces.reduce((sum,iface) => sum + (iface.txRateBytesPerSecond || 0),0),
    },
  };
}

function positiveRate(next: number,previous: number,seconds: number) {
  if (!Number.isFinite(next) || !Number.isFinite(previous) || next < previous) return 0;
  return (next - previous) / seconds;
}
