import { ControlButton } from '../../../components/controls/ControlButton';
import { SelectControl } from '../../../components/controls/SelectControl';
import { InputControl } from '../../../components/controls/TextControls';
import { FormField } from '../../../components/FormPrimitives';
import type { VideoSettings,VideoSourceCatalog } from '../../../domains/recording/recordingPublic';
import { useVideoProductionText } from './videoProductionMessages';
import { videoLayerNames } from './videoSourceSettingsModel';

const toggle = (items: string[],item: string) => items.includes(item) ? items.filter((value) => value !== item) : [...items,item];
export function VideoSourceSettings({ id,catalog,value,onChange }: { id: string;catalog: VideoSourceCatalog;value: VideoSettings;onChange: (next: VideoSettings) => void }) {
  const t = useVideoProductionText();
  const matching = (...types: string[]) => catalog.topics.filter((topic) => types.includes(topic.type) && topic.messageCount > 0);
  return <div className="video-source-settings" data-xgc-role="video-source-settings" data-xgc-id={id}>
    <div className="video-production-fields">
      <FormField label={t('Recorded calibration')}><SelectControl fill ariaLabel={t('Recorded calibration')} value={value.calibrationTopic}
        dataXgcRole="video-calibration" dataXgcId={id} options={matching('sensor_msgs/CameraInfo').map((topic) => ({ value: topic.name,label: topic.name }))}
        onChange={(calibrationTopic) => onChange({ ...value,calibrationTopic })} /></FormField>
      <FormField label={t('Recorded fixed frame')}><InputControl value={value.fixedFrame} aria-label={t('Recorded fixed frame')}
        dataXgcRole="video-fixed-frame" dataXgcId={id} onChange={(fixedFrame) => onChange({ ...value,fixedFrame })} /></FormField>
      <FormField label={t('Path width (metres)')}><InputControl value={String(value.pathWidth)} inputMode="decimal" aria-label={t('Path width (metres)')}
        dataXgcRole="video-path-width" dataXgcId={id} onChange={(width) => onChange({ ...value,pathWidth: Number(width) })} /></FormField>
    </div>
    <fieldset><legend>{t('Recorded transforms')}</legend>
      {matching('tf2_msgs/TFMessage').map((topic) => <div className="video-production-toolbar" key={topic.name}>
        <ControlButton size="compact" aria-pressed={value.transformTopics.includes(topic.name)} dataXgcRole="video-tf-topic" dataXgcId={`${id}:${topic.name}`}
          onClick={() => onChange({ ...value,transformTopics: toggle(value.transformTopics,topic.name),staticTransformTopics: value.transformTopics.includes(topic.name) ? value.staticTransformTopics.filter((name) => name !== topic.name) : value.staticTransformTopics })}>{topic.name}</ControlButton>
        <ControlButton size="compact" disabled={!value.transformTopics.includes(topic.name)} aria-pressed={value.staticTransformTopics.includes(topic.name)}
          dataXgcRole="video-static-tf" dataXgcId={`${id}:${topic.name}`} onClick={() => onChange({ ...value,staticTransformTopics: toggle(value.staticTransformTopics,topic.name) })}>{t('Static / latched')}</ControlButton>
      </div>)}
    </fieldset>
    {videoLayerNames.map(([role,label]) => <fieldset key={role}><legend>{t(label)}</legend>
      <div className="video-production-toolbar">{matching(...(role === 'history' || role === 'predictions' ? ['nav_msgs/Path'] : ['visualization_msgs/Marker','visualization_msgs/MarkerArray'])).map((topic) => (
        <ControlButton key={topic.name} size="compact" aria-pressed={value.layerTopics[role].includes(topic.name)}
          dataXgcRole="video-layer-topic" dataXgcId={`${id}:${role}:${topic.name}`}
          onClick={() => {
            const next = toggle(value.layerTopics[role],topic.name);const pathColors = { ...value.pathColors };
            if (!next.includes(topic.name)) delete pathColors[topic.name];
            onChange({ ...value,pathColors,layerTopics: { ...value.layerTopics,[role]: next } });
          }}>{topic.name}</ControlButton>
      ))}</div>
      {(role === 'history' || role === 'predictions') && value.layerTopics[role].map((topic) => <FormField key={topic} label={`${t('Path colour')} · ${topic}`}>
        <InputControl value={value.pathColors?.[topic] ?? ''} placeholder="#RRGGBB" aria-label={`${t('Path colour')} ${topic}`}
          dataXgcRole="video-path-colour" dataXgcId={`${id}:${topic}`} onChange={(colour) => {
            const pathColors = { ...value.pathColors };if (colour) pathColors[topic] = colour;else delete pathColors[topic];onChange({ ...value,pathColors });
          }} />
      </FormField>)}
    </fieldset>)}
  </div>;
}
