import type { VenueAssetDetail } from './venueAssetService';
import { venueAssetPreview } from './venueAssetPreview';
import { VenueAssetMedia } from './VenueAssetMedia';
import { useVenueText } from './venueMessages';

/** Reading an asset never starts a provider or substitutes another asset's pixels. */
export function VenueAssetPreview({ detail, mediaUrl, previewUrl }: {
  detail: VenueAssetDetail;
  mediaUrl: string;
  previewUrl: string;
}) {
  const t = useVenueText();
  const preview = venueAssetPreview(detail);
  const src = preview.displayImageSource === 'preview' ? previewUrl
    : preview.displayImageSource === 'media' ? mediaUrl : undefined;
  return <VenueAssetMedia name={detail.name} photoExpected={preview.photoExpected} src={src}
    alt={preview.directoryPreview ? t('Scene preview') : undefined} />;
}
