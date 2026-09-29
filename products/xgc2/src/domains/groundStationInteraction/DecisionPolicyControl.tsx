import { SelectControl } from '../../components/controls/SelectControl';
import { Notice } from '@xgc2/ui-react';
import type { DecisionSource } from './decisionPolicyTypes';
import { useDecisionPolicy } from './useDecisionPolicy';
import { useGroundStationNativeText } from './groundStationAgentMessages';

/** The same policy choice is used by native permissions and GCS decisions.
 * Scope comes from the pending request's backend, not the visible message. */
export function DecisionPolicyControl({experimentId,source,disabled=false}:{experimentId:string;source:DecisionSource;disabled?:boolean}) {
  const t=useGroundStationNativeText();
  const {identity,error,busy,mode,canChange,load,change}=useDecisionPolicy(experimentId,source,disabled);
  return <div data-xgc-role="decision-policy-control" data-xgc-id={identity}>
    <SelectControl size="compact" ariaLabel={t('Approval policy')} dataXgcRole="decision-policy-mode" dataXgcId={identity}
      value={mode} disabled={disabled} busy={busy} onOpen={() => void load()} onChange={mode => void change(mode)}
      options={[{value:'manual',label:t('Ask each time'),disabled:busy || !canChange},
        {value:'auto',label:t('Allow this action · 5 min / 10 uses'),disabled:busy || !canChange},
        {value:'deny',label:t('Deny this action · 5 min / 10 uses'),disabled:busy || !canChange}]} />
    {error ? <Notice tone="warning" density="compact">{error}</Notice> : null}
  </div>;
}
