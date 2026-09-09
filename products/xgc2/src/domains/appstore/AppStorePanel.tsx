import { useMemo } from 'react';
import type { StatusTone } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useGroundStationNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import { AppStoreCatalogGrid,AppStoreCatalogSearch } from './AppStoreCatalog';
import {
  AppDetailDrawer,
  AppInstallDrawer,
  AppUninstallDrawer,
  InstalledDetailDrawer,
  VersionDiffDrawer,
} from './AppStoreDrawers';
import { useAppStoreCatalogSync } from './useAppStoreCatalogSync';
import { useAppStoreCatalogView } from './useAppStoreCatalogView';
import { useAppStoreInstallOperations } from './useAppStoreInstallOperations';
import { useAppStoreOverlaySession } from './useAppStoreOverlaySession';
import { useAppStoreSnapshot } from './useAppStoreSnapshot';
import './app-store.css';

export function AppStorePanel({ targetId = 'local',targetCoreId }: {
  targetId?: string;
  targetCoreId?: string;
}) {
  const targetKey = `${targetCoreId ?? ''}\u0000${targetId}`;
  return <AppStoreTargetWorkspace key={targetKey} targetId={targetId} targetCoreId={targetCoreId} />;
}

function AppStoreTargetWorkspace({ targetId,targetCoreId }: {
  targetId: string;
  targetCoreId?: string;
}) {
  const apiTarget = useMemo<ApiTargetOptions>(() => targetCoreId ? { targetCoreId } : {}, [targetCoreId]);
  const targetKey = `${targetCoreId ?? ''}\u0000${targetId}`;
  const snapshot = useAppStoreSnapshot({ targetId,targetKey,apiTarget });
  const catalogSync = useAppStoreCatalogSync({
    targetId,
    targetKey,
    apiTarget,
    refreshSnapshot: snapshot.refresh,
  });
  const installOperations = useAppStoreInstallOperations({ targetId,apiTarget });
  const catalogView = useAppStoreCatalogView({
    apps: snapshot.apps,
    details: snapshot.details,
    installed: snapshot.installed,
    initialSnapshotLoading: catalogSync.initialLoading,
    syncing: catalogSync.syncing,
    sync: catalogSync.sync,
  });
  const overlaySession = useAppStoreOverlaySession({
    details: snapshot.details,
    install: installOperations.install,
    operateInstall: installOperations.operate,
    targetId,
    apiTarget,
  });
  const { catalog } = catalogView;
  const installTarget = overlaySession.installTarget;
  const uninstallTarget = overlaySession.uninstallTarget;

  // Shared toast stack only — never insert operator feedback Notices into the page body.
  useGroundStationNotification(targetId, snapshot.error, {
    title: 'App store',severity: 'error',source: 'app-store',dedupeKey: 'app-store:snapshot-error',
  });
  useGroundStationNotification(targetId, catalogSync.feedback?.text ?? '', {
    title: 'App store',
    severity: feedbackSeverity(catalogSync.feedback?.tone),
    source: 'app-store',
    dedupeKey: `app-store:catalog:${catalogSync.feedback?.text ?? ''}`,
  });
  useGroundStationNotification(targetId, installOperations.feedback?.text ?? '', {
    title: 'App store',
    severity: feedbackSeverity(installOperations.feedback?.tone),
    source: 'app-store',
    dedupeKey: `app-store:install:${installOperations.feedback?.text ?? ''}`,
  });
  useGroundStationNotification(targetId, overlaySession.diffError, {
    title: 'App store',severity: 'error',source: 'app-store',dedupeKey: 'app-store:diff-error',
  });

  return (
    <div className="app-store-page xgc-workspace-full-span" data-xgc-role="app-store-page" data-xgc-id="app-store-page">
      <div className="app-store-chrome" data-xgc-role="app-store-chrome" data-xgc-id="app-store-chrome">
        <SegmentedControl
          asTabs
          className="app-store-tabs"
          value={catalogView.tab}
          options={[
            { value: 'available',label: 'Available' },
            { value: 'installed',label: 'Installed' },
            {
              value: 'updates',
              label: catalog.updateApps.length > 0
                ? `Updates ${catalog.updateApps.length}`
                : 'Updates',
            },
          ]}
          onChange={catalogView.setTab}
          ariaLabel="App Store sections"
          dataXgcRole="app-store-tabs" dataXgcId="app-store-tabs"
        />
        <AppStoreCatalogSearch
          query={catalogView.query}
          syncing={catalogSync.syncing}
          onQueryChange={catalogView.setQuery}
          onSync={() => void catalogView.syncCatalog()}
        />
      </div>

      <div className="app-store-body" data-xgc-role="app-store-body" data-xgc-id="app-store-body">
        <AppStoreCatalogGrid
          tab={catalogView.tab}
          availableApps={catalog.availableApps}
          activeInstalls={catalog.activeInstalls}
          updateApps={catalog.updateApps}
          apps={snapshot.apps}
          details={snapshot.details}
          visibleInstallStateByKey={catalog.visibleInstallStateByKey}
          blockingInstallByKey={catalog.blockingInstallByKey}
          isInstallOperationBusy={installOperations.isInstallBusy}
          emptyState={{ state: catalogView.catalogState,reason: catalog.emptyReason,hasFilters: catalog.hasFilters }}
          onClearFilters={catalogView.clearFilters}
          onOpenDetail={overlaySession.setDetailTarget}
          onInstall={overlaySession.openInstall}
          onOperate={(id, operation, version) => void overlaySession.operate(id, operation, version)}
          onOpenInstalled={overlaySession.setInstalledTarget}
          onShowDiff={(install, version) => void overlaySession.showVersionDiff(install, version)}
          onUninstall={overlaySession.setUninstallTarget}
        />
      </div>
      {overlaySession.detailTarget && (
        <AppDetailDrawer
          app={overlaySession.detailTarget}
          onClose={() => overlaySession.setDetailTarget(null)}
          onInstall={() => overlaySession.installFromDetail()}
        />
      )}
      {installTarget && overlaySession.activeDetail && (
        <AppInstallDrawer
          app={installTarget}
          details={snapshot.details.filter((detail) => detail.appKey === installTarget.key)}
          version={overlaySession.installVersion}
          busy={installOperations.isBusy('install', installTarget.id)}
          onVersionChange={overlaySession.setInstallVersion}
          onClose={() => overlaySession.setInstallTarget(null)}
          onInstall={() => void overlaySession.submitInstall()}
        />
      )}
      {overlaySession.installedTarget && (
        <InstalledDetailDrawer
          install={overlaySession.installedTarget}
          onClose={() => overlaySession.setInstalledTarget(null)}
        />
      )}
      {overlaySession.versionDiff && (
        <VersionDiffDrawer
          diff={overlaySession.versionDiff}
          onClose={() => overlaySession.setVersionDiff(null)}
        />
      )}
      {uninstallTarget && (
        <AppUninstallDrawer
          install={uninstallTarget}
          busy={installOperations.isBusy('uninstall', uninstallTarget.id)}
          onClose={() => overlaySession.setUninstallTarget(null)}
          onUninstall={() => void overlaySession.operate(uninstallTarget.id, 'uninstall')}
        />
      )}
      {overlaySession.confirmationDialog}
    </div>
  );
}

function feedbackSeverity(tone?: StatusTone): 'info' | 'success' | 'warning' | 'error' {
  if (tone === 'danger') return 'error';
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  return 'info';
}
