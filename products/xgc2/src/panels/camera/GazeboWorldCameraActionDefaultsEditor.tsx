import { useEffect, useMemo, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { FormSection,FormSectionSpan,Notice,Vector3Control } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import { AutomationPathPicker,listAutomationTargetFiles } from '../../domains/automation/automationPublic';
import {
  WORLD_CAMERA_SOURCES,
  worldCameraSourceSelection,
  type WorldCameraSource,
} from '../../domains/experiment/experimentPublic';
import type { PanelPluginActionDefaultsEditorProps } from '../types';
import {
  withWorldCameraIntrinsicSelection,
  worldCameraAuthoredPose,
  worldCameraAuthoredPoseActionInputs,
  worldCameraAuthoredPoseOptions,
  worldCameraExtrinsicPathMatches,
  worldCameraIntrinsicPartitionPath,
  worldCameraIntrinsicPathMatches,
  worldCameraIntrinsicSelection,
  type WorldCameraPoseSource,
} from './gazeboWorldCameraCalibrationInputs';
import {
  validateGazeboWorldCameraPoseIssue,
  type GazeboWorldCameraPose,
} from './gazeboWorldCameraPoseModel';
import {
  timestampedExtrinsicYamlFiles,
  timestampedIntrinsicYamlFiles,
  worldCameraExtrinsicOptionLabel,
  worldCameraIntrinsicOptionLabel,
  type WorldCameraIntrinsicFileOption,
} from './gazeboWorldCameraIntrinsicFiles';
import { localizeCameraValidationIssue,useCameraText } from './cameraMessages';
import { WorldCameraExtrinsicSelectionField } from './WorldCameraExtrinsicSelectionField';
import { extrinsicSelectionField } from './worldCameraExtrinsicSelectionModel';
import '../../styles/gazebo-world-camera-panel.css';

export function GazeboWorldCameraActionDefaultsEditor(props: PanelPluginActionDefaultsEditorProps) {
  if (props.port.id !== 'camera-service') return null;
  return <WorldCameraIntrinsicDefaultsEditor {...props} />;
}

function WorldCameraIntrinsicDefaultsEditor({
  panel,values,options,onChange,onOptionsChange,executionTargetId = 'local',experimentWorldOffset,
}: PanelPluginActionDefaultsEditorProps) {
  const t = useCameraText();
  const selection = worldCameraIntrinsicSelection(values);
  const sourceSelection = worldCameraSourceSelection(values);
  const authoredPose = worldCameraAuthoredPose(values, options);
  const authoredPoseIssue = validateGazeboWorldCameraPoseIssue(authoredPose);
  const [simulationFiles, setSimulationFiles] = useState<WorldCameraIntrinsicFileOption[]>([]);
  const [physicalFiles, setPhysicalFiles] = useState<WorldCameraIntrinsicFileOption[]>([]);
  const [simulationExtrinsics, setSimulationExtrinsics] = useState<WorldCameraIntrinsicFileOption[]>([]);
  const [physicalExtrinsics, setPhysicalExtrinsics] = useState<WorldCameraIntrinsicFileOption[]>([]);
  const [selectionError,setSelectionError]=useState('');
  const [simulationMode,setSimulationMode]=useState('');
  const [picker, setPicker] = useState<'simulation' | 'physical' | 'extrinsic' | null>(null);

  useEffect(() => {
    const root = selection.calibrationRoot;
    const cameraName = selection.cameraName;
    if (!root) {
      setSimulationFiles([]);
      setPhysicalFiles([]);
      setSimulationExtrinsics([]);
      setPhysicalExtrinsics([]);
      return undefined;
    }
    let cancelled = false;
    void Promise.all([
      listAutomationTargetFiles(
        executionTargetId,
        worldCameraIntrinsicPartitionPath(root, 'sim', cameraName),
        { missing:'empty' },
      ),
      listAutomationTargetFiles(
        executionTargetId,
        worldCameraIntrinsicPartitionPath(root, 'phy', cameraName),
        { missing:'empty' },
      ),
    ]).then(([simulation, physical]) => {
      if (cancelled) return;
      setSimulationFiles(timestampedIntrinsicYamlFiles(simulation.entries));
      setPhysicalFiles(timestampedIntrinsicYamlFiles(physical.entries));
      setSimulationExtrinsics(timestampedExtrinsicYamlFiles(simulation.entries));
      setPhysicalExtrinsics(timestampedExtrinsicYamlFiles(physical.entries));
    }).catch(() => {
      if (!cancelled) {
        setSimulationFiles([]);
        setPhysicalFiles([]);
        setSimulationExtrinsics([]);
        setPhysicalExtrinsics([]);
      }
    });
    return () => { cancelled = true; };
  }, [executionTargetId, selection.calibrationRoot, selection.cameraName]);

  const latestPrefix = t('Latest · ');
  const simulationOptions = useMemo(
    () => intrinsicSelectOptions(simulationFiles, selection.simulationIntrinsicFile, latestPrefix),
    [latestPrefix, selection.simulationIntrinsicFile, simulationFiles],
  );
  const physicalOptions = useMemo(
    () => intrinsicSelectOptions(physicalFiles, selection.physicalIntrinsicFile, latestPrefix),
    [latestPrefix, selection.physicalIntrinsicFile, physicalFiles],
  );
  const extrinsicOptions = useMemo(() => {
    const physicalLabel = t('Physical');
    const simulationLabel = t('Simulation');
    const options = [
      ...physicalExtrinsics.map((file) => ({
        value: file.path,
        label: worldCameraExtrinsicOptionLabel(file,'phy',latestPrefix,simulationLabel,physicalLabel),
      })),
      ...simulationExtrinsics.map((file) => ({
        value: file.path,
        label: worldCameraExtrinsicOptionLabel(file,'sim',latestPrefix,simulationLabel,physicalLabel),
      })),
    ];
    if (selection.simulationExtrinsicFile && !options.some((option) => option.value === selection.simulationExtrinsicFile)) {
      options.push({
        value: selection.simulationExtrinsicFile,
        label: selection.simulationExtrinsicFile.split('/').pop() || selection.simulationExtrinsicFile,
      });
    }
    return options;
  }, [latestPrefix, physicalExtrinsics, selection.simulationExtrinsicFile, simulationExtrinsics, t]);
  function commit(next: {
    simulationIntrinsicFile?: string;
    physicalIntrinsicFile?: string;
    simulationPoseSource?: WorldCameraPoseSource;
    simulationExtrinsicFile?: string;
  }) {
    const result={
      simulationIntrinsicFile:next.simulationIntrinsicFile ?? selection.simulationIntrinsicFile,
      physicalIntrinsicFile:next.physicalIntrinsicFile ?? selection.physicalIntrinsicFile,
      simulationPoseSource:next.simulationPoseSource ?? selection.simulationPoseSource,
      simulationExtrinsicFile:next.simulationExtrinsicFile ?? selection.simulationExtrinsicFile,
    };
    if ((next.simulationIntrinsicFile !== undefined
      && !worldCameraIntrinsicPathMatches(next.simulationIntrinsicFile,selection.calibrationRoot,'sim',selection.cameraName))
      || (next.physicalIntrinsicFile !== undefined
      && !worldCameraIntrinsicPathMatches(next.physicalIntrinsicFile,selection.calibrationRoot,'phy',selection.cameraName))) {
      setSelectionError(t('Select a calibration from the matching mode and camera directory.'));
      return;
    }
    if (next.simulationExtrinsicFile !== undefined
      && !worldCameraExtrinsicPathMatches(next.simulationExtrinsicFile,selection.calibrationRoot,selection.cameraName)) {
      setSelectionError(t('Select a calibration from the matching mode and camera directory.'));
      return;
    }
    if (result.simulationPoseSource === 'file' && !result.simulationExtrinsicFile) {
      setSelectionError(t('Choose an extrinsics YAML when pose source is a calibration file.'));
      onChange(withWorldCameraIntrinsicSelection(values,result));
      return;
    }
    setSelectionError('');
    onChange(withWorldCameraIntrinsicSelection(values,result));
  }

  function commitSource(cameraSource: WorldCameraSource) {
    setSelectionError('');
    onChange({
      ...values,
      cameraSource,
    });
  }

  function commitAuthoredPose(next: GazeboWorldCameraPose) {
    if (validateGazeboWorldCameraPoseIssue(next)) return;
    setSelectionError('');
    onChange({
      ...withWorldCameraIntrinsicSelection(values,{
        simulationIntrinsicFile:selection.simulationIntrinsicFile,
        physicalIntrinsicFile:selection.physicalIntrinsicFile,
        simulationPoseSource:'authored',
        simulationExtrinsicFile:selection.simulationExtrinsicFile,
      }),
      ...worldCameraAuthoredPoseActionInputs(next),
    });
    onOptionsChange({ ...options,...worldCameraAuthoredPoseOptions(next) });
  }

  return (
    <FormSection
      title={t('Camera calibration inputs')}
      dataXgcRole="panel-shared-action-defaults"
      dataXgcId={panel.id}
    >
      <IntrinsicYamlField
        panelId={panel.id}
        kind="simulation"
        label={t('Simulation camera intrinsics')}
        value={selection.simulationIntrinsicFile}
        options={simulationOptions}
        onChange={(path) => commit({ simulationIntrinsicFile: path })}
        onBrowse={() => setPicker('simulation')}
      />
      <IntrinsicYamlField
        panelId={panel.id}
        kind="physical"
        label={t('Physical camera intrinsics')}
        value={selection.physicalIntrinsicFile}
        options={physicalOptions}
        onChange={(path) => commit({ physicalIntrinsicFile: path })}
        onBrowse={() => setPicker('physical')}
      />
      {(['simulation','physical'] as const).map((kind) => <WorldCameraExtrinsicSelectionField
        key={`${panel.id}:${kind}:${executionTargetId}:${selection.calibrationRoot}:${selection.cameraName}`}
        panelId={panel.id} kind={kind} value={values[extrinsicSelectionField(kind)]}
        targetId={executionTargetId} root={selection.calibrationRoot} camera={selection.cameraName}
        offset={experimentWorldOffset} files={extrinsicOptions}
        legacyLabel={kind === 'physical' ? 'Current calibration'
          : selection.simulationPoseSource === 'file' ? 'Current calibration' : 'Current hand-set pose'}
        onModeChange={kind === 'simulation' ? setSimulationMode : undefined}
        onChange={(choice) => onChange({ ...values,[extrinsicSelectionField(kind)]:JSON.stringify(choice) })}
      />)}
      <FormField
        label={t('Camera source')}
        tooltip={t('Auto follows the Session runMode. Simulation or physical forces that live source. Replay uses the image and calibration from the scene selected in Config.')}
        dataXgcRole="gazebo-world-camera-source-field"
        dataXgcId={panel.id}
      >
        <SelectControl
          ariaLabel={t('Camera source')}
          dataXgcRole="gazebo-world-camera-source"
          dataXgcId={panel.id}
          fill
          value={sourceSelection.cameraSource}
          options={WORLD_CAMERA_SOURCES.map((source) => ({ value:source,label:cameraSourceLabels(t)[source] }))}
          onChange={(value) => commitSource(value as WorldCameraSource)}
        />
      </FormField>
      {(!simulationMode || simulationMode === 'legacy') && !values.simulationExtrinsicSelectionJson && selection.simulationPoseSource === 'authored' && (
        <FormSectionSpan
          className="gazebo-world-camera-authored-pose"
          data-xgc-role="gazebo-world-camera-authored-pose"
          data-xgc-id={panel.id}
        >
          <FormField
            label={t('Position')}
            tooltip={t('World east / north / up in metres for the next Gazebo spawn.')}
            dataXgcRole="gazebo-world-camera-authored-position"
            dataXgcId={panel.id}
          >
            <Vector3Control
              unit="m"
              dataXgcRole="gazebo-world-camera-authored-position-xyz"
              dataXgcId={panel.id}
              axes={[
                { label:'X',value:authoredPose.x,step:0.1,dataXgcRole:'gazebo-world-camera-authored-pose-field',dataXgcId:`${panel.id}:x` },
                { label:'Y',value:authoredPose.y,step:0.1,dataXgcRole:'gazebo-world-camera-authored-pose-field',dataXgcId:`${panel.id}:y` },
                { label:'Z',value:authoredPose.z,step:0.1,dataXgcRole:'gazebo-world-camera-authored-pose-field',dataXgcId:`${panel.id}:z` },
              ]}
              onValueChange={(index, next) => {
                const key = (['x','y','z'] as const)[index];
                commitAuthoredPose({ ...authoredPose,[key]: Number(next) });
              }}
            />
          </FormField>
          <FormField
            label={t('Attitude')}
            tooltip={t('Roll, pitch and yaw in degrees for the next Gazebo spawn.')}
            dataXgcRole="gazebo-world-camera-authored-attitude"
            dataXgcId={panel.id}
          >
            <Vector3Control
              unit="°"
              dataXgcRole="gazebo-world-camera-authored-attitude-rpy"
              dataXgcId={panel.id}
              axes={[
                { label:'R',value:authoredPose.rollDegrees,min:-360,max:360,step:1,ariaLabel:t('Roll'),dataXgcRole:'gazebo-world-camera-authored-pose-field',dataXgcId:`${panel.id}:roll` },
                { label:'P',value:authoredPose.pitchDegrees,min:-360,max:360,step:1,ariaLabel:t('Pitch'),dataXgcRole:'gazebo-world-camera-authored-pose-field',dataXgcId:`${panel.id}:pitch` },
                { label:'Y',value:authoredPose.yawDegrees,min:-360,max:360,step:1,ariaLabel:t('Yaw'),dataXgcRole:'gazebo-world-camera-authored-pose-field',dataXgcId:`${panel.id}:yaw` },
              ]}
              onValueChange={(index, next) => {
                const key = (['rollDegrees','pitchDegrees','yawDegrees'] as const)[index];
                commitAuthoredPose({ ...authoredPose,[key]: Number(next) });
              }}
            />
          </FormField>
          {authoredPoseIssue && (
            <Notice tone="danger" density="compact">
              {localizeCameraValidationIssue(t, authoredPoseIssue)}
            </Notice>
          )}
        </FormSectionSpan>
      )}
      {(!simulationMode || simulationMode === 'legacy') && !values.simulationExtrinsicSelectionJson && selection.simulationPoseSource === 'file' && (
        <FormField
          label={t('Simulation camera extrinsics')}
          tooltip={t('YAML this Experiment uses for the Gazebo camera spawn pose. Physical files keep their stored world pose.')}
          dataXgcRole="gazebo-world-camera-simulation-extrinsic-field"
          dataXgcId={panel.id}
        >
          <div className="gazebo-world-camera-intrinsic-select">
            <SelectControl
              className="gazebo-world-camera-intrinsic-input"
              ariaLabel={t('Simulation camera extrinsics')}
              dataXgcRole="gazebo-world-camera-simulation-extrinsic"
              dataXgcId={panel.id}
              fill
              value={selection.simulationExtrinsicFile}
              options={extrinsicOptions}
              placeholder={t('Choose a file')}
              onChange={(path) => commit({ simulationExtrinsicFile: path })}
            />
            <ControlButton
              className="xgc-panel-frame-action"
              size="compact"
              iconOnly
              title={t('Browse')}
              aria-label={t('Browse')}
              dataXgcRole="gazebo-world-camera-simulation-extrinsic-browse"
              dataXgcId={panel.id}
              onClick={() => setPicker('extrinsic')}
            >
              <Ellipsis size={16} aria-hidden="true" />
            </ControlButton>
          </div>
        </FormField>
      )}
      {(selectionError || ((!simulationMode || simulationMode === 'legacy') && !values.simulationExtrinsicSelectionJson && selection.simulationPoseSource === 'file' && !selection.simulationExtrinsicFile)) && (
        <Notice tone="danger" density="compact">
          {selectionError || t('Choose an extrinsics YAML when pose source is a calibration file.')}
        </Notice>
      )}
      {picker && (
        <AutomationPathPicker
          targetId={executionTargetId}
          kind="file"
          fileExtensions={['.yaml']}
          value={picker === 'simulation' ? selection.simulationIntrinsicFile
            : picker === 'physical' ? selection.physicalIntrinsicFile
              : selection.simulationExtrinsicFile}
          onSelect={(path) => {
            if (picker === 'simulation') commit({ simulationIntrinsicFile: path });
            else if (picker === 'physical') commit({ physicalIntrinsicFile: path });
            else commit({ simulationExtrinsicFile: path });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </FormSection>
  );
}

function cameraSourceLabels(t: ReturnType<typeof useCameraText>): Record<WorldCameraSource,string> {
  return { auto:t('Auto'),simulation:t('Simulation'),physical:t('Physical'),replay:t('Replay') };
}

function IntrinsicYamlField({
  panelId,kind,label,value,options,onChange,onBrowse,
}: {
  panelId: string;
  kind: 'simulation' | 'physical';
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (path: string) => void;
  onBrowse: () => void;
}) {
  const t = useCameraText();
  const fieldId = `${panelId}:${kind}`;
  return (
    <FormField
      label={label}
      tooltip={t('YAML this Experiment uses for extrinsic calibration and the camera provider.')}
      dataXgcRole={`gazebo-world-camera-${kind}-intrinsic-field`}
      dataXgcId={fieldId}
    >
      <div className="gazebo-world-camera-intrinsic-select">
        <SelectControl
          className="gazebo-world-camera-intrinsic-input"
          ariaLabel={label}
          dataXgcRole={`gazebo-world-camera-${kind}-intrinsic`}
          dataXgcId={fieldId}
          fill
          value={value}
          options={[{ value:'',label:t('Automatic') },...options]}
          placeholder={t('Automatic')}
          onChange={onChange}
        />
        <ControlButton
          className="xgc-panel-frame-action"
          size="compact"
          iconOnly
          title={t('Browse')}
          aria-label={t('Browse')}
          dataXgcRole={`gazebo-world-camera-${kind}-intrinsic-browse`}
          dataXgcId={fieldId}
          onClick={onBrowse}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </ControlButton>
      </div>
    </FormField>
  );
}

function intrinsicSelectOptions(
  files: readonly WorldCameraIntrinsicFileOption[],
  current: string,
  latestPrefix: string,
): { value: string; label: string }[] {
  const options = files.map((file) => ({
    value: file.path,
    label: worldCameraIntrinsicOptionLabel(file, latestPrefix),
  }));
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: current.split('/').pop() || current });
  }
  return options;
}
