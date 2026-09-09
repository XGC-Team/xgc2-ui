import type { DataTableSort } from '@xgc2/ui-react';
import type { ProcessDefinition,ProcessInstance } from './executionModel';

export const OPERATIONS_AUDIT_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE = 20;
export const OPERATIONS_AUDIT_ROW_HEIGHT_FALLBACK = 72;
export const OPERATIONS_AUDIT_HEADER_HEIGHT_FALLBACK = 36;
export const OPERATIONS_AUDIT_PAGER_HEIGHT_FALLBACK = 40;

export function isOperationsAuditPageSize(value: unknown): value is number {
  return (OPERATIONS_AUDIT_PAGE_SIZE_OPTIONS as readonly number[]).includes(Number(value));
}

export function operationsAuditPageSizeFromViewport(params: {
  regionHeight: number;
  headerHeight?: number;
  paginationHeight?: number;
  rowHeight?: number;
}) {
  const headerHeight = positiveSize(params.headerHeight, OPERATIONS_AUDIT_HEADER_HEIGHT_FALLBACK);
  const paginationHeight = positiveSize(params.paginationHeight, OPERATIONS_AUDIT_PAGER_HEIGHT_FALLBACK);
  const rowHeight = positiveSize(params.rowHeight, OPERATIONS_AUDIT_ROW_HEIGHT_FALLBACK);
  const available = params.regionHeight - headerHeight - paginationHeight;
  if (!(params.regionHeight > 0) || !(available > 0) || !(rowHeight > 0)) {
    return DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE;
  }
  return Math.max(1, Math.floor(available / rowHeight));
}

export function measureOperationsAuditPageSize(region: HTMLElement) {
  const table = region.querySelector('[data-xgc-role="process-audit-table"]');
  const pager = region.querySelector('[data-xgc-role="operations-audit-pagination"]');
  const header = table?.querySelector('thead');
  const row = table?.querySelector('tbody tr');
  return operationsAuditPageSizeFromViewport({
    regionHeight: region.clientHeight,
    headerHeight: elementHeight(header),
    paginationHeight: elementHeight(pager),
    rowHeight: elementHeight(row),
  });
}

export function sliceAuditPage<T>(rows: readonly T[], page: number, pageSize: number) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.max(1, Math.min(Number.isFinite(page) ? Math.trunc(page) : 1, totalPages));
  const start = (current - 1) * size;
  return { page: current,pageSize: size,total,rows: rows.slice(start, start + size) };
}

export function processAuditProvenance(instance: ProcessInstance) {
  const ownerType = instance.ownerType.trim();
  const ownerId = instance.ownerId.trim();
  const scope = labelledScope(instance.scope);
  let automation = scope.automation || '—';
  let run = scope.run || '—';
  let node = scope.node || '—';
  const normalizedOwner = ownerType.toLowerCase();
  if (automation === '—' && normalizedOwner === 'automation') automation = ownerId || '—';
  if (run === '—' && (normalizedOwner === 'automation-run' || normalizedOwner === 'orchestration-run')) run = ownerId || '—';
  if (node === '—' && (normalizedOwner === 'automation-node' || normalizedOwner === 'orchestration-node')) node = ownerId || '—';
  return {
    automation,
    run,
    node,
    owner: ownerType && ownerId ? `${ownerType} · ${ownerId}` : ownerType || ownerId || '—',
  };
}

export function processHandleLabel(instance: ProcessInstance) {
  const handle = instance.handle;
  if (!handle) return '—';
  const pid = positiveInteger(handle.pid);
  if (pid) return `PID ${pid}`;
  const containerProcess = textValue(handle.containerProcess);
  if (containerProcess) return `Handle ${containerProcess}`;
  const containerId = textValue(handle.containerId);
  if (containerId) return `Container ${containerId}`;
  return 'Managed handle';
}

export function filterAuditProcesses(
  instances: ProcessInstance[],
  definitions: Map<string,ProcessDefinition>,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return instances;
  return instances.filter((instance) => {
    const definition = definitions.get(instance.definitionId);
    const provenance = processAuditProvenance(instance);
    return [
      instance.id,
      instance.targetId,
      instance.definitionId,
      definition?.label,
      instance.driver,
      instance.desiredState,
      instance.observedState,
      processHandleLabel(instance),
      provenance.automation,
      provenance.run,
      provenance.node,
      provenance.owner,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function sortAuditProcesses(
  instances: ProcessInstance[],
  definitions: Map<string,ProcessDefinition>,
  sort?: DataTableSort,
) {
  const rows = [...instances];
  if (!sort) return rows.sort(compareAuditProcesses);
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return rows.sort((left, right) => (
    compareAuditSortValues(
      auditSortValue(left, sort.columnId, definitions),
      auditSortValue(right, sort.columnId, definitions),
    ) * direction || left.id.localeCompare(right.id)
  ));
}

export function processHasLiveUptime(instance: ProcessInstance) {
  return instance.observedState === 'starting'
    || instance.observedState === 'running'
    || instance.observedState === 'stopping';
}

export function compareAuditProcesses(left: ProcessInstance, right: ProcessInstance) {
  const leftActive = processHasLiveUptime(left) ? 0 : 1;
  const rightActive = processHasLiveUptime(right) ? 0 : 1;
  return leftActive - rightActive || left.id.localeCompare(right.id);
}

function auditSortValue(
  instance: ProcessInstance,
  columnId: string,
  definitions: Map<string,ProcessDefinition>,
) {
  const provenance = processAuditProvenance(instance);
  switch (columnId) {
    case 'process':
      return `${instance.id}\n${definitions.get(instance.definitionId)?.label || instance.definitionId}`;
    case 'runtime':
      return processHandleLabel(instance);
    case 'state':
      return `${instance.observedState}\n${instance.desiredState}`;
    case 'provenance':
      return `${provenance.automation}\n${provenance.run}\n${provenance.node}\n${provenance.owner}`;
    case 'started':
      return Date.parse(instance.startedAt ?? '') || 0;
    default:
      return instance.id;
  }
}

function compareAuditSortValues(
  left: Date | number | string | null | undefined,
  right: Date | number | string | null | undefined,
) {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true,sensitivity: 'base' });
}

function labelledScope(scope: string) {
  const parts = scope.split(/[/:=]/).map((part) => part.trim()).filter(Boolean);
  const result: Record<'automation' | 'run' | 'node',string> = { automation: '',run: '',node: '' };
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index].toLowerCase();
    if ((key === 'automation' || key === 'run' || key === 'node') && !result[key]) result[key] = parts[index + 1];
  }
  return result;
}

function positiveInteger(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function positiveSize(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback;
}

function elementHeight(node: Element | null | undefined) {
  return node instanceof HTMLElement ? node.getBoundingClientRect().height : 0;
}
