import { formatOperatorDateTime } from '../../../shared/operatorTime';
import { useEffect,useRef,useState } from 'react';
import { ArrowLeftToLine,ArrowRightToLine,ChevronLeft,ChevronRight,FolderOpen,Image as ImageIcon,Layers,Pause,Play,SkipBack,SkipForward } from 'lucide-react';
import { EmptyState,StatusText } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { InputControl } from '../../../components/controls/TextControls';
import { FormField } from '../../../components/FormPrimitives';
import {
  createVideoJob,deleteVideoRecipe,fetchVideoArtifact,getVideoCapabilities,getVideoJob,getVideoSourceCatalog,listVideoRecipes,saveVideoRecipe,
  type SavedVideoRecipe,type VideoCapabilities,type VideoJob,type VideoPreviewSessionRequest,type VideoRequest,type VideoSettings,type VideoSourceCatalog,
} from '../../../domains/recording/recordingPublic';
import type { PanelActionInvocation,PanelPluginProps } from '../../types';
import { experimentIdFromArtifactsPort } from '../rosbagPlotPanelModel';
import { usePolling } from '../../../hooks/usePolling';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import { usePanelInvocationObservation } from '../../usePanelInvocationObservation';
import {
  VIDEO_RENDER_ACTION_PORT,VIDEO_TRAIL_MAX_SAMPLES,catalogDurationNs,createVideoRecipe,createVideoRendition,isVideoBagCandidate,newVideoDraft,nsToSeconds,
  VIDEO_TRAIL_DEFAULT_FADE,parseFrameIndex,parseTrailFrames,permilleToPercent,renditionLabelKey,secondsToNs,videoCameraTopics,type VideoDraft,type VideoRendition,
} from './videoProductionModel';
import { useVideoProductionText,videoEditingIssueMessages,videoRecipeIssueMessages,videoRenditionIssueMessages } from './videoProductionMessages';
import { useVideoArchive } from './useVideoArchive';
import { initialVideoSettings,releaseEmptyVideoLayers,seedRecordedSource,videoSettingsIssue } from './videoSourceSettingsModel';
import { VideoJobHistory } from './VideoJobHistory';
import { VideoTimeline } from './VideoTimeline';
import { VideoPreviewStage,type StageArtifact } from './VideoPreviewStage';
import { VideoSourcePane } from './VideoSourcePane';
import { groupVideoSources,recordingModeLabel,recordingTime } from './videoSourceModel';
import { VideoTrackAdder,VideoTrackInspector } from './VideoEditingCards';
import { VideoSourceObjects,type VideoSourceTrackChoice } from './VideoSourceObjects';
import { VideoWorkbenchSettings,type VideoSettingsSection } from './VideoWorkbenchSettings';
import { VideoMediaBin,VideoProjectMenu,VideoSequenceInspector,VideoStudioTopBar } from './VideoStudioChrome';
import { formatTimecode,frameTimeNs } from './videoTimelineModel';
import { gridIndex,isTypingTarget,nextTrackColor,onFrameGrid,reanchorFrames } from './videoStudioModel';
import type { VideoPreviewFramePlan } from '../../../domains/recording/recordingPublic';
import { PanelViewSwitcher } from '../../../components/PanelViewSwitcher';
import {
  createVideoEditingSettings,newVideoEditingDraft,newVideoTrackDraft,partitionVideoEditingIssues,videoClockMappingDraftFromWire,videoEditingSourceIssues,videoTrackDraftFromWire,
} from './videoEditingModel';
import { videoRandomId } from './videoRandomId';
import { VideoProductionHeaderLeading } from './videoProductionPanelFrame';
import { useVideoProductionView } from './videoProductionPanelFrameState';
import { createDeadlineTimer } from '../../../shared/eventCoalescer';
import '../../../styles/video-production.css';
import '../../../styles/video-production-integrated.css';
import '../../../styles/video-production-editor.css';

const VIDEO_PREVIEW_BYTES_LIMIT = 256 * 1024 * 1024;
const NS = 1_000_000_000n;

type Props = PanelPluginProps;
export function VideoProductionPanel(props: Props) {
  const t = useVideoProductionText();const artifacts = props.context.ports.data['recording-artifacts'];
  const experimentId = artifacts?.connected ? experimentIdFromArtifactsPort(artifacts.value) : '';
  if (!experimentId) return <EmptyState appearance="plain" fill title={t('Video production')}
    description={t('Connect the recording artifacts of this Experiment.')} data-xgc-role="video-production-unbound" data-xgc-id={props.panel.id} />;
  const port = props.context.ports.actions[VIDEO_RENDER_ACTION_PORT];
  const scope = JSON.stringify([experimentId,props.panel.id,props.context.executionTargetId,
    port?.trace.workflowInstanceId,port?.trace.presetId,port?.trace.actionId]);
  return <VideoProductionWorkspace key={scope} {...props} experimentId={experimentId} />;
}

const DEFAULT_FADE = { trailFadeFrom: VIDEO_TRAIL_DEFAULT_FADE.from,trailFadeTo: VIDEO_TRAIL_DEFAULT_FADE.to };
/** A saved legacy exposure trail reopens as an afterimage over the same moments;
 * saving or rendering it again is an explicit new request. */
function renditionFromSaved(rendition: VideoRendition): Pick<VideoDraft,'renditionKind' | 'stillFrame' | 'trailFrames' | 'trailFadeFrom' | 'trailFadeTo'> {
  switch (rendition.kind) {
    case 'still': return { renditionKind: 'still',stillFrame: String(rendition.frame),trailFrames: '',...DEFAULT_FADE };
    case 'trail': return { renditionKind: 'trail',stillFrame: '0',trailFrames: rendition.frames.join(','),
      ...(rendition.method === 'afterimage'
        ? { trailFadeFrom: permilleToPercent(rendition.fadeFromPermille),trailFadeTo: permilleToPercent(rendition.fadeToPermille) }
        : DEFAULT_FADE) };
    default: return { renditionKind: 'video',stillFrame: '0',trailFrames: '',...DEFAULT_FADE };
  }
}

/** Output frames of the raw interval, before the whole recipe is valid. */
function intervalFrameCount(startNs: bigint,endNs: bigint,fps: number) {
  if (endNs <= startNs || !Number.isSafeInteger(fps) || fps <= 0) return 0;
  return Number(((endNs - startNs) * BigInt(fps) + NS - 1n) / NS);
}

function VideoProductionWorkspace({ panel,context,experimentId }: Props & { experimentId: string }) {
  const t = useVideoProductionText();
  const [sourceScope,setSourceScope] = useState<'current' | 'all'>('current');
  const archive = useVideoArchive(sourceScope === 'current' ? experimentId : undefined);
  const [browserView,setBrowserView] = useState<'objects' | 'media'>('media');
  const [settingsSection,setSettingsSection] = useState<VideoSettingsSection>();
  const [view,setView] = useVideoProductionView(panel.id);
  const [bagId,setBagId] = useState('');const [draft,setDraft] = useState<VideoDraft>(newVideoDraft);
  const [settings,setSettings] = useState<VideoSettings>(initialVideoSettings);
  const [editing,setEditing] = useState(newVideoEditingDraft);const [selectedTrackId,setSelectedTrackId] = useState('');
  const [playing,setPlaying] = useState(false);
  const [catalog,setCatalog] = useState<VideoSourceCatalog>();const [catalogBusy,setCatalogBusy] = useState(false);
  const [error,setError] = useState('');const [busy,setBusy] = useState(false);const [previewFrame,setPreviewFrame] = useState('0');
  const [capabilities,setCapabilities] = useState<VideoCapabilities>();const [capabilityRevision,setCapabilityRevision] = useState(0);
  const [saved,setSaved] = useState<SavedVideoRecipe[]>([]);const [selectedSaved,setSelectedSaved] = useState<SavedVideoRecipe>();
  const [receipt,setReceipt] = useState<PanelActionInvocation>();const [historyRevision,setHistoryRevision] = useState(0);
  const [stage,setStage] = useState<StageArtifact>();const [previewJobId,setPreviewJobId] = useState('');
  const [previewJob,setPreviewJob] = useState<VideoJob>();
  const lock = useRef(false);const mounted = useRef(true);
  const workspaceRoot = useRef<HTMLElement | null>(null);
  const previewPlans = useRef<{ fingerprint: string;plans: readonly VideoPreviewFramePlan[] } | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const restore = useRef<SavedVideoRecipe | undefined>(undefined);
  const [catalogRevision,setCatalogRevision] = useState(0);
  const ticket = useRef<{ fingerprint: string;key: string;id?: string } | undefined>(undefined);
  const stageURL = useRef('');const previewFingerprint = useRef('');
  const port = context.ports.actions[VIDEO_RENDER_ACTION_PORT];
  const bags = archive.bags.filter(isVideoBagCandidate);
  const latestBag = groupVideoSources(bags)[0]?.items[0];
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; },[]);
  useEffect(() => () => { if (stageURL.current) URL.revokeObjectURL(stageURL.current); },[]);
  useEffect(() => {
    const controller = new AbortController();
    void getVideoCapabilities(experimentId,controller.signal).then((value) => { if (!controller.signal.aborted) setCapabilities(value); }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(String(cause)); });
    return () => controller.abort();
  },[experimentId,capabilityRevision]);
  useEffect(() => {
    const controller = new AbortController();
    void listVideoRecipes(experimentId,controller.signal).then((value) => { if (!controller.signal.aborted) setSaved(value.items); }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(String(cause)); });
    return () => controller.abort();
  },[experimentId,selectedSaved]);
  useEffect(() => {
    const controller = new AbortController();setCatalog(undefined);setCatalogBusy(Boolean(bagId));
    if (!bagId) return () => controller.abort();
    const previous = restore.current;
    void getVideoSourceCatalog(experimentId,bagId,previous?.request.videoRecipe.source.sessionId,controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (value.id !== bagId || value.experimentId !== experimentId) throw new Error('Bag catalog scope mismatch.');
      if (previous && (value.size !== previous.request.videoRecipe.source.recordedSize || value.sessionId !== previous.request.videoRecipe.source.sessionId)) throw new Error('The saved source changed; select and configure the archive again.');
      const savedContext = previous?.request.settings.sourceContextSha256;
      if (savedContext && (value.recordedContext.status !== 'available' || value.recordedContext.sha256 !== savedContext)) throw new Error('The saved recording context changed; select and configure the archive again.');
      const savedFacts = previous?.request.settings.recordFactsSha256;
      if (savedFacts && (value.recordFacts.status !== 'available' || value.recordFacts.sha256 !== savedFacts)) throw new Error('The saved record facts changed; select and configure the archive again.');
      setCatalog(value);
      if (!previous) {
        const seeded = seedRecordedSource(value.topics, settingsRef.current);
        setSettings({
          ...seeded,
          ...(value.recordedContext.status === 'available' ? { sourceContextSha256: value.recordedContext.sha256 } : {}),
          ...(value.recordFacts.status === 'available' ? { recordFactsSha256: value.recordFacts.sha256 } : {}),
        });
        setDraft((current) => ({
          ...current,
          endSeconds: nsToSeconds(BigInt(value.durationNs)),
          layers: releaseEmptyVideoLayers(seeded, current.layers),
        }));
      }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setCatalogBusy(false); });
    return () => controller.abort();
  },[experimentId,bagId,catalogRevision]);
  // Catalog and capability reads may finish in either order. Select a sole
  // supported source only for a new bag; never replace a saved/user selection.
  useEffect(() => {
    if (!catalog || !capabilities || restore.current) return;
    const cameras = videoCameraTopics({ ...catalog,durationSec:Number(catalog.durationNs) / 1e9,supportedCameraMessageTypes:capabilities.messageTypes });
    if (cameras.length === 1) setDraft((current) => current.cameraTopic ? current : { ...current,cameraTopic:cameras[0].name });
  },[catalog,capabilities]);
  const modelCatalog = catalog ? { ...catalog,durationSec: Number(catalog.durationNs) / 1e9,supportedCameraMessageTypes:capabilities?.messageTypes ?? [] } : undefined;
  const cameraTopics = videoCameraTopics(modelCatalog);
  const selectableCatalog = catalog ? { ...catalog,objects:catalog.objects.filter((object) => object.kind !== 'camera' || cameraTopics.some((topic) => topic.name === object.topic)) } : undefined;
  const bag = catalog ? { id: catalog.id,name: catalog.name,size: catalog.size,experimentId,sessionId: catalog.sessionId } : undefined;
  const result = createVideoRecipe({ experimentId,bag,catalog: modelCatalog,draft });
  const renditionResult = result.ok ? createVideoRendition({
    kind: draft.renditionKind,frame: draft.stillFrame,trailFrames: draft.trailFrames,trailFadeFrom: draft.trailFadeFrom,trailFadeTo: draft.trailFadeTo,
  },result.frameCount) : undefined;
  const durationNs = catalogDurationNs(modelCatalog);
  const startNs = secondsToNs(draft.startSeconds);
  const endNs = secondsToNs(draft.endSeconds);
  const intervalValid = startNs !== undefined && endNs !== undefined && startNs < endNs
    && durationNs !== undefined && endNs <= durationNs;
  const intervalFrames = intervalValid ? intervalFrameCount(startNs,endNs,draft.fps) : 0;
  const playhead = Math.min(parseFrameIndex(previewFrame,Math.max(intervalFrames,1)) ?? 0,Math.max(intervalFrames - 1,0));
  const lastFrame = Math.max(intervalFrames - 1,0);
  const issue = videoSettingsIssue(settings,draft.layers);
  const editingResult = createVideoEditingSettings(editing,durationNs);
  const editingSourceIssues = videoEditingSourceIssues({
    layerTopics: settings.layerTopics,layers: draft.layers,
    transformTopics: settings.transformTopics,staticTransformTopics: settings.staticTransformTopics,
    calibrationTopic: settings.calibrationTopic,cameraTopic: draft.cameraTopic,
  },editing);
  const editingValid = editingResult.ok && editingSourceIssues.length === 0;
  const editingIssues = partitionVideoEditingIssues([...(editingResult.ok ? [] : editingResult.issues),...editingSourceIssues]);
  const settingsWire: VideoSettings = editingValid ? { ...settings,...editingResult.settings } : settings;
  const trailParsed = draft.renditionKind === 'trail' ? parseTrailFrames(draft.trailFrames) ?? [] : undefined;
  const trailSampleFrames = trailParsed?.filter((sample) => sample >= 0 && sample < intervalFrames);
  const previewIndex = result.ok ? parseFrameIndex(previewFrame,result.frameCount) : undefined;
  const cameraReady = Boolean(draft.cameraTopic && cameraTopics.some((topic) => topic.name === draft.cameraTopic));
  const canCreatePreview = Boolean(bagId && catalog && cameraReady && intervalValid);
  function createPreviewRequest(): VideoPreviewSessionRequest | undefined {
    if (!canCreatePreview || !result.ok || issue || !editingValid) return undefined;
    return { videoRecipe: result.recipe,settings: structuredClone(settingsWire) };
  }
  const previewFingerprintValue = (() => { const value = createPreviewRequest(); return value ? JSON.stringify(value) : ''; })();
  /** Trims keep output markers (still, trail samples, playhead) on the same
   * source instant: an In move of Δ grid frames shifts them by −Δ. */
  function clipChange(nextStart: bigint,nextEnd: bigint) {
    const fps = draft.fps;
    const previous = startNs;
    const nextFrames = intervalFrameCount(nextStart,nextEnd,fps);
    const delta = previous !== undefined && onFrameGrid(previous,fps) && onFrameGrid(nextStart,fps)
      ? Number(gridIndex(nextStart,fps) - gridIndex(previous,fps)) : 0;
    setDraft((current) => {
      const next = { ...current,startSeconds: nsToSeconds(nextStart),endSeconds: nsToSeconds(nextEnd) };
      if (!delta) return next;
      const trail = parseTrailFrames(current.trailFrames);
      const still = parseFrameIndex(current.stillFrame,Number.MAX_SAFE_INTEGER);
      return {
        ...next,
        ...(trail ? { trailFrames: reanchorFrames(trail,delta,nextFrames).join(',') } : {}),
        ...(still !== undefined ? { stillFrame: String(Math.min(Math.max(still - delta,0),Math.max(nextFrames - 1,0))) } : {}),
      };
    });
    if (delta) setPreviewFrame((current) => String(Math.min(Math.max((parseFrameIndex(current,Number.MAX_SAFE_INTEGER) ?? 0) - delta,0),Math.max(nextFrames - 1,0))));
  }
  // Retain the accepted Run independently of the current authoring-head projection.
  // A terminal receipt is never a pending render; stale summaries cannot revive it.
  const observation = usePanelInvocationObservation(port,receipt);
  const own = observation.invocation;
  const projected = port?.activeInvocation;
  const active = isRunStatusActive(own?.status) ? own
    : projected?.id !== own?.id && isRunStatusActive(projected?.status) ? projected : undefined;
  useEffect(() => {
    if (own?.status === 'failed' || own?.status === 'rejected') {
      setError(observation.detail?.run?.primaryError || t('Render workflow status: {status}',{ status: own.status }));
    }
  },[observation.detail?.run?.primaryError,own?.id,own?.status,t]);
  const refused = context.disabledReason || port?.disabledReason || (!port?.connected ? t('Connect a dedicated Render video workflow to submit a recipe.') : '');
  const baseDisabled = !result.ok || !editingValid || Boolean(issue || refused || busy || active || catalogBusy) || !capabilities?.available;
  const renderDisabled = baseDisabled || !renditionResult?.ok;
  function showStage(next: StageArtifact | undefined) {
    if (stageURL.current) URL.revokeObjectURL(stageURL.current);
    stageURL.current = next?.url ?? '';setStage(next);
  }
  function buildRequest(rendition: VideoRendition): VideoRequest | undefined {
    if (!result.ok || issue || !editingValid) return undefined;
    return { videoRecipe: result.recipe,settings: structuredClone(settingsWire),rendition };
  }
  function previewRequest() {
    return previewIndex === undefined ? undefined : buildRequest({ kind: 'preview',frame: previewIndex });
  }
  function renderRequest() {
    return renditionResult?.ok ? buildRequest(renditionResult.rendition) : undefined;
  }
  function selectBag(id: string) {
    restore.current = undefined;setBagId(id);setCatalog(undefined);setDraft(newVideoDraft());setSettings(initialVideoSettings());
    setEditing(newVideoEditingDraft());setSelectedTrackId('');setPlaying(false);
    setBrowserView('objects');setSettingsSection(undefined);
    setSelectedSaved(undefined);setPreviewFrame('0');setPreviewJobId('');setPreviewJob(undefined);showStage(undefined);setError('');ticket.current = undefined;
  }
  function setTrackEnabled(ids: readonly string[],enabled: boolean) {
    const selected = new Set(ids);
    setEditing((current) => ({ ...current,tracks:current.tracks.map((track) => selected.has(track.id) ? { ...track,enabled } : track) }));
  }
  function addSourceTrack(choice: VideoSourceTrackChoice) {
    const object = catalog?.objects.find((item) => item.id === choice.objectId);
    if (!object) return;
    let next;
    if (object.kind === 'robot' && object.robot) {
      const model = capabilities?.models.find((item) => item.modelId === choice.modelId);
      if (!model) return;
      next = newVideoTrackDraft('robot-model',{ durationNs,modelId:model.modelId,bundleSha256:model.bundleSha256,frameId:object.robot.frame.id });
    } else if ((object.kind === 'path' || object.kind === 'markers') && object.topic && choice.layer) {
      const role = choice.layer;
      const allowed = object.kind === 'path' ? ['history','predictions'] : ['labels','obstacles'];
      if (!allowed.includes(role) || Object.entries(settings.layerTopics).some(([key,topics]) => key !== role && topics.includes(object.topic!))) return;
      const topic = object.topic;
      setSettings((current) => ({ ...current,layerTopics:{ ...current.layerTopics,[role]:[...new Set([...current.layerTopics[role],topic])] } }));
      setDraft((current) => ({ ...current,layers:{ ...current.layers,[role]:true } }));
      next = newVideoTrackDraft(object.kind,{ durationNs,topic,color:object.kind === 'path' ? settings.pathColors?.[topic] ?? nextTrackColor(editing.tracks.map((track) => track.color).filter(Boolean)) : '',widthMeters:settings.pathWidth });
    } else return;
    next.label = object.label;
    // Choosing a recorded object is an explicit metadata edit. Merely restoring
    // a pre-context recipe never upgrades its accepted request identity.
    if (catalog?.recordedContext.status === 'available') {
      const digest = catalog.recordedContext.sha256;
      setSettings((current) => ({ ...current,sourceContextSha256:digest }));
    }
    if (catalog?.recordFacts.status === 'available') {
      const digest = catalog.recordFacts.sha256;
      setSettings((current) => ({ ...current,recordFactsSha256:digest }));
    }
    setEditing((current) => ({ ...current,tracks:[...current.tracks,next] }));setSelectedTrackId(next.id);
  }
  function loadSaved(id: string) {
    const value = saved.find((item) => item.id === id);if (!value || value.experimentId !== experimentId) return;
    const r = value.request.videoRecipe;restore.current = value;setSelectedSaved(value);setError('');ticket.current = undefined;
    setPlaying(false);setSelectedTrackId('');
    // The editing drafts are the single authority for tracks/clockMappings;
    // the base settings state never carries them, so deleting the last edit
    // cannot resurrect the saved arrays on the wire.
    const { tracks: savedTracks,clockMappings: savedClockMappings,...baseSettings } = value.request.settings;
    setEditing({
      clockMappings: (savedClockMappings ?? []).map(videoClockMappingDraftFromWire),
      tracks: (savedTracks ?? []).map(videoTrackDraftFromWire),
    });
    setDraft({
      cameraTopic: r.source.cameraTopic,startSeconds: nsToSeconds(BigInt(r.interval.startNs)),endSeconds: nsToSeconds(BigInt(r.interval.endNs)),
      fps: r.output.fps,layers: { ...r.view.layers },...renditionFromSaved(value.request.rendition),
    });
    setSettings(structuredClone(baseSettings));
    if (value.request.rendition.kind === 'preview') setPreviewFrame(String(value.request.rendition.frame));
    // A load is a new catalog request even when the archive ID is unchanged.
    setSettingsSection(undefined);setBrowserView('objects');
    setBagId(r.source.bagId);setCatalogRevision((n) => n + 1);
  }
  async function submit(target: 'render' | 'preview') {
    const value = target === 'preview' ? previewRequest() : renderRequest();
    if (!value || !port || baseDisabled || (target === 'render' && !renditionResult?.ok) || lock.current) return;
    lock.current = true;setBusy(true);setError('');
    try {
      const fingerprint = JSON.stringify(value);
      if (!ticket.current || ticket.current.fingerprint !== fingerprint) ticket.current = { fingerprint,key: videoRandomId() };
      const current = ticket.current;
      if (!current.id) {
        const job = await createVideoJob(experimentId,value,current.key);
        if (job.experimentId !== experimentId || job.bagId !== value.videoRecipe.source.bagId) throw new Error('Video admission scope mismatch.');
        current.id = job.id;
      }
      // A source request may outlive its workspace. Leave the immutable ticket
      // prepared for history/discard, but do not start work after a scope switch.
      if (!mounted.current) return;
      const invocation = await port.invoke({ experimentId,videoJobId: current.id },'Render one immutable archived Experiment request');
      if (!mounted.current) return;
      setReceipt(invocation);setHistoryRevision((n) => n + 1);
      if (target === 'preview' && current.id) { previewFingerprint.current = fingerprint;setPreviewJob(undefined);setPreviewJobId(current.id); }
      ticket.current = undefined;
    } catch (cause) { if (mounted.current) { setError(String(cause));setHistoryRevision((n) => n + 1); } }
    finally { lock.current = false;if (mounted.current) setBusy(false); }
  }
  async function persistRecipe() {
    const value = renderRequest();if (!value || lock.current) return;lock.current = true;setBusy(true);setError('');
    try { const next = await saveVideoRecipe(experimentId,value,selectedSaved);if (mounted.current) setSelectedSaved(next); }
    catch (cause) { if (mounted.current) setError(String(cause)); }
    finally { lock.current = false;if (mounted.current) setBusy(false); }
  }
  async function removeRecipe() {
    if (!selectedSaved || lock.current) return;lock.current = true;setBusy(true);
    try { await deleteVideoRecipe(experimentId,selectedSaved);if (mounted.current) setSelectedSaved(undefined); }
    catch (cause) { if (mounted.current) setError(String(cause)); }
    finally { lock.current = false;if (mounted.current) setBusy(false); }
  }
  async function cancelRender() {
    if (!port || !active || !port.action?.controls.includes('cancel') || lock.current) return;lock.current = true;setBusy(true);
    try { await port.control(active,'cancel','Cancel this video render only'); }
    catch (cause) { if (mounted.current) setError(String(cause)); }
    finally { lock.current = false;if (mounted.current) { setBusy(false);setHistoryRevision((n) => n + 1); } }
  }
  async function showArtifact(job: VideoJob) {
    if (!job.artifact) return;
    const name = job.artifact;
    const isVideo = name.endsWith('.mp4');
    if (isVideo && (!Number.isSafeInteger(job.artifactSize) || (job.artifactSize ?? 0) > VIDEO_PREVIEW_BYTES_LIMIT)) return;
    try {
      const blob = await fetchVideoArtifact(experimentId,job.id,name);
      if (!mounted.current) return;
      setView('studio');
      showStage({ kind: isVideo ? 'video' : 'image',url: URL.createObjectURL(blob),
        caption: `${t(renditionLabelKey(job.rendition))} · ${job.id} · ${name}` });
    } catch (cause) { if (mounted.current) setError(String(cause)); }
  }
  // Poll the admitted preview job until Core commits a verified preview.png.
  const previewActive = Boolean(previewJobId) && (!previewJob || !['succeeded','failed','cancelled','interrupted'].includes(previewJob.status));
  usePolling({
    enabled: previewActive,intervalMs: 2000,pollKey: `${experimentId}:${previewJobId}`,
    task: async () => {
      const job = await getVideoJob(experimentId,previewJobId);
      setPreviewJob(job);
      if (job.status === 'succeeded') {
        if (job.artifact === 'preview.png') {
          const blob = await fetchVideoArtifact(experimentId,job.id,'preview.png');
          showStage({ kind: 'image',url: URL.createObjectURL(blob),caption: `${t('AR preview')} · ${job.id}`,fingerprint: previewFingerprint.current });
        }
        setHistoryRevision((n) => n + 1);
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted') {
        setError(job.error || `${t('Render workflow status: {status}',{ status: t(job.status) })}`);
        setHistoryRevision((n) => n + 1);
      }
    },
    onError: (cause) => setError(String(cause)),
  });
  const currentPreviewFingerprint = (() => { const value = previewRequest();return value ? JSON.stringify(value) : ''; })();
  const renditionIssues = renditionResult && !renditionResult.ok ? renditionResult.issues : [];
  const renderLabel = draft.renditionKind === 'still' ? t('Render 4K still')
    : draft.renditionKind === 'trail' ? t('Render 4K afterimage') : t('Render 4K video');

  const fallbackControls = <>
    <div className="video-production-toolbar">
      <FormField label={t('Preview frame (zero-based)')}><InputControl value={previewFrame} inputMode="numeric" aria-label={t('Preview frame (zero-based)')}
        dataXgcRole="video-preview-frame" dataXgcId={panel.id} onChange={setPreviewFrame} /></FormField>
      <ControlButton size="compact" disabled={baseDisabled || !previewRequest()} dataXgcRole="video-production-preview" dataXgcId={panel.id}
        onClick={() => void submit('preview')}>{t('Render preview frame')}</ControlButton>
    </div>
    {previewJob && previewJob.status !== 'succeeded' && !['failed','cancelled','interrupted'].includes(previewJob.status)
      && <p role="status">{t('Render workflow status: {status}',{ status: t(previewJob.status) })} · {t('Completed frames')}: {previewJob.renderedFrames}/{Math.max(previewJob.captureCount,1)}</p>}
  </>;
  // Playback advances the controlled frame index at wall-clock fps; the preview
  // keeps its native frame ACK and coalesces — the playhead never claims that a
  // frame was displayed.
  useEffect(() => {
    if (!playing || intervalFrames < 1) return undefined;
    const timer = createDeadlineTimer(() => {
      setPreviewFrame((current) => {
        const index = parseFrameIndex(current,Math.max(intervalFrames,1)) ?? 0;
        return String(Math.min(index + 1,lastFrame));
      });
      timer.schedule(1000 / draft.fps);
    });
    timer.schedule(1000 / draft.fps);
    return () => timer.cancel();
  },[playing,intervalFrames,lastFrame,draft.fps]);
  useEffect(() => {
    if (playing && (intervalFrames < 1 || playhead >= lastFrame)) setPlaying(false);
  },[playing,intervalFrames,playhead,lastFrame]);
  function addTrailSample(sample: number) {
    const parsed = parseTrailFrames(draft.trailFrames) ?? [];
    if (parsed.includes(sample) || parsed.length >= VIDEO_TRAIL_MAX_SAMPLES) return;
    setDraft((current) => ({ ...current,trailFrames: [...parsed,sample].sort((a,b) => a - b).join(',') }));
  }
  function removeTrailSample(sample: number) {
    const parsed = parseTrailFrames(draft.trailFrames) ?? [];
    setDraft((current) => ({ ...current,trailFrames: parsed.filter((item) => item !== sample).join(',') }));
  }
  const transport = <div className="video-stepper" role="group" aria-label={t('Frame transport')}
    data-xgc-role="video-transport" data-xgc-id={panel.id}>
    <ControlButton size="compact" iconOnly disabled={intervalFrames < 1 || playhead <= 0}
      aria-label={t('First frame')} title={`${t('First frame')} (Home)`} dataXgcRole="video-transport-first" dataXgcId={panel.id}
      onClick={() => setPreviewFrame('0')}><SkipBack size={13} aria-hidden="true" /></ControlButton>
    <ControlButton size="compact" iconOnly disabled={intervalFrames < 1 || playhead <= 0}
      aria-label={t('Previous frame')} title={`${t('Previous frame')} (←)`} dataXgcRole="video-transport-prev" dataXgcId={panel.id}
      onClick={() => setPreviewFrame(String(Math.max(playhead - 1,0)))}><ChevronLeft size={13} aria-hidden="true" /></ControlButton>
    <ControlButton size="compact" iconOnly tone={playing ? 'primary' : 'default'} disabled={intervalFrames < 1} aria-pressed={playing}
      aria-label={playing ? t('Pause') : t('Play')} title={`${playing ? t('Pause') : t('Play')} (Space)`}
      dataXgcRole="video-transport-play" dataXgcId={panel.id}
      onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}</ControlButton>
    <ControlButton size="compact" iconOnly disabled={intervalFrames < 1 || playhead >= lastFrame}
      aria-label={t('Next frame')} title={`${t('Next frame')} (→)`} dataXgcRole="video-transport-next" dataXgcId={panel.id}
      onClick={() => setPreviewFrame(String(Math.min(playhead + 1,lastFrame)))}><ChevronRight size={13} aria-hidden="true" /></ControlButton>
    <ControlButton size="compact" iconOnly disabled={intervalFrames < 1 || playhead >= lastFrame}
      aria-label={t('Last frame')} title={`${t('Last frame')} (End)`} dataXgcRole="video-transport-last" dataXgcId={panel.id}
      onClick={() => setPreviewFrame(String(lastFrame))}><SkipForward size={13} aria-hidden="true" /></ControlButton>
  </div>;
  const playheadNs = intervalValid ? startNs + frameTimeNs(BigInt(playhead),draft.fps) : undefined;
  const timecode = intervalValid && playheadNs !== undefined && durationNs !== undefined ? {
    current: formatTimecode(playheadNs,draft.fps),total: formatTimecode(durationNs,draft.fps),
  } : undefined;
  const sourceBag = bags.find((item) => item.id === bagId);
  const sourceDetail = sourceBag ? [sourceBag.experimentName?.trim(),sourceBag.runMode ? t(recordingModeLabel(sourceBag.runMode)) : '',
    recordingTime(sourceBag) !== undefined ? formatOperatorDateTime(sourceBag.startedAt!) : ''].filter(Boolean).join(' · ') : '';
  const selectedTrack = editing.tracks.find((track) => track.id === selectedTrackId);
  const header = <VideoProductionHeaderLeading panel={panel} editing={Boolean(context.editing)} />;
  // Why Render is unavailable, in plain words, for the inspector — never a banner wall.
  const blockers = [...new Set([
    ...(capabilities && !capabilities.available ? [`${t('Offline worker unavailable')}: ${capabilities.reason}`] : []),
    ...(refused ? [refused] : []),
    ...(bagId && !catalogBusy && !result.ok ? result.issues.map((item) => t(videoRecipeIssueMessages[item])) : []),
    ...(issue ? [t(issue)] : []),
    ...editingIssues.trackIssues.map((item) => t(videoEditingIssueMessages[item])),
    ...editingIssues.clockIssues.map((item) => t(videoEditingIssueMessages[item])),
    ...renditionIssues.map((item) => t(videoRenditionIssueMessages[item])),
  ])];
  const failure = error || observation.error;
  const renderStatus = failure && !`${failure}`.includes('configuration: invalid input')
    ? { tone: 'danger' as const,text: failure }
    : archive.error ? { tone: 'danger' as const,text: archive.error }
      : archive.incomplete ? { tone: 'warning' as const,text: t('Some recording history is unavailable.') } : undefined;
  const sessionPlans = previewPlans.current?.fingerprint === previewFingerprintValue ? previewPlans.current.plans : undefined;
  function markIn() {
    if (!intervalValid || playhead <= 0) return;
    clipChange(startNs + frameTimeNs(BigInt(playhead),draft.fps),endNs);
  }
  function markOut() {
    if (!intervalValid || playhead >= lastFrame) return;
    clipChange(startNs,startNs + frameTimeNs(BigInt(playhead + 1),draft.fps));
  }
  function toggleTrailAtPlayhead() {
    if (draft.renditionKind !== 'trail' || intervalFrames < 1) return;
    if ((trailSampleFrames ?? []).includes(playhead)) removeTrailSample(playhead);else addTrailSample(playhead);
  }
  // NLE shortcuts; never while typing into a field or driving a focused slider.
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => undefined);
  shortcuts.current = (event: KeyboardEvent) => {
    if (view !== 'studio' || settingsSection || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const root = workspaceRoot.current;
    if (!root || !(event.target === document.body || (event.target instanceof Node && root.contains(event.target)))) return;
    if (isTypingTarget(event.target) || intervalFrames < 1) return;
    const step = event.shiftKey ? 10 : 1;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const handled = key === ' ' ? (setPlaying((value) => !value),true)
      : key === 'ArrowLeft' ? (setPreviewFrame(String(Math.max(playhead - step,0))),true)
      : key === 'ArrowRight' ? (setPreviewFrame(String(Math.min(playhead + step,lastFrame))),true)
      : key === 'Home' ? (setPreviewFrame('0'),true)
      : key === 'End' ? (setPreviewFrame(String(lastFrame)),true)
      : key === 'i' ? (markIn(),true)
      : key === 'o' ? (markOut(),true)
      : key === 's' && draft.renditionKind === 'still' ? (setDraft((current) => ({ ...current,stillFrame: String(playhead) })),true)
      : key === 't' && draft.renditionKind === 'trail' ? (toggleTrailAtPlayhead(),true)
      : false;
    if (handled) event.preventDefault();
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event);
    document.addEventListener('keydown',listener);
    return () => document.removeEventListener('keydown',listener);
  },[]);
  const editTools = <>
    <ControlButton size="compact" appearance="inverse" iconOnly disabled={!intervalValid || playhead <= 0} aria-label={t('Mark in')} title={`${t('Mark in at playhead')}  I`}
      dataXgcRole="video-mark-in" dataXgcId={panel.id} onClick={markIn}><ArrowRightToLine size={14} aria-hidden="true" /></ControlButton>
    <ControlButton size="compact" appearance="inverse" iconOnly disabled={!intervalValid || playhead >= lastFrame} aria-label={t('Mark out')} title={`${t('Mark out at playhead')}  O`}
      dataXgcRole="video-mark-out" dataXgcId={panel.id} onClick={markOut}><ArrowLeftToLine size={14} aria-hidden="true" /></ControlButton>
    {draft.renditionKind === 'still' && <ControlButton size="compact" appearance="inverse" iconOnly disabled={intervalFrames < 1}
      aria-label={t('Set still frame')} title={`${t('Set still frame at playhead')}  S`}
      dataXgcRole="video-timeline-set-still" dataXgcId={panel.id}
      onClick={() => setDraft((current) => ({ ...current,stillFrame: String(playhead) }))}><ImageIcon size={14} aria-hidden="true" /></ControlButton>}
  </>;
  const stillMarker = draft.renditionKind === 'still' ? parseFrameIndex(draft.stillFrame,Math.max(intervalFrames,1)) : undefined;
  const canSave = result.ok && editingValid && Boolean(renditionResult?.ok) && !issue && !busy && !catalogBusy;
  return <section className="video-production video-studio" aria-label={t('Video production')} data-xgc-role="video-production" data-xgc-id={panel.id} ref={workspaceRoot}>
    <VideoStudioTopBar id={panel.id} leading={header} studio={view === 'studio'}
      transport={transport} timecode={timecode}
      render={{ label: renderLabel,disabled: renderDisabled,title: blockers[0] ?? refused ?? undefined,onRender: () => void submit('render'),
        ...(active ? { active: { progress: t('Rendering · {status}',{ status: t(active.status) }),
          ...(port?.action?.controls.includes('cancel') && !busy ? { onCancel: () => void cancelRender() } : {}) } } : {}) }} />
    {view === 'renders'
      ? <div className="video-renders">
        <VideoJobHistory experimentId={experimentId} id={panel.id} revision={historyRevision} onShowArtifact={(job) => void showArtifact(job)} />
      </div>
      : <div className="video-workbench">
      <aside className="video-browser" data-xgc-role="video-browser" data-xgc-id={panel.id} data-xgc-recipe-ready={canSave ? 'true' : 'false'}>
        <div className="video-browser-header">
          <PanelViewSwitcher ariaLabel={t('Workbench browser')} dataXgcRole="video-browser-views" dataXgcId={panel.id}
            optionDataXgcRole="video-browser-view" presentation="labels" value={browserView} onChange={setBrowserView}
            items={[{ id:'objects' as const,label:t('Objects'),icon:Layers },{ id:'media' as const,label:t('Media'),icon:FolderOpen }]} />
          <VideoProjectMenu id={panel.id} bagSelected={Boolean(bagId)} canSave={canSave} onSave={() => void persistRecipe()}
            onOpenSettings={setSettingsSection} onOpenMedia={() => setBrowserView('media')} />
        </div>
        {catalog && <button type="button" className="video-browser-source" title={[catalog.name,sourceDetail].filter(Boolean).join('\n')}
          data-xgc-role="video-current-source" data-xgc-id={panel.id} onClick={() => setBrowserView('media')}>
          <strong>{catalog.name}</strong>{sourceDetail && <small>{sourceDetail}</small>}
        </button>}
        <div className="video-browser-body">
        {!bagId && latestBag && <button type="button" className="video-recent-recording"
          data-xgc-role="video-recent-recording" data-xgc-id={`${panel.id}:${latestBag.id}`} title={latestBag.name}
          onClick={() => selectBag(latestBag.id)}>
          <span>{t('Latest recording')}</span><strong>{[latestBag.experimentName?.trim(),latestBag.name.split('/').pop()].filter(Boolean).join(' · ')}</strong>
          {(latestBag.runMode || recordingTime(latestBag) !== undefined) && <small>{[latestBag.runMode ? t(recordingModeLabel(latestBag.runMode)) : '',recordingTime(latestBag) !== undefined ? formatOperatorDateTime(latestBag.startedAt!) : ''].filter(Boolean).join(' · ')}</small>}
        </button>}
        {browserView === 'media' ? <VideoMediaBin id={panel.id} experimentId={experimentId} revision={historyRevision}
          cameraTopics={cameraTopics} cameraTopic={draft.cameraTopic}
          onCamera={(cameraTopic) => setDraft((current) => ({ ...current,cameraTopic }))}
          onShowArtifact={(job) => void showArtifact(job)}
          saved={saved} selectedSaved={selectedSaved} onLoadSaved={loadSaved} onDeleteSaved={() => void removeRecipe()} busy={busy}
          recordings={<VideoSourcePane id={panel.id} bags={bags} selectedId={bagId} busy={archive.busy}
            loaded={archive.loaded} scope={sourceScope} onScopeChange={setSourceScope} nextOffset={archive.nextOffset}
            onSelect={selectBag} onRefresh={() => { void archive.load();setCapabilityRevision((n) => n + 1); }}
            onLoadOlder={() => { if (archive.nextOffset !== undefined) void archive.load(archive.nextOffset); }} />} />
          : <>
            {!bagId ? <EmptyState appearance="plain" density="compact" title={t('Select a recording')} /> : <>
              {selectableCatalog && <VideoSourceObjects id={panel.id} catalog={selectableCatalog} models={capabilities?.models ?? []}
                settings={settings} tracks={editing.tracks} selectedTrackId={selectedTrackId} cameraTopic={draft.cameraTopic}
                canToggle={capabilities?.editing.trackEnabled === true} onSelectTrack={setSelectedTrackId} onSetEnabled={setTrackEnabled}
                onAdd={addSourceTrack} onCamera={(cameraTopic) => setDraft((current) => ({ ...current,cameraTopic }))} />}
              <VideoTrackAdder id={panel.id} editing={editing} settings={settings} durationNs={durationNs}
                layers={draft.layers} models={capabilities?.models ?? []}
                onEnableLayer={(role) => setDraft((current) => ({ ...current,layers:{ ...current.layers,[role]:true } }))}
                onChange={setEditing} onSelectTrack={setSelectedTrackId} />
            </>}
          </>}
        </div>
      </aside>
      <div className="video-stage-pane">
        <VideoPreviewStage id={panel.id} experimentId={experimentId} bagId={bagId}
          canCreate={canCreatePreview} createRequest={createPreviewRequest} fingerprint={previewFingerprintValue}
          fingerprintInvalid={Boolean(bagId && catalog && intervalValid) && !previewFingerprintValue}
          frame={playhead} artifact={stage} artifactStale={Boolean(stage?.fingerprint && currentPreviewFingerprint && stage.fingerprint !== currentPreviewFingerprint)}
          onCloseArtifact={() => showStage(undefined)} fallback={fallbackControls}
          onPlans={(fingerprint,plans) => { previewPlans.current = { fingerprint,plans }; }} />
      </div>
      <div className="video-timeline-pane">
        {catalogBusy && <p className="video-timeline-empty" role="status">{t('Loading bag catalog')}</p>}
        {!catalogBusy && !intervalValid && <p className="video-timeline-empty">{bagId ? t('Set a valid clip to edit the timeline.') : t('Select a recording')}</p>}
        {!catalogBusy && durationNs !== undefined && intervalValid && <VideoTimeline id={panel.id}
          durationNs={durationNs} fps={draft.fps} startNs={startNs} endNs={endNs}
          frame={playhead} frameCount={intervalFrames} disabled={intervalFrames < 1}
          cameraLabel={draft.cameraTopic} stillFrame={stillMarker} tools={editTools}
          tracks={editingValid && editingResult.ok ? editingResult.settings.tracks ?? [] : []}
          selectedTrackId={selectedTrackId} onSelectTrack={setSelectedTrackId}
          trailFrames={draft.renditionKind === 'trail' ? trailSampleFrames : undefined}
          onAddTrailSample={draft.renditionKind === 'trail' ? addTrailSample : undefined}
          onRemoveTrailSample={draft.renditionKind === 'trail' ? removeTrailSample : undefined}
          onClipChange={clipChange} onScrub={(next) => setPreviewFrame(String(next))} />}
      </div>
      <aside className="video-inspector" data-xgc-role="video-inspector" data-xgc-id={panel.id}>
        {selectedTrack ? <>
          <div className="video-inspector-title">
            <ControlButton size="compact" appearance="ghost" iconOnly aria-label={t('Back to sequence')} title={t('Back to sequence')}
              dataXgcRole="video-inspector-back" dataXgcId={panel.id} onClick={() => setSelectedTrackId('')}><ChevronLeft size={14} aria-hidden="true" /></ControlButton>
            <h3>{selectedTrack.label || t('Untitled track')}</h3>
          </div>
          <VideoTrackInspector id={panel.id} editing={editing} selectedTrackId={selectedTrackId}
            models={capabilities?.models ?? []} canToggle={capabilities?.editing.trackEnabled === true}
            issues={editingIssues.trackIssues} onChange={setEditing} onSelectTrack={setSelectedTrackId} />
        </> : bagId ? <VideoSequenceInspector id={panel.id} draft={draft} setDraft={setDraft} cameraTopics={cameraTopics}
            frameCount={intervalFrames} playhead={playhead} startNs={startNs} endNs={endNs} plans={sessionPlans}
            blockers={catalogBusy ? [] : blockers} status={renderStatus} />
          : <div className="video-inspector-empty">
            <EmptyState appearance="plain" density="compact" title={t('Select a recording')} />
            {renderStatus && <StatusText tone={renderStatus.tone} status={renderStatus.text} />}
          </div>}
      </aside>
      </div>}
    {view === 'studio' && settingsSection && <VideoWorkbenchSettings id={panel.id} section={settingsSection}
      onClose={() => setSettingsSection(undefined)} bagId={bagId} catalog={catalog}
      settings={settings} setSettings={setSettings} editing={editing} setEditing={setEditing}
      issue={issue || undefined} clockIssues={editingIssues.clockIssues} />}
  </section>;
}
