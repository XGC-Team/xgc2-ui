import { useEffect,useMemo,useRef,useState } from 'react';
import { Check,RefreshCw } from 'lucide-react';
import { Button,EmptyState,Notice,Vector3Control } from '@xgc2/ui-react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { InputControl } from '../../components/controls/TextControls';
import { robotAssetChassisClass,useRobotAssetKindComposition,useRobotText,type RobotAssetDocument } from '../../domains/robot/robotAssetPublic';
import {
  loadExperimentCoordinateSamples,
  computeExperimentWorldOrigin,
  computeExperimentSimulationInitialPoses,
  type ExperimentRobotBinding,
  type ExperimentLocalizationOffset,
} from '../../domains/experiment/experimentPublic';
import { ExperimentRobotPortrait } from './ExperimentRobotPortrait';
import './experiment-coordinate-drawer.css';

type CoordinateView = 'origin' | 'starting-poses';
type Samples = Awaited<ReturnType<typeof loadExperimentCoordinateSamples>>;
const AXES = ['x','y','z'] as const;

export function ExperimentCoordinateDrawer({
  view,targetId,runId,runMode,experimentResourceId,bindings,assets,offset,disabledReason = '',editing = false,visible = true,
  onSaveOrigin,onSavePoses,onClose,
}: {
  view: CoordinateView;
  targetId: string;
  runId?: string;
  runMode: string;
  experimentResourceId: string;
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
  const [mode,setMode] = useState<'sample' | 'custom'>(runId ? 'sample' : 'custom');
  const [samples,setSamples] = useState<Samples>();
  const [selected,setSelected] = useState<string[]>([]);
  const [manualRobot,setManualRobot] = useState(bindings[0]?.id ?? '');
  const [origin,setOrigin] = useState({ x:-offset.x,y:-offset.y,z:-offset.z });
  const [poses,setPoses] = useState(() => bindings.map((binding) => ({ ...binding,initialPose:{ ...binding.initialPose } })));
  const [refresh,setRefresh] = useState(0);
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [receipt,setReceipt] = useState('');
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
      targetId,runId,runMode,experimentResourceId,bindings,composition,signal:controller.signal,
    }).then((value) => {
      if (controller.signal.aborted) return;
      setSamples(value);
      setSelected((ids) => ids.filter((id) => value.samples.some((sample) => sample.bindingId === id)));
      setError('');
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[targetId,runId,runMode,experimentResourceId,bindings,composition,refresh,visible]);

  const candidates = (samples?.samples ?? []).filter((sample) => view !== 'origin' || sample.rawPosition);
  const preview = useMemo(() => {
    try {
      if (mode === 'custom') return { origin,poses,error:'' };
      if (!samples || selected.length === 0) return { error:'' };
      return view === 'origin'
        ? { origin:computeExperimentWorldOrigin(samples.samples,selected,samples.capturedAt).rawOrigin,error:'' }
        : { poses:computeExperimentSimulationInitialPoses(bindings,samples.samples,selected,samples.capturedAt),error:'' };
    } catch (cause) {
      return { error:cause instanceof Error ? cause.message : String(cause) };
    }
  },[mode,origin,poses,samples,selected,view,bindings]);
  const selectedPose = poses.find((binding) => binding.id === manualRobot);
  const valid = view === 'origin'
    ? preview.origin && AXES.every((axis) => Number.isFinite(preview.origin?.[axis]))
    : mode === 'sample' ? selected.length > 0 && !preview.error
      : poses.length > 0 && poses.every((binding) => Object.values(binding.initialPose).every(Number.isFinite));

  function edited() { setDirty(true);setReceipt('');setError(''); }
  function toggle(id: string) {
    setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids,id]);
    edited();
  }
  function updatePose(axis: 'x' | 'y' | 'z' | 'yaw',value: number) {
    setPoses((items) => items.map((binding) => binding.id === manualRobot
      ? { ...binding,initialPose:{ ...binding.initialPose,[axis]:value } } : binding));
    edited();
  }
  async function save() {
    if (!valid || disabledReason || saving || (mode === 'sample' && (!runId || loading))) return;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);setError('');setReceipt('');
    try {
      const currentSamples = mode === 'sample'
        ? await loadExperimentCoordinateSamples({ targetId,runId:runId!,runMode,experimentResourceId,bindings,composition,signal:controller.signal })
        : undefined;
      controller.signal.throwIfAborted();
      if (currentSamples) setSamples(currentSamples);
      if (view === 'origin') {
        const value = mode === 'sample'
          ? computeExperimentWorldOrigin(currentSamples!.samples,selected).offset
          : { x:-origin.x,y:-origin.y,z:-origin.z };
        await onSaveOrigin(value);
        setOrigin({ x:-value.x,y:-value.y,z:-value.z });
      } else {
        const value = mode === 'sample'
          ? computeExperimentSimulationInitialPoses(bindings,currentSamples!.samples,selected)
          : poses;
        await onSavePoses(value);
        setPoses(value.map((binding) => ({ ...binding,initialPose:{ ...binding.initialPose } })));
      }
      setDirty(false);
      setReceipt(t(editing ? 'Added to the Edit draft. Save the Experiment to use it next time.' : 'Saved for the next experiment start.'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
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
      footer={(
        <div className="experiment-coordinate-save">
          <div className="experiment-coordinate-receipt" role="status" data-xgc-role="experiment-coordinate-save-receipt" data-xgc-id={view}>
            {receipt}
          </div>
          <Button appearance="solid" disabled={!valid || Boolean(disabledReason) || saving || (mode === 'sample' && (!runId || loading))} aria-busy={saving}
            title={disabledReason || undefined} onClick={() => void save()}
            data-xgc-role="experiment-coordinate-save" data-xgc-id={view}
          >{t(editing ? 'Use in Edit draft' : 'Save for next start')}</Button>
        </div>
      )}
    >
      <div inert={saving}>
      <div className="experiment-coordinate-source-row">
      <div className="experiment-coordinate-modes" aria-label={t('Coordinate source')}>
        {(['sample','custom'] as const).map((source) => (
          <button type="button" key={source} aria-pressed={mode === source}
            data-xgc-role="experiment-coordinate-source" data-xgc-id={source}
            onClick={() => { setMode(source);setError('');setReceipt(''); }}
          >{t(source === 'sample' ? 'Robots' : 'Custom')}</button>
        ))}
      </div>
      {mode === 'sample' && <Button appearance="ghost" iconOnly disabled={!runId || loading || saving} aria-busy={loading}
        aria-label={t('Refresh positions')} title={t('Refresh positions')}
        data-xgc-role={view === 'starting-poses' ? 'experiment-robot-assets-fill-current-pose' : 'experiment-coordinate-refresh'}
        data-xgc-id={view === 'starting-poses' ? 'experiment' : view} onClick={() => setRefresh((value) => value + 1)}
      ><RefreshCw size={14} aria-hidden="true" /></Button>}
      </div>
      {mode === 'sample' ? (
        <>
          <div className="experiment-coordinate-candidates" aria-busy={loading}>
            {candidates.map((sample,index) => {
              const asset = assets.find((item) => item.head.resourceId === sample.robotAssetId);
              const chosen = selected.includes(sample.bindingId);
              const chassis = asset ? robotAssetChassisClass(asset.spec,composition) : undefined;
              return (
                <button type="button" className="experiment-coordinate-candidate experiment-robot-portrait-host" key={sample.bindingId}
                  aria-pressed={chosen} disabled={saving} onClick={() => toggle(sample.bindingId)}
                  title={formatPosition(view === 'origin' ? sample.rawPosition! : sample.pose)}
                  data-xgc-role="experiment-coordinate-robot" data-xgc-id={sample.bindingId}
                >
                  <ExperimentRobotPortrait family={chassis === 'multirotor' ? 'air' : chassis === 'mecanum' ? 'mecanum' : chassis === 'unicycle' ? 'ground' : 'generic'} selected={chosen} variant={index} />
                  <strong>{asset?.spec.name ?? sample.name}</strong>
                  <span className="experiment-coordinate-choice" aria-hidden="true">{chosen && <Check size={14} />}</span>
                </button>
              );
            })}
            {!loading && candidates.length === 0 && (
              <EmptyState appearance="plain" title={t('No tracked Robots')} />
            )}
          </div>
          {samples?.originUnavailableReason && view === 'origin' && <Notice density="compact" tone="warning">{samples.originUnavailableReason}</Notice>}
        </>
      ) : (
        <>
          {view === 'origin' ? (
            <CoordinateInputs value={origin} id="origin"
              onChange={(axis,value) => { setOrigin((current) => ({ ...current,[axis]:value }));edited(); }} />
          ) : bindings.length > 0 ? (
            <>
              <div className="experiment-coordinate-robot-tabs">
                {bindings.map((binding,index) => {
                  const asset = assets.find((item) => item.head.resourceId === binding.ref.resourceId);
                  const chassis = asset ? robotAssetChassisClass(asset.spec,composition) : undefined;
                  return <button type="button" key={binding.id} className="experiment-robot-portrait-host"
                    aria-pressed={manualRobot === binding.id} onClick={() => setManualRobot(binding.id)}
                    data-xgc-role="experiment-coordinate-manual-robot" data-xgc-id={binding.id}
                  ><ExperimentRobotPortrait family={chassis === 'multirotor' ? 'air' : chassis === 'mecanum' ? 'mecanum' : chassis === 'unicycle' ? 'ground' : 'generic'}
                    selected={manualRobot === binding.id} variant={index} motion={false} />
                    <span>{asset?.spec.name ?? binding.id}</span>
                  </button>;
                })}
              </div>
              {selectedPose && <>
                <CoordinateInputs value={selectedPose.initialPose} id={manualRobot} onChange={updatePose} />
                <label className="experiment-coordinate-heading">{t('Heading')}
                  <InputControl type="number" step="any" unit="rad" value={String(selectedPose.initialPose.yaw)}
                    aria-label={t('Heading')} dataXgcRole="experiment-coordinate-yaw" dataXgcId={manualRobot}
                    onChange={(value) => updatePose('yaw',parseInput(value))} />
                </label>
              </>}
            </>
          ) : <EmptyState appearance="plain" title={t('Add Robots before defining starting poses.')} />}
        </>
      )}
      {view === 'origin' && mode === 'sample' && preview.origin && valid && (
        <section className="experiment-coordinate-preview" data-xgc-role="experiment-coordinate-preview" data-xgc-id={view}>
          <span>{t('Geometric centre')}</span><strong>{formatPosition(preview.origin)}</strong>
        </section>
      )}
      {(error || preview.error) && <Notice density="compact" tone="danger" data-xgc-role="experiment-coordinate-error" data-xgc-id={view}>{error || preview.error}</Notice>}
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
    axes={AXES.map((axis) => ({ value:Number.isFinite(value[axis]) ? String(value[axis]) : '',label:axis.toUpperCase(),ariaLabel:axis.toUpperCase(),step:0.1,dataXgcRole:'experiment-coordinate-axis',dataXgcId:`${id}:${axis}` })) as [
      {value:string;label:string;ariaLabel:string;step:number;dataXgcRole:string;dataXgcId:string}, {value:string;label:string;ariaLabel:string;step:number;dataXgcRole:string;dataXgcId:string}, {value:string;label:string;ariaLabel:string;step:number;dataXgcRole:string;dataXgcId:string}
    ]}
    onValueChange={(index,next) => onChange(AXES[index],parseInput(next))}
  /></div>;
}
function parseInput(value:string) { return value.trim() === '' ? Number.NaN : Number(value); }
function formatPosition(value:ExperimentLocalizationOffset) { return `${value.x.toFixed(3)} · ${value.y.toFixed(3)} · ${value.z.toFixed(3)} m`; }
