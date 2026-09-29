import { Notice } from '@xgc2/ui-react';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { formatOperatorDateTime } from '../../shared/operatorTime';
import { useVenueAssetDetail } from './useVenueAssetDetail';
import { venueAssetSummary, type VenueAssetRow } from './venueAssetCatalog';
import { VenueAssetPreview } from './VenueAssetPreview';
import { VenueAssetMedia } from './VenueAssetMedia';
import { venueAssetPreview } from './venueAssetPreview';
import { useVenueText } from './venueMessages';

const shapeNames: Record<string, string> = {
  box: 'Box', sphere: 'Sphere', cylinder: 'Cylinder', ellipsoid: 'Ellipsoid',
  polytope: 'Polyhedron', composite: 'Composite',
};

/** Operator summary only; recorded notes and provenance remain in the unchanged asset. */
export function VenueAssetDetailView({ row }: { row: VenueAssetRow }) {
  const t = useVenueText();
  const language = useAppLanguage();
  const { detail, error, mediaUrl, previewUrl } = useVenueAssetDetail(row.name);
  const available = detail ? venueAssetPreview(detail) : undefined;
  const extent = detail?.obstacles?.extent;
  const range = extent?.unit === 'm' && [extent.minX, extent.minY, extent.maxX, extent.maxY].every(Number.isFinite)
    && extent.maxX >= extent.minX && extent.maxY >= extent.minY
    ? `${(extent.maxX - extent.minX).toLocaleString(language, { maximumFractionDigits: 2 })} × ${(extent.maxY - extent.minY).toLocaleString(language, { maximumFractionDigits: 2 })} m`
    : undefined;
  const obstacles = detail?.obstacles;
  const shapes = Object.entries(obstacles?.shapes ?? {}).filter(([, count]) => Number.isInteger(count) && count > 0);
  const shapeSummary = shapes.reduce((total, [, count]) => total + count, 0) === obstacles?.count
    ? shapes.map(([shape, count]) => `${t(shapeNames[shape] ?? 'Other shapes')} × ${count}`).join(', ') : '';
  const simulators = Object.keys(detail?.simulators ?? {}).map((simulator) => (
    simulator === 'gazebo' ? t('Gazebo')
      : simulator === 'lightweight' ? t('Lightweight simulator') : simulator
  ));
  const displayedImage = detail?.media;
  const resolution = displayedImage?.width && displayedImage.height
    && Number.isInteger(displayedImage.width) && Number.isInteger(displayedImage.height)
    && displayedImage.width > 0 && displayedImage.height > 0
    ? `${displayedImage.width} × ${displayedImage.height} px` : t('Not available');
  const purpose = row.kind === 'still'
    ? 'Use the site photo as the background for a simulation.'
    : row.kind === 'loop'
      ? 'Original video is kept for selecting a scene photo.'
      : 'Use this scene in a supported simulator.';
  return (
    <section className="venue-asset-detail"
      data-xgc-role="venue-asset-detail" data-xgc-id={row.name}
      data-xgc-kind={row.kind} data-xgc-origin={row.origin}>
      {detail ? <VenueAssetPreview key={detail.name} detail={detail} mediaUrl={mediaUrl} previewUrl={previewUrl} />
        : <VenueAssetMedia name={row.name} photoExpected={row.kind === 'still'}
          src={row.kind === 'still' ? mediaUrl : undefined} />}
      <p className="venue-asset-detail-copy" data-xgc-role="venue-asset-detail-purpose" data-xgc-id={row.name}>
        {t(purpose)}
      </p>
      {error ? <Notice tone="danger" data-xgc-role="venue-asset-detail-error" data-xgc-id={row.name}>{t(error)}</Notice> : null}
      {detail && available ? (
        <div className="venue-asset-contents" data-xgc-role="venue-asset-contents" data-xgc-id={row.name}>
          <dl className="venue-asset-facts" data-xgc-role="venue-asset-facts" data-xgc-id={row.name}>
            <div>
              <dt>{t('Scene type')}</dt>
              <dd>{t(venueAssetSummary(detail.kind))}</dd>
            </div>
            {simulators.length > 0 ? (
              <div data-xgc-role="venue-asset-simulators" data-xgc-id={row.name}>
                <dt>{t('Simulators')}</dt>
                <dd>{simulators.join(' · ')}</dd>
              </div>
            ) : null}
            {range !== undefined ? (
              <div>
                <dt>{t('Scene range')}</dt>
                <dd>{range}</dd>
              </div>
            ) : null}
            {obstacles ? (
              <div data-xgc-role="venue-asset-obstacles" data-xgc-id={row.name}>
                <dt>{t('Obstacles')}</dt>
                <dd>{obstacles.count}
                  {shapeSummary ? <span className="venue-asset-fact-detail">{shapeSummary}</span> : null}
                </dd>
              </div>
            ) : null}
            {available.image ? (
              <div>
                <dt>{t('Image dimensions')}</dt>
                <dd>{resolution}</dd>
              </div>
            ) : null}
            {available.image || detail.camera || detail.extrinsic ? (
              <div data-xgc-role="venue-asset-calibration" data-xgc-id={row.name}>
                <dt>{t('Calibration')}</dt>
                <dd>{t(available.cameraAvailable && available.poseAvailable && !available.frameMismatch
                  && detail.replayIssues.length === 0 ? 'Intrinsics and camera pose' : 'Incomplete')}</dd>
              </div>
            ) : null}
            {detail.createdAt ? (
              <div>
                <dt>{t('Saved at')}</dt>
                <dd>{formatOperatorDateTime(detail.createdAt, language)}</dd>
              </div>
            ) : null}
          </dl>
          {available.worldDeclared ? (
            <p data-xgc-role="venue-asset-world-source" data-xgc-id={row.name}>
              {t(available.worldAvailable ? 'Simulator world available.' : 'Simulator world unavailable.')}
            </p>
          ) : null}
          {available.originalVideo && available.mediaAvailable ? (
            <a href={mediaUrl} download data-xgc-role="venue-asset-original-media" data-xgc-id={row.name}>
              {t('Download original video')}
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
