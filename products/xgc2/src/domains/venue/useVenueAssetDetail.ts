import { useEffect, useState } from 'react';
import {
  getVenueAssetDetail,
  venueAssetMediaUrl,
  venueAssetPreviewUrl,
  type VenueAssetDetail,
} from './venueAssetService';

/** Loads one venue asset's generated contents for its asset page. */
export function useVenueAssetDetail(name: string) {
  const [result, setResult] = useState<{ name: string; detail?: VenueAssetDetail; error: string }>();
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    getVenueAssetDetail(name, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setResult(detail.name === name
          ? { name, detail, error: '' }
          : { name, error: 'The returned scene does not match the selected asset.' });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ name, error: cause instanceof Error ? cause.message : String(cause) });
      });
    return () => controller.abort();
  }, [name]);
  // Effects run after render. Do not pair the previous scene with the new media URL even for one render.
  const current = result?.name === name ? result : undefined;
  return {
    detail: current?.detail,
    error: current?.error ?? '',
    mediaUrl: venueAssetMediaUrl(name),
    previewUrl: venueAssetPreviewUrl(name),
  };
}
