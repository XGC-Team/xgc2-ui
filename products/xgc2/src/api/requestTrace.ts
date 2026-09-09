export type CoreRequestTrace = {
  method: string;
  path: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status?: number;
  outcome: 'succeeded' | 'failed' | 'cancelled';
  requestId?: string;
  commandId?: string;
  targetCoreId?: string;
  managedHostId?: string;
};

type PendingCoreRequestTrace = {
  method: string;
  path: string;
  startedAt: string;
  startedAtMs: number;
  targetCoreId?: string;
  managedHostId?: string;
};

const MAX_RETAINED_TRACES = 50;
const traces: CoreRequestTrace[] = [];

export function beginCoreRequestTrace(input: {
  method?: string;
  path: string;
  targetCoreId?: string;
  managedHostId?: string;
}): PendingCoreRequestTrace {
  const startedAtMs = Date.now();
  return {
    method: (input.method?.trim() || 'GET').toUpperCase().slice(0, 16),
    path: safeCoreRequestPath(input.path),
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    targetCoreId: bounded(input.targetCoreId, 200),
    managedHostId: bounded(input.managedHostId, 200),
  };
}

export function completeCoreRequestTrace(
  pending: PendingCoreRequestTrace,
  result: {
    outcome: CoreRequestTrace['outcome'];
    status?: number;
    requestId?: string | null;
    commandId?: string | null;
  },
): CoreRequestTrace {
  const completedAtMs = Date.now();
  const trace: CoreRequestTrace = {
    method: pending.method,
    path: pending.path,
    startedAt: pending.startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - pending.startedAtMs),
    outcome: result.outcome,
    ...(Number.isInteger(result.status) && Number(result.status) >= 0
      ? { status: Number(result.status) }
      : {}),
    ...(bounded(result.requestId ?? undefined, 300) ? { requestId: bounded(result.requestId ?? undefined, 300) } : {}),
    ...(bounded(result.commandId ?? undefined, 300) ? { commandId: bounded(result.commandId ?? undefined, 300) } : {}),
    ...(pending.targetCoreId ? { targetCoreId: pending.targetCoreId } : {}),
    ...(pending.managedHostId ? { managedHostId: pending.managedHostId } : {}),
  };
  traces.push(trace);
  if (traces.length > MAX_RETAINED_TRACES) traces.splice(0, traces.length - MAX_RETAINED_TRACES);
  return trace;
}

export function recentCoreRequestTraces(options: { limit?: number;sinceMs?: number } = {}): CoreRequestTrace[] {
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 20), MAX_RETAINED_TRACES));
  const since = Date.now() - Math.max(0, options.sinceMs ?? 2 * 60_000);
  return traces
    .filter((trace) => Date.parse(trace.startedAt) >= since)
    .slice(-limit)
    .map((trace) => ({ ...trace }));
}

export function clearCoreRequestTracesForTest(): void {
  traces.splice(0, traces.length);
}

export function safeCoreRequestPath(value: string): string {
  const raw = value.trim() || '/';
  try {
    const url = new URL(raw, 'http://xgc.local');
    return bounded(url.pathname, 2_000) || '/';
  } catch {
    const withoutQuery = raw.split(/[?#]/, 1)[0] || '/';
    return bounded(withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`, 2_000) || '/';
  }
}

function bounded(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}
