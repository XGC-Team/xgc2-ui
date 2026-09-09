import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import { executionRequestId,type ExecutionJob } from '../execution/executionPublic';
import {
  isActiveCleanupJobStatus,
  cleanupScanItemHasContent,
  parseCleanupApplyResult,
  remoteOperationToApplyResult,
  remoteScanToCleanupResult,
  type CleanupApplyResult,
  type CleanupScanResult,
} from './toolboxModel';
import { submitCleanupAction,submitRemoteCleanupAction } from './toolboxService';

export type CleanupScan = { result: CleanupScanResult; jobId: string; finishedAt?: string };
export type CleanupApply = { result: CleanupApplyResult; jobId: string; finishedAt?: string };
export type ActiveCleanupJob = { id: string; kind: 'cleanup.scan' | 'cleanup.apply'; status: ExecutionJob['status'] };
type CleanupAction = 'scan' | 'apply';
type CleanupOperationState = {
  sessionKey: string;
  busyAction: CleanupAction | '';
  error: string;
  errorAction: CleanupAction | '';
};

export function useCleanupSession({
  targetId,
  sessionKey,
  apiTarget,
  scan: feedScan,
  activeJob,
  remote,
  requestsAllowed = true,
}: {
  targetId: string;
  sessionKey: string;
  apiTarget: ApiTargetOptions;
  scan: CleanupScan | undefined;
  activeJob?: ActiveCleanupJob;
  /** When set, uses direct remote toolbox API with managedHostId (no jobs). */
  remote?: { managedHostId: string };
  requestsAllowed?: boolean;
}) {
  const isRemote = Boolean(remote?.managedHostId);
  const [remoteScan,setRemoteScan] = useState<CleanupScan | undefined>(undefined);
  const [remoteApply,setRemoteApply] = useState<CleanupApply | undefined>(undefined);

  // Target switch clears transient remote scan/selection/result.
  useEffect(() => {
    if (!isRemote) return;
    setRemoteScan(undefined);
    setRemoteApply(undefined);
  }, [isRemote,sessionKey]);

  const scan = isRemote ? remoteScan : feedScan;
  const scanKey = `${sessionKey}\0${scan?.result.scanDigest ?? ''}`;
  const allItemIds = useMemo(() => (
    scan?.result.items.filter(cleanupScanItemHasContent).map((item) => item.id) ?? []
  ), [scan]);
  const defaultSelectedIds = useMemo(() => (
    scan?.result.items
      .filter((item) => cleanupScanItemHasContent(item) && item.selectedByDefault !== false)
      .map((item) => item.id) ?? []
  ), [scan]);
  const [selection,setSelection] = useState({ scanKey,ids: defaultSelectedIds });
  const selectedIds = selection.scanKey === scanKey ? selection.ids : defaultSelectedIds;
  const operationRef = useRef({ sessionKey,generation: 0,inFlight: false });
  if (operationRef.current.sessionKey !== sessionKey) {
    operationRef.current = { sessionKey,generation: operationRef.current.generation + 1,inFlight: false };
  }
  const [operation,setOperation] = useState<CleanupOperationState>({
    sessionKey,busyAction: '',error: '',errorAction: '',
  });
  const currentOperation = operation.sessionKey === sessionKey
    ? operation
    : { sessionKey,busyAction: '' as const,error: '',errorAction: '' as const };
  const jobBusyAction: CleanupAction | '' = !isRemote && activeJob
    ? (activeJob.kind === 'cleanup.scan' ? 'scan' : 'apply')
    : '';
  const busyAction = currentOperation.busyAction || jobBusyAction;

  useEffect(() => {
    setSelection((current) => current.scanKey === scanKey
      ? current
      : { scanKey,ids: defaultSelectedIds });
  }, [defaultSelectedIds,scanKey]);

  useEffect(() => () => {
    operationRef.current.generation += 1;
    operationRef.current.inFlight = false;
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelection((current) => {
      const ids = current.scanKey === scanKey ? current.ids : defaultSelectedIds;
      return {
        scanKey,
        ids: ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids,id],
      };
    });
  }, [defaultSelectedIds,scanKey]);

  const selectIds = useCallback((ids: ReadonlySet<string>) => {
    setSelection({ scanKey,ids: allItemIds.filter((id) => ids.has(id)) });
  }, [allItemIds,scanKey]);

  const submit = useCallback(async (action: CleanupAction) => {
    if (operationRef.current.sessionKey !== sessionKey) return undefined;
    if (operationRef.current.inFlight) return undefined;
    if (!requestsAllowed) return undefined;
    if (!isRemote && activeJob) return undefined;
    if (action === 'apply' && (!scan || selectedIds.length === 0)) return undefined;
    const generation = operationRef.current.generation + 1;
    operationRef.current = { sessionKey,generation,inFlight: true };
    setOperation({ sessionKey,busyAction: action,error: '',errorAction: '' });
    try {
      const requestId = executionRequestId(`cleanup.${action}`, isRemote ? remote!.managedHostId : targetId);
      if (isRemote && remote) {
        const response = await submitRemoteCleanupAction({
          action,
          ...(action === 'apply' && scan ? { ids: selectedIds,scanDigest: scan.result.scanDigest } : {}),
          requestId,
          idempotencyKey: requestId,
          reason: action === 'scan' ? 'operator cleanup scan' : 'operator cleanup apply',
        }, { ...apiTarget,managedHostId: remote.managedHostId });
        if (!isCurrent()) return undefined;
        if (response.action === 'scan') {
          const result = remoteScanToCleanupResult(response.scan);
          setRemoteScan({ result, jobId: `remote-scan:${result.scanDigest}`, finishedAt: response.scan.collectedAt });
          setRemoteApply(undefined);
        } else {
          const digest = scan?.result.scanDigest ?? '';
          if (response.operation.status === 'failed' || response.operation.status === 'error') {
            throw new Error(response.operation.message || `Cleanup operation ${response.operation.status}`);
          }
          if (response.operation.message && /stale|digest/i.test(response.operation.message) && response.operation.status !== 'succeeded' && response.operation.status !== 'completed') {
            throw new Error(response.operation.message);
          }
          setRemoteApply({
            result: remoteOperationToApplyResult(response.operation, digest),
            jobId: response.operation.operationId || `remote-apply:${digest}`,
            finishedAt: response.operation.updatedAt,
          });
        }
        setOperation({ sessionKey,busyAction: '',error: '',errorAction: '' });
        return undefined;
      }
      await submitCleanupAction({
        targetId,
        action,
        ...(action === 'apply' && scan ? { ids: selectedIds,scanDigest: scan.result.scanDigest } : {}),
        requestId,
        idempotencyKey: requestId,
        reason: action === 'scan' ? 'operator cleanup scan' : 'operator cleanup apply',
      }, apiTarget);
      if (isCurrent()) setOperation({ sessionKey,busyAction: '',error: '',errorAction: '' });
      return undefined;
    } catch (cause) {
      const error = messageOf(cause);
      if (isCurrent()) setOperation({ sessionKey,busyAction: '',error,errorAction: action });
      return error;
    } finally {
      if (isCurrent()) operationRef.current.inFlight = false;
    }

    function isCurrent() {
      return operationRef.current.sessionKey === sessionKey
        && operationRef.current.generation === generation;
    }
  }, [activeJob,apiTarget,isRemote,remote,requestsAllowed,scan,selectedIds,sessionKey,targetId]);

  return {
    selectedIds,
    toggleSelected,
    selectIds,
    busyAction,
    error: currentOperation.error,
    errorAction: currentOperation.errorAction,
    submit,
    scan,
    apply: isRemote ? remoteApply : undefined,
    isRemote,
  };
}

export function latestCleanupScan(jobs: ExecutionJob[]): CleanupScan | undefined {
  for (const job of sortJobsNewestFirst(jobs)) {
    if (job.kind !== 'cleanup.scan' || job.status !== 'succeeded') continue;
    const result = parseCleanupScanResult(job.result);
    if (result) return { result, jobId: job.id, finishedAt: job.finishedAt };
  }
  return undefined;
}

export function latestCleanupApply(jobs: ExecutionJob[]): CleanupApply | undefined {
  for (const job of sortJobsNewestFirst(jobs)) {
    if (job.kind !== 'cleanup.apply' || job.status !== 'succeeded') continue;
    const result = parseCleanupApplyResult(job.result);
    if (result) return { result, jobId: job.id, finishedAt: job.finishedAt };
  }
  return undefined;
}

export function activeCleanupJob(jobs: ExecutionJob[]): ActiveCleanupJob | undefined {
  for (const job of sortJobsNewestFirst(jobs)) {
    if ((job.kind !== 'cleanup.scan' && job.kind !== 'cleanup.apply') || !isActiveCleanupJobStatus(job.status)) {
      continue;
    }
    return { id: job.id, kind: job.kind, status: job.status };
  }
  return undefined;
}

function sortJobsNewestFirst(jobs: ExecutionJob[]) {
  return [...jobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseCleanupScanResult(value: unknown): CleanupScanResult | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.scanDigest !== 'string' || !Array.isArray(item.items) || typeof item.totalBytes !== 'number') return undefined;
  const items = item.items.filter((candidate): candidate is CleanupScanResult['items'][number] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const entry = candidate as Record<string, unknown>;
    return typeof entry.id === 'string' && typeof entry.name === 'string' && typeof entry.sizeBytes === 'number' && typeof entry.entryCount === 'number';
  });
  return {
    scanDigest: item.scanDigest,
    totalBytes: item.totalBytes,
    items: items.map((entry) => ({
      ...entry,
      selectedByDefault: typeof entry.selectedByDefault === 'boolean' ? entry.selectedByDefault : undefined,
    })),
  };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
