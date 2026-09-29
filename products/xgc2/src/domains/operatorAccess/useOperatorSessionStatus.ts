import { useEffect, useState } from 'react';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import { deleteOperatorSession, getOperatorIdentity } from './operatorAccessService';
import { noteOperatorSessionEnded } from './operatorControlSession';
import type { OperatorIdentity } from './operatorAccessTypes';
import { operatorAccessCopy } from './operatorAccessMessages';
import { forgetPreviousStationHeader } from './operatorPairingModel';

export function useOperatorSessionStatus({ language, identity, onSignedOut }: {
  language: AppLanguage;
  identity?: OperatorIdentity;
  onSignedOut?: () => void;
}) {
  const copy = operatorAccessCopy(language);
  const [loaded, setLoaded] = useState<OperatorIdentity>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (identity !== undefined) return;
    let alive = true;
    getOperatorIdentity().then((value) => { if (alive) setLoaded(value); })
      .catch(() => { if (alive) setError(copy.loadFailed); });
    return () => { alive = false; };
  }, [identity, copy.loadFailed]);
  const current = identity ?? loaded;
  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteOperatorSession();
      forgetPreviousStationHeader();
      noteOperatorSessionEnded();
      setLoaded({ authenticated: false, canPair: false });
      if (onSignedOut) onSignedOut();
      else window.location.replace('/operator-pair');
    } catch {
      setError(copy.logoutFailed);
    } finally {
      setBusy(false);
    }
  };
  return { current, error, busy, signOut };
}
