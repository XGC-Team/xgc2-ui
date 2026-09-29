import { ArrowDownUp,Folder,LandPlot } from 'lucide-react';
import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { SelectControl } from '../../components/controls/SelectControl';
import {
  ListPage,
  ListPageHost,
  ListPageItemMain,
  ListPageRow,
} from '../../components/ListPage';
import './venue-assets.css';
import { useProductRouteVisible } from '../../shared/routeReady';
import { VenueAssetMedia } from './VenueAssetMedia';
import {
  buildProjectedConfigAssetCatalog,
  ConfigAssetFolderTitle,
  type ConfigAssetSortMode,
} from '../assets/assetsPublic';
import {
  VENUE_ORIGIN_ALL,
  VENUE_ORIGIN_PLATFORM,
  VENUE_ORIGIN_USER,
  venueAssetSummary,
  type VenueAssetOrigin,
  type VenueAssetRow,
} from './venueAssetCatalog';
import { useVenueText } from './venueMessages';
import { venueAssetMediaUrl,venueAssetPreviewUrl } from './venuePublic';
import { VenueAssetDetailView } from './VenueAssetDetailView';

const VENUE_OPEN_STORAGE_KEY = 'xgc.venue.user.lastOpen';

export function VenueAssetsPage({
  assets,
}: {
  assets: readonly VenueAssetRow[];
}) {
  const t = useVenueText();
  const visible = useProductRouteVisible();
  const catalogHost = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const [search,setSearch] = useState('');
  const [sortMode,setSortMode] = useState<ConfigAssetSortMode>('updated-desc');
  const [originFilter,setOriginFilter] = useState<typeof VENUE_ORIGIN_ALL | VenueAssetOrigin>(VENUE_ORIGIN_ALL);
  const [collapsedFolders,setCollapsedFolders] = useState<string[]>([]);
  const [openName,setOpenName] = useState(() => sessionStorage.getItem(VENUE_OPEN_STORAGE_KEY) ?? '');
  const opened = assets.find((asset) => asset.name === openName) ?? null;

  function openScene(name: string) {
    scrollTop.current = catalogHost.current?.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]')?.scrollTop ?? 0;
    sessionStorage.setItem(VENUE_OPEN_STORAGE_KEY, name);
    setOpenName(name);
  }

  function closeScene() {
    sessionStorage.removeItem(VENUE_OPEN_STORAGE_KEY);
    setOpenName('');
  }

  useEffect(() => {
    if (!visible) return;
    const onList = () => closeScene();
    window.addEventListener('xgc:venue-list', onList);
    return () => window.removeEventListener('xgc:venue-list', onList);
  }, [visible]);

  useEffect(() => {
    if (openName && !assets.some((asset) => asset.name === openName)) closeScene();
  }, [assets, openName]);

  useEffect(() => {
    if (!visible) return;
    window.dispatchEvent(new CustomEvent('xgc:venue-breadcrumb', {
      detail: opened ? { view: 'detail', name: opened.name } : { view: 'list' },
    }));
  }, [opened, visible]);

  useLayoutEffect(() => {
    if (opened || !visible) return;
    const scroller = catalogHost.current?.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]');
    if (scroller) scroller.scrollTop = scrollTop.current;
  }, [opened, visible]);

  const originFolders = [
    { id: VENUE_ORIGIN_PLATFORM,title: t('Platform presets') },
    { id: VENUE_ORIGIN_USER,title: t('User venues') },
  ];
  const listed = originFilter === VENUE_ORIGIN_ALL
    ? assets
    : assets.filter((asset) => asset.origin === originFilter);
  const rootFolders = originFilter === VENUE_ORIGIN_ALL
    ? originFolders
    : originFolders.filter((folder) => folder.id === originFilter);
  const { folders,visibleAssets } = buildProjectedConfigAssetCatalog({
    items: listed,
    namespaces: [],
    search,
    tagFilter: 'all',
    sortMode,
    viewMode: 'folder',
    allAssetsTitle: t('All venues'),
    rootFolders,
    project: (asset) => ({
      name: asset.name,
      description: asset.note ?? '',
      tags: [],
      updatedAt: asset.createdAt,
      folderId: asset.origin,
      searchTerms: [asset.name,asset.note ?? '',t(venueAssetSummary(asset.kind))],
    }),
  });
  const filtering = search.trim() !== '' || originFilter !== VENUE_ORIGIN_ALL;

  function toggleFolder(folderId: string) {
    setCollapsedFolders((current) => (
      current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current,folderId]
    ));
  }

  return (
    <>
    {opened ? <VenueAssetDetailView row={opened} /> : null}
    <div ref={catalogHost} className="venue-assets-catalog xgc-workspace-full-span" hidden={Boolean(opened)}
      onScrollCapture={(event) => {
        if (!opened && visible && event.target instanceof HTMLElement
          && event.target.dataset.xgcRole === 'list-page-items-scroll') scrollTop.current = event.target.scrollTop;
      }}>
    <ListPageHost className="xgc-workspace-full-span" data-xgc-role="venue-assets-page" data-xgc-id="venue">
      <ListPage<VenueAssetRow>
        search={{ value: search,placeholder: t('Search venues'),onChange: setSearch,role: 'venue-asset-search' }}
        controls={(
          <>
            <SelectControl
              compact
              value={originFilter}
              options={[
                { value: VENUE_ORIGIN_ALL,label: t('All venues') },
                { value: VENUE_ORIGIN_PLATFORM,label: t('Platform presets') },
                { value: VENUE_ORIGIN_USER,label: t('User venues') },
              ]}
              onChange={(value) => {
                if (value === VENUE_ORIGIN_ALL || value === VENUE_ORIGIN_PLATFORM || value === VENUE_ORIGIN_USER) {
                  setOriginFilter(value);
                }
              }}
              icon={<Folder size={15} />}
              ariaLabel={t('Filter venues by origin')}
              dataXgcRole="venue-asset-origin-filter"
              dataXgcId="venue-asset-origin-filter"
            />
            <SelectControl
              compact
              value={sortMode}
              options={[
                { value: 'updated-desc',label: t('Recently updated') },
                { value: 'updated-asc',label: t('Oldest updated') },
                { value: 'name-asc',label: t('Name A-Z') },
              ]}
              onChange={(value) => setSortMode(value as ConfigAssetSortMode)}
              icon={<ArrowDownUp size={15} />}
              ariaLabel={t('Sort venues')}
              dataXgcRole="venue-asset-sort"
              dataXgcId="venue-asset-sort"
            />
          </>
        )}
        folders={visibleAssets.length > 0 ? folders : []}
        showFolderHeaders
        collapsedFolders={collapsedFolders}
        onToggleFolder={toggleFolder}
        getFolderProps={(folder) => ({
          'data-xgc-role': 'venue-folder',
          'data-xgc-id': folder.id,
        })}
        renderFolderTitle={(folder,collapsed) => (
          <ConfigAssetFolderTitle
            title={folder.title}
            itemCount={folder.items.length}
            collapsed={collapsed}
          />
        )}
        renderItem={(asset) => {
          const summary = t(venueAssetSummary(asset.kind));
          return (
            <ListPageRow
              key={asset.name}
              className="venue-asset-card"
              layout="compact"
              data-xgc-role="venue-asset-row"
              data-xgc-id={asset.name}
              data-xgc-kind={asset.kind}
              data-xgc-origin={asset.origin}
              onClick={() => openScene(asset.name)}
            >
              <div className="venue-asset-row-content">
              <VenueAssetMedia name={asset.name} compact photoExpected={asset.hasPreview || asset.kind === 'still'}
                src={asset.hasPreview ? venueAssetPreviewUrl(asset.name)
                  : asset.kind === 'still' ? venueAssetMediaUrl(asset.name) : undefined}
                alt={asset.hasPreview ? t('Scene preview') : undefined} />
              <ListPageItemMain
                dataXgcId={asset.name}
                titleRole="venue-asset-row-open"
                descriptionRole="venue-asset-row-description"
                title={asset.name}
                description={summary}
                icon={LandPlot}
                openLabel={t('Open scene {name}', { name: asset.name })}
                onOpen={() => openScene(asset.name)}
              />
              </div>
            </ListPageRow>
          );
        }}
        emptyTitle={filtering ? t('No matching venues') : t('No venue assets')}
        emptyDescription={t('Saved scenes are available to your experiments.')}
      />
    </ListPageHost>
    </div>
    </>
  );
}
