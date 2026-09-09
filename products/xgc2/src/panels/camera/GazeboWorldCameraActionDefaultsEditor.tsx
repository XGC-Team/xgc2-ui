import { useEffect, useMemo, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { FormSection,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import { AutomationPathPicker,listAutomationTargetFiles } from '../../domains/automation/automationPublic';
import type { PanelPluginActionDefaultsEditorProps } from '../types';
import {
  withWorldCameraIntrinsicSelection,
  worldCameraIntrinsicPartitionPath,
  worldCameraIntrinsicSelection,
  worldCameraIntrinsicPathMatches,
} from './gazeboWorldCameraCalibrationInputs';
import {
  timestampedIntrinsicYamlFiles,
  worldCameraIntrinsicOptionLabel,
  type WorldCameraIntrinsicFileOption,
} from './gazeboWorldCameraIntrinsicFiles';
import { useCameraText } from './cameraMessages';
import '../../styles/gazebo-world-camera-panel.css';

export function GazeboWorldCameraActionDefaultsEditor(props: PanelPluginActionDefaultsEditorProps) {
  if (props.port.id !== 'camera-service') return null;
  return <WorldCameraIntrinsicDefaultsEditor {...props} />;
}

function WorldCameraIntrinsicDefaultsEditor({
  panel,values,onChange,executionTargetId = 'local',
}: PanelPluginActionDefaultsEditorProps) {
  const t = useCameraText();
  const selection = worldCameraIntrinsicSelection(values);
  const [simulationFiles, setSimulationFiles] = useState<WorldCameraIntrinsicFileOption[]>([]);
  const [physicalFiles, setPhysicalFiles] = useState<WorldCameraIntrinsicFileOption[]>([]);
  const [selectionError,setSelectionError]=useState('');
  const [picker, setPicker] = useState<'simulation' | 'physical' | null>(null);

  useEffect(() => {
    const root = selection.calibrationRoot;
    const cameraName = selection.cameraName;
    if (!root) {
      setSimulationFiles([]);
      setPhysicalFiles([]);
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
    }).catch(() => {
      if (!cancelled) {
        setSimulationFiles([]);
        setPhysicalFiles([]);
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

  function commit(next: { simulationIntrinsicFile?: string; physicalIntrinsicFile?: string }) {
    const result={
      simulationIntrinsicFile:next.simulationIntrinsicFile ?? selection.simulationIntrinsicFile,
      physicalIntrinsicFile:next.physicalIntrinsicFile ?? selection.physicalIntrinsicFile,
    };
    if ((next.simulationIntrinsicFile !== undefined
      && !worldCameraIntrinsicPathMatches(next.simulationIntrinsicFile,selection.calibrationRoot,'sim',selection.cameraName))
      || (next.physicalIntrinsicFile !== undefined
      && !worldCameraIntrinsicPathMatches(next.physicalIntrinsicFile,selection.calibrationRoot,'phy',selection.cameraName))) {
      setSelectionError(t('Select a calibration from the matching mode and camera directory.'));
      return;
    }
    setSelectionError('');
    onChange(withWorldCameraIntrinsicSelection(values,result));
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
      {selectionError && <Notice tone="danger" density="compact">{selectionError}</Notice>}
      {picker && (
        <AutomationPathPicker
          targetId={executionTargetId}
          kind="file"
          fileExtensions={['.yaml']}
          value={picker === 'simulation' ? selection.simulationIntrinsicFile : selection.physicalIntrinsicFile}
          onSelect={(path) => {
            if (picker === 'simulation') commit({ simulationIntrinsicFile: path });
            else commit({ physicalIntrinsicFile: path });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </FormSection>
  );
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
