import { useEffect,useState } from 'react';
import type { AgentProviderSettingsUpdate,AgentSettings } from '@xgc2/agent-runtime/react';
import {
  getNativeProviderSettings,
  refreshNativeProviderSettings,
  updateNativeProviderSettings,
} from './groundStationAgentSettingsService';
import { isNativeCompanionUnavailable,operatorNativeErrorMessage } from './nativeCompanionAvailability';

export function useAgentProviderSettings(open:boolean) {
  const [settings,setSettings] = useState<AgentSettings>();
  const [error,setError] = useState('');
  const [unavailable,setUnavailable] = useState(false);
  const [reload,setReload] = useState(0);
  const [busy,setBusy] = useState(false);
  const [savingId,setSavingId] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    void getNativeProviderSettings(controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setSettings(next);
      setUnavailable(false);
      setError('');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [open,reload]);

  async function refresh(providerId:string) {
    setSavingId(providerId);
    try {
      setSettings(await refreshNativeProviderSettings(providerId));
      setUnavailable(false);
      setError('');
    } catch (cause: unknown) {
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
    } finally {
      setSavingId('');
    }
  }

  async function save(update:AgentProviderSettingsUpdate) {
    setSavingId(update.provider.id);
    try {
      setSettings(await updateNativeProviderSettings(update));
      setUnavailable(false);
      setError('');
      return true;
    } catch (cause: unknown) {
      setUnavailable(isNativeCompanionUnavailable(cause));
      setError(operatorNativeErrorMessage(cause));
      return false;
    } finally {
      setSavingId('');
    }
  }

  return {settings,error,unavailable,busy,savingId,retry:() => setReload(value => value+1),refresh,save};
}
