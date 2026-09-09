import {
  EmptyState,
  OperatorWorkspace,
  Panel,
  SettingRow,
  SettingsList,
  Stack,
  Toolbar,
  useConfirmationDialog,
} from '@xgc2/ui-react';
import { RefreshCw,ShieldCheck,Trash2 } from 'lucide-react';
import { useMemo,type ReactNode } from 'react';
import { useDeferRouteReady } from '../../shared/routeReady';
import type { ApiTargetOptions } from '../../api/http';
import { ControlButton } from '../../components/controls/ControlButton';
import { SortableDataTable } from '../../components/SortableDataTable';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import { useExecutionTarget, type ExecutionJob } from '../execution/executionPublic';
import { type HostManagementConnection } from '../host/hostPublic';
import { cleanupScanItemHasContent,type CleanupScanResult } from './toolboxModel';
import {
  activeCleanupJob,
  latestCleanupApply,
  latestCleanupScan,
  useCleanupSession,
} from './useCleanupSession';
import { useMaintenanceCatalog } from './useMaintenanceCatalog';

/** Stable remote jobs reference — never allocate a fresh [] each render. */
const EMPTY_JOBS: ExecutionJob[] = [];

export type ToolboxTab = 'maintenance' | 'cleanup' | 'all';

export function ToolboxPage({
  activeTab,
  targetId,
  targetCoreId,
  language,
  onOpenCleanup,
  managedHostId,
  maintenanceEnabled = true,
  requestsAllowed = true,
  managementConnection = 'ready',
  performanceControl,
}: {
  activeTab: ToolboxTab;
  targetId: string;
  targetCoreId?: string;
  language: AppLanguage;
  /** Opens the cache-cleanup workspace (sidebar section). */
  onOpenCleanup?: () => void;
  /** Remote Agent host id. Local omits this and keeps the durable job flow. */
  managedHostId?: string;
  /** Exact maintenanceCleanup membership. Remote false → fail closed, 0 request. */
  maintenanceEnabled?: boolean;
  /** Automatic/remote actions only when idle/ready. */
  requestsAllowed?: boolean;
  managementConnection?: HostManagementConnection;
  /** Host policy control supplied by the System route; cleanup owns its placement only. */
  performanceControl?: ReactNode;
}) {
  const confirmation = useConfirmationDialog();
  const isRemote = Boolean(managedHostId);
  // Local job feed only — remote never fakes ExecutionJob snapshots or dual-sends.
  const snapshot = useExecutionTarget(targetId, !isRemote);
  const apiTarget = useMemo<ApiTargetOptions>(() => ({
    ...(targetCoreId ? { targetCoreId } : {}),
    ...(managedHostId ? { managedHostId } : {}),
  }), [managedHostId,targetCoreId]);
  const targetKey = `${targetCoreId ?? 'local'}\0${managedHostId ?? targetId}`;
  const copy = toolboxCopy[language];
  // Local: durable execution job feed. Remote: empty stable list (no dual-send / fake snapshots).
  const jobs = isRemote ? EMPTY_JOBS : snapshot.jobs;
  const feedScan = useMemo(() => (isRemote ? undefined : latestCleanupScan(jobs)), [isRemote,jobs]);
  const feedApply = useMemo(() => (isRemote ? undefined : latestCleanupApply(jobs)), [isRemote,jobs]);
  const activeJob = useMemo(() => (isRemote ? undefined : activeCleanupJob(jobs)), [isRemote,jobs]);
  const catalogEnabled = maintenanceEnabled && requestsAllowed;
  const catalogNeeded = activeTab === 'maintenance';
  const maintenance = useMaintenanceCatalog(targetKey, apiTarget, { enabled: catalogEnabled && catalogNeeded });
  useDeferRouteReady(catalogEnabled && catalogNeeded && maintenance.loading && !maintenance.error);
  const cleanup = useCleanupSession({
    targetId,
    sessionKey: targetKey,
    apiTarget,
    scan: feedScan,
    activeJob,
    remote: managedHostId ? { managedHostId } : undefined,
    requestsAllowed: catalogEnabled,
  });
  const scan = cleanup.scan ?? feedScan;
  const apply = cleanup.apply ?? feedApply;
  const remoteCapable = isRemote && maintenanceEnabled;
  const canScan = catalogEnabled;
  const canApply = catalogEnabled;
  const supportsCleanup = remoteCapable || (maintenance.supports('cleanup.scan') && maintenance.supports('cleanup.apply'));
  const scanBusy = cleanup.busyAction === 'scan';
  const applyBusy = cleanup.busyAction === 'apply';
  const scanFailed = Boolean(cleanup.error) && cleanup.errorAction === 'scan' && !scanBusy;
  const applyFailed = Boolean(cleanup.error) && cleanup.errorAction === 'apply' && !applyBusy;
  const cleanableItems = scan?.result.items.filter(cleanupScanItemHasContent) ?? [];
  const selectedByteTotal = selectedBytes(scan?.result, cleanup.selectedIds);
  const actionsDisabled = !catalogEnabled || Boolean(cleanup.busyAction);

  async function submit(action: 'scan' | 'apply') {
    if (!catalogEnabled) return;
    if (action === 'apply' && (!scan || cleanup.selectedIds.length === 0)) return;
    if (action === 'apply' && !await confirmation.confirm({
      title: copy.clean,
      message: copy.confirmApply
        .replace('{count}', String(cleanup.selectedIds.length))
        .replace('{size}', formatBytes(selectedByteTotal)),
      confirmLabel: copy.clean,
    })) return;
    await cleanup.submit(action);
  }

  if (isRemote && !maintenanceEnabled) {
    return (
      <OperatorWorkspace className="toolbox-page xgc-workspace-full-span" padding="none" data-xgc-role="toolbox-page" data-xgc-id={targetId} data-xgc-remote="true" data-xgc-maintenance="disabled">
        {performanceControl ? <Toolbar className="toolbox-toolbar">{performanceControl}</Toolbar> : null}
        <EmptyState
          density="compact"
          title={copy.maintenanceUnavailable}
          description={copy.maintenanceUnavailableHint}
          data-xgc-role="toolbox-maintenance-unavailable" data-xgc-id="toolbox-maintenance-unavailable"
        />
      </OperatorWorkspace>
    );
  }

  return (
    <OperatorWorkspace
      className="toolbox-page xgc-workspace-full-span"
      padding="none"
      data-xgc-role="toolbox-page"
      data-xgc-id={targetId}
      data-xgc-remote={isRemote ? 'true' : undefined}
      data-xgc-management-connection={managementConnection}
      data-xgc-requests={requestsAllowed ? 'allowed' : 'blocked'}
    >
      {activeTab === 'maintenance' && (
        <MaintenanceCatalog
          available={supportsCleanup}
          loading={catalogEnabled && maintenance.loading}
          copy={copy}
          onOpenCleanup={onOpenCleanup}
          actionsEnabled={catalogEnabled}
        />
      )}
      {(activeTab === 'cleanup' || activeTab === 'all') && (
        <Panel
          bodyLayout="column"
          chrome="flat"
          className="toolbox-section"
          data-xgc-role="cleanup-section" data-xgc-id="cleanup-section"
          padding="none"
          fill
        >
          <Stack className="toolbox-cleanup-layout" gap="none">
            <Toolbar className="toolbox-toolbar">
              {performanceControl}
              {(cleanableItems.length > 0 || apply) && (
                <p className="toolbox-summary" data-xgc-role="cleanup-summary" data-xgc-id="cleanup-summary">
                  {cleanableItems.length > 0 && (
                    <>
                      <span className="toolbox-summary-item">
                        <span>{copy.cleanableSize}</span>
                        <strong>{formatBytes(scan?.result.totalBytes ?? 0)}</strong>
                      </span>
                      <span className="toolbox-summary-item">
                        <span>{copy.entries}</span>
                        <strong>{cleanableItems.reduce((total, item) => total + item.entryCount, 0)}</strong>
                      </span>
                      <span>{cleanup.selectedIds.length} {copy.selected}</span>
                    </>
                  )}
                  {apply && (
                    <>
                      <span className="toolbox-summary-item">
                        <span>{copy.lastCleaned}</span>
                        <strong>{formatBytes(apply.result.totalBytes)}</strong>
                      </span>
                      <span className="toolbox-summary-item">
                        <span>{copy.removedEntries}</span>
                        <strong>{apply.result.totalItems}</strong>
                      </span>
                    </>
                  )}
                </p>
              )}
              <div className="toolbox-actions" data-xgc-role="cleanup-actions" data-xgc-id="cleanup-actions">
                <ControlButton
                  size="compact"
                  dataXgcRole="cleanup-scan" dataXgcId="cleanup-scan"
                  disabled={actionsDisabled || !canScan}
                  aria-busy={scanBusy || undefined}
                  aria-invalid={scanFailed || undefined}
                  data-xgc-failed={scanFailed ? 'true' : undefined}
                  title={scanFailed ? cleanup.error : (!requestsAllowed ? copy.offlineHint.replace('{state}', managementConnection) : undefined)}
                  onClick={() => void submit('scan')}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {copy.scan}
                </ControlButton>
                <ControlButton
                  tone="danger"
                  size="compact"
                  dataXgcRole="cleanup-apply" dataXgcId="cleanup-apply"
                  disabled={!scan || cleanup.selectedIds.length === 0 || actionsDisabled || !canApply}
                  aria-busy={applyBusy || undefined}
                  aria-invalid={applyFailed || undefined}
                  data-xgc-failed={applyFailed ? 'true' : undefined}
                  title={applyFailed ? cleanup.error : undefined}
                  onClick={() => void submit('apply')}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {copy.clean}
                </ControlButton>
              </div>
            </Toolbar>

            <CleanupEntriesTable
              actionsDisabled={actionsDisabled}
              copy={copy}
              items={cleanableItems}
              scanDigest={scan?.result.scanDigest}
              selectedIds={cleanup.selectedIds}
              onSelectIds={cleanup.selectIds}
              onToggleSelected={cleanup.toggleSelected}
            />
          </Stack>
        </Panel>
      )}
      {confirmation.dialog}
    </OperatorWorkspace>
  );
}

function CleanupEntriesTable({
  actionsDisabled,
  copy,
  items,
  scanDigest,
  selectedIds,
  onSelectIds,
  onToggleSelected,
}: {
  actionsDisabled: boolean;
  copy: ToolboxCopy;
  items: CleanupScanResult['items'];
  scanDigest?: string;
  selectedIds: string[];
  onSelectIds: (ids: ReadonlySet<string>) => void;
  onToggleSelected: (id: string) => void;
}) {
  return (
    <div
      className="toolbox-table-region"
      data-xgc-role="cleanup-scan-result"
      data-xgc-surface="page"
      data-xgc-id={scanDigest}
    >
      <SortableDataTable
        className="toolbox-cleanup-table-shell"
        bodyScroll
        bodyScrollLabel="Table rows"
        columns={[
          {
            id: 'name',header: copy.entryName,sortable: true,sortValue: (item) => item.name,
            cell: (item) => (
              <span className="toolbox-cleanup-name" title={item.description || item.id}>
                {item.name}
              </span>
            ),
          },
          {
            id: 'entries',header: copy.entries,className: 'toolbox-cleanup-count',sortable: true,
            sortValue: (item) => item.entryCount,cell: (item) => item.entryCount,
          },
          {
            id: 'size',header: copy.size,className: 'toolbox-cleanup-size',sortable: true,
            sortValue: (item) => item.sizeBytes,cell: (item) => formatBytes(item.sizeBytes),
          },
        ]}
        data-xgc-role="cleanup-entry-table" data-xgc-id="cleanup-entry-table"
        emptyMode="table"
        getRowProps={(item) => ({
          'data-xgc-role': 'cleanup-entry',
          'data-xgc-id': item.id,
          'data-xgc-selected': selectedIds.includes(item.id) ? 'true' : undefined,
          title: item.description || item.id,
          onClick: () => {
            if (!actionsDisabled) onToggleSelected(item.id);
          },
        })}
        rowKey={(item) => item.id}
        rows={items}
        selection={{
          // No cleanable rows → keep the bulk control inert like the shared
          // empty-state contract expects; nothing can be selected anyway.
          disabled: actionsDisabled || items.length === 0,
          getRowLabel: (item) => `${copy.selected}: ${item.name}`,
          onChange: onSelectIds,
          rowHeaderLabel: copy.selectAll,
          selectedRowKeys: new Set(selectedIds),
        }}
        tableProps={{ className: 'toolbox-cleanup-table' }}
      />
    </div>
  );
}

function MaintenanceCatalog({
  available,
  loading,
  copy,
  onOpenCleanup,
  actionsEnabled,
}: {
  available: boolean;
  loading: boolean;
  copy: ToolboxCopy;
  onOpenCleanup?: () => void;
  actionsEnabled: boolean;
}) {
  return (
    <Panel
      bodyLayout="column"
      className="toolbox-section"
      title={copy.maintenanceTitle}
      description={copy.maintenanceDescription}
      data-xgc-role="maintenance-catalog" data-xgc-id="maintenance-catalog"
    >
      {!loading && !available ? (
        <EmptyState
          density="compact"
          appearance="plain"
          title={copy.noMaintenance}
          description={copy.registeredOnly}
        />
      ) : null}
      {!loading && available && (
        <SettingsList>
          <SettingRow
            data-xgc-role="maintenance-capability"
            data-xgc-id="cache-cleanup"
            title={(
              <span className="toolbox-capability-title">
                <ShieldCheck size={16} aria-hidden="true" />
                {copy.cleanupCapability}
              </span>
            )}
            description={copy.cleanupCapabilityDescription}
            actions={onOpenCleanup ? (
              <ControlButton dataXgcRole="open-cleanup" dataXgcId="open-cleanup" disabled={!actionsEnabled} onClick={onOpenCleanup}>
                {copy.openCleanup}
              </ControlButton>
            ) : undefined}
          />
        </SettingsList>
      )}
    </Panel>
  );
}

function selectedBytes(result: CleanupScanResult | undefined, selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return result?.items.reduce((total, item) => total + (selected.has(item.id) ? item.sizeBytes : 0), 0) ?? 0;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

type ToolboxCopy = { [Key in keyof typeof toolboxCopy['en-US']]: string };
const toolboxCopy = {
  'en-US': {
    maintenanceTitle: 'Registered maintenance',
    maintenanceDescription: 'Built-in maintenance handlers registered on this target. Paths and actions are server-defined; operators cannot add custom scripts here.',
    scan: 'Scan',
    scanning: 'Scanning…',
    clean: 'Clean',
    cleaning: 'Cleaning…',
    selectAll: 'Select all',
    clearSelection: 'Clear selection',
    cleanableSize: 'Cleanable size',
    entries: 'Entries',
    entryName: 'Name',
    size: 'Size',
    selected: 'selected',
    lastCleaned: 'Last cleaned',
    removedEntries: 'Removed entries',
    groups: 'groups',
    latestScan: 'Latest completed scan',
    latestClean: 'Latest completed clean',
    noScan: 'No completed scan',
    emptyScan: 'Nothing cleanable',
    emptyScanHint: 'No ROS logs or Agent cache/tmp to remove. Workspace source, packages, and identity files are never scanned.',
    scanHint: 'Run a scan before selecting entries.',
    scanInProgress: 'Cleanup scan in progress',
    cleanInProgress: 'Cleanup in progress',
    cleanupCapability: 'Storage cleanup',
    cleanupCapabilityDescription: 'Scan ROS session logs and Agent cache/tmp, then clean the groups you select.',
    openCleanup: 'Open cleanup',
    noMaintenance: 'No maintenance capabilities',
    registeredOnly: 'Maintenance capabilities available on this target appear here.',
    confirmApply: 'Clean {count} registered entries ({size})?',
    cleanupFailed: 'Cleanup failed',
    dismiss: 'OK',
    maintenanceUnavailable: 'Maintenance unavailable',
    maintenanceUnavailableHint: 'This Agent did not advertise the maintenanceCleanup system service.',
    offlineHint: 'Agent connection is {state}. Maintenance membership is enabled, but automatic requests are suppressed until idle or ready.',
  },
  'zh-CN': {
    maintenanceTitle: '已注册维护能力',
    maintenanceDescription: '当前目标上已注册的内置维护能力。路径与动作由服务端定义，操作员不能在此添加自定义脚本。',
    scan: '扫描',
    scanning: '扫描中…',
    clean: '清理',
    cleaning: '清理中…',
    selectAll: '全选',
    clearSelection: '清除选择',
    cleanableSize: '可清理大小',
    entries: '条目',
    entryName: '名称',
    size: '大小',
    selected: '已选择',
    lastCleaned: '最近清理',
    removedEntries: '已删除条目',
    groups: '组',
    latestScan: '最近完成的扫描',
    latestClean: '最近完成的清理',
    noScan: '尚无已完成扫描',
    emptyScan: '没有可清理内容',
    emptyScanHint: '没有可删的 ROS 日志或 Agent cache/tmp。工作空间源码、安装包和身份文件不会进扫描。',
    scanHint: '先执行扫描，再选择清理项。',
    scanInProgress: '清理扫描进行中',
    cleanInProgress: '清理进行中',
    cleanupCapability: '空间清理',
    cleanupCapabilityDescription: '扫描 ROS 会话日志和 Agent cache/tmp，并清理你选择的分组。',
    openCleanup: '打开清理',
    noMaintenance: '没有维护能力',
    registeredOnly: '当前目标可用的维护能力会显示在这里。',
    confirmApply: '确认清理 {count} 个已注册条目（{size}）？',
    cleanupFailed: '清理失败',
    dismiss: '知道了',
    maintenanceUnavailable: '维护不可用',
    maintenanceUnavailableHint: '此 Agent 未声明 maintenanceCleanup 系统服务。',
    offlineHint: 'Agent 连接状态为 {state}。维护成员资格已启用，但在 idle/ready 前不会自动请求。',
  },
} as const;
