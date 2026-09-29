import { useCallback,useEffect,useRef,useState,type ReactNode } from 'react';
import { ActionMenu } from '@xgc2/ui-react';
import { MoreHorizontal,RefreshCw,RotateCcw } from 'lucide-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { videoPreviewRendererUrl,type VideoPreviewFramePlan,type VideoPreviewSessionRequest } from '../../../domains/recording/recordingPublic';
import { browserFrameTransport,createFrameClient } from './frameProtocol';
import { usePreviewSession } from './usePreviewSession';
import { useVideoProductionText } from './videoProductionMessages';

export type StageArtifact = { kind: 'image' | 'video';url: string;caption: string;fingerprint?: string };

/**
 * The workbench stage: an interactive Lichtblick iframe scrubbed through the
 * frame protocol, with the exact-frame PNG job path kept as an explicit
 * fallback. No preview pixels are ever fabricated in the station.
 */
export function VideoPreviewStage({ id,experimentId,bagId,canCreate,createRequest,fingerprint,fingerprintInvalid,frame,artifact,artifactStale,onCloseArtifact,fallback,transport,onPlans }: {
  id: string;
  experimentId: string;
  bagId: string;
  canCreate: boolean;
  createRequest: () => VideoPreviewSessionRequest | undefined;
  /** Identifies the full recipe+settings the preview must match. */
  fingerprint: string;
  /** True when a configured bag/clip exists but no valid edit request can be
   * built; any ready session is by definition showing stale authoring. */
  fingerprintInvalid: boolean;
  frame: number;
  artifact?: StageArtifact;
  artifactStale: boolean;
  onCloseArtifact: () => void;
  /** Exact-frame PNG preview controls, rendered in fallback mode. */
  fallback: ReactNode;
  /** Frame-stepping transport rendered in the stage toolbar. */
  transport?: ReactNode;
  /** The ready session's prepared frame map, keyed by the fingerprint it matches. */
  onPlans?: (fingerprint: string,plans: readonly VideoPreviewFramePlan[]) => void;
}) {
  const t = useVideoProductionText();
  const session = usePreviewSession(experimentId);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [mode,setMode] = useState<'interactive' | 'fallback'>('interactive');
  const [iframeKey,setIframeKey] = useState(0);
  const [rendererNotice,setRendererNotice] = useState('');
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const client = useRef<ReturnType<typeof createFrameClient> | undefined>(undefined);
  const loaded = useRef(false);
  const failed = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef<number | undefined>(undefined);
  const rendered = useRef<number | undefined>(undefined);
  const latestFrame = useRef(frame);
  latestFrame.current = frame;
  const ready = session.phase === 'ready';
  // An empty current fingerprint with a configured bag/clip is a mismatch, not
  // a fresh start: the old session must neither look current nor keep scrubbing.
  const stale = ready && (fingerprint ? session.fingerprint !== fingerprint : fingerprintInvalid);
  const scrubEnabled = ready && !stale && mode === 'interactive' && !artifact;
  const onPlansRef = useRef(onPlans);
  onPlansRef.current = onPlans;
  const readyPlans = session.phase === 'ready' ? session.plans : undefined;
  const readyFingerprint = session.phase === 'ready' ? session.fingerprint : '';
  useEffect(() => { if (readyPlans) onPlansRef.current?.(readyFingerprint,readyPlans); },[readyPlans,readyFingerprint]);

  // A bag switch discards the old session; the first valid configuration of a
  // bag starts one session automatically, later changes are explicit refreshes.
  const previousBag = useRef(bagId);
  useEffect(() => {
    if (previousBag.current === bagId) return;
    previousBag.current = bagId;setMode('interactive');sessionRef.current.reset();
  },[bagId]);
  const autoStarted = useRef('');
  useEffect(() => {
    if (!canCreate || !fingerprint || !bagId || autoStarted.current === bagId) return;
    const value = createRequest();
    if (!value) return;
    autoStarted.current = bagId;
    sessionRef.current.start(value,fingerprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bagId,canCreate,fingerprint]);

  const disposeClient = useCallback(() => {
    client.current?.dispose();client.current = undefined;
  },[]);
  const newClient = useCallback(() => {
    disposeClient();
    const content = iframe.current?.contentWindow;
    if (!content) return undefined;
    client.current = createFrameClient({ transport: browserFrameTransport(content,window),origin: window.location.origin });
    return client.current;
  },[disposeClient]);

  const send = useCallback((target: number) => {
    const current = sessionRef.current;
    if (current.phase !== 'ready' || failed.current) return;
    const plan = current.plans[target];
    if (!plan) return;
    const sessionId = current.sessionId;
    const active = client.current ?? newClient();
    if (!active) { pending.current = target;return; }
    inFlight.current = true;
    active.requestFrame(plan).then(() => {
      inFlight.current = false;
      const now = sessionRef.current;
      if (now.phase !== 'ready' || now.sessionId !== sessionId) return;
      rendered.current = target;setRendererNotice('');
      const next = pending.current;
      pending.current = undefined;
      if (next !== undefined && next !== target) send(next);
    }).catch(() => {
      inFlight.current = false;
      const now = sessionRef.current;
      if (now.phase !== 'ready' || now.sessionId !== sessionId) return;
      // A failed client is tainted. Stop until the operator explicitly retries;
      // reloading from onLoad would otherwise create an unbounded failure loop.
      failed.current = true;
      pending.current = undefined;
      disposeClient();
      setRendererNotice(t('Preview could not render this frame. Retry or check source settings.'));
    });
  },[newClient,disposeClient,t]);

  const requestScrub = useCallback((target: number) => {
    if (!loaded.current || inFlight.current) { pending.current = target;return; }
    if (rendered.current === target) return;
    send(target);
  },[send]);
  const requestScrubRef = useRef(requestScrub);
  requestScrubRef.current = requestScrub;

  // Frame changes enter the ACK-gated pipeline directly: one in-flight request,
  // the latest target coalesced into pending. No trailing debounce — at 30 fps
  // playback a cancelling timer would starve every send until playback stops.
  useEffect(() => {
    if (!scrubEnabled) return;
    requestScrubRef.current(latestFrame.current);
  },[frame,scrubEnabled,iframeKey]);

  // Reset the render pipeline whenever a different session becomes ready.
  const readyKey = ready ? `${session.sessionId}:${iframeKey}` : '';
  useEffect(() => {
    disposeClient();loaded.current = false;inFlight.current = false;
    pending.current = undefined;rendered.current = undefined;failed.current = false;setRendererNotice('');
  },[readyKey,disposeClient]);
  useEffect(() => () => { disposeClient(); },[disposeClient]);

  function iframeLoaded() {
    loaded.current = true;
    newClient();
    const target = pending.current ?? latestFrame.current;
    pending.current = undefined;
    if (rendered.current !== target) send(target);
  }

  const stateText = artifact ? artifact.caption
    : mode === 'fallback' ? t('Exact-frame PNG fallback')
      : session.phase === 'preparing' ? t('Preparing Lichtblick snapshot…')
        : session.phase === 'failed' ? session.error
          : stale ? t('Preview is out of date')
            : rendererNotice || (ready ? t('Lichtblick · native AR') : '');
  const stateTone = session.phase === 'failed' || rendererNotice ? 'danger' : stale || artifactStale ? 'warning' : 'neutral';
  const canRefresh = session.phase === 'failed' || stale || (session.phase === 'idle' && canCreate);
  return <section className="video-preview-stage" aria-label={t('Preview')} data-xgc-role="video-preview-stage" data-xgc-id={id}>
    <div className="video-preview-viewport">
      {artifact && <div className="video-preview-media">
        {artifact.kind === 'image' && <img src={artifact.url} alt={t('Preview')} />}
        {artifact.kind === 'video' && <video controls preload="metadata" src={artifact.url} />}
      </div>}
      {!artifact && mode === 'fallback' && <div className="video-preview-fallback" data-xgc-role="video-preview-fallback" data-xgc-id={id}>
        {fallback}
      </div>}
      {!artifact && mode === 'interactive' && <>
        {session.phase === 'idle' && <p className="video-preview-placeholder">{t('Select a bag and clip to open the interactive AR preview.')}</p>}
        {session.phase === 'preparing' && <p className="video-preview-placeholder" role="status">{t('Preparing interactive preview')}</p>}
        {ready && <iframe key={iframeKey} ref={iframe} className="video-preview-iframe" title={t('Interactive preview')}
          data-stale={stale || undefined}
          src={videoPreviewRendererUrl(experimentId,session.sessionId,session.snapshotSha256)}
          onLoad={iframeLoaded} data-xgc-role="video-preview-iframe" data-xgc-id={id} />}
      </>}
    </div>
    <footer className="video-preview-footer">
      <span className="video-preview-state" data-tone={stateTone} role={stateTone === 'neutral' ? undefined : 'status'}
        data-xgc-role="video-preview-state" data-xgc-id={id} title={stateText}>{stateText}</span>
      {artifactStale && <span className="video-preview-state" data-tone="warning">{t('This preview is older than the current configuration.')}</span>}
      <span className="video-preview-actions">
        {artifact && <ControlButton size="compact" appearance="inverse" dataXgcRole="video-preview-close-artifact" dataXgcId={id} onClick={onCloseArtifact}>{t('Back to preview')}</ControlButton>}
        {!artifact && rendererNotice && <ControlButton size="compact" appearance="inverse" iconOnly aria-label={t('Retry preview')} title={t('Retry preview')}
          dataXgcRole="video-preview-retry" dataXgcId={id}
          onClick={() => { disposeClient();loaded.current = false;setIframeKey((value) => value + 1); }}><RotateCcw size={14} aria-hidden="true" /></ControlButton>}
        {!artifact && canRefresh && <ControlButton size="compact" appearance="inverse" iconOnly disabled={!fingerprint}
          aria-label={session.phase === 'failed' ? t('Retry interactive preview') : t('Refresh interactive preview')}
          title={session.phase === 'failed' ? t('Retry interactive preview') : t('Refresh interactive preview')}
          dataXgcRole="video-preview-session-start" dataXgcId={id}
          onClick={() => { const value = createRequest();if (value && fingerprint) session.start(value,fingerprint); }}><RefreshCw size={14} aria-hidden="true" /></ControlButton>}
        {!artifact && <ActionMenu ariaLabel={t('Preview options')} dataXgcId={id} dataXgcRole="video-preview-menu" triggerDataXgcRole="video-preview-menu-trigger"
          align="end" placement="above" triggerProps={{ appearance: 'inverse',uiSize: 'compact',iconOnly: true }}
          trigger={<MoreHorizontal size={15} aria-hidden="true" />}
          items={[{ id: 'fallback',label: mode === 'fallback' ? t('Back to interactive preview') : t('Fallback PNG preview'),
            onSelect: () => setMode((current) => (current === 'fallback' ? 'interactive' : 'fallback')) }]} />}
      </span>
      {transport}
    </footer>
  </section>;
}
