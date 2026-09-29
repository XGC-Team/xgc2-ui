import { formatOperatorDateTime } from '../../../shared/operatorTime';
import { useState } from 'react';
import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { useExperimentSurfaceVisible } from '../../../domains/experiment/experimentPublic';
import { cancelPreparedVideoJob,downloadVideoArtifact,listVideoJobs,publishVideoJobToGallery,type VideoJob } from '../../../domains/recording/recordingPublic';
import { useLatestAsyncRequest } from '../../../hooks/useLatestAsyncRequest';
import { usePolling } from '../../../hooks/usePolling';
import { useProductRouteVisible } from '../../../shared/routeReady';
import { renditionLabelKey } from './videoProductionModel';
import { useVideoProductionText } from './videoProductionMessages';

const VIDEO_PREVIEW_BYTES_LIMIT = 256 * 1024 * 1024;

function formatBytes(size: number | undefined) {
  if (!Number.isSafeInteger(size) || size === undefined || size < 0) return '';
  if (size < 1024) return `${size} B`;
  const units = ['KiB','MiB','GiB'];
  let value = size;let unit = 'B';
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;unit = next;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

export function VideoJobHistory({ experimentId,id,revision,onShowArtifact }: {
  experimentId: string;id: string;revision: number;
  onShowArtifact?: (job: VideoJob) => void;
}) {
  const t = useVideoProductionText();
  const [offsetState,setOffsetState] = useState({experimentId,offset:0});
  const offset = offsetState.experimentId === experimentId ? offsetState.offset : 0;
  const [page,setPage] = useState<{experimentId:string;offset:number;items:VideoJob[];nextOffset:number | undefined}>();
  const jobs = page?.experimentId === experimentId && page.offset === offset ? page.items : [];
  const nextOffset = page?.experimentId === experimentId && page.offset === offset ? page.nextOffset : undefined;
  const [errorState,setErrorState] = useState({experimentId,error:''});
  const error = errorState.experimentId === experimentId ? errorState.error : '';
  const setError = (message:string) => setErrorState({experimentId,error:message});
  const [refresh,setRefresh] = useState(0);
  const [publishedGalleries,setPublishedGalleries] = useState<Record<string,string>>({});
  // Each poll scans the disk-backed render history on the server, so only a
  // visible surface polls. Showing the dashboard or route again refreshes it.
  const dashboardVisible = useExperimentSurfaceVisible();
  const routeVisible = useProductRouteVisible();
  const requestScope = `${experimentId}:${offset}:${revision}:${refresh}`;
  const beginListRequest = useLatestAsyncRequest(requestScope);
  usePolling({
    enabled: dashboardVisible && routeVisible,intervalMs: 3000,pollKey: requestScope,
    task: async () => {
      const isCurrent = beginListRequest();
      const result = await listVideoJobs(experimentId,offset);
      if (!isCurrent()) return;
      if (result.items.some((job) => job.experimentId !== experimentId)) throw new Error('Video job scope mismatch.');
      setPage({experimentId,offset,items:result.items,nextOffset:result.nextOffset});setError('');
    },
    onError: (cause) => setError(String(cause)),
  });
  async function cancelPrepared(job: VideoJob) {
    try { await cancelPreparedVideoJob(experimentId,job.id);setRefresh((n) => n + 1); }
    catch (cause) { setError(String(cause)); }
  }
  async function download(job: VideoJob,name: string) {
    try { await downloadVideoArtifact(experimentId,job,name); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(String(cause)); }
  }
  async function publishToGallery(job: VideoJob) {
    try {
      const publication = await publishVideoJobToGallery(experimentId,job.id);
      setPublishedGalleries((current) => ({ ...current,[job.id]: publication.galleryId }));
      setError('');
    }
    catch (cause) { setError(String(cause)); }
  }
  function publishableToGallery(job: VideoJob) {
    return job.status === 'succeeded' && (job.artifact === 'still.png' || job.artifact === 'trail.png');
  }
  function progressOf(job: VideoJob) {
    const total = job.rendition.kind === 'video' ? job.outputFrames : Math.max(job.captureCount,1);
    return `${job.renderedFrames}/${total}`;
  }
  function viewable(job: VideoJob) {
    if (!job.artifact) return false;
    if (job.artifact.endsWith('.png')) return true;
    return Number.isSafeInteger(job.artifactSize) && (job.artifactSize ?? 0) <= VIDEO_PREVIEW_BYTES_LIMIT;
  }
  return <section data-xgc-role="video-job-history" data-xgc-id={id} aria-label={t('Render history')}>
    <h3>{t('Render history')}</h3>
    {error && <Notice tone="danger" density="compact">{error}</Notice>}
    {jobs.map((job) => <article className="video-job-card" key={job.id} data-xgc-role="video-job" data-xgc-id={job.id}>
      <p><strong>{t(renditionLabelKey(job.rendition))}</strong> · {t(job.status)} · {formatOperatorDateTime(job.createdAt)}</p>
      <p>{job.id} · {t('Completed frames')}: {progressOf(job)}</p>
      {job.rendition.kind === 'still' && <p>{t('Frame')}: {job.rendition.frame}</p>}
      {job.rendition.kind === 'preview' && <p>{t('Frame')}: {job.rendition.frame}</p>}
      {job.rendition.kind === 'trail' && <p>{t('Trail samples')}: {job.rendition.frames.join(', ')} · {job.rendition.method === 'afterimage'
        ? t('Ghost fade {from} % → {to} %, last solid',{ from: String(job.rendition.fadeFromPermille / 10),to: String(job.rendition.fadeToPermille / 10) })
        : `${t('Half-life (ns)')}: ${job.rendition.halfLifeNs}`}</p>}
      {job.artifact && <p>{job.artifact}{formatBytes(job.artifactSize) ? ` · ${formatBytes(job.artifactSize)}` : ''}
        {job.artifactSha256 ? ` · sha256 ${job.artifactSha256.slice(0,12)}…` : ''}</p>}
      {job.error && <Notice tone="warning" density="compact">{job.error}</Notice>}
      {publishedGalleries[job.id] && <Notice tone="success" density="compact" data-xgc-role="video-gallery-published" data-xgc-id={job.id}>{t('Published to the scientific image gallery: {id}',{ id: publishedGalleries[job.id] })}</Notice>}
      <div className="video-production-toolbar">
        {job.status === 'prepared' && <ControlButton size="compact" dataXgcRole="video-cancel-prepared" dataXgcId={job.id} onClick={() => void cancelPrepared(job)}>{t('Discard unstarted task')}</ControlButton>}
        {job.status === 'succeeded' && job.artifact && onShowArtifact && <ControlButton size="compact" disabled={!viewable(job)}
          title={viewable(job) ? undefined : t('This artifact is too large for an in-panel preview; download it instead.')}
          dataXgcRole="video-view-artifact" dataXgcId={job.id} onClick={() => onShowArtifact(job)}>{t('View artifact')}</ControlButton>}
        {job.status === 'succeeded' && job.artifact && <ControlButton size="compact" dataXgcRole="video-download" dataXgcId={job.id} onClick={() => void download(job,job.artifact!)}>{t('Download result')}</ControlButton>}
        {publishableToGallery(job) && <ControlButton size="compact" disabled={Boolean(publishedGalleries[job.id])}
          title={publishedGalleries[job.id] ? t('Published to the scientific image gallery: {id}',{ id: publishedGalleries[job.id] }) : undefined}
          dataXgcRole="video-publish-gallery" dataXgcId={job.id} onClick={() => void publishToGallery(job)}>{t('Publish to gallery')}</ControlButton>}
        {job.status === 'succeeded' && <ControlButton size="compact" dataXgcRole="video-receipt" dataXgcId={job.id} onClick={() => void download(job,'result.json')}>{t('Download receipt')}</ControlButton>}
        {job.status === 'succeeded' && <ControlButton size="compact" dataXgcRole="video-publication" dataXgcId={job.id} onClick={() => void download(job,'publication.json')}>{t('Download publication')}</ControlButton>}
      </div>
    </article>)}
    <div className="video-production-toolbar">
      <ControlButton size="compact" disabled={offset === 0} dataXgcRole="video-history-first" dataXgcId={id} onClick={() => setOffsetState({experimentId,offset:0})}>{t('Latest tasks')}</ControlButton>
      <ControlButton size="compact" disabled={nextOffset === undefined} dataXgcRole="video-history-next" dataXgcId={id} onClick={() => { if (nextOffset !== undefined) setOffsetState({experimentId,offset:nextOffset}); }}>{t('Load older')}</ControlButton>
    </div>
  </section>;
}
