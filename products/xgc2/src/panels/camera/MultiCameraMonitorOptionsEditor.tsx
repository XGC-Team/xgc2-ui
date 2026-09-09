import { ChevronDown,ChevronUp,Plus,Trash2 } from 'lucide-react';
import { FormSection, FormSectionSpan } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { InputControl } from '../../components/controls/TextControls';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type { PanelPluginOptionsEditorProps } from '../types';
import {
  encodeMultiCameraMonitorStreams,
  MULTI_CAMERA_MONITOR_MAX_STREAMS,
  multiCameraMonitorOptions,
  type MultiCameraMonitorStream,
  nextMultiCameraMonitorStreamID,
} from './multiCameraMonitorModel';
import { useCameraText } from './cameraMessages';
import '../../styles/multi-camera-monitor.css';

export function MultiCameraMonitorOptionsEditor({
  panel,options,onChange,
}: PanelPluginOptionsEditorProps) {
  const t = useCameraText();
  const value = multiCameraMonitorOptions(options);
  const update = (patch: Record<string,unknown>) => onChange({ ...options,...patch });
  const updateStreams = (streams: MultiCameraMonitorStream[]) => update({
    streamsJson:encodeMultiCameraMonitorStreams(streams),
  });

  function patchStream(index: number, patch: Partial<MultiCameraMonitorStream>) {
    updateStreams(value.streams.map((stream,current) => current === index ? { ...stream,...patch } : stream));
  }

  function moveStream(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= value.streams.length) return;
    const next = [...value.streams];
    [next[index],next[target]] = [next[target]!,next[index]!];
    updateStreams(next);
  }

  function addStream() {
    const id = nextMultiCameraMonitorStreamID(value.streams);
    updateStreams([...value.streams,{
      id,name:t('Camera {index}', { index:value.streams.length + 1 }),edgeUrl:'',sourceId:'usb_cam',enabled:true,
    }]);
  }

  return <>
    <FormSection title={t('Layout and playback')}
      dataXgcRole="multi-camera-monitor-layout-options" dataXgcId={panel.id}>
      <FormField label={t('Grid columns')} tooltip={t('How many camera tiles to place in each row of the monitor grid.')}>
        <SelectControl value={value.layoutColumns} options={[
          { value:'auto',label:t('Automatic') },
          { value:'1',label:t('1 column') },
          { value:'2',label:t('2 columns') },
          { value:'3',label:t('3 columns') },
          { value:'4',label:t('4 columns') },
        ]} onChange={(layoutColumns) => update({ layoutColumns })}
        ariaLabel={t('Multi-camera grid columns')} dataXgcRole="multi-camera-monitor-columns"
        dataXgcId={panel.id} fill />
      </FormField>
      <FormField label={t('Tile aspect ratio')} tooltip={t('Aspect ratio of each camera tile before the image is fitted.')}>
        <SelectControl value={value.tileAspectRatio} options={[
          { value:'16:9',label:'16:9' },
          { value:'4:3',label:'4:3' },
          { value:'fill',label:t('Fill available height') },
        ]} onChange={(tileAspectRatio) => update({ tileAspectRatio })}
        ariaLabel={t('Camera tile aspect ratio')} dataXgcRole="multi-camera-monitor-aspect"
        dataXgcId={panel.id} fill />
      </FormField>
      <FormField label={t('Image fit')} tooltip={t('Whether frames letterbox inside the tile or crop to cover it.')}>
        <SelectControl value={value.imageFit} options={[
          { value:'contain',label:t('Contain entire image') },
          { value:'cover',label:t('Cover tile') },
        ]} onChange={(imageFit) => update({ imageFit })}
        ariaLabel={t('Camera image fit')} dataXgcRole="multi-camera-monitor-image-fit"
        dataXgcId={panel.id} fill />
      </FormField>
      <FormField label={t('Reconnect policy')} tooltip={t('How the panel recovers after a stream disconnects.')}>
        <SelectControl value={value.reconnectPolicy} options={[
          { value:'automatic',label:t('Automatic backoff') },
          { value:'manual',label:t('Manual retry') },
        ]} onChange={(reconnectPolicy) => update({ reconnectPolicy })}
        ariaLabel={t('Camera reconnect policy')} dataXgcRole="multi-camera-monitor-reconnect"
        dataXgcId={panel.id} fill />
      </FormField>
      <SwitchControl label={t('Show stream metadata')} checked={value.showMetadata}
        tooltip={t('Overlay source name and connection status on each camera tile.')}
        onChange={(showMetadata) => update({ showMetadata })}
        dataXgcRole="multi-camera-monitor-show-metadata" dataXgcId={panel.id} />
    </FormSection>
    <FormSection title={t('Camera sources ({count}/{maximum})', {
        count:value.streams.length,maximum:MULTI_CAMERA_MONITOR_MAX_STREAMS,
      })}
      dataXgcRole="multi-camera-monitor-sources" dataXgcId={panel.id}>
      <FormSectionSpan className="multi-camera-monitor-options-composite">
        <div className="multi-camera-monitor-options-list">
          {value.streams.map((stream,index) => {
            const markId = `${panel.id}:${stream.id}`;
            return (
            <section className="multi-camera-monitor-options-source" key={stream.id}
              data-xgc-role="multi-camera-monitor-source-options" data-xgc-id={markId}>
              <div className="multi-camera-monitor-options-source-heading">
                <SwitchControl label={stream.name || t('Camera {index}', { index:index + 1 })} checked={stream.enabled}
                  tooltip={t('Include this camera tile in the live monitor grid.')}
                  onChange={(enabled) => patchStream(index,{ enabled })}
                  dataXgcRole="multi-camera-monitor-source-enabled" dataXgcId={markId} />
                <div className="multi-camera-monitor-options-source-actions">
                  <ControlButton iconOnly size="compact" aria-label={t('Move {name} up', { name:stream.name })}
                    title={t('Move up')} disabled={index === 0} onClick={() => moveStream(index,-1)}
                    dataXgcRole="multi-camera-monitor-source-up" dataXgcId={markId}>
                    <ChevronUp size={13} />
                  </ControlButton>
                  <ControlButton iconOnly size="compact" aria-label={t('Move {name} down', { name:stream.name })}
                    title={t('Move down')} disabled={index === value.streams.length - 1}
                    onClick={() => moveStream(index,1)}
                    dataXgcRole="multi-camera-monitor-source-down" dataXgcId={markId}>
                    <ChevronDown size={13} />
                  </ControlButton>
                  <ControlButton iconOnly size="compact" tone="danger"
                    aria-label={t('Remove {name}', { name:stream.name })} title={t('Remove source')}
                    onClick={() => updateStreams(value.streams.filter((_,current) => current !== index))}
                    dataXgcRole="multi-camera-monitor-source-remove" dataXgcId={markId}>
                    <Trash2 size={13} />
                  </ControlButton>
                </div>
              </div>
              <FormField label={t('Display name')} tooltip={t('Label shown on this camera tile.')}>
                <InputControl value={stream.name} onChange={(name) => patchStream(index,{ name })}
                  dataXgcRole="multi-camera-monitor-source-name" dataXgcId={markId} />
              </FormField>
              <FormField label={t('Media Edge URL')} tooltip={t('Media Edge base URL that brokers this camera stream.')}>
                <InputControl value={stream.edgeUrl} placeholder="http://192.168.51.14:18090"
                  onChange={(edgeUrl) => patchStream(index,{ edgeUrl })}
                  dataXgcRole="multi-camera-monitor-source-edge-url" dataXgcId={markId} />
              </FormField>
              <FormField label={t('Media source')} tooltip={t('Source id published by Media Edge for this camera.')}>
                <InputControl value={stream.sourceId} placeholder="usb_cam"
                  onChange={(sourceId) => patchStream(index,{ sourceId })}
                  dataXgcRole="multi-camera-monitor-source-id" dataXgcId={markId} />
              </FormField>
            </section>
          );})}
        </div>
        <ControlButton onClick={addStream}
          disabled={value.streams.length >= MULTI_CAMERA_MONITOR_MAX_STREAMS}
          dataXgcRole="multi-camera-monitor-source-add" dataXgcId={panel.id}>
          <Plus size={14} />
          {t('Add camera')}
        </ControlButton>
      </FormSectionSpan>
    </FormSection>
  </>;
}
