import { describe,expect,it } from 'vitest';
import type { HostProcess } from './hostModel';
import {
  DEFAULT_HOST_PROCESS_SORT,
  nextHostProcessSort,
  sortHostProcesses,
} from './hostProcessListModel';

function proc(partial: Partial<HostProcess> & { pid: number;name: string }): HostProcess {
  return {
    startTicks: partial.startTicks ?? 1,
    ppid: partial.ppid ?? 1,
    threads: partial.threads ?? 1,
    user: partial.user ?? 'u',
    cpuPercent: partial.cpuPercent ?? 0,
    state: partial.state ?? 'S',
    cpuTime: '',
    memory: partial.memory ?? 0,
    connections: partial.connections ?? 0,
    startTime: partial.startTime ?? '',
    command: partial.command ?? partial.name,
    ...partial,
  };
}

describe('hostProcessListModel', () => {
  it('defaults to CPU descending for Runtime ops', () => {
    expect(DEFAULT_HOST_PROCESS_SORT).toEqual({ key: 'cpu',direction: 'desc' });
  });

  it('toggles direction on the same key and picks metric-first desc for new metric keys', () => {
    const cpuDesc = DEFAULT_HOST_PROCESS_SORT;
    expect(nextHostProcessSort(cpuDesc,'cpu')).toEqual({ key: 'cpu',direction: 'asc' });
    expect(nextHostProcessSort(cpuDesc,'name')).toEqual({ key: 'name',direction: 'asc' });
    expect(nextHostProcessSort(cpuDesc,'memory')).toEqual({ key: 'memory',direction: 'desc' });
  });

  it('sorts by CPU and memory with PID tie-break', () => {
    const rows = [
      proc({ pid: 2,name: 'b',cpuPercent: 1,memory: 10 }),
      proc({ pid: 1,name: 'a',cpuPercent: 5,memory: 1 }),
      proc({ pid: 3,name: 'c',cpuPercent: 5,memory: 100 }),
    ];
    const byCpu = sortHostProcesses(rows,{ key: 'cpu',direction: 'desc' });
    expect(byCpu.map((row) => row.pid)).toEqual([1,3,2]); // cpu 5 tie → pid 1 then 3
    const byMem = sortHostProcesses(rows,{ key: 'memory',direction: 'desc' });
    expect(byMem.map((row) => row.pid)).toEqual([3,2,1]);
  });

  it('sorts names case-insensitively', () => {
    const rows = [
      proc({ pid: 1,name: 'zeta' }),
      proc({ pid: 2,name: 'Alpha' }),
      proc({ pid: 3,name: 'beta' }),
    ];
    expect(sortHostProcesses(rows,{ key: 'name',direction: 'asc' }).map((row) => row.name))
      .toEqual(['Alpha','beta','zeta']);
  });
});
