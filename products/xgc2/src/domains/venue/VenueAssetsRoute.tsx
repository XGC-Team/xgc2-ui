import { useCallback,useEffect,useState } from 'react';
import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useDeferRouteReady } from '../../shared/routeReady';
import { listScenes,type SceneReplayAsset } from '../experiment/experimentPublic';
import { venueAssetKind,venueAssetOrigin,type VenueAssetRow } from './venueAssetCatalog';
import { VenueAssetsPage } from './VenueAssetsPage';
import { useVenueText } from './venueMessages';

export function VenueAssetsRoute() {
  const t = useVenueText();
  const [assets,setAssets] = useState<VenueAssetRow[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    return listScenes(signal).then((items) => {
      if (signal?.aborted) return;
      setAssets(items.map(venueAssetRow));
      setLoading(false);
    }).catch((cause: unknown) => {
      if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useDeferRouteReady(loading && assets.length === 0 && !error);
  if (loading && assets.length === 0 && !error) return null;

  return (
    <>
      {error ? (
        <Notice
          className="venue-assets-global-error"
          tone="danger"
          heading={t('Unable to load venue assets')}
          data-xgc-role="venue-asset-catalog-error"
          data-xgc-id="venue"
        >
          {error}
          <ControlButton
            dataXgcRole="venue-asset-catalog-retry"
            dataXgcId="venue"
            onClick={() => { void load(); }}
          >
            {t('Try loading venues again')}
          </ControlButton>
        </Notice>
      ) : null}
      <VenueAssetsPage assets={assets} />
    </>
  );
}

function venueAssetRow(asset: SceneReplayAsset): VenueAssetRow {
  return {
    name: asset.name,
    kind: venueAssetKind(asset.kind),
    hasPreview: asset.preview?.kind === 'still',
    origin: venueAssetOrigin(asset.origin),
    createdAt: asset.createdAt,
    note: asset.note,
  };
}
