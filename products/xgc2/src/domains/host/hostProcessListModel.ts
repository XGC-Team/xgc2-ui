import type { HostProcess } from './hostModel';

/** Sortable process columns (important operational fields). */
export type HostProcessSortKey =
  | 'pid'
  | 'name'
  | 'ppid'
  | 'threads'
  | 'user'
  | 'cpu'
  | 'memory'
  | 'connections'
  | 'state'
  | 'startTime'
  | 'command';

export type HostProcessSortDirection = 'asc' | 'desc';

export type HostProcessSort = {
  key: HostProcessSortKey;
  direction: HostProcessSortDirection;
};

/** Default: highest CPU first (most useful for Runtime ops). */
export const DEFAULT_HOST_PROCESS_SORT: HostProcessSort = {
  key: 'cpu',
  direction: 'desc',
};

export const HOST_PROCESS_SORT_COLUMNS: Array<{
  key: HostProcessSortKey;
  label: string;
}> = [
  { key: 'pid',label: 'PID' },
  { key: 'name',label: 'Name' },
  { key: 'ppid',label: 'Parent PID' },
  { key: 'threads',label: 'Threads' },
  { key: 'user',label: 'User' },
  { key: 'cpu',label: 'CPU' },
  { key: 'memory',label: 'Memory' },
  { key: 'connections',label: 'Connections' },
  { key: 'state',label: 'State' },
  { key: 'startTime',label: 'Start time' },
  { key: 'command',label: 'Command' },
];

export function isHostProcessSortKey(value: unknown): value is HostProcessSortKey {
  return HOST_PROCESS_SORT_COLUMNS.some((column) => column.key === value);
}

/** Toggle: same key flips direction; new key starts desc for metrics, asc for labels. */
export function nextHostProcessSort(
  current: HostProcessSort,
  key: HostProcessSortKey,
): HostProcessSort {
  if (current.key === key) {
    return { key,direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  const metricFirstDesc = key === 'cpu' || key === 'memory' || key === 'connections' || key === 'threads';
  return { key,direction: metricFirstDesc ? 'desc' : 'asc' };
}

export function sortHostProcesses(
  processes: readonly HostProcess[],
  sort: HostProcessSort,
): HostProcess[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...processes].sort((left,right) => {
    const cmp = compareProcessField(left,right,sort.key);
    if (cmp !== 0) return cmp * factor;
    // Stable tie-break by PID then startTicks.
    const pid = (left.pid || 0) - (right.pid || 0);
    if (pid !== 0) return pid;
    return (left.startTicks || 0) - (right.startTicks || 0);
  });
}

function compareProcessField(left: HostProcess,right: HostProcess,key: HostProcessSortKey): number {
  switch (key) {
  case 'pid':
    return (left.pid || 0) - (right.pid || 0);
  case 'ppid':
    return (left.ppid || 0) - (right.ppid || 0);
  case 'threads':
    return (left.threads || 0) - (right.threads || 0);
  case 'cpu':
    return (left.cpuPercent || 0) - (right.cpuPercent || 0);
  case 'memory':
    return (left.memory || 0) - (right.memory || 0);
  case 'connections':
    return (left.connections || 0) - (right.connections || 0);
  case 'name':
    return compareText(left.name,right.name);
  case 'user':
    return compareText(left.user,right.user);
  case 'state':
    return compareText(left.state,right.state);
  case 'command':
    return compareText(left.command,right.command);
  case 'startTime':
    return compareStartTime(left.startTime,right.startTime);
  default:
    return 0;
  }
}

function compareText(left: string | undefined,right: string | undefined): number {
  return (left || '').localeCompare(right || '',undefined,{ sensitivity: 'base',numeric: true });
}

function compareStartTime(left: string | undefined,right: string | undefined): number {
  const a = left ? Date.parse(left) : Number.NaN;
  const b = right ? Date.parse(right) : Number.NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  if (Number.isFinite(a)) return -1;
  if (Number.isFinite(b)) return 1;
  return compareText(left,right);
}
