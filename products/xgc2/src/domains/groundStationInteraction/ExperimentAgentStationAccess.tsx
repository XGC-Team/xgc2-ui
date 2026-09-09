import { useEffect,useState } from 'react';
import { Notice,Stack } from '@xgc2/ui-react';
import { FormField } from '../../components/FormPrimitives';
import { InputControl } from '../../components/controls/TextControls';
import { ControlButton } from '../../components/controls/ControlButton';
import { stationToken,signInAgentStation,STATION_AUTH_CHANGED } from './experimentAgentService';
import { useExperimentAgentText } from './experimentAgentMessages';

export function ExperimentAgentStationAccess({ id }: { id: string }) {
  const t = useExperimentAgentText();
  const [stored,setStored] = useState(() => Boolean(stationToken()));
  const [fingerprint,setFingerprint] = useState('local-main');
  const [invite,setInvite] = useState('');
  const [credential,setCredential] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    const refresh = () => setStored(Boolean(stationToken()));
    window.addEventListener(STATION_AUTH_CHANGED,refresh);
    window.addEventListener('storage',refresh);
    return () => { window.removeEventListener(STATION_AUTH_CHANGED,refresh); window.removeEventListener('storage',refresh); };
  },[]);
  const authenticate = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await signInAgentStation(fingerprint,invite,credential); }
    catch { setError(t('Sign-in failed. Check the configured invite and station-specific credential.')); }
    finally { setInvite(''); setCredential(''); setBusy(false); }
  };
  if (stored) return null;
  return <section data-xgc-role="experiment-agent-station-access" data-xgc-id={id}>
    <Stack gap="compact">
      <FormField label={t('Station fingerprint')}><InputControl value={fingerprint} onChange={setFingerprint} disabled={busy} maxLength={128} dataXgcRole="experiment-agent-fingerprint" dataXgcId={id} /></FormField>
      <FormField label={t('Deployment invite')}><InputControl type="password" autoComplete="off" value={invite} onChange={setInvite} disabled={busy} maxLength={4096} dataXgcRole="experiment-agent-invite" dataXgcId={id} /></FormField>
      <FormField label={t('Station credential')}><InputControl type="password" autoComplete="off" value={credential} onChange={setCredential} disabled={busy} maxLength={4096} dataXgcRole="experiment-agent-credential" dataXgcId={id} /></FormField>
      <ControlButton dataXgcRole="experiment-agent-sign-in" dataXgcId={id} disabled={busy || !fingerprint || !invite || !credential} onClick={() => void authenticate()}>{t('Sign in')}</ControlButton>
      {error ? <Notice tone="danger" density="compact">{error}</Notice> : null}
    </Stack>
  </section>;
}
