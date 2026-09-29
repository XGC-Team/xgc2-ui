import { useState } from 'react';
import { Bot,Camera,ChevronDown,ChevronRight,Eye,EyeOff,Plus,Spline,Shapes } from 'lucide-react';
import { ActionMenu } from '@xgc2/ui-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import type { VideoLayerName,VideoModelCapability,VideoSettings,VideoSourceCatalog,VideoSourceObject } from '../../../domains/recording/recordingPublic';
import { videoTrackRobotOwner,videoTrackSourceObject,type VideoTrackDraft } from './videoEditingModel';
import { useVideoProductionText } from './videoProductionMessages';
import { videoLayerNames } from './videoSourceSettingsModel';
import { recordingModeLabel } from './videoSourceModel';

export type VideoSourceTrackChoice = { objectId: string;modelId?: string;layer?: VideoLayerName };
type Props = {
  id: string;catalog: VideoSourceCatalog;models: readonly VideoModelCapability[];settings: VideoSettings;
  tracks: readonly VideoTrackDraft[];selectedTrackId: string;cameraTopic: string;canToggle: boolean;
  onSelectTrack: (id:string) => void;onSetEnabled: (ids:readonly string[],enabled:boolean) => void;
  onAdd: (choice:VideoSourceTrackChoice) => void;onCamera: (topic:string) => void;
};

/** Catalog rows are source evidence; editable tracks retain their own exact IDs. */
export function VideoSourceObjects(props: Props) {
  const { id,catalog,tracks,selectedTrackId,onSelectTrack,onSetEnabled,canToggle } = props;
  const t = useVideoProductionText();
  const [collapsed,setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const objects = catalog.objects;
  const robots = objects.filter((object) => object.kind === 'robot');
  const owner = new Map(tracks.map((track) => [track.id,videoTrackRobotOwner(track,objects)]));
  function trackRow(track:VideoTrackDraft) {
    return <div className="video-object-track-row" key={track.id} data-enabled={track.enabled !== false}>
      <button type="button" className="video-object-row video-object-track" title={track.label} aria-pressed={selectedTrackId === track.id}
        data-xgc-role="video-track-row" data-xgc-id={`${id}:${track.id}`} onClick={() => onSelectTrack(track.id)}>
        <i className={`video-timeline-swatch video-timeline-swatch-${track.kind}`} aria-hidden="true"
          style={track.color ? { '--track-color': track.color } as React.CSSProperties : undefined} />
        <span>{track.label || t('Untitled track')} · {track.startSeconds}–{track.endSeconds}s</span>
      </button>
      <ControlButton size="compact" appearance="ghost" iconOnly disabled={!canToggle} aria-pressed={track.enabled !== false}
        aria-label={t(track.enabled === false ? 'Show {label}' : 'Hide {label}',{ label:track.label })}
        dataXgcRole="video-object-track-enabled" dataXgcId={`${id}:${track.id}`} onClick={() => onSetEnabled([track.id],track.enabled === false)}>
        {track.enabled === false ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
      </ControlButton>
    </div>;
  }
  function sourceRow(object:VideoSourceObject) {
    // A tracked overlay is represented by its track row; do not list it twice.
    if ((object.kind === 'path' || object.kind === 'markers') && tracks.some((track) => videoTrackSourceObject(track,objects)?.id === object.id)) return null;
    return <SourceObjectRow key={object.id} {...props} object={object}
      hasTrack={tracks.some((track) => videoTrackSourceObject(track,objects)?.id === object.id)} />;
  }
  const recorded = catalog.recordedContext;
  const facts = catalog.recordFacts;
  return <section className="video-source-objects" aria-label={t('Recorded objects')} data-xgc-role="video-source-objects" data-xgc-id={id}>
    {recorded.status === 'available' && <small className="video-recorded-context" data-xgc-role="video-recorded-context" data-xgc-id={id}
      title={facts.status === 'available' ? t('Record facts') : facts.status === 'unavailable' ? t('Record facts unavailable') : undefined}>
      {[recorded.experimentName || t('Experiment name unknown'),t(recordingModeLabel(recorded.runMode))].join(' · ')}
    </small>}
    {robots.map((robot) => {
      const members = tracks.filter((track) => owner.get(track.id) === robot.id);
      const visible = members.some((track) => track.enabled !== false);
      const isCollapsed = collapsed.has(robot.id);
      const hasModelTrack = tracks.some((track) => videoTrackSourceObject(track,objects)?.id === robot.id);
      const evidence = [t('Model bytes not recorded'),t('Frame unverified'),robot.robot?.frame.id].filter(Boolean).join(' · ');
      return <section className="video-robot-object" key={robot.id} data-xgc-role="video-source-robot" data-xgc-id={`${id}:${robot.id}`}>
        <div className="video-object-track-row">
          <button type="button" className="video-object-row video-object-group" aria-expanded={!isCollapsed} title={evidence}
            data-xgc-role="video-source-robot-toggle" data-xgc-id={`${id}:${robot.id}`} onClick={() => setCollapsed((current) => {
              const next = new Set(current);if (next.has(robot.id)) next.delete(robot.id);else next.add(robot.id);return next;
            })}>{isCollapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
            <Bot size={13} aria-hidden="true" /><span>{robot.label}</span>{members.length > 0 && <small>{members.length}</small>}</button>
          <ActionMenu ariaLabel={t('Add model track for {label}',{ label: robot.label })} dataXgcId={`${id}:${robot.id}`} dataXgcRole="video-source-add-model"
            triggerDataXgcRole="video-source-add-model-trigger" align="end" disabled={hasModelTrack || !props.models.length}
            triggerProps={{ appearance: 'ghost',uiSize: 'compact',iconOnly: true,title: props.models.length ? t('Add model track') : t('Models unavailable') }}
            trigger={<Plus size={13} aria-hidden="true" />}
            items={props.models.map((model) => ({ id: model.modelId,icon: <Bot size={14} />,label: model.label,
              onSelect: () => props.onAdd({ objectId: robot.id,modelId: model.modelId }) }))} />
          <ControlButton size="compact" appearance="ghost" iconOnly disabled={!canToggle || !members.length} aria-pressed={visible}
            aria-label={t(visible ? 'Hide tracks of {label}' : 'Show tracks of {label}',{ label:robot.label })}
            dataXgcRole="video-source-robot-enabled" dataXgcId={`${id}:${robot.id}`} onClick={() => onSetEnabled(members.map((track) => track.id),!visible)}>
            {visible ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
          </ControlButton>
        </div>
        {!isCollapsed && <div className="video-object-children">
          {objects.filter((object) => object.parentId === robot.id).map(sourceRow)}
          {members.map(trackRow)}
        </div>}
      </section>;
    })}
    {objects.filter((object) => object.kind === 'world').map((world) => (
      <section className="video-robot-object" key={world.id} data-xgc-role="video-source-world" data-xgc-id={`${id}:${world.id}`}>
        {sourceRow(world)}
        <div className="video-object-children">{objects.filter((object) => object.parentId === world.id).map(sourceRow)}</div>
      </section>
    ))}
    {objects.filter((object) => object.kind !== 'robot' && object.kind !== 'world' && !object.parentId).map(sourceRow)}
    {tracks.filter((track) => !owner.get(track.id)).map(trackRow)}
  </section>;
}

function SourceObjectRow({ id,object,settings,hasTrack,cameraTopic,onAdd,onCamera }: Props & { object:VideoSourceObject;hasTrack:boolean }) {
  const t = useVideoProductionText();
  const roles = object.kind === 'path' ? ['history','predictions'] : ['labels','obstacles'];
  const selectedRole = videoLayerNames.find(([role]) => settings.layerTopics[role].includes(object.topic ?? ''))?.[0];
  const identity = `${id}:${object.id}`;
  if (object.kind === 'robot') return null;
  if (object.kind === 'camera') return <button type="button" className="video-object-row video-object-camera" title={object.label}
    aria-pressed={cameraTopic === object.topic} data-xgc-role="video-source-camera" data-xgc-id={identity} onClick={() => onCamera(object.topic!)}>
    <Camera size={13} aria-hidden="true" /><span>{object.label}</span>
  </button>;
  if (object.kind === 'world' || object.kind === 'ground' || object.kind === 'fence') {
    const availability = object.fact?.availability === 'applied' ? t('Applied') : object.fact?.availability === 'stopped' ? t('Stopped') : t('Unknown interval');
    return <span className="video-object-row video-object-static" title={`${object.label} · ${availability}`} data-xgc-role={`video-source-${object.kind}`} data-xgc-id={identity}>
      <Shapes size={13} aria-hidden="true" /><span>{object.label} · {availability}</span></span>;
  }
  if (object.kind === 'source-layer') return <span className="video-object-row video-object-static" title={object.label} data-xgc-role="video-source-layer" data-xgc-id={identity}>
    <Shapes size={13} aria-hidden="true" /><span>{object.label}</span></span>;
  return <div className="video-object-track-row video-object-overlay" data-xgc-role="video-source-overlay" data-xgc-id={identity} data-has-track={hasTrack}>
    <span className="video-object-row video-object-static" title={object.topic ?? object.label}>
      {object.kind === 'path' ? <Spline size={13} aria-hidden="true" /> : <Shapes size={13} aria-hidden="true" />}<span>{object.label}</span>
    </span>
    {!hasTrack && (selectedRole
      ? <ControlButton size="compact" appearance="ghost" iconOnly aria-label={t('Add track for {label}',{ label:object.label })} title={t('Add track for {label}',{ label:object.label })}
        dataXgcRole="video-source-add-track" dataXgcId={identity} onClick={() => onAdd({ objectId:object.id,layer:selectedRole })}><Plus size={13} aria-hidden="true" /></ControlButton>
      : <ActionMenu ariaLabel={t('Add track for {label}',{ label:object.label })} dataXgcId={identity} dataXgcRole="video-source-add-track"
        triggerDataXgcRole="video-source-add-track-trigger" align="end"
        triggerProps={{ appearance: 'ghost',uiSize: 'compact',iconOnly: true,title: t('Add track for {label}',{ label:object.label }) }}
        trigger={<Plus size={13} aria-hidden="true" />}
        items={videoLayerNames.filter(([role]) => roles.includes(role)).map(([role,label]) => ({ id: role,label: t('Add as {layer}',{ layer: t(label) }),
          onSelect: () => onAdd({ objectId:object.id,layer:role as VideoLayerName }) }))} />)}
  </div>;
}
