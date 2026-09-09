import { FormSection } from '@xgc2/ui-react';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import { InputControl } from '../../components/controls/TextControls';
import type { PanelPluginOptionsEditorProps } from '../types';
import { cameraVideoPanelOptions } from './cameraVideoPanelModel';
import { MultiCameraMonitorOptionsEditor } from './MultiCameraMonitorOptionsEditor';
import { useCameraText } from './cameraMessages';

export function CameraVideoPanelOptionsEditor(props: PanelPluginOptionsEditorProps) {
  const t = useCameraText();
  const { panel,options,onChange } = props;
  const value = cameraVideoPanelOptions(options);
  const update = (patch: Record<string,unknown>) => {
    const next = { ...options,...patch };
    delete next.targetId;
    onChange(next);
  };
  return <>
    <MultiCameraMonitorOptionsEditor {...props}
      onChange={(next) => {
        const sanitized = { ...next };
        delete sanitized.targetId;
        onChange(sanitized);
      }} />
    <FormSection title={t('Experiment behavior')}
      dataXgcRole="camera-video-experiment-options" dataXgcId={panel.id}>
      <FormField label={t('Media workflow binding')}
        htmlFor={`camera-video-media-binding-${panel.id}`}
        tooltip={t('Experiment workflow binding that owns the MediaMTX adapter and Edge lifecycle for this panel.')}>
        <InputControl id={`camera-video-media-binding-${panel.id}`}
          value={value.mediaBindingId}
          onChange={(mediaBindingId) => update({ mediaBindingId })}
          dataXgcRole="camera-video-media-binding" dataXgcId={panel.id} />
      </FormField>
      <SwitchControl label={t('Connect viewers when panel opens')} checked={value.autoConnect}
        tooltip={t('Open each enabled browser WebRTC receive session when the panel is mounted.')}
        onChange={(autoConnect) => update({ autoConnect })}
        dataXgcRole="camera-video-auto-connect" dataXgcId={panel.id} />
      <SwitchControl label={t('Connect viewers when Experiment starts')}
        checked={value.autoConnectOnExperimentRun}
        tooltip={t('Connect enabled viewers on a new Experiment run; a manual Disconnect for a viewer wins.')}
        onChange={(autoConnectOnExperimentRun) => update({ autoConnectOnExperimentRun })}
        dataXgcRole="camera-video-auto-connect-experiment" dataXgcId={panel.id} />
    </FormSection>
  </>;
}
