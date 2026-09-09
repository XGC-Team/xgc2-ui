import { RefreshCw } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SearchControl } from '../../components/controls/TextControls';
import { EmptyState } from '@xgc2/ui-react';
import { InstalledCard,StoreCard } from './AppStoreCards';
import { latestAppDetail,type AppStoreCatalogTab } from './appStoreCatalogModel';
import type { AppStoreApp,AppStoreDetail,AppStoreInstall,AppStoreInstallOperation } from './appStoreModel';

export function AppStoreCatalogSearch({
  query,
  syncing,
  onQueryChange,
  onSync,
}: {
  query: string;
  syncing: boolean;
  onQueryChange: (query: string) => void;
  onSync: () => void;
}) {
  return (
    <div className="app-store-search" data-xgc-role="app-store-search" data-xgc-id="app-store-search">
      <SearchControl value={query} onChange={onQueryChange} placeholder="Search apps" dataXgcRole="app-store-query" dataXgcId="app-store-query" />
      <ControlButton iconOnly aria-label="Sync remote app catalog" disabled={syncing} onClick={onSync} dataXgcRole="app-store-sync" dataXgcId="app-store-sync">
        <RefreshCw size={15} aria-hidden="true" />
      </ControlButton>
    </div>
  );
}

export function AppStoreCatalogGrid({
  tab,
  availableApps,
  activeInstalls,
  updateApps,
  apps,
  details,
  visibleInstallStateByKey,
  blockingInstallByKey,
  isInstallOperationBusy,
  emptyState,
  onClearFilters,
  onOpenDetail,
  onInstall,
  onOperate,
  onOpenInstalled,
  onShowDiff,
  onUninstall,
}: {
  tab: AppStoreCatalogTab;
  availableApps: AppStoreApp[];
  activeInstalls: AppStoreInstall[];
  updateApps: AppStoreApp[];
  apps: AppStoreApp[];
  details: AppStoreDetail[];
  visibleInstallStateByKey: Map<string,AppStoreInstall>;
  blockingInstallByKey: Map<string,AppStoreInstall>;
  isInstallOperationBusy: (id: string) => boolean;
  emptyState: { state: string; reason: string; hasFilters: boolean };
  onClearFilters: () => void;
  onOpenDetail: (app: AppStoreApp) => void;
  onInstall: (app: AppStoreApp, version?: string) => void;
  onOperate: (id: string, operation: AppStoreInstallOperation, version?: string) => void;
  onOpenInstalled: (install: AppStoreInstall) => void;
  onShowDiff: (install: AppStoreInstall, version?: string) => void;
  onUninstall: (install: AppStoreInstall) => void;
}) {
  if (tab === 'available') {
    const empty = availableApps.length === 0;
    return (
      <div
        className="app-store-card-grid"
        data-xgc-role="app-store-catalog" data-xgc-id="app-store-catalog"
        data-xgc-view="available"
        data-xgc-empty={empty ? 'true' : undefined}
      >
        {availableApps.map((app) => (
          <StoreCard
            key={app.key}
            app={app}
            installed={visibleInstallStateByKey.get(app.key)}
            onOpenDetail={() => onOpenDetail(app)}
            onInstall={() => onInstall(app)}
          />
        ))}
        {empty && emptyState.state !== 'loading' && (
          <AppStoreEmptyState
            title={availableEmptyTitle(emptyState.state, emptyState.reason)}
            action={emptyState.hasFilters && emptyState.reason === 'filtered' ? 'Clear filters' : undefined}
            state={emptyState.state}
            onAction={onClearFilters}
          />
        )}
      </div>
    );
  }

  if (tab === 'installed') {
    const empty = activeInstalls.length === 0;
    return (
      <div
        className="app-store-card-grid"
        data-xgc-role="app-store-catalog" data-xgc-id="app-store-catalog"
        data-xgc-view="installed"
        data-xgc-empty={empty ? 'true' : undefined}
      >
        {activeInstalls.map((install) => (
          <InstalledCard
            key={install.id}
            install={install}
            busy={isInstallOperationBusy(install.id)}
            app={apps.find((item) => item.key === install.appKey)}
            latestDetail={latestAppDetail(details, install.appKey)}
            onOperate={onOperate}
            onOpenParams={() => onOpenInstalled(install)}
            onShowDiff={(version) => onShowDiff(install, version)}
            onUninstall={() => onUninstall(install)}
          />
        ))}
        {empty && <AppStoreEmptyState title="No installed apps" />}
      </div>
    );
  }

  const empty = updateApps.length === 0;
  return (
    <div
      className="app-store-card-grid"
      data-xgc-role="app-store-catalog" data-xgc-id="app-store-catalog"
      data-xgc-view="updates"
      data-xgc-empty={empty ? 'true' : undefined}
    >
      {updateApps.map((app) => {
        const install = blockingInstallByKey.get(app.key);
        const version = latestAppDetail(details, app.key)?.version;
        return (
          <StoreCard
            key={app.key}
            app={app}
            installed={install}
            busy={Boolean(install && isInstallOperationBusy(install.id))}
            onOpenDetail={() => onOpenDetail(app)}
            onInstall={() => install && onOperate(install.id, 'upgrade', version)}
            update
          />
        );
      })}
      {empty && <AppStoreEmptyState title="No updates available" />}
    </div>
  );
}

function AppStoreEmptyState({ title,action,state = 'empty',onAction }: {
  title: string;
  action?: string;
  state?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyState
      className="app-store-card-empty"
      title={title}
      appearance="plain"
      fill
      actions={action && onAction ? <ControlButton tone="primary" onClick={onAction} dataXgcRole="app-store-empty-action" dataXgcId="app-store-empty-action">{action}</ControlButton> : undefined}
      data-xgc-role="app-store-empty-state"
      data-xgc-id={state}
    />
  );
}

function availableEmptyTitle(state: string, reason: string) {
  if (state === 'syncing') return 'Syncing app catalog';
  if (reason === 'filtered') return 'No apps match filters';
  return 'No available apps';
}
