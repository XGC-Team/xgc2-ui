import { useState } from 'react';
import { LandPlot } from 'lucide-react';
import { useVenueText } from './venueMessages';
import './venue-asset-media.css';

/** One media box for a supplied image, an absent image or a failed load. */
export function VenueAssetMedia({ name, src, photoExpected = false, compact = false, alt }: {
  name: string;
  src?: string;
  photoExpected?: boolean;
  compact?: boolean;
  alt?: string;
}) {
  const t = useVenueText();
  const [failedSource, setFailedSource] = useState('');
  const unavailable = photoExpected && (!src || failedSource === src);
  const showPhoto = src && failedSource !== src;
  const id = `${name}:${compact ? 'row' : 'detail'}`;
  return (
    <div className={`venue-asset-media${compact ? ' venue-asset-media-compact' : ''}`}
      data-xgc-role={compact ? 'venue-asset-row-preview' : 'venue-asset-preview'} data-xgc-id={name}>
      {showPhoto ? (
        <img className="venue-asset-photo" src={src} alt={alt ?? t('Recorded camera frame')}
          loading={compact ? 'lazy' : 'eager'} decoding="async"
          data-xgc-role="venue-asset-photo" data-xgc-id={id} onError={() => setFailedSource(src)} />
      ) : (
        <div className="venue-asset-photo-placeholder" data-xgc-role="venue-asset-photo-status" data-xgc-id={id}>
          <LandPlot aria-hidden="true" />
          <span>{t(unavailable ? 'Preview unavailable' : 'No preview')}</span>
        </div>
      )}
    </div>
  );
}
