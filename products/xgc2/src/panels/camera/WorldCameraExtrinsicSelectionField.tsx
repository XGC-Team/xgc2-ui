import { useEffect,useRef,useState } from 'react';
import { FormSectionSpan,Notice,Vector3Control } from '@xgc2/ui-react';
import { FormField } from '../../components/FormPrimitives';
import { SelectControl } from '../../components/controls/SelectControl';
import { readAutomationTargetFileFingerprint } from '../../domains/automation/automationPublic';
import { worldCameraIntrinsicPartitionPath } from './gazeboWorldCameraCalibrationInputs';
import { validateGazeboWorldCameraPoseIssue,type GazeboWorldCameraPose } from './gazeboWorldCameraPoseModel';
import {
  extrinsicResultRef,hasCameraWorldOffset,manualExtrinsicChoice,manualExtrinsicPose,parseWorldCameraExtrinsicChoice,
  type CameraWorldOffset,type WorldCameraExtrinsicChoice,
} from './worldCameraExtrinsicSelectionModel';

type Props = {
  panelId:string;kind:'simulation'|'physical';value:unknown;targetId:string;root:string;camera:string;
  offset?:CameraWorldOffset;files:{ value:string;label:string }[];legacyLabel:string;
  onChange:(choice:WorldCameraExtrinsicChoice)=>void;
  onModeChange?:(mode:string)=>void;
};

export function WorldCameraExtrinsicSelectionField(props:Props) {
  const { panelId,kind,value,targetId,root,camera,offset,files,legacyLabel,onChange } = props;
  let choice:WorldCameraExtrinsicChoice|null = null;
  let invalid = '';
  try { choice = parseWorldCameraExtrinsicChoice(value); } catch { invalid = 'The camera position setting is invalid. Choose a mode again.'; }
  const [draft,setDraft] = useState<{ value:unknown;mode:string }|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const pending = useRef<AbortController|null>(null);
  // New authored values or another target cannot receive a late file-read result.
  useEffect(() => () => { pending.current?.abort(); },[value,targetId,root,camera,offset?.x,offset?.y,offset?.z,onChange]);
  const mode = draft && draft.value === value ? draft.mode : choice?.mode ?? (invalid ? '' : 'legacy');
  const ready = hasCameraWorldOffset(offset);
  const pose = ready ? manualExtrinsicPose(choice,offset) : null;
  const prefix = `gazebo-world-camera-${kind}-extrinsic`;
  const id = `${panelId}:${kind}`;
  const label = kind === 'simulation' ? 'Simulation camera position' : 'Physical camera position';
  const selectedPath = choice?.mode === 'version'
    ? `${worldCameraIntrinsicPartitionPath(root,choice.result.sourceMode,camera)}/${choice.result.fileName}` : '';
  const options = files.slice();
  if (choice?.mode === 'version' && !options.some((file) => file.value === selectedPath)) {
    options.push({ value:selectedPath,label:'Selected calibration (unavailable)' });
  }

  function chooseMode(next:string) {
    pending.current?.abort();
    setBusy(false);
    setError('');
    setDraft({ value,mode:next });
    props.onModeChange?.(next);
    if (next === 'auto') onChange({ mode:'auto' });
    if (next === 'pose' && ready && pose) onChange(manualExtrinsicChoice(pose,offset));
  }

  async function chooseVersion(path:string) {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    try {
      const sha256 = await readAutomationTargetFileFingerprint(targetId,path,request.signal);
      if (request.signal.aborted) return;
      onChange({ mode:'version',result:extrinsicResultRef(path,root,camera,sha256) });
    } catch {
      if (!request.signal.aborted) setError('This saved calibration could not be verified. Select it again.');
    } finally {
      if (pending.current === request) setBusy(false);
    }
  }

  function commitPose(next:GazeboWorldCameraPose) {
    if (!ready || validateGazeboWorldCameraPoseIssue(next)) return;
    onChange(manualExtrinsicChoice(next,offset));
  }

  function positionAxis(axis:'x'|'y'|'z') {
    return { label:axis.toUpperCase(),value:pose?.[axis] ?? 0,step:0.1,
      dataXgcRole:`${prefix}-manual-field`,dataXgcId:`${id}:${axis}` };
  }
  function rotationAxis(axis:'rollDegrees'|'pitchDegrees'|'yawDegrees',label:string,ariaLabel:string) {
    return { label,ariaLabel,value:pose?.[axis] ?? 0,min:-360,max:360,step:1,
      dataXgcRole:`${prefix}-manual-field`,dataXgcId:`${id}:${axis}` };
  }

  return <>
    <FormField label={label} tooltip="Automatic uses the last applied calibration. Manual choices stay fixed."
      dataXgcRole={`${prefix}-mode-field`} dataXgcId={id}>
      <SelectControl ariaLabel={label} dataXgcRole={`${prefix}-mode`} dataXgcId={id} fill value={mode}
        options={[
          ...(!choice && !invalid ? [{ value:'legacy',label:legacyLabel }] : []),
          { value:'auto',label:'Automatic' },{ value:'version',label:'Saved calibration' },
          { value:'pose',label:'Manual pose',disabled:!ready },
        ]} onChange={chooseMode} />
    </FormField>
    {mode === 'version' && <FormField label="Calibration" dataXgcRole={`${prefix}-version-field`} dataXgcId={id}>
      <SelectControl ariaLabel={`${label} calibration`} dataXgcRole={`${prefix}-version`} dataXgcId={id}
        fill busy={busy} value={selectedPath} options={options} placeholder="Choose a calibration" onChange={(path) => { void chooseVersion(path); }} />
    </FormField>}
    {mode === 'pose' && pose && <FormSectionSpan className="gazebo-world-camera-authored-pose"
      data-xgc-role={`${prefix}-manual`} data-xgc-id={id}>
      <FormField label="Position" tooltip="Camera optical centre in this experiment's world frame."
        dataXgcRole={`${prefix}-position`} dataXgcId={id}>
        <Vector3Control unit="m" dataXgcRole={`${prefix}-position-xyz`} dataXgcId={id}
          axes={[positionAxis('x'),positionAxis('y'),positionAxis('z')]}
          onValueChange={(index,next) => commitPose({ ...pose,[(['x','y','z'] as const)[index]]:Number(next) })} />
      </FormField>
      <FormField label="Rotation" tooltip="Roll, pitch and yaw of the camera optical frame in degrees."
        dataXgcRole={`${prefix}-rotation`} dataXgcId={id}>
        <Vector3Control unit="°" dataXgcRole={`${prefix}-rotation-rpy`} dataXgcId={id}
          axes={[rotationAxis('rollDegrees','R','Roll'),rotationAxis('pitchDegrees','P','Pitch'),rotationAxis('yawDegrees','Y','Yaw')]}
          onValueChange={(index,next) => commitPose({ ...pose,[(['rollDegrees','pitchDegrees','yawDegrees'] as const)[index]]:Number(next) })} />
      </FormField>
    </FormSectionSpan>}
    {(invalid || error || (mode === 'version' && !selectedPath)) && <Notice tone="danger" density="compact">
      {error || invalid || (files.length ? 'Choose a saved calibration.' : 'No saved calibrations are available.')}
    </Notice>}
  </>;
}
