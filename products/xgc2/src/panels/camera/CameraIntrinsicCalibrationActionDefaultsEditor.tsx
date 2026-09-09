import { FormSection } from '@xgc2/ui-react';
import { FormField } from '../../components/FormPrimitives';
import { SelectControl } from '../../components/controls/SelectControl';
import { InputControl } from '../../components/controls/TextControls';
import type { PanelPluginActionDefaultsEditorProps } from '../types';
import { CAMERA_INTRINSIC_PANEL_DEFAULTS } from './cameraIntrinsicPanelModel';
import { useCameraText } from './cameraMessages';

export function CameraIntrinsicCalibrationActionDefaultsEditor({
  panel,values,options,onChange,onOptionsChange,
}: PanelPluginActionDefaultsEditorProps) {
  const t = useCameraText();
  const physical = recordValue(values.physical);
  const simulation = recordValue(values.simulation);
  const sharedValue = (name:string,fallback:number) => numberValue(
    physical[name],numberValue(simulation[name],fallback),
  );
  const updateShared = (name:string,value:number) => onChange({
    ...values,
    physical:{ ...physical,[name]:value },
    simulation:{ ...simulation,[name]:value },
  });
  const updateSharedString = (name:string,value:string) => onChange({
    ...values,
    physical:{ ...physical,[name]:value },
    simulation:{ ...simulation,[name]:value },
  });
  const updatePhysicalString = (name:string,value:string) => onChange({
    ...values,physical:{ ...physical,[name]:value },
  });
  const updateSourceId = (value:string) => {
    onChange({ ...values,sourceId:value });
    onOptionsChange({ ...options,sourceId:value });
  };
  const boardProfile = stringValue(
    physical.boardProfile,
    stringValue(simulation.boardProfile,'field_6x6_88mm_30pct'),
  );
  const updateBoardProfile = (value:string) => onChange({
    ...values,
    physical:{ ...physical,boardProfile:value },
    simulation:{ ...simulation,boardProfile:value },
  });

  return <>
    <FormSection title={t('Camera connection')} dataXgcRole="camera-intrinsic-connection-options"
      dataXgcId={panel.id}>
      <FormField label={t('Physical V4L2 device')}
        tooltip={t('Stable /dev/v4l/by-id device watched by the physical camera daemon. Hotplug reconnects only while the physical calibration Run is active.')}>
        <InputControl value={stringValue(physical.videoDevice,'')}
          aria-label={t('Physical V4L2 device')} dataXgcRole="camera-intrinsic-video-device"
          dataXgcId={panel.id}
          required onChange={(value) => updatePhysicalString('videoDevice',value)} />
      </FormField>
      <FormField label={t('WebRTC / Media Edge URL')}
        tooltip={t('Browser-reachable Media Edge HTTP origin used for WebRTC signaling and playback; it is separate from the target-local Edge URL.')}>
        <InputControl value={stringValue(options.edgeUrl,CAMERA_INTRINSIC_PANEL_DEFAULTS.edgeUrl)}
          aria-label={t('WebRTC / Media Edge URL')} dataXgcRole="camera-intrinsic-edge-url"
          dataXgcId={panel.id}
          required onChange={(value) => onOptionsChange({ ...options,edgeUrl:value })} />
      </FormField>
      <FormField label={t('Media source ID')}
        tooltip={t('One stable source identity shared by the Workflow source roster and this Panel viewer.')}>
        <InputControl value={stringValue(values.sourceId,
          stringValue(options.sourceId,CAMERA_INTRINSIC_PANEL_DEFAULTS.sourceId))}
          aria-label={t('Media source ID')} dataXgcRole="camera-intrinsic-source-id"
          dataXgcId={panel.id}
          required onChange={updateSourceId} />
      </FormField>
    </FormSection>
    <FormSection title={t('Calibration camera')} dataXgcRole="camera-intrinsic-image-options"
      dataXgcId={panel.id}>
      <FormField label={t('Camera name')}
        tooltip={t('Stable storage identity. Results are isolated under sim/ or phy/ and this camera name; it is not inferred from the Media source ID.')}>
        <InputControl value={stringValue(physical.cameraName,stringValue(simulation.cameraName,'usb_cam'))}
          aria-label={t('Camera name')} dataXgcRole="camera-intrinsic-camera-name"
          dataXgcId={panel.id}
          pattern="^[A-Za-z][A-Za-z0-9._-]{0,63}$" maxLength={64} required
          onChange={(value) => updateSharedString('cameraName',value)} />
      </FormField>
      <FormField label={t('Simulation capture contract')}
        tooltip={t('Fixed capture profile for the 110-degree simulated lens.')}>
        <SelectControl value="world_wide_4k30_110"
          options={[{ value:'world_wide_4k30_110',label:'3840 × 2160 · 30 fps · 110° HFOV' }]}
          ariaLabel={t('Simulation capture contract')} dataXgcRole="camera-intrinsic-capture-contract"
          dataXgcId={panel.id} fill onChange={() => undefined} />
      </FormField>
    </FormSection>
    <FormSection title={t('Snapshot processing')} dataXgcRole="camera-intrinsic-capture-parameters"
      dataXgcId={panel.id}>
      <NumberField label={t('Snapshot timeout')} unit="sec" role="camera-intrinsic-snapshot-timeout"
        value={sharedValue('snapshotTimeout',5)} min={0.1} max={30} step={0.1}
        tooltip={t('Maximum wait for one calibration snapshot in either run mode.')}
        onChange={(value) => updateShared('snapshotTimeout',value)} />
      <NumberField label={t('Detection/display width')} unit="px" role="camera-intrinsic-display-width"
        value={sharedValue('displayWidth',960)} min={320} max={3840} step={1}
        tooltip={t('Image width used for board detection and the operator preview in either run mode.')}
        onChange={(value) => updateShared('displayWidth',value)} />
      <NumberField label={t('Reference JPEG quality')} role="camera-intrinsic-jpeg-quality"
        value={sharedValue('jpegQuality',80)} min={40} max={100} step={1}
        tooltip={t('Quality of stored reference snapshots in either run mode.')}
        onChange={(value) => updateShared('jpegQuality',value)} />
    </FormSection>
    <FormSection title={t('Calibration algorithm')} dataXgcRole="camera-intrinsic-board-parameters"
      dataXgcId={panel.id}>
      <FormField label={t('Calibration board')}
        tooltip={t('One profile atomically configures both calibration run modes and the Gazebo target.')}>
        <SelectControl value={boardProfile} options={[
          { value:'field_6x6_88mm_30pct',label:t('Field plate · 6×6 · 88 mm tags · 26.4 mm gap') },
          { value:'a4_6x6_24mm_30pct_kalibr_v1',label:t('A4 sheet · 6×6 · 24 mm tags · 7.2 mm gap') },
        ]}
          ariaLabel={t('Calibration board')} dataXgcRole="camera-intrinsic-board-profile" dataXgcId={panel.id}
          fill onChange={updateBoardProfile} />
      </FormField>
    </FormSection>
  </>;
}

function NumberField({ label,role,unit,value,min,max,step,tooltip,onChange }: {
  label:string;
  role:string;
  unit?:string;
  value:number;
  min:number;
  max?:number;
  step:number;
  tooltip:string;
  onChange:(value:number)=>void;
}) {
  return <FormField label={label} tooltip={tooltip}>
        <InputControl type="number" value={value} min={min} max={max} step={step}
      unit={unit} aria-label={unit ? `${label} (${unit})` : label}
      dataXgcRole={role} dataXgcId={role} onChange={(next) => onChange(Number(next))} />
  </FormField>;
}

function recordValue(value:unknown):Record<string,unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string,unknown>
    : {};
}

function numberValue(value:unknown,fallback:number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value:unknown,fallback:string) {
  return typeof value==='string' ? value : fallback;
}
