import { useEffect,useState } from 'react';
import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useDeferRouteReady } from '../../shared/routeReady';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useConfigurationLocation } from '../../hooks/useConfigurationLocation';
import { useNavigation } from '../../app/navigationContext';
import { configResourceArchiveLocked } from '../../shared/configResourceProtection';
import {
  type ConfigAssetSortMode,
  useConfigAssetCatalogView,
} from '../assets/assetsPublic';
import { useGroundStationErrorNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import { RobotAssetConfigDrawer } from './RobotAssetConfigDrawer';
import { RobotAssetsPage } from './RobotAssetsPage';
import type { RobotAssetDocument } from './robotAssetContracts';
import { useRobotAssetStore } from './robotAssetStore';
import { useRobotAssetKindComposition } from './useRobotAssetKindComposition';
import { useRobotAssetReachability } from './useRobotAssetReachability';
import './robot-assets.css';

const ROBOT_ASSET_SORT_MODE_STORAGE_KEY = 'xgc.robot.catalog.local.sortMode';

export function RobotAssetsRoute() {
  const nav = useNavigation();
  const {
    resourceId,
    open: openLocation,
    close: closeLocation,
    replaceInvalidWithList,
  } = useConfigurationLocation('robotAsset', nav.page === 'robotAssets');
  // Product roots inject the composed kind graph. Without a leaf contribution,
  // list decode rejects that leaf's protocol kind and payload arm.
  const composition = useRobotAssetKindComposition();
  const store = useRobotAssetStore(undefined, composition);
  const catalogView = useConfigAssetCatalogView();
  const [sortMode,setSortMode] = usePersistentState<ConfigAssetSortMode>(
    ROBOT_ASSET_SORT_MODE_STORAGE_KEY,
    'updated-desc',
    isConfigAssetSortMode,
  );
  const [editor,setEditor] = useState<RobotAssetDocument | 'new' | null>(null);
  const [actionError,setActionError] = useState('');
  const reachability = useRobotAssetReachability();
  const error = actionError || store.error;
  useDeferRouteReady(store.loading && store.assets.length === 0 && !store.error);

  useGroundStationErrorNotification('local', error, {
    title: 'Robot configuration',source: 'robot-assets',dedupeKey: 'robot-assets:error',
  });

  useEffect(() => {
    if (!resourceId) {
      setEditor((current) => current === 'new' ? current : null);
      return;
    }
    if (store.loading) return;
    const selected = store.assets.find((asset) => asset.head.resourceId === resourceId);
    if (!selected) {
      if (store.error) return;
      setEditor(null);
      replaceInvalidWithList();
      return;
    }
    setEditor(selected);
  }, [resourceId,replaceInvalidWithList,store.assets,store.error,store.loading]);

  useEffect(() => {
    window.addEventListener('xgc:robot-list',closeLocation);
    return () => window.removeEventListener('xgc:robot-list',closeLocation);
  }, [closeLocation]);

  async function run(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (store.loading && store.assets.length === 0) return null;

  return (
    <>
      {store.error && (
        <Notice
          className="robot-assets-global-error"
          tone="danger"
          heading="Robot catalog unavailable"
          data-xgc-role="robot-asset-catalog-error"
          data-xgc-id="robot"
        >
          {store.error}
          <ControlButton dataXgcRole="robot-asset-catalog-retry" dataXgcId="robot" onClick={() => { void store.refresh(); }}>
            Retry
          </ControlButton>
        </Notice>
      )}
      {actionError && (
        <Notice
          className="robot-assets-global-error"
          tone="danger"
          data-xgc-role="robot-asset-action-error"
          data-xgc-id="robot"
        >
          {actionError}
        </Notice>
      )}
      <RobotAssetsPage
        assets={store.assets}
        search={catalogView.search}
        sortMode={sortMode}
        collapsedFolders={catalogView.collapsedFolders}
        onCreate={() => setEditor('new')}
        onConfigure={(asset) => {
          setEditor(asset);
          openLocation(asset.head.resourceId);
        }}
        onCheckReachability={(asset) => void reachability.checkReachability(asset.head.resourceId)}
        onArchive={(asset) => {
          if (!configResourceArchiveLocked(asset.head)) void run(() => store.archive(asset));
        }}
        onSearchChange={catalogView.setSearch}
        onSortModeChange={setSortMode}
        onToggleFolder={catalogView.toggleFolder}
        reachabilityById={reachability.reachabilityById}
      />
      {editor && (
        <RobotAssetConfigDrawer
          document={editor === 'new' ? undefined : editor}
          assets={store.assets}
          onClose={() => {
            const closesDeepLink = editor !== 'new';
            setEditor(null);
            if (closesDeepLink) closeLocation();
          }}
          onError={setActionError}
          onSave={async (spec) => {
            if (editor === 'new') {
              await store.create(undefined,spec);
            } else {
              await store.commit(editor,spec,'Update robot asset');
            }
          }}
        />
      )}
    </>
  );
}

function isConfigAssetSortMode(value: unknown): value is ConfigAssetSortMode {
  return value === 'updated-desc' || value === 'updated-asc' || value === 'name-asc';
}
