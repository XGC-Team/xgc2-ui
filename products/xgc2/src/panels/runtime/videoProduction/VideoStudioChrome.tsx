import { useEffect,useState,type Dispatch,type ReactNode,type SetStateAction } from 'react';
import { Camera,Clock,Film,FolderOpen,Image as ImageIcon,Layers3,MoreHorizontal,Save,Sparkles,Square,Trash2 } from 'lucide-react';
import { ActionMenu,StatusText } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { InputControl } from '../../../components/controls/TextControls';
import { SelectControl } from '../../../components/controls/SelectControl';
import { formatOperatorDateTime } from '../../../shared/operatorTime';
import { listVideoJobs,type SavedVideoRecipe,type VideoJob,type VideoPreviewFramePlan } from '../../../domains/recording/recordingPublic';
import {
  VIDEO_FRAME_RATES,VIDEO_TRAIL_MAX_SAMPLES,VIDEO_TRAIL_MIN_SAMPLES,parseFrameIndex,parseTrailFrames,renditionLabelKey,savedVideoRecipeLabel,
  type VideoDraft,
} from './videoProductionModel';
import { useVideoProductionText } from './videoProductionMessages';
import { videoLayerNames } from './videoSourceSettingsModel';
import { distinctSourceFrames,distributeTrailFrames,formatDurationSeconds } from './videoStudioModel';

type RenditionKind = VideoDraft['renditionKind'];
const RENDITION_CHOICES: readonly (readonly [RenditionKind,string,typeof Film])[] = [
  ['video','Video',Film],['still','Still frame',ImageIcon],['trail','Afterimage trail',Sparkles],
];

/**
 * The thin studio bar: view switch, transport + timecode, and the one primary
 * action. Everything else lives in the project panel menu or the inspector.
 */
export function VideoStudioTopBar({ id,leading,studio,transport,timecode,render }: {
  id: string;leading: ReactNode;studio: boolean;transport: ReactNode;
  timecode?: { current: string;total: string };
  render: { label: string;disabled: boolean;title?: string;onRender: () => void;active?: { progress: string;onCancel?: () => void } };
}) {
  const t = useVideoProductionText();
  return <header className="video-studio-topbar" data-xgc-role="video-studio-topbar" data-xgc-id={id}>
    <div className="video-studio-topbar-start">{leading}</div>
    {studio && <div className="video-studio-topbar-center">
      {transport}
      {timecode && <span className="video-studio-timecode" data-xgc-role="video-studio-timecode" data-xgc-id={id}>
        <strong>{timecode.current}</strong><span>{timecode.total}</span>
      </span>}
    </div>}
    {studio && <div className="video-studio-topbar-end">
      {render.active
        ? <span className="video-studio-rendering" role="status" data-xgc-role="video-render-active" data-xgc-id={id}>
          <span className="video-studio-rendering-dot" aria-hidden="true" />{render.active.progress}
          {render.active.onCancel && <ControlButton size="compact" appearance="ghost" iconOnly aria-label={t('Cancel render')} title={t('Cancel render')}
            dataXgcRole="video-production-cancel" dataXgcId={id} onClick={render.active.onCancel}><Square size={12} aria-hidden="true" /></ControlButton>}
        </span>
        : <ControlButton size="compact" tone="primary" disabled={render.disabled} title={render.title} dataXgcRole="video-production-render" dataXgcId={id}
          onClick={render.onRender}>{render.label}</ControlButton>}
    </div>}
  </header>;
}

/** Project menu: the setup actions that do not deserve permanent chrome. */
export function VideoProjectMenu({ id,bagSelected,canSave,onSave,onOpenSettings,onOpenMedia }: {
  id: string;bagSelected: boolean;canSave: boolean;onSave: () => void;
  onOpenSettings: (section: 'clip' | 'clock') => void;onOpenMedia: () => void;
}) {
  const t = useVideoProductionText();
  return <ActionMenu ariaLabel={t('Project menu')} dataXgcId={id} dataXgcRole="video-project-menu" triggerDataXgcRole="video-project-menu-trigger"
    align="end" triggerProps={{ appearance: 'ghost',uiSize: 'compact',iconOnly: true }}
    trigger={<MoreHorizontal size={15} aria-hidden="true" />}
    items={[
      { id: 'save',icon: <Save size={14} />,label: t('Save recipe'),disabled: !canSave,onSelect: onSave },
      { id: 'sources',icon: <Layers3 size={14} />,label: t('Sources & layers…'),disabled: !bagSelected,onSelect: () => onOpenSettings('clip') },
      { id: 'clock',icon: <Clock size={14} />,label: t('Clock sync…'),disabled: !bagSelected,onSelect: () => onOpenSettings('clock') },
      { id: 'media',icon: <FolderOpen size={14} />,label: t('Open recording…'),onSelect: onOpenMedia },
    ]} />;
}

/** One inspector property: quiet label column, control column. */
export function PropRow({ label,children,hint }: { label: string;children: ReactNode;hint?: ReactNode }) {
  return <div className="video-prop-row">
    <span className="video-prop-label">{label}</span>
    <div className="video-prop-value">{children}</div>
    {hint && <div className="video-prop-hint">{hint}</div>}
  </div>;
}

export function InspectorSection({ title,children,role,id,actions }: { title: string;children: ReactNode;role: string;id: string;actions?: ReactNode }) {
  return <section className="video-inspector-section" aria-label={title} data-xgc-role={role} data-xgc-id={id}>
    <header><h3>{title}</h3>{actions}</header>
    {children}
  </section>;
}

/**
 * Inspector with nothing selected: the sequence. Clip, export format and its
 * parameters, AR layers, and — only when something blocks Render — why.
 * The afterimage helper writes the explicit frame list the contract admits.
 */
export function VideoSequenceInspector({ id,draft,setDraft,cameraTopics,frameCount,playhead,startNs,endNs,plans,blockers,status }: {
  id: string;draft: VideoDraft;setDraft: Dispatch<SetStateAction<VideoDraft>>;
  cameraTopics: readonly { name: string }[];frameCount: number;playhead: number;
  startNs?: bigint;endNs?: bigint;
  /** Prepared frame map of the current preview, when it matches the edit. */
  plans?: readonly VideoPreviewFramePlan[];
  /** Why Render is unavailable, in plain words; empty when ready. */
  blockers: readonly string[];
  status?: { tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success';text: string };
}) {
  const t = useVideoProductionText();
  const lastFrame = Math.max(frameCount - 1,0);
  const [samples,setSamples] = useState('12');
  const [windowStart,setWindowStart] = useState('0');
  const [windowEnd,setWindowEnd] = useState(String(lastFrame));
  useEffect(() => { setWindowStart('0');setWindowEnd(String(lastFrame)); },[lastFrame]);
  const trail = parseTrailFrames(draft.trailFrames) ?? [];
  const first = parseFrameIndex(windowStart,Math.max(frameCount,1));
  const last = parseFrameIndex(windowEnd,Math.max(frameCount,1));
  const count = Number(samples);
  const distributable = first !== undefined && last !== undefined && last - first >= VIDEO_TRAIL_MIN_SAMPLES - 1
    && Number.isSafeInteger(count) && count >= VIDEO_TRAIL_MIN_SAMPLES && count <= VIDEO_TRAIL_MAX_SAMPLES;
  function distribute() {
    if (!distributable) return;
    setDraft((current) => ({ ...current,trailFrames: distinctSourceFrames(distributeTrailFrames(first!,last!,count),plans).join(',') }));
  }
  const clipLength = startNs !== undefined && endNs !== undefined && endNs > startNs ? endNs - startNs : undefined;
  return <div className="video-sequence-inspector" data-xgc-role="video-sequence-inspector" data-xgc-id={id}>
    <InspectorSection title={t('Clip')} role="video-clip-card" id={id}>
      <PropRow label={t('Camera')}><SelectControl fill compact ariaLabel={t('Recorded camera')} value={draft.cameraTopic} dataXgcRole="video-production-camera" dataXgcId={id}
        options={cameraTopics.map((topic) => ({ value: topic.name,label: topic.name }))} onChange={(cameraTopic) => setDraft((current) => ({ ...current,cameraTopic }))} /></PropRow>
      <PropRow label={t('In')}><InputControl value={draft.startSeconds} inputMode="decimal" unit="s" aria-label={t('Start (seconds from bag start)')}
        dataXgcRole="video-production-start" dataXgcId={id} onChange={(startSeconds) => setDraft((current) => ({ ...current,startSeconds }))} /></PropRow>
      <PropRow label={t('Out')}><InputControl value={draft.endSeconds} inputMode="decimal" unit="s" aria-label={t('End (exclusive, seconds from bag start)')}
        dataXgcRole="video-production-end" dataXgcId={id} onChange={(endSeconds) => setDraft((current) => ({ ...current,endSeconds }))} /></PropRow>
      <PropRow label={t('Frame rate')}><SelectControl fill compact ariaLabel={t('Frame rate')} value={String(draft.fps)} dataXgcRole="video-production-fps" dataXgcId={id}
        options={VIDEO_FRAME_RATES.map((fps) => ({ value: String(fps),label: `${fps} fps` }))} onChange={(fps) => setDraft((current) => ({ ...current,fps: Number(fps) }))} /></PropRow>
      <p className="video-inspector-meta" data-xgc-role="video-production-frame-count" data-xgc-id={id}>
        {[clipLength !== undefined ? formatDurationSeconds(clipLength) : '',frameCount > 0 ? t('{frames} frames',{ frames: String(frameCount) }) : '','3840 × 2160'].filter(Boolean).join('  ·  ')}
      </p>
    </InspectorSection>

    <InspectorSection title={t('Export')} role="video-rendition-card" id={id}>
      <div className="video-segmented" role="group" aria-label={t('Rendition kind')} data-xgc-role="video-rendition-kind" data-xgc-id={id}>
        {RENDITION_CHOICES.map(([kind,label,Icon]) => <button key={kind} type="button" aria-pressed={draft.renditionKind === kind}
          data-xgc-role="video-rendition-choice" data-xgc-id={`${id}:${kind}`} onClick={() => setDraft((current) => ({ ...current,renditionKind: kind }))}>
          <Icon size={13} aria-hidden="true" /><span>{t(label)}</span></button>)}
      </div>
      {draft.renditionKind === 'still' && <PropRow label={t('Frame')}>
        <div className="video-prop-pair">
          <InputControl value={draft.stillFrame} inputMode="numeric" aria-label={t('Still frame (zero-based)')} dataXgcRole="video-still-frame" dataXgcId={id}
            onChange={(stillFrame) => setDraft((current) => ({ ...current,stillFrame }))} />
          <ControlButton size="compact" disabled={frameCount < 1} dataXgcRole="video-still-at-playhead" dataXgcId={id}
            onClick={() => setDraft((current) => ({ ...current,stillFrame: String(playhead) }))}>{t('Use playhead')}</ControlButton>
        </div>
      </PropRow>}
      {draft.renditionKind === 'trail' && <>
        <PropRow label={t('Window')}>
          <div className="video-prop-pair">
            <InputControl value={windowStart} inputMode="numeric" aria-label={t('Window from frame')} dataXgcRole="video-trail-window-start" dataXgcId={id} onChange={setWindowStart} />
            <span aria-hidden="true">→</span>
            <InputControl value={windowEnd} inputMode="numeric" aria-label={t('Window to frame')} dataXgcRole="video-trail-window-end" dataXgcId={id} onChange={setWindowEnd} />
          </div>
        </PropRow>
        <PropRow label={t('Samples')}>
          <div className="video-prop-pair">
            <InputControl value={samples} inputMode="numeric" aria-label={t('Samples')} dataXgcRole="video-trail-count" dataXgcId={id} onChange={setSamples} />
            <ControlButton size="compact" disabled={!distributable} dataXgcRole="video-trail-distribute" dataXgcId={id} onClick={distribute}>{t('Distribute samples')}</ControlButton>
          </div>
        </PropRow>
        <PropRow label={t('Ghost fade')}>
          <div className="video-prop-pair">
            <InputControl value={draft.trailFadeFrom} inputMode="decimal" unit="%" aria-label={t('Oldest ghost opacity')} dataXgcRole="video-trail-fade-from" dataXgcId={id}
              onChange={(trailFadeFrom) => setDraft((current) => ({ ...current,trailFadeFrom }))} />
            <span aria-hidden="true">→</span>
            <InputControl value={draft.trailFadeTo} inputMode="decimal" unit="%" aria-label={t('Newest ghost opacity')} dataXgcRole="video-trail-fade-to" dataXgcId={id}
              onChange={(trailFadeTo) => setDraft((current) => ({ ...current,trailFadeTo }))} />
          </div>
        </PropRow>
        <PropRow label={t('Frames')}><InputControl value={draft.trailFrames} inputMode="numeric" aria-label={t('Trail frames (comma-separated, ascending)')}
          dataXgcRole="video-trail-frames" dataXgcId={id} onChange={(trailFrames) => setDraft((current) => ({ ...current,trailFrames }))} /></PropRow>
        <p className="video-inspector-meta" data-xgc-role="video-trail-summary" data-xgc-id={id}>
          {trail.length ? t('{count} moments · last one solid',{ count: String(trail.length) }) : t('Pick 3–32 moments; the last one stays solid.')}
        </p>
      </>}
      {blockers.length > 0 && <ul className="video-inspector-blockers" data-xgc-role="video-render-blockers" data-xgc-id={id}>
        {blockers.map((item) => <li key={item}>{item}</li>)}
      </ul>}
      {status && <StatusText tone={status.tone} status={status.text} data-xgc-role="video-render-status" data-xgc-id={id} />}
    </InspectorSection>

    <InspectorSection title={t('AR layers')} role="video-layers-card" id={id}>
      <div className="video-layer-list" role="group" aria-label={t('AR layers')}>{videoLayerNames.map(([role,label]) => (
        <button key={role} type="button" className="video-layer-toggle" aria-pressed={draft.layers[role]} data-xgc-role="video-production-layer" data-xgc-id={`${id}:${role}`}
          onClick={() => setDraft((current) => ({ ...current,layers: { ...current.layers,[role]: !current.layers[role] } }))}>
          <span className="video-layer-check" aria-hidden="true" />{t(label)}</button>
      ))}</div>
    </InspectorSection>
  </div>;
}

const VIDEO_PREVIEW_BYTES_LIMIT = 256 * 1024 * 1024;

/** Media bin: camera streams of the open bag, saved recipes, archived bags and finished renders. */
export function VideoMediaBin({ id,experimentId,revision,recordings,cameraTopics,cameraTopic,onCamera,onShowArtifact,saved,selectedSaved,onLoadSaved,onDeleteSaved,busy }: {
  id: string;experimentId: string;revision: number;recordings: ReactNode;
  cameraTopics: readonly { name: string;messageCount?: number }[];cameraTopic: string;onCamera: (topic: string) => void;
  onShowArtifact: (job: VideoJob) => void;
  saved: readonly SavedVideoRecipe[];selectedSaved?: SavedVideoRecipe;onLoadSaved: (id: string) => void;onDeleteSaved: () => void;busy: boolean;
}) {
  const t = useVideoProductionText();
  const [jobs,setJobs] = useState<VideoJob[]>([]);
  useEffect(() => {
    let current = true;
    void listVideoJobs(experimentId,0).then((page) => {
      if (current) setJobs((page?.items ?? []).filter((job) => job.experimentId === experimentId && job.status === 'succeeded' && job.artifact));
    }).catch(() => { if (current) setJobs([]); });
    return () => { current = false; };
  },[experimentId,revision]);
  const viewable = (job: VideoJob) => Boolean(job.artifact?.endsWith('.png')
    || (Number.isSafeInteger(job.artifactSize) && (job.artifactSize ?? 0) <= VIDEO_PREVIEW_BYTES_LIMIT));
  return <div className="video-media-bin" data-xgc-role="video-media-bin" data-xgc-id={id}>
    {cameraTopics.length > 0 && <section className="video-media-section" aria-label={t('Camera streams')}>
      <h4>{t('Camera streams')}</h4>
      {cameraTopics.map((topic) => <button key={topic.name} type="button" className="video-media-item" aria-pressed={topic.name === cameraTopic}
        data-xgc-role="video-media-camera" data-xgc-id={`${id}:${topic.name}`} onClick={() => onCamera(topic.name)} title={topic.name}>
        <Camera size={13} aria-hidden="true" /><span>{topic.name}</span>{topic.messageCount !== undefined && <small>{topic.messageCount}</small>}
      </button>)}
    </section>}
    <section className="video-media-section" aria-label={t('Saved configurations')} data-xgc-role="video-saved-recipe" data-xgc-id={id}>
      <h4>{t('Saved configurations')}</h4>
      {saved.length === 0 && <p className="video-media-empty">{t('No saved recipes')}</p>}
      {saved.map((item) => <div key={item.id} className="video-media-row">
        <button type="button" className="video-media-item" aria-pressed={selectedSaved?.id === item.id}
          data-xgc-role="video-saved-recipe-item" data-xgc-id={`${id}:${item.id}`} onClick={() => onLoadSaved(item.id)}
          title={savedVideoRecipeLabel(item.request.videoRecipe)}>
          <Save size={13} aria-hidden="true" /><span>{savedVideoRecipeLabel(item.request.videoRecipe)}</span>
        </button>
        {selectedSaved?.id === item.id && <ControlButton size="compact" appearance="ghost" iconOnly disabled={busy}
          aria-label={t('Delete saved configuration')} title={t('Delete saved configuration')}
          dataXgcRole="video-recipe-delete" dataXgcId={id} onClick={onDeleteSaved}><Trash2 size={13} aria-hidden="true" /></ControlButton>}
      </div>)}
    </section>
    <section className="video-media-section" aria-label={t('Recordings')}>
      <h4>{t('Recordings')}</h4>
      {recordings}
    </section>
    {jobs.length > 0 && <section className="video-media-section" aria-label={t('Rendered media')}>
      <h4>{t('Rendered media')}</h4>
      {jobs.slice(0,12).map((job) => <button key={job.id} type="button" className="video-media-item" disabled={!viewable(job)}
        data-xgc-role="video-media-render" data-xgc-id={`${id}:${job.id}`} onClick={() => onShowArtifact(job)}
        title={`${job.artifact} · ${job.id}`}>
        {job.artifact?.endsWith('.mp4') ? <Film size={13} aria-hidden="true" /> : job.rendition.kind === 'trail' ? <Sparkles size={13} aria-hidden="true" /> : <ImageIcon size={13} aria-hidden="true" />}
        <span>{t(renditionLabelKey(job.rendition))}</span><small>{formatOperatorDateTime(job.createdAt)}</small>
      </button>)}
    </section>}
  </div>;
}
