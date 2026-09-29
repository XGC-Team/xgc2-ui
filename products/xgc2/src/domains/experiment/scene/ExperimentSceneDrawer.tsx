import { useEffect,useRef,useState } from 'react';
import { ConfigDrawer } from '../../../components/ConfigDrawer';
import { FormField,SwitchControl } from '../../../components/FormPrimitives';
import { ControlButton } from '../../../components/controls/ControlButton';
import { SelectControl } from '../../../components/controls/SelectControl';
import { InputControl } from '../../../components/controls/TextControls';
import { VenueAssetMedia,venueAssetMediaUrl } from '../../venue/venuePublic';
import { WorkspaceBusyOverlay } from '../../../shared/WorkspaceBusyOverlay';
import { listScenes,type SceneReplayAsset } from '../experimentService';
import type { ExperimentScene } from '../experimentModel';
import { useExperimentText } from '../experimentMessages';
import './experiment-scene-drawer.css';

export function ExperimentSceneDrawer({
  value,headCommitId,visible,disabledReason = '',onSave,onClose,
}: {
  value?: ExperimentScene;
  headCommitId: string;
  visible: boolean;
  disabledReason?: string;
  onSave: (scene: ExperimentScene,expectedCommitId: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useExperimentText();
  const [base] = useState(headCommitId);
  const [draft,setDraft] = useState<ExperimentScene>(() => structuredClone(value ?? { asset:'',simulator:'',parameters:{} }));
  const [assets,setAssets] = useState<SceneReplayAsset[]>([]);
  const [loading,setLoading] = useState(false);
  const [loadError,setLoadError] = useState('');
  const [saveError,setSaveError] = useState('');
  const [saving,setSaving] = useState(false);
  const [dirty,setDirty] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; },[]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    void listScenes(controller.signal).then((items) => {
      if (!controller.signal.aborted) setAssets(items);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[visible]);

  const selected = assets.find((asset) => asset.name === draft.asset);
  const support = selected?.simulators?.[draft.simulator];
  const blocked = (disabledReason ? t(disabledReason) : '') || (headCommitId !== base ? t('The Experiment changed. Reopen scene settings before saving.') : '');
  const unavailable = loading || loadError ? '' : !selected
    ? t(draft.asset ? 'The selected scene is unavailable.' : 'Choose a scene asset.')
    : Object.keys(selected.simulators ?? {}).length === 0
      ? t('This scene has no simulator representation yet.')
      : !support ? t('Choose a simulator supported by this scene.') : '';
  const parameters = draft.parameters ?? {};
  const manualTiming = parameters.overrideWorldPhysicsTiming === true;
  const timingValid = draft.simulator !== 'gazebo' || !manualTiming || (
    typeof parameters.maxStepSize === 'number' && Number.isFinite(parameters.maxStepSize) && parameters.maxStepSize > 0
    && typeof parameters.realTimeUpdateRate === 'number' && Number.isFinite(parameters.realTimeUpdateRate) && parameters.realTimeUpdateRate >= 0
  );
  const feedback = blocked || (loadError ? t(loadError) : '') || (saveError ? t(saveError) : '') || unavailable
    || (!timingValid ? t('Enter a positive integration step and a nonnegative update rate.') : '');
  const canSave = dirty && !saving && !loading && !feedback && Boolean(support);

  function change(next: ExperimentScene) {
    setDraft(next);setDirty(true);setSaveError('');
  }
  function parameter(key: string,next: unknown) {
    change({ ...draft,parameters:{ ...parameters,[key]:next } });
  }
  function selectAsset(asset: string) {
    const next = assets.find((candidate) => candidate.name === asset);
    const simulator = draft.simulator && next?.simulators?.[draft.simulator] ? draft.simulator : '';
    change({ asset,simulator,parameters:simulator ? { ...parameters } : {} });
  }
  async function save() {
    if (!canSave) return;
    setSaving(true);setSaveError('');
    try {
      await onSave(structuredClone(draft),base);
      if (mounted.current) onClose();
    } catch (cause) {
      if (mounted.current) setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (mounted.current) setSaving(false); }
  }

  return <ConfigDrawer open={visible} title={t('Scene')} ariaLabel={t('Scene')}
    className="config-drawer-wide experiment-scene-drawer" dirty={dirty && !saving} dismissible={!saving}
    dataXgcRole="experiment-scene-drawer" dataXgcId="scene"
    closeDataXgcRole="experiment-scene-close" closeDataXgcId="scene"
    closeLabel={t('Close drawer')} closeOnBackdrop={!saving} onClose={onClose}
    actions={<ControlButton size="compact" tone="primary" disabled={!canSave} aria-busy={saving}
      dataXgcRole="experiment-scene-save" dataXgcId="scene" onClick={() => void save()}>{t('Save')}</ControlButton>}>
    <div className="experiment-scene-form" data-xgc-role="experiment-scene-form" data-xgc-id="scene">
      <VenueAssetMedia name={draft.asset || 'scene'} photoExpected={selected?.kind === 'still'}
        src={selected?.kind === 'still' ? venueAssetMediaUrl(selected.name) : undefined} />
      <FormField label={t('Scene')} dataXgcRole="experiment-scene-select-field" dataXgcId="scene">
        <SelectControl ariaLabel={t('Scene')} dataXgcRole="experiment-scene-select" dataXgcId="scene"
          fill value={draft.asset} disabled={Boolean(blocked) || saving || loading} onChange={selectAsset}
          options={assets.map((asset) => ({ value:asset.name,label:asset.name }))} />
      </FormField>
      <FormField label={t('Simulator')} dataXgcRole="experiment-backend-select-field" dataXgcId="scene">
        <SelectControl ariaLabel={t('Simulator')} dataXgcRole="experiment-backend-select" dataXgcId="scene"
          fill value={draft.simulator} disabled={Boolean(blocked) || saving || !selected} onChange={(simulator) => change({ ...draft,simulator,parameters:{} })}
          options={Object.keys(selected?.simulators ?? {}).map((simulator) => ({ value:simulator,label:simulator === 'gazebo' ? 'Gazebo' : simulator === 'lightweight' ? t('Lightweight simulator') : simulator }))} />
      </FormField>
      {support?.note ? <p className="experiment-scene-support-note" data-xgc-role="experiment-backend-note" data-xgc-id="scene">{support.note}</p> : null}
      {draft.simulator === 'gazebo' && support ? <div className="experiment-scene-parameters" data-xgc-role="experiment-backend-params" data-xgc-id="gazebo">
        <FormField label={t('Custom physics timing')} dataXgcRole="experiment-scene-timing-field" dataXgcId="gazebo">
          <SwitchControl checked={manualTiming} disabled={Boolean(blocked) || saving} onChange={(checked) => change({ ...draft,parameters:{ ...parameters,
            overrideWorldPhysicsTiming:checked,maxStepSize:parameters.maxStepSize ?? 0.004,realTimeUpdateRate:parameters.realTimeUpdateRate ?? 250,
          } })} ariaLabel={t('Custom physics timing')} dataXgcRole="experiment-scene-timing" dataXgcId="gazebo" />
        </FormField>
        {manualTiming ? <div className="experiment-scene-timing-fields">
          <FormField label={t('Integration step')} dataXgcRole="experiment-scene-step-field" dataXgcId="gazebo">
            <InputControl type="number" unit="s" step="any" value={String(parameters.maxStepSize ?? '')} disabled={Boolean(blocked) || saving}
              aria-label={t('Integration step')} dataXgcRole="experiment-scene-step" dataXgcId="gazebo"
              onChange={(next) => parameter('maxStepSize',next === '' ? '' : Number(next))} />
          </FormField>
          <FormField label={t('Physics update rate')} dataXgcRole="experiment-scene-rate-field" dataXgcId="gazebo">
            <InputControl type="number" unit="Hz" value={String(parameters.realTimeUpdateRate ?? '')} disabled={Boolean(blocked) || saving}
              aria-label={t('Physics update rate')} dataXgcRole="experiment-scene-rate" dataXgcId="gazebo"
              onChange={(next) => parameter('realTimeUpdateRate',next === '' ? '' : Number(next))} />
          </FormField>
        </div> : null}
      </div> : null}
      <div className="experiment-scene-feedback" role="status" aria-live="polite" data-xgc-role="experiment-scene-feedback" data-xgc-id="scene">{feedback}</div>
      {loading ? <WorkspaceBusyOverlay id="experiment-scene" label={t('Loading scenes')} /> : null}
    </div>
  </ConfigDrawer>;
}
