import { useEffect,useMemo,useRef,useState } from 'react';
import { Check,RefreshCw } from 'lucide-react';
import { Button,EmptyState,Notice,Vector3Control } from '@xgc2/ui-react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { robotAssetChassisClass,useRobotAssetKindComposition,useRobotText,type RobotAssetDocument } from '../../domains/robot/robotAssetPublic';
import {
  loadExperimentCoordinateSamples,
  computeExperimentSimulationInitialPoses,
  type ExperimentRobotBinding,
  type ExperimentLocalizationOffset,
  coordinateFieldNumber,
  coordinateFieldText,
} from '../../domains/experiment/experimentPublic';
import { ExperimentRobotPortrait } from './ExperimentRobotPortrait';
import './experiment-coordinate-drawer.css';

type CoordinateView = 'origin' | 'starting-poses';
type Samples = Awaited<ReturnType<typeof loadExperimentCoordinateSamples>>;
const AXES = ['x','y','z'] as const;

export function ExperimentCoordinateDrawer({
  view,targetId,runId,runMode,experimentResourceId,expectedCommitId,expectedDigest,sessionId,robotRunIds,bindings,assets,offset,disabledReason = '',editing = false,visible = true,
  onSaveOrigin,onSavePoses,onClose,
}: {
  view: CoordinateView;
  targetId: string;
  runId?: string;
  runMode: string;
  experimentResourceId: string;
  expectedCommitId: string;
  expectedDigest: string;
  sessionId: string;
  robotRunIds: readonly string[];
  bindings: readonly ExperimentRobotBinding[];
  assets: readonly RobotAssetDocument[];
  offset: ExperimentLocalizationOffset;
  disabledReason?: string;
  editing?: boolean;
  visible?: boolean;
  onSaveOrigin: (offset: ExperimentLocalizationOffset) => Promise<void>;
  onSavePoses: (bindings: readonly ExperimentRobotBinding[]) => Promise<void>;
  onClose: () => void;
}) {
  const t = useRobotText();
  const composition = useRobotAssetKindComposition();
  const ownerIdentity = JSON.stringify(robotRunIds);
  const owners = useMemo(() => JSON.parse(ownerIdentity) as string[],[ownerIdentity]);
  const [samples,setSamples] = useState<Samples>();
  const [selected,setSelected] = useState<string[]>([]);
  const [manualRobot,setManualRobot] = useState(bindings[0]?.id ?? '');
  const [origin,setOrigin] = useState({ x:-offset.x,y:-offset.y,z:-offset.z });
  const [poses,setPoses] = useState(() => bindings.map((binding) => ({ ...binding,initialPose:{ ...binding.initialPose } })));
  const [refresh,setRefresh] = useState(0);
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [dirty,setDirty] = useState(false);
  const saveController = useRef<AbortController | null>(null);

  useEffect(() => () => saveController.current?.abort(),[targetId,runId,experimentResourceId,visible]);

  useEffect(() => {
    if (!visible) { setLoading(false);return; }
    if (!runId) {
      setSamples(undefined);
      setSelected([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setSamples(undefined);
    void loadExperimentCoordinateSamples({
      targetId,runId,runMode,experimentResourceId,expectedCommitId,expectedDigest,sessionId,robotRunIds:owners,bindings,composition,signal:controller.signal,
    }).then((value) => {
      if (controller.signal.aborted) return;
      setSamples(value);
      setSelected((ids) => ids.filter((id) => value.samples.some((sample) => sample.bindingId === id)));
      setError('');
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[targetId,runId,runMode,experimentResourceId,expectedCommitId,expectedDigest,sessionId,owners,bindings,composition,refresh,visible]);

  const candidates = (samples?.samples ?? []).filter((sample) => sample.physical && sample.rawPosition);
  const selectedPose = poses.find((binding) => binding.id === manualRobot);
  const valid = view === 'origin'
    ? AXES.every((axis) => Number.isFinite(origin[axis]))
    : poses.length > 0 && poses.every((binding) => Object.values(binding.initialPose).every(Number.isFinite));

  function edited() { setDirty(true);setError(''); }
  function fillOrigin(sample: Samples['samples'][number]) {
    const position = sample.rawPosition;
    if (!position) return;
    setSelected([sample.bindingId]);
    setOrigin({ x:position.x,y:position.y,z:position.z });
    edited();
  }
  function updatePose(axis: 'x' | 'y' | 'z' | 'yaw',value: number) {
    setPoses((items) => items.map((binding) => binding.id === manualRobot
      ? { ...binding,initialPose:{ ...binding.initialPose,[axis]:value } } : binding));
    edited();
  }
  function selectStartingRobot(bindingId: string) {
    setManualRobot(bindingId);
    const binding = poses.find((item) => item.id === bindingId);
    const live = binding && samples ? samples.samples.filter((sample) => sample.bindingId === bindingId
      && binding.ref.resourceId === sample.robotAssetId && binding.namespace === sample.namespace) : [];
    if (live.length !== 1 || !samples) return;
    try {
      const next = computeExperimentSimulationInitialPoses(poses,samples.samples,[bindingId],offset);
      setPoses(next.map((item) => ({ ...item,initialPose:{ ...item.initialPose } })));
      edited();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  async function save() {
    if (!valid || disabledReason || saving) return;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);setError('');
    try {
      if (view === 'origin') {
        const value = { x:-origin.x,y:-origin.y,z:-origin.z };
        await onSaveOrigin(value);
        setOrigin({ x:-value.x,y:-value.y,z:-value.z });
      } else {
        await onSavePoses(poses);
        setPoses(poses.map((binding) => ({ ...binding,initialPose:{ ...binding.initialPose } })));
      }
      setDirty(false);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    finally { if (saveController.current === controller) saveController.current = null;setSaving(false); }
  }

  return (
    <ConfigDrawer
      open={visible}
      title={t(view === 'origin' ? 'World origin' : 'Starting poses')}
      className="experiment-coordinate-drawer"
      bodyClassName="experiment-coordinate-drawer-body"
      dataXgcRole="experiment-coordinate-drawer"
      dataXgcId={view}
      dirty={dirty}
      dismissible={!saving}
      onClose={onClose}
      closeOnBackdrop
      actions={(
        <ControlButton size="compact" tone="primary"
          disabled={!valid || Boolean(disabledReason) || saving}
          aria-busy={saving} title={disabledReason || undefined} onClick={() => void save()}
          dataXgcRole="experiment-coordinate-save" dataXgcId={view}
        >{t(editing ? 'Use in Edit draft' : 'Save for next start')}</ControlButton>
      )}
    >
      <div inert={saving}>
      {view === 'origin' ? (
        <>
          <CoordinateInputs value={origin} id="origin"
            onChange={(axis,value) => { setOrigin((current) => ({ ...current,[axis]:value }));edited(); }} />
          {runId && <div className="experiment-coordinate-source-row">
            <Button appearance="ghost" iconOnly disabled={loading || saving} aria-busy={loading}
              aria-label={t('Refresh positions')} title={t('Refresh positions')}
              data-xgc-role="experiment-coordinate-refresh" data-xgc-id={view}
              onClick={() => setRefresh((value) => value + 1)}
            ><RefreshCw size={14} aria-hidden="true" /></Button>
          </div>}
          {candidates.length > 0 && <div className="experiment-coordinate-candidates" aria-busy={loading}>
            {candidates.map((sample,index) => {
              const asset = assets.find((item) => item.head.resourceId === sample.robotAssetId);
              const chassis = asset ? robotAssetChassisClass(asset.spec,composition) : undefined;
              return (
                <Button appearance="ghost" type="button" className="experiment-coordinate-candidate experiment-robot-portrait-host" key={sample.bindingId}
                  aria-pressed={selected[0] === sample.bindingId} disabled={saving} onClick={() => fillOrigin(sample)}
                  title={formatPosition(sample.rawPosition!)}
                  data-xgc-role="experiment-coordinate-robot" data-xgc-id={sample.bindingId}
                >
                  <ExperimentRobotPortrait family={chassis === 'multirotor' ? 'air' : chassis === 'mecanum' ? 'mecanum' : chassis === 'unicycle' ? 'ground' : 'generic'} selected={selected[0] === sample.bindingId} variant={index} />
                  <strong>{asset?.spec.name ?? sample.name}</strong>
                  <span className="experiment-coordinate-choice" aria-hidden="true">{selected[0] === sample.bindingId && <Check size={14} />}</span>
                </Button>
              );
            })}
          </div>}
          {samples?.originUnavailableReason && <Notice density="compact" tone="warning">{samples.originUnavailableReason}</Notice>}
        </>
      ) : bindings.length > 0 ? (
        <>
          {runId && <div className="experiment-coordinate-source-row">
            <Button appearance="ghost" iconOnly disabled={loading || saving} aria-busy={loading}
              aria-label={t('Refresh positions')} title={t('Refresh positions')}
              data-xgc-role="experiment-robot-assets-fill-current-pose" data-xgc-id="experiment"
              onClick={() => setRefresh((value) => value + 1)}
            ><RefreshCw size={14} aria-hidden="true" /></Button>
          </div>}
          <div className="experiment-coordinate-robot-tabs">
            {bindings.map((binding,index) => {
              const asset = assets.find((item) => item.head.resourceId === binding.ref.resourceId);
              const chassis = asset ? robotAssetChassisClass(asset.spec,composition) : undefined;
              const pressed = manualRobot === binding.id;
              const name = asset?.spec.name ?? binding.id;
              return <Button appearance="ghost" type="button" key={binding.id} className="experiment-robot-portrait-host"
                aria-pressed={pressed} disabled={saving} onClick={() => selectStartingRobot(binding.id)}
                data-xgc-role="experiment-coordinate-manual-robot" data-xgc-id={binding.id}
              ><ExperimentRobotPortrait family={chassis === 'multirotor' ? 'air' : chassis === 'mecanum' ? 'mecanum' : chassis === 'unicycle' ? 'ground' : 'generic'}
                selected={pressed} variant={index} motion={false} />
                <span>{name}</span>
                <span className="experiment-coordinate-choice" aria-hidden="true">{pressed && <Check size={14} />}</span>
              </Button>;
            })}
          </div>
          {selectedPose && <>
            <p className="experiment-coordinate-selected-robot" data-xgc-role="experiment-coordinate-selected-robot" data-xgc-id={manualRobot}>
              {assets.find((item) => item.head.resourceId === selectedPose.ref.resourceId)?.spec.name ?? manualRobot}
            </p>
            <CoordinateInputs value={selectedPose.initialPose} id={manualRobot} onChange={updatePose} />
            <label className="experiment-coordinate-heading">{t('Heading')}
              <InputControl type="number" step="0.01" unit="rad" value={coordinateFieldText(selectedPose.initialPose.yaw)}
                aria-label={t('Heading')} dataXgcRole="experiment-coordinate-yaw" dataXgcId={manualRobot}
                onChange={(value) => updatePose('yaw',coordinateFieldNumber(value))} />
            </label>
          </>}
        </>
      ) : <EmptyState appearance="plain" title={t('Add Robots before defining starting poses.')} />}
      {error && <Notice density="compact" tone="danger" data-xgc-role="experiment-coordinate-error" data-xgc-id={view}>{error}</Notice>}
      </div>
    </ConfigDrawer>
  );
}

function CoordinateInputs({ value,id,onChange }: {
  value: ExperimentLocalizationOffset;id:string;
  onChange:(axis:'x'|'y'|'z',value:number)=>void;
}) {
  return <div className="experiment-coordinate-inputs"><Vector3Control unit="m"
    dataXgcRole="experiment-coordinate-position" dataXgcId={id}
    axes={AXES.map((axis) => ({ value:coordinateFieldText(value[axis]),label:axis.toUpperCase(),ariaLabel:axis.toUpperCase(),step:0.01,dataXgcRole:'experiment-coordinate-axis',dataXgcId:`${id}:${axis}` })) as [
      {value:string;label:string;ariaLabel:string;step:number;dataXgcRole:string;dataXgcId:string}, {value:string;label:string;ariaLabel:string;step:number;dataXgcRole:string;dataXgcId:string}, {value:string;label:string;ariaLabel:string;step:number;dataXgcRole:string;dataXgcId:string}
    ]}
    onValueChange={(index,next) => onChange(AXES[index],coordinateFieldNumber(next))}
  /></div>;
}
function formatPosition(value:ExperimentLocalizationOffset) { return `${value.x.toFixed(3)} · ${value.y.toFixed(3)} · ${value.z.toFixed(3)} m`; }
