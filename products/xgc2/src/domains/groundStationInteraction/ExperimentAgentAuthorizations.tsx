import { useEffect,useState } from 'react';
import { Notice,Stack } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { stationToken } from './experimentAgentService';
import { getExperimentAgentDelegations,revokeExperimentAgentDelegation,STATION_AUTH_CHANGED,type AgentDelegation } from './experimentAgentService';
import { useExperimentAgentText } from './experimentAgentMessages';

export function ExperimentAgentAuthorizations({ experimentId,conversationId }: { experimentId: string; conversationId:string }) {
  const t = useExperimentAgentText();
  const [leases,setLeases] = useState<AgentDelegation[]>([]);
  const [revision,setRevision] = useState(0);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => setRevision((value) => value+1);
    window.addEventListener(STATION_AUTH_CHANGED,refresh);
    return () => window.removeEventListener(STATION_AUTH_CHANGED,refresh);
  },[]);
  useEffect(() => {
    const controller = new AbortController();
    setLeases([]); setError('');
    if (stationToken()) void getExperimentAgentDelegations(experimentId,controller.signal).then((value) => {
      if (!controller.signal.aborted) setLeases(value.filter(lease => lease.scope.conversationId === conversationId));
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Authorization inventory unavailable.'); });
    return () => controller.abort();
  },[experimentId,conversationId,revision]);
  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await revokeExperimentAgentDelegation(experimentId,id); setRevision((value) => value+1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Revocation failed.'); }
    finally { setBusy(false); }
  };
  return <section aria-label={t('Experiment tools')} data-xgc-role="experiment-agent-authorizations" data-xgc-id={conversationId}>
    <Stack gap="compact">
      <ControlButton dataXgcRole="experiment-agent-refresh" dataXgcId={experimentId} onClick={() => setRevision((value) => value+1)}>{t('Refresh authorizations')}</ControlButton>
      {!leases.length && !error ? <p>{t('Experiment tools are not authorized.')}</p> : null}
      {leases.map((lease) => <section key={lease.id} data-xgc-role="experiment-agent-delegation" data-xgc-id={lease.id}>
        <p>{t('Experiment tools authorized')}</p>
        <ControlButton dataXgcRole="experiment-agent-revoke" dataXgcId={lease.id} disabled={busy} onClick={() => void revoke(lease.id)}>{t('Revoke')}</ControlButton>
      </section>)}
      {error ? <Notice tone="warning" density="compact">{error}</Notice> : null}
    </Stack>
  </section>;
}
