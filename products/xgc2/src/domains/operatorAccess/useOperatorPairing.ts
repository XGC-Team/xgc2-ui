import { useEffect, useRef, useState } from 'react';
import { bootstrapOperatorSession } from './operatorAccessService';
import type { OperatorIdentity } from './operatorAccessTypes';
import { forgetPreviousStationHeader, takeOperatorPairingToken } from './operatorPairingModel';

/** Own the one-time exchange across StrictMode effect replay. */
export function useOperatorPairing(onPaired?: () => void) {
  const exchange = useRef<Promise<OperatorIdentity> | null>(null);
  const completed = useRef(false);
  const [phase, setPhase] = useState<'pairing' | 'missing' | 'failed' | 'paired'>('pairing');
  useEffect(() => {
    let alive = true;
    if (!exchange.current) {
      const token = takeOperatorPairingToken();
      if (!token) {
        setPhase('missing');
        return;
      }
      // Effect replay must observe the same exchange, never consume a ticket
      // twice or race an unauthenticated identity request against bootstrap.
      exchange.current = bootstrapOperatorSession(token);
    }
    exchange.current.then(() => {
      if (!alive || completed.current) return;
      forgetPreviousStationHeader();
      completed.current = true;
      setPhase('paired');
      if (onPaired) onPaired();
      else window.location.replace('/');
    }).catch(() => { if (alive) setPhase('failed'); });
    return () => { alive = false; };
  }, [onPaired]);
  return { phase };
}
