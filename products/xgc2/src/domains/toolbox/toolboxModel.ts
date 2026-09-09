import type { CommandReceipt,ExecutionJob,JobStatus } from '../execution/executionPublic';

export type MaintenanceDefinition = {
  kind: string;
  parameterSchema: Record<string, unknown>;
  timeout: number;
  retry: Record<string, unknown>;
  recovery: string;
  compensateOnFailure: boolean;
  submission?: {
    automatable?: boolean;
    remoteTransport?: boolean;
    requiredCapabilities?: string[];
    risk?: string;
  };
};

export type CleanupScanItem = {
  id: string;
  name: string;
  description?: string;
  sizeBytes: number;
  entryCount: number;
  selectedByDefault?: boolean;
};

export type CleanupScanResult = {
  scanDigest: string;
  totalBytes: number;
  items: CleanupScanItem[];
};

export function cleanupScanItemHasContent(item: CleanupScanItem) {
  return item.sizeBytes > 0 || item.entryCount > 0;
}

export type CleanupAppliedItem = {
  id: string;
  removedBytes: number;
  removedItems: number;
};

export type CleanupApplyResult = {
  scanDigest: string;
  applied: CleanupAppliedItem[];
  totalBytes: number;
  totalItems: number;
};

export type CleanupActionRequest = {
  targetId: string;
  action: 'scan' | 'apply';
  ids?: string[];
  scanDigest?: string;
  requestId: string;
  idempotencyKey: string;
  reason: string;
};

/** Local durable job accept response (unchanged). */
export type TypedJobResponse = {
  job: ExecutionJob;
  receipt: CommandReceipt;
};

/** Remote Agent maintenance scan payload (managedhosts CleanupScan shape). */
export type RemoteCleanupScan = {
  scanDigest: string;
  entries: RemoteCleanupEntry[];
  collectedAt?: string;
  totalBytes?: number;
};

export type RemoteCleanupEntry = {
  id: string;
  path?: string;
  kind?: string;
  sizeBytes: number;
  selectedByDefault?: boolean;
  name?: string;
  description?: string;
  entryCount?: number;
};

/** Remote Agent maintenance apply payload (managedhosts CleanupOperation shape). */
export type RemoteCleanupOperation = {
  operationId: string;
  status: string;
  message?: string;
  freedBytes?: number;
  updatedAt?: string;
};

export type RemoteCleanupScanResponse = {
  mode: 'remote';
  action: 'scan';
  scan: RemoteCleanupScan;
};

export type RemoteCleanupApplyResponse = {
  mode: 'remote';
  action: 'apply';
  operation: RemoteCleanupOperation;
};

export type RemoteCleanupActionResponse = RemoteCleanupScanResponse | RemoteCleanupApplyResponse;

const ACTIVE_CLEANUP_STATUSES = new Set<JobStatus>(['queued', 'running', 'cancel_requested']);

export function isActiveCleanupJobStatus(status: JobStatus): boolean {
  return ACTIVE_CLEANUP_STATUSES.has(status);
}

export function parseCleanupApplyResult(value: unknown): CleanupApplyResult | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.scanDigest !== 'string' || !Array.isArray(item.applied)) return undefined;
  const applied = item.applied.filter((candidate): candidate is CleanupAppliedItem => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const entry = candidate as Record<string, unknown>;
    return typeof entry.id === 'string'
      && typeof entry.removedBytes === 'number'
      && typeof entry.removedItems === 'number';
  });
  const totalBytes = typeof item.totalBytes === 'number'
    ? item.totalBytes
    : applied.reduce((total, entry) => total + entry.removedBytes, 0);
  const totalItems = typeof item.totalItems === 'number'
    ? item.totalItems
    : applied.reduce((total, entry) => total + entry.removedItems, 0);
  return { scanDigest: item.scanDigest, applied, totalBytes, totalItems };
}

const remoteCleanupNames: Record<string, string> = {
  cache: 'Agent cache',
  tmp: 'Agent tmp',
  'log-cache': 'Agent log-cache',
  'ros-logs': 'ROS logs',
  'xgc-ros-logs': 'XGC ROS logs',
};

/** Project remote Agent scan entries onto the shared cleanup table model. */
export function remoteScanToCleanupResult(scan: RemoteCleanupScan): CleanupScanResult {
  const items: CleanupScanItem[] = (scan.entries ?? []).map((entry) => {
    const sizeBytes = entry.sizeBytes ?? 0;
    return {
      id: entry.id,
      name: entry.name || remoteCleanupNames[entry.id] || entry.path || entry.kind || entry.id,
      description: entry.description || entry.path || entry.kind,
      sizeBytes,
      entryCount: typeof entry.entryCount === 'number' ? entry.entryCount : (sizeBytes > 0 ? 1 : 0),
      selectedByDefault: entry.selectedByDefault,
    };
  });
  const visible = items.filter(cleanupScanItemHasContent);
  const totalBytes = typeof scan.totalBytes === 'number'
    ? scan.totalBytes
    : visible.reduce((total, item) => total + item.sizeBytes, 0);
  return {
    scanDigest: scan.scanDigest,
    totalBytes,
    items,
  };
}

export function remoteOperationToApplyResult(
  operation: RemoteCleanupOperation,
  scanDigest: string,
): CleanupApplyResult {
  const totalBytes = operation.freedBytes ?? 0;
  return {
    scanDigest,
    applied: totalBytes > 0 || operation.status === 'succeeded' || operation.status === 'completed'
      ? [{ id: operation.operationId || 'operation', removedBytes: totalBytes, removedItems: 1 }]
      : [],
    totalBytes,
    totalItems: totalBytes > 0 ? 1 : 0,
  };
}

export function parseRemoteCleanupScan(value: unknown): RemoteCleanupScan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.scanDigest !== 'string') return undefined;
  const rawEntries = Array.isArray(item.entries)
    ? item.entries
    : Array.isArray(item.items)
      ? item.items
      : [];
  const entries: RemoteCleanupEntry[] = [];
  for (const candidate of rawEntries) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const entry = candidate as Record<string, unknown>;
    if (typeof entry.id !== 'string') continue;
    entries.push({
      id: entry.id,
      path: typeof entry.path === 'string' ? entry.path : undefined,
      kind: typeof entry.kind === 'string' ? entry.kind : undefined,
      sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : 0,
      selectedByDefault: entry.selectedByDefault === true,
      name: typeof entry.name === 'string' ? entry.name : undefined,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      entryCount: typeof entry.entryCount === 'number' ? entry.entryCount : undefined,
    });
  }
  return {
    scanDigest: item.scanDigest,
    entries,
    collectedAt: typeof item.collectedAt === 'string' ? item.collectedAt : undefined,
    totalBytes: typeof item.totalBytes === 'number' ? item.totalBytes : undefined,
  };
}

export function parseRemoteCleanupOperation(value: unknown): RemoteCleanupOperation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.operationId !== 'string' && typeof item.status !== 'string') return undefined;
  return {
    operationId: typeof item.operationId === 'string' ? item.operationId : '',
    status: typeof item.status === 'string' ? item.status : 'unknown',
    message: typeof item.message === 'string' ? item.message : undefined,
    freedBytes: typeof item.freedBytes === 'number' ? item.freedBytes : undefined,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  };
}
