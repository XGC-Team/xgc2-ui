import { useEffect,useMemo,useRef,useState } from 'react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { useRobotText } from '../../domains/robot/robotAssetPublic';
import {
  EXPERIMENT_BOUNDARY_KEYS,experimentBoundaryDraft,parseExperimentBoundaryDraft,
  type ExperimentWorldBoundary,
} from '../../domains/experiment/experimentPublic';
import './experiment-world-fence-drawer.css';

/** This editor changes the next Experiment revision, never an active controller. */
export function ExperimentWorldFenceDrawer({
  value,headCommitId,visible,disabledReason = '',editing = false,onSave,onClose,
}: {
  value:ExperimentWorldBoundary | null;
  headCommitId:string;
  visible:boolean;
  disabledReason?:string;
  editing?:boolean;
  onSave:(value:ExperimentWorldBoundary,expectedCommitId:string) => Promise<void>;
  onClose:() => void;
}) {
  const t=useRobotText();
  const [base,setBase] = useState(() => ({headCommitId,value:JSON.stringify(value)}));
  const [draft,setDraft] = useState(() => experimentBoundaryDraft(value));
  const [ground,setGround] = useState(() => value?.groundZ == null ? '' : String(value.groundZ));
  const [dirty,setDirty] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current=true;return () => { mounted.current=false; }; },[]);
  const stale = headCommitId!==base.headCommitId || JSON.stringify(value)!==base.value;
  useEffect(() => {
    if (dirty || saving) return;
    const next = JSON.stringify(value);
    if (next !== base.value || headCommitId === base.headCommitId) return;
    setBase({ headCommitId,value:next });
  }, [base,dirty,headCommitId,saving,value]);
  const parsed=useMemo(() => {
    try { return {value:parseExperimentBoundaryDraft(draft,ground),error:''}; }
    catch(cause) { return {value:undefined,error:cause instanceof Error ? cause.message : String(cause)}; }
  },[draft,ground]);
  const blocked=disabledReason || (stale ? t('The Experiment configuration changed. Reopen coordinate settings before saving.') : '');
  const feedback=error || (dirty ? t(parsed.error) : '');
  async function save() {
    if (!parsed.value || blocked || !dirty || saving) return;
    setSaving(true);setError('');
    try {
      await onSave(parsed.value,base.headCommitId);
      if (mounted.current) onClose();
    } catch(cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if(mounted.current) setSaving(false); }
  }
  return (
    <ConfigDrawer open={visible} dirty={dirty && !saving} dismissible={!saving} ariaLabel={t('World fence')} title={t('World fence')}
      className="config-drawer-wide experiment-world-fence-drawer"
      dataXgcRole="experiment-world-fence-drawer" dataXgcId="world-boundary"
      closeDataXgcRole="experiment-world-fence-close" closeDataXgcId="world-boundary"
      closeLabel={t('Close drawer')} closeOnBackdrop={!saving} onClose={() => { if(!saving) onClose(); }}
      actions={(
        <ControlButton size="compact" tone="primary"
          disabled={Boolean(blocked)||saving||!dirty||!parsed.value}
          aria-busy={saving} title={blocked || parsed.error || undefined} onClick={() => void save()}
          dataXgcRole="experiment-world-fence-save" dataXgcId="world-boundary">
          {t(saving ? 'Saving' : editing ? 'Use in Edit draft' : 'Save for next start')}
        </ControlButton>
      )}>
      <form className="experiment-world-fence-form" onSubmit={(event) => {event.preventDefault();void save();}}>
        <fieldset disabled={Boolean(blocked)||saving} aria-describedby={feedback ? 'experiment-fence-feedback' : undefined}>
          <div className="experiment-world-fence-fields">
            {EXPERIMENT_BOUNDARY_KEYS.map((key) => (
              <label className="experiment-world-fence-field" key={key}>
                <span>{key[0]!.toUpperCase()} {t(key.endsWith('Min') ? 'Minimum' : 'Maximum')}</span>
                <InputControl type="number" step="any" unit="m" value={draft[key]}
                  aria-label={`${key[0]!.toUpperCase()} ${t(key.endsWith('Min') ? 'Minimum' : 'Maximum')} (m)`}
                  dataXgcRole="experiment-world-fence-endpoint" dataXgcId={key}
                  onChange={(next) => {setDraft((current) => ({...current,[key]:next}));setDirty(true);setError('');}} />
              </label>
            ))}
            <label className="experiment-world-fence-field">
              <span>{t('Ground')}</span>
              <InputControl type="number" step="any" unit="m" value={ground}
                aria-label={t('Ground (m)')}
                dataXgcRole="experiment-world-fence-ground" dataXgcId="groundZ"
                onChange={(next) => {setGround(next);setDirty(true);setError('');}} />
            </label>
          </div>
        </fieldset>
        {feedback ? (
          <div id="experiment-fence-feedback" role="status" aria-live="polite" className="experiment-world-fence-feedback">
            {feedback}
          </div>
        ) : null}
      </form>
    </ConfigDrawer>
  );
}
