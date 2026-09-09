import { ArrowDownUp, Bot, Folder, LoaderCircle, Settings, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import {
  ListPage,
  ListPageHost,
  ListPageItemActions,
  ListPageRow,
} from '../../components/ListPage';
import {
  buildProjectedConfigAssetCatalog,
  ConfigAssetFolderTitle,
  type ConfigAssetSortMode,
  useAssetsText,
} from '../assets/assetsPublic';
import { configResourceArchiveLocked } from '../../shared/configResourceProtection';
import {
  PX4_MODEL_FS150,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  px4RobotModelId,
  type RobotAssetDocument,
} from './robotAssetContracts';
import {
  robotAssetEndpoint,
  robotAssetKind,
  robotAssetKindLabel,
  robotAssetOverviewAttributes,
} from './robotAssetCatalog';
import {
  ROBOT_CHASSIS_FILTER_ALL,
  robotAssetChassisClass,
  robotAssetChassisLabel,
  robotAssetVendorLabel,
  robotChassisFilterOptions,
  robotChassisFolderEntries,
  type RobotChassisFilterId,
} from './robotAssetChassis';
import type { RobotAssetKindComposition } from './robotAssetKindComposition';
import { useRobotAssetKindComposition } from './useRobotAssetKindComposition';
import { useRobotText } from './robotMessages';
import type { RobotAssetReachabilityState } from './useRobotAssetReachability';

export function RobotAssetsPage({
  assets,
  search = '',
  sortMode = 'updated-desc',
  collapsedFolders = [],
  onCreate,
  onConfigure = () => undefined,
  onCheckReachability = () => undefined,
  onArchive = () => undefined,
  onSearchChange = () => undefined,
  onSortModeChange = () => undefined,
  onToggleFolder = () => undefined,
  composition: compositionProp,
  reachabilityById = {},
}: {
  assets: RobotAssetDocument[];
  search?: string;
  sortMode?: ConfigAssetSortMode;
  collapsedFolders?: string[];
  onCreate: () => void;
  onConfigure?: (asset: RobotAssetDocument) => void;
  onCheckReachability?: (asset: RobotAssetDocument) => void;
  onArchive?: (asset: RobotAssetDocument) => void;
  onSearchChange?: (value: string) => void;
  onSortModeChange?: (value: ConfigAssetSortMode) => void;
  onToggleFolder?: (folderId: string) => void;
  composition?: RobotAssetKindComposition;
  reachabilityById?: Readonly<Record<string,RobotAssetReachabilityState>>;
}) {
  const t = useAssetsText();
  const robotText = useRobotText();
  const compositionFromContext = useRobotAssetKindComposition();
  const composition = compositionProp ?? compositionFromContext;
  const [chassisFilter, setChassisFilter] = useState<RobotChassisFilterId>(ROBOT_CHASSIS_FILTER_ALL);
  const chassisFolders = robotChassisFolderEntries(composition, robotText);
  const listedAssets = chassisFilter === ROBOT_CHASSIS_FILTER_ALL
    ? assets
    : assets.filter((asset) => robotAssetChassisClass(asset.spec, composition) === chassisFilter);
  const rootFolders = chassisFilter === ROBOT_CHASSIS_FILTER_ALL
    ? chassisFolders
    : chassisFolders.filter((folder) => folder.id === chassisFilter);

  function selectChassisFilter(value: string) {
    if (value !== ROBOT_CHASSIS_FILTER_ALL && !chassisFolders.some((folder) => folder.id === value)) {
      return;
    }
    setChassisFilter(value as RobotChassisFilterId);
    if (value === ROBOT_CHASSIS_FILTER_ALL) return;
    if (collapsedFolders.includes(value)) onToggleFolder(value);
  }

  // First-level folders are chassis / dynamics class, not firmware or brand.
  const { folders } = buildProjectedConfigAssetCatalog({
    items: listedAssets,
    namespaces: [],
    search,
    tagFilter: 'all',
    sortMode,
    viewMode: 'folder',
    allAssetsTitle: t('All robots'),
    rootFolders,
    project: (asset) => ({
      name: asset.spec.name,
      description: '',
      tags: [],
      updatedAt: asset.head.updatedAt,
      folderId: robotAssetChassisClass(asset.spec, composition),
      searchTerms: [
        asset.spec.name,
        robotAssetChassisLabel(asset, composition, robotText),
        robotAssetVendorLabel(asset, composition),
        robotAssetKindLabel(asset, composition),
        robotAssetEndpoint(asset, composition),
        ...robotAssetOverviewAttributes(asset, composition).map((attribute) => attribute.value),
      ],
    }),
  });
  return (
    <ListPageHost className="xgc-workspace-full-span" data-xgc-role="robot-assets-page" data-xgc-id="robot">
      <ListPage<RobotAssetDocument>
        createLabel={t('New')}
        createRole="robot-asset-create"
        onCreate={onCreate}
        search={{ value: search, placeholder: t('Search robots'), onChange: onSearchChange, role: 'robot-asset-search' }}
        controls={(
          <>
            <div className="robot-asset-list-filters" data-xgc-role="robot-asset-list-filters" data-xgc-id="robot-asset-list-filters">
              <SelectControl
                compact
                value={chassisFilter}
                options={[...robotChassisFilterOptions(robotText)]}
                onChange={selectChassisFilter}
                icon={<Folder size={15} />}
                ariaLabel={robotText('Filter robots by folder')}
                dataXgcRole="robot-asset-chassis-filter" dataXgcId="robot-asset-chassis-filter"
              />
            </div>
            <div className="robot-asset-list-view-controls">
              <SelectControl
                compact
                value={sortMode}
                options={[
                  { value: 'updated-desc',label: t('Recently updated') },
                  { value: 'updated-asc',label: t('Oldest updated') },
                  { value: 'name-asc',label: t('Name A-Z') },
                ]}
                onChange={(value) => onSortModeChange(value as ConfigAssetSortMode)}
                icon={<ArrowDownUp size={15} />}
                ariaLabel={t('Sort robots')}
                dataXgcRole="robot-asset-sort" dataXgcId="robot-asset-sort"
              />
            </div>
          </>
        )}
        folders={folders}
        showFolderHeaders
        collapsedFolders={collapsedFolders}
        onToggleFolder={onToggleFolder}
        getFolderProps={(folder) => ({
          'data-xgc-role': 'robot-folder',
          'data-xgc-id': folder.id,
        })}
        renderFolderTitle={(folder, collapsed) => (
          <ConfigAssetFolderTitle
            title={folder.title}
            itemCount={folder.items.length}
            collapsed={collapsed}
          />
        )}
        listClassName="robot-assets-list"
        renderItem={(asset) => {
          const kind = robotAssetKind(asset.spec, composition);
          const attrs = robotAssetOverviewAttributes(asset, composition);
          const reachability = reachabilityById[asset.head.resourceId];
          const connectivityLevel = robotAssetConnectivityLevel(reachability);
          const reachabilityLabel = robotReachabilityLabel(reachability,t);
          const reachabilitySupported = robotAssetManagementReachabilitySupported(asset);
          const archiveLocked = configResourceArchiveLocked(asset.head);
          return (
            <ListPageRow
              key={asset.head.resourceId}
              className="robot-asset-card"
              layout="compact"
              data-xgc-role="robot-asset-row"
              data-xgc-id={asset.head.resourceId}
              data-xgc-kind={kind}
              data-xgc-system={asset.head.system || undefined}
            >
              <div className="robot-asset-card-body">
                <div className="robot-asset-card-title">
                  <Bot className="robot-asset-card-icon" size={15} aria-hidden="true" />
                  <strong>{asset.spec.name}</strong>
                </div>
                <dl
                  className="robot-asset-card-attrs"
                  data-xgc-role="robot-asset-attrs"
                  data-xgc-id={asset.head.resourceId}
                  data-xgc-kind={kind}
                >
                  {attrs.map((attribute) => (
                    <div
                      key={attribute.id}
                      className="robot-asset-card-attr"
                      data-xgc-role="robot-asset-attr"
                      data-xgc-id={attribute.id}
                    >
                      <dt>{robotText(attribute.label)}</dt>
                      <dd title={attribute.value}>
                        {attribute.id === 'vrpn-pose' || attribute.id === 'mavros-fcu'
                          ? <code>{attribute.value}</code>
                          : attribute.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <ListPageItemActions className="robot-asset-card-actions">
                {reachabilitySupported && (
                  <ControlButton
                    iconOnly
                    size="compact"
                    tone={connectivityLevel === 'success' ? 'success'
                      : connectivityLevel === 'danger' ? 'danger' : 'default'}
                    dataXgcRole="robot-asset-connectivity"
                    dataXgcId={asset.head.resourceId}
                    data-xgc-state={connectivityLevel}
                    data-xgc-check-state={reachability?.status ?? 'unknown'}
                    data-xgc-latency-ms={reachability?.result?.reachable
                      ? reachability.result.latencyMs : undefined}
                    aria-label={reachabilityLabel}
                    title={reachabilityLabel}
                    disabled={reachability?.status === 'checking'}
                    onClick={() => onCheckReachability(asset)}
                  >
                    {reachability?.status === 'checking'
                      ? <LoaderCircle data-xgc-spinning="true" size={15} />
                      : connectivityLevel === 'danger'
                        ? <WifiOff size={15} /> : <Wifi size={15} />}
                  </ControlButton>
                )}
                <ControlButton
                  iconOnly
                  size="compact"
                  dataXgcRole="robot-asset-settings"
                  dataXgcId={asset.head.resourceId}
                  aria-label={robotText('Configure robot')}
                  title={robotText('Configure robot')}
                  onClick={() => onConfigure(asset)}
                >
                  <Settings size={15} />
                </ControlButton>
                {!archiveLocked && (
                  <ControlButton
                    iconOnly
                    size="compact"
                    tone="danger"
                    dataXgcRole="robot-asset-delete"
                    dataXgcId={asset.head.resourceId}
                    aria-label={robotText('Archive robot')}
                    title={robotText('Archive robot')}
                    onClick={() => onArchive(asset)}
                  >
                    <Trash2 size={15} />
                  </ControlButton>
                )}
              </ListPageItemActions>
            </ListPageRow>
          );
        }}
        emptyTitle={robotText('No robots')}
      />
    </ListPageHost>
  );
}

type RobotAssetConnectivityLevel = 'neutral' | 'success' | 'warning' | 'danger';

function robotAssetConnectivityLevel(
  state: RobotAssetReachabilityState | undefined,
): RobotAssetConnectivityLevel {
  if (!state) return 'neutral';
  if (state.status === 'error' || state.status === 'unreachable') return 'danger';
  if (!state.result) return 'neutral';
  if (!state.result.reachable) return 'danger';
  return state.result.latencyMs < 15 ? 'success' : 'warning';
}

function robotReachabilityLabel(
  state: RobotAssetReachabilityState | undefined,
  t: (message: string) => string,
) {
  if (!state) return t('Check management reachability');
  if (state.status === 'checking') return t('Checking management reachability…');
  const prefix = state.status === 'checked' ? `${t('Last management reachability check')} · ` : '';
  if (!state.result) {
    return `${prefix}${t('Management reachability check failed')} · ${state.message || t('Unknown error')}`;
  }
  const outcome = t(state.result.reachable
    ? 'Management address reachable'
    : 'Management address unreachable');
  const latency = state.result.reachable
    ? ` · ${state.result.latencyMs < 1 ? '<1' : Math.round(state.result.latencyMs)} ms` : '';
  return `${prefix}${outcome} · ${state.result.address}${latency} · ${state.result.detail}`;
}

function robotAssetManagementReachabilitySupported(asset: RobotAssetDocument) {
  if (isScoutRobotAsset(asset) || isMecanumRobotAsset(asset)) return true;
  return isPX4RobotAsset(asset) && px4RobotModelId(asset.spec) === PX4_MODEL_FS150;
}
