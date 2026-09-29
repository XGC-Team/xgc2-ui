import { Eye,EyeOff,Plus,Trash2 } from 'lucide-react';
import { ActionMenu,EmptyState,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { ColorControl } from '../../../components/controls/ColorControl';
import { InputControl } from '../../../components/controls/TextControls';
import { SelectControl } from '../../../components/controls/SelectControl';
import { FormField } from '../../../components/FormPrimitives';
import type { VideoSettings,VideoSourceCatalog,VideoModelCapability } from '../../../domains/recording/recordingPublic';
import {
  newVideoClockMappingDraft,newVideoTrackDraft,videoEasingNames,videoMarkerPresentationNames,videoTrackKindNames,
  type VideoClockMappingDraft,type VideoEditingDraft,type VideoEditingIssue,type VideoTrackDraft,type VideoTrackKind,
} from './videoEditingModel';
import { useVideoProductionText,videoEditingIssueMessages } from './videoProductionMessages';
import { nextTrackColor } from './videoStudioModel';
import { InspectorSection,PropRow } from './VideoStudioChrome';

function Issues({ role,id,issues }: { role: string;id: string;issues: readonly VideoEditingIssue[] }) {
  const t = useVideoProductionText();
  if (!issues.length) return null;
  return <Notice tone="warning" density="compact" data-xgc-role={role} data-xgc-id={id}>{issues.map((issue) => t(videoEditingIssueMessages[issue])).join(' ')}</Notice>;
}

/** Objects and their editor share the workspace selection. Adding a track
 * enables its owning layer — the rendered layer set and the track set never
 * diverge silently. */
export function VideoTrackAdder({ id,editing,settings,durationNs,layers,models,onEnableLayer,onChange,onSelectTrack }: {
  id: string;
  editing: VideoEditingDraft;
  settings: VideoSettings;
  /** Bag duration bounds span validation and the default span of new tracks. */
  durationNs?: bigint;
  layers: Record<'history' | 'predictions' | 'labels' | 'obstacles',boolean>;
  models: readonly VideoModelCapability[];
  onEnableLayer: (role: 'history' | 'predictions' | 'labels' | 'obstacles') => void;
  onChange: (next: VideoEditingDraft) => void;
  onSelectTrack: (id: string) => void;
}) {
  const t = useVideoProductionText();
  const pathTopics = [...settings.layerTopics.history,...settings.layerTopics.predictions];
  const markerTopics = [...settings.layerTopics.labels,...settings.layerTopics.obstacles];
  const options: { value: string;label: string }[] = [
    // Every selected topic stays offered: one object may have several
    // non-overlapping segments (appear, leave, re-appear).
    ...pathTopics.map((topic) => ({ value: `path|${topic}`,label: `${t('Path')}: ${topic}` })),
    ...markerTopics.map((topic) => ({ value: `markers|${topic}`,label: `${t('Markers')}: ${topic}` })),
    ...models.map((model) => ({ value:`robot-model|${model.modelId}`,label:`${t('Robot model')}: ${model.label}` })),
  ];
  function addTrack(addTarget: string) {
    const [kind,topic] = addTarget.split('|') as [VideoTrackKind,string?];
    if (!videoTrackKindNames.some(([name]) => name === kind)) return;
    if (kind === 'path' && topic) {
      const role = settings.layerTopics.history.includes(topic) ? 'history' : 'predictions';
      if (!layers[role]) onEnableLayer(role);
    }
    if (kind === 'markers' && topic) {
      const role = settings.layerTopics.labels.includes(topic) ? 'labels' : 'obstacles';
      if (!layers[role]) onEnableLayer(role);
    }
    const model = kind === 'robot-model' ? models.find((item) => item.modelId === topic) : undefined;
    if (kind === 'robot-model' && !model) return;
    const draft = newVideoTrackDraft(kind,{
      topic: kind === 'robot-model' ? '' : topic ?? '',
      ...(model ? { modelId:model.modelId,bundleSha256:model.bundleSha256 } : {}),
      color: kind === 'path' ? settings.pathColors?.[topic ?? ''] ?? nextTrackColor(editing.tracks.map((track) => track.color).filter(Boolean)) : '',
      widthMeters: settings.pathWidth,
      durationNs,
    });
    if (!draft.label) draft.label = model?.label ?? topic ?? '';
    onChange({ ...editing,tracks: [...editing.tracks,draft] });
    onSelectTrack(draft.id);
  }
  return <section className="video-object-tracks" aria-label={t('Tracks')} data-xgc-role="video-tracks-card" data-xgc-id={id}>
    <ActionMenu ariaLabel={t('Add track')} dataXgcId={id} dataXgcRole="video-track-add-target" triggerDataXgcRole="video-track-add"
      disabled={!options.length} placement="above" triggerProps={{ appearance: 'ghost',uiSize: 'compact' }}
      trigger={<><Plus size={13} aria-hidden="true" />{t('Add track')}</>}
      items={options.map((option) => ({ id: option.value,label: option.label,onSelect: () => addTrack(option.value) }))} />
  </section>;
}

export function VideoTrackInspector({ id,editing,selectedTrackId,issues,models,canToggle,onChange,onSelectTrack }: {
  id: string;editing: VideoEditingDraft;selectedTrackId: string;issues: readonly VideoEditingIssue[];
  models: readonly VideoModelCapability[];canToggle: boolean;
  onChange: (next: VideoEditingDraft) => void;onSelectTrack: (id: string) => void;
}) {
  const t = useVideoProductionText();
  const selected = editing.tracks.find((track) => track.id === selectedTrackId);
  function patchTrack(trackId: string,patch: Partial<VideoTrackDraft>) {
    onChange({ ...editing,tracks: editing.tracks.map((track) => track.id === trackId ? { ...track,...patch } : track) });
  }
  return <section className="video-selected-properties" aria-label={t('Track properties')} data-xgc-role="video-track-properties" data-xgc-id={id}>
    {selected ? <div className="video-track-editor" data-xgc-role="video-track-editor" data-xgc-id={`${id}:${selected.id}`}>
      <InspectorSection title={t('Track')} role="video-track-identity" id={`${id}:${selected.id}`}
        actions={<span className="video-inspector-actions">
          <ControlButton size="compact" appearance="ghost" iconOnly disabled={!canToggle} aria-pressed={selected.enabled !== false} aria-label={t('Track visibility')}
            title={t(selected.enabled === false ? 'Hidden' : 'Visible')}
            dataXgcRole="video-track-enabled" dataXgcId={`${id}:${selected.id}`} onClick={() => patchTrack(selected.id,{ enabled:selected.enabled === false })}>
            {selected.enabled === false ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </ControlButton>
          <ControlButton size="compact" appearance="ghost" iconOnly tone="danger" aria-label={t('Delete track')} title={t('Delete track')}
            dataXgcRole="video-track-delete" dataXgcId={`${id}:${selected.id}`}
            onClick={() => { onChange({ ...editing,tracks: editing.tracks.filter((track) => track.id !== selected.id) });onSelectTrack(''); }}>
            <Trash2 size={14} aria-hidden="true" /></ControlButton>
        </span>}>
        <PropRow label={t('Name')}><InputControl value={selected.label} aria-label={t('Track label')}
          dataXgcRole="video-track-label" dataXgcId={`${id}:${selected.id}`} onChange={(label) => patchTrack(selected.id,{ label })} /></PropRow>
        {selected.kind === 'markers' && <>
          <PropRow label={t('Namespace')}><InputControl value={selected.namespace} aria-label={t('Marker namespace')}
            dataXgcRole="video-track-namespace" dataXgcId={`${id}:${selected.id}`}
            onChange={(namespace) => patchTrack(selected.id,{ namespace })} /></PropRow>
          <PropRow label={t('Marker ID')}><InputControl value={selected.markerId} inputMode="numeric" aria-label={t('Marker ID')}
            dataXgcRole="video-track-marker-id" dataXgcId={`${id}:${selected.id}`}
            onChange={(markerId) => patchTrack(selected.id,{ markerId })} /></PropRow>
        </>}
        {selected.kind === 'robot-model' && <>
          <PropRow label={t('Model')}><SelectControl fill compact ariaLabel={t('Controlled model')} value={models.some((model) => model.modelId === selected.modelId && (!selected.bundleSha256 || model.bundleSha256 === selected.bundleSha256)) ? selected.modelId : ''}
            dataXgcRole="video-track-model" dataXgcId={`${id}:${selected.id}`} placeholder={t('Saved model unavailable')}
            options={models.map((model) => ({ value:model.modelId,label:model.label }))}
            onChange={(modelId) => { const model = models.find((item) => item.modelId === modelId);if (model) patchTrack(selected.id,{ modelId,bundleSha256:model.bundleSha256 }); }} /></PropRow>
          <PropRow label={t('TF frame')} hint={<span data-xgc-role="video-model-provenance" data-xgc-id={`${id}:${selected.id}`}>{t(selected.bundleSha256 ? 'Controlled model · rest pose' : 'Legacy saved model')} · {t('Frame unverified')}</span>}>
            <InputControl value={selected.frameId} aria-label={t('Recorded TF frame')}
              dataXgcRole="video-track-frame-id" dataXgcId={`${id}:${selected.id}`}
              onChange={(frameId) => patchTrack(selected.id,{ frameId })} /></PropRow>
        </>}
      </InspectorSection>
      <InspectorSection title={t('Appearance')} role="video-track-appearance" id={`${id}:${selected.id}`}>
        {selected.kind === 'path'
          ? <PropRow label={t('Colour')}><ColorControl value={selected.color} ariaLabel={t('Colour')}
            dataXgcRole="video-track-colour" dataXgcId={`${id}:${selected.id}`}
            onChange={(color) => patchTrack(selected.id,{ color })} /></PropRow>
          : <PropRow label={t('Colour')}>
            <div className="video-prop-pair">
              <ControlButton size="compact" aria-pressed={Boolean(selected.color)}
                dataXgcRole="video-track-colour-override" dataXgcId={`${id}:${selected.id}`}
                onClick={() => patchTrack(selected.id,{ color: selected.color ? '' : '#ffbf00' })}>{t('Override colour')}</ControlButton>
              {selected.color !== '' && <ColorControl value={selected.color} ariaLabel={t('Colour')}
                dataXgcRole="video-track-colour" dataXgcId={`${id}:${selected.id}`}
                onChange={(color) => patchTrack(selected.id,{ color })} />}
            </div>
          </PropRow>}
        <PropRow label={t('Opacity')}><InputControl value={selected.opacity} inputMode="decimal" aria-label={t('Opacity')}
          dataXgcRole="video-track-opacity" dataXgcId={`${id}:${selected.id}`}
          onChange={(opacity) => patchTrack(selected.id,{ opacity })} /></PropRow>
        {selected.kind === 'path' && <PropRow label={t('Width')}><InputControl value={selected.widthMeters} inputMode="decimal" unit="m"
          aria-label={t('Width (metres)')} dataXgcRole="video-track-width" dataXgcId={`${id}:${selected.id}`}
          onChange={(widthMeters) => patchTrack(selected.id,{ widthMeters })} /></PropRow>}
        {selected.kind !== 'path' && <PropRow label={t('Scale')}><InputControl value={selected.scale} inputMode="decimal" aria-label={t('Scale')}
          dataXgcRole="video-track-scale" dataXgcId={`${id}:${selected.id}`}
          onChange={(scale) => patchTrack(selected.id,{ scale })} /></PropRow>}
        {selected.kind === 'markers' && <PropRow label={t('Presentation')}><SelectControl fill compact ariaLabel={t('Presentation')} value={selected.presentation}
          dataXgcRole="video-track-presentation" dataXgcId={`${id}:${selected.id}`}
          options={videoMarkerPresentationNames.map(([presentation,label]) => ({ value: presentation,label: t(label) }))}
          onChange={(presentation) => patchTrack(selected.id,{ presentation: presentation as VideoTrackDraft['presentation'] })} /></PropRow>}
      </InspectorSection>
      <InspectorSection title={t('Timing')} role="video-track-timing" id={`${id}:${selected.id}`}>
        <PropRow label={t('Enter')}><InputControl value={selected.startSeconds} inputMode="decimal" unit="s"
          aria-label={t('Enter (seconds from bag start)')} dataXgcRole="video-track-span-start" dataXgcId={`${id}:${selected.id}`}
          onChange={(startSeconds) => patchTrack(selected.id,{ startSeconds })} /></PropRow>
        <PropRow label={t('Exit')}><InputControl value={selected.endSeconds} inputMode="decimal" unit="s"
          aria-label={t('Exit (exclusive, seconds)')} dataXgcRole="video-track-span-end" dataXgcId={`${id}:${selected.id}`}
          onChange={(endSeconds) => patchTrack(selected.id,{ endSeconds })} /></PropRow>
        <PropRow label={t('Fade in')}><InputControl value={selected.fadeInSeconds} inputMode="decimal" unit="s"
          aria-label={t('Fade in (seconds)')} dataXgcRole="video-track-fade-in" dataXgcId={`${id}:${selected.id}`}
          onChange={(fadeInSeconds) => patchTrack(selected.id,{ fadeInSeconds })} /></PropRow>
        <PropRow label={t('Fade out')}><InputControl value={selected.fadeOutSeconds} inputMode="decimal" unit="s"
          aria-label={t('Fade out (seconds)')} dataXgcRole="video-track-fade-out" dataXgcId={`${id}:${selected.id}`}
          onChange={(fadeOutSeconds) => patchTrack(selected.id,{ fadeOutSeconds })} /></PropRow>
        <PropRow label={t('Easing')}><SelectControl fill compact ariaLabel={t('Easing')} value={selected.easing}
          dataXgcRole="video-track-easing" dataXgcId={`${id}:${selected.id}`}
          options={videoEasingNames.map(([easing,label]) => ({ value: easing,label: t(label) }))}
          onChange={(easing) => patchTrack(selected.id,{ easing: easing as VideoTrackDraft['easing'] })} /></PropRow>
      </InspectorSection>
      <Issues role="video-tracks-issues" id={id} issues={issues} />
    </div> : <><EmptyState appearance="plain" title={t('Select a track')} /><Issues role="video-tracks-issues" id={id} issues={issues} /></>}
  </section>;
}

/** Operator-declared clock offsets; no inference, one mapping per scope. */
export function VideoClockSyncCard({ id,catalog,mappings,issues,onChange }: {
  id: string;
  catalog?: VideoSourceCatalog;
  mappings: VideoClockMappingDraft[];
  issues: readonly VideoEditingIssue[];
  onChange: (next: VideoClockMappingDraft[]) => void;
}) {
  const t = useVideoProductionText();
  const topics = (catalog?.topics ?? []).filter((topic) => topic.messageCount > 0).map((topic) => topic.name);
  function patch(idToPatch: string,patchValue: Partial<VideoClockMappingDraft>) {
    onChange(mappings.map((mapping) => mapping.id === idToPatch ? { ...mapping,...patchValue } : mapping));
  }
  return <section className="video-workbench-card" aria-label={t('Clock sync')} data-xgc-role="video-clock-card" data-xgc-id={id}>
    <h3>{t('Clock sync')}</h3>
    {mappings.map((mapping) => <div className="video-clock-mapping" key={mapping.id} data-xgc-role="video-clock-mapping" data-xgc-id={`${id}:${mapping.id}`}>
      <div className="video-production-toolbar">
        <ControlButton size="compact" aria-pressed={mapping.kind === 'topic'}
          dataXgcRole="video-clock-kind-topic" dataXgcId={`${id}:${mapping.id}`}
          onClick={() => patch(mapping.id,{ kind: 'topic' })}>{t('Whole topic')}</ControlButton>
        <ControlButton size="compact" aria-pressed={mapping.kind === 'tf-edge'}
          dataXgcRole="video-clock-kind-edge" dataXgcId={`${id}:${mapping.id}`}
          onClick={() => patch(mapping.id,{ kind: 'tf-edge' })}>{t('TF edge')}</ControlButton>
        <ControlButton size="compact" dataXgcRole="video-clock-delete" dataXgcId={`${id}:${mapping.id}`}
          onClick={() => onChange(mappings.filter((item) => item.id !== mapping.id))}>{t('Delete mapping')}</ControlButton>
      </div>
      <div className="video-production-fields">
        <FormField label={t('Recorded topic')}><SelectControl fill ariaLabel={t('Recorded topic')} value={mapping.topic}
          dataXgcRole="video-clock-topic" dataXgcId={`${id}:${mapping.id}`}
          options={topics.map((topic) => ({ value: topic,label: topic }))} onChange={(topic) => patch(mapping.id,{ topic })} /></FormField>
        {mapping.kind === 'tf-edge' && <>
          <FormField label={t('Parent frame')}><InputControl value={mapping.parentFrame} aria-label={t('Parent frame')}
            dataXgcRole="video-clock-parent" dataXgcId={`${id}:${mapping.id}`} onChange={(parentFrame) => patch(mapping.id,{ parentFrame })} /></FormField>
          <FormField label={t('Child frame')}><InputControl value={mapping.childFrame} aria-label={t('Child frame')}
            dataXgcRole="video-clock-child" dataXgcId={`${id}:${mapping.id}`} onChange={(childFrame) => patch(mapping.id,{ childFrame })} /></FormField>
        </>}
        <FormField label={t('Offset (seconds, signed)')}><InputControl value={mapping.offsetSeconds} inputMode="decimal"
          aria-label={t('Offset (seconds, signed)')} dataXgcRole="video-clock-offset" dataXgcId={`${id}:${mapping.id}`}
          onChange={(offsetSeconds) => patch(mapping.id,{ offsetSeconds })} /></FormField>
      </div>
    </div>)}
    <div className="video-production-toolbar">
      <ControlButton size="compact" dataXgcRole="video-clock-add" dataXgcId={id}
        onClick={() => onChange([...mappings,newVideoClockMappingDraft()])}>{t('Add clock mapping')}</ControlButton>
    </div>
    <Issues role="video-clock-issues" id={id} issues={issues} />
  </section>;
}
