import { Session } from 'node:inspector/promises';

/**
 * Process CPU time in ms (user + system, all threads, so GC helpers count).
 * Perf hosts are shared: under load, wall time mostly measures waiting for a
 * core, while CPU time still measures the work a change adds or removes.
 */
export function cpuTimeMs() {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}

/** Opt-in: print the top self-time functions of `work` (XGC_PERF_CPU_TOP=N). */
export async function profileCpu<T>(work: () => Promise<T>) {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval',{ interval: 100 });
  await session.post('Profiler.start');
  const value = await work();
  const { profile } = await session.post('Profiler.stop') as { profile: {
    nodes: { id: number;hitCount: number;callFrame: { functionName: string;url: string;lineNumber: number } }[];
    startTime: number;endTime: number;samples: number[];
  } };
  const intervalMs = (profile.endTime - profile.startTime) / 1000 / Math.max(1,profile.samples.length);
  const self = new Map<string,number>();
  profile.nodes.forEach((node) => {
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'} ${frame.url.replace(/^.*\/web\//,'')}:${frame.lineNumber + 1}`;
    self.set(key,(self.get(key) ?? 0) + node.hitCount * intervalMs);
  });
  const top = [...self.entries()].sort((a,b) => b[1] - a[1]).slice(0,Number(process.env.XGC_PERF_CPU_TOP) || 30);
  process.stdout.write(`cpu self time:\n${top.map(([site,ms]) => `  ${ms.toFixed(1).padStart(8)} ms ${site}`).join('\n')}\n`);
  await session.post('Profiler.disable');
  session.disconnect();
  return value;
}
