import { useEffect, useRef, useState } from 'react';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import { writeClipboardText } from '../../shared/utils/clipboard';
import { createDeadlineTimer } from '../../shared/eventCoalescer';
import { getOperatorIdentity, getOperatorPairingOptions, issueOperatorPairing } from './operatorAccessService';
import type { OperatorIdentity, OperatorPairingIssued, OperatorPairingOptions } from './operatorAccessTypes';
import { operatorAccessCopy, unknownOperatorCapabilities } from './operatorAccessMessages';
import { buildOperatorPairingLink } from './operatorPairingModel';

function expiryMsOf(issued: OperatorPairingIssued): number {
  return Date.parse(issued.bootstrapExpiresAt);
}

export function useOperatorDeviceSignIn(language: AppLanguage) {
  const copy = operatorAccessCopy(language);
  const [identity, setIdentity] = useState<OperatorIdentity>();
  const [options, setOptions] = useState<OperatorPairingOptions>();
  const [host, setHost] = useState('');
  const [issued, setIssued] = useState<{ value: OperatorPairingIssued; link: string }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Bumped on every authoring change and unmount: a late issue response must
  // never resurrect a link for a stale configuration.
  const changeTicket = useRef(0);
  useEffect(() => () => { changeTicket.current += 1; }, []);
  useEffect(() => {
    let alive = true;
    getOperatorIdentity().then(async (current) => {
      if (!alive) return;
      setIdentity(current);
      const available = current.canPair ? await getOperatorPairingOptions() : undefined;
      if (alive) setOptions(available);
    }).catch(() => { if (alive) setError(copy.loadFailed); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [copy.loadFailed]);
  const grant = identity?.authenticated
    ? options?.grants.find((candidate) => candidate.stationId === identity.stationId)
    : undefined;
  const grantUnknown = grant ? unknownOperatorCapabilities(grant.capabilities) : [];
  const address = options?.origins.find((origin) => origin.host === host);
  const canGenerate = Boolean(grant && grantUnknown.length === 0 && address && !busy && !loading);
  // An expired one-time ticket is not a valid link: stop offering it for copy
  // and ask for regeneration. Devices that already opened a link keep their
  // authorization; nothing here revokes a session.
  const issuedExpired = Boolean(issued && Number.isFinite(expiryMsOf(issued.value)) && expiryMsOf(issued.value) <= nowMs);
  useEffect(() => {
    if (!issued) return undefined;
    const expiryMs = expiryMsOf(issued.value);
    if (!Number.isFinite(expiryMs)) return undefined;
    const timer = createDeadlineTimer(() => setNowMs(Date.now()));
    timer.schedule(expiryMs - Date.now() + 100);
    return () => timer.cancel();
  }, [issued]);
  function authoringChanged() {
    changeTicket.current += 1;
    setIssued(undefined);
    setCopyMessage('');
  }
  const generate = async () => {
    if (!canGenerate || !grant || !address) return;
    const ticket = changeTicket.current;
    setBusy(true);
    setError('');
    setIssued(undefined);
    setCopyMessage('');
    try {
      const value = await issueOperatorPairing(grant.stationId, address.host);
      if (ticket !== changeTicket.current) return;
      if (value.station.stationId !== grant.stationId) throw new Error('Unexpected operator identity.');
      // The issued grant is what the link actually carries: apply the same
      // unknown-capability gate as the pre-check. A ticket this interface
      // cannot describe is never presented for copying.
      if (unknownOperatorCapabilities(value.station.capabilities).length > 0) { setError(copy.issueUndescribed); return; }
      setIssued({ value, link: buildOperatorPairingLink(value, address.publicOrigin) });
    } catch {
      if (ticket === changeTicket.current) setError(copy.issueFailed);
    } finally {
      setBusy(false);
    }
  };
  const selectHost = (value: string) => {
    setHost(value);
    authoringChanged();
  };
  const copyLink = async () => {
    if (!issued || issuedExpired) return;
    await writeClipboardText(issued.link).then(
      () => setCopyMessage(copy.copied),
      () => setCopyMessage(copy.copyFailed),
    );
  };
  return { identity, options, host, issued, error, loading, busy, copyMessage, grant, grantUnknown, canGenerate, issuedExpired, selectHost, generate, copyLink };
}
