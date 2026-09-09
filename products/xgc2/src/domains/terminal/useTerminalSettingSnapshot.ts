import { useCallback,useEffect,useMemo,useState } from 'react';
import { getAppThemeToken } from '../../theme';
import { createFallbackTerminalSetting } from './terminalCatalogModel';
import type { TerminalSetting } from './terminalModel';
import { getTerminalSetting } from './terminalService';

export function useTerminalSettingSnapshot(targetCoreId?: string, managedHostId?: string) {
  const [setting,setSetting] = useState<TerminalSetting>(() => createFallbackTerminalSetting({
    backgroundColor: getAppThemeToken('--color-bg-code'),
    foregroundColor: getAppThemeToken('--color-text-strong'),
  }));
  const [error,setError] = useState('');
  const apiTarget = useMemo(() => {
    const core = targetCoreId?.trim();
    const host = managedHostId?.trim();
    if (!core && !host) return undefined;
    return {
      ...(core ? { targetCoreId: core } : {}),
      ...(host ? { managedHostId: host } : {}),
    };
  },[managedHostId,targetCoreId]);

  const load = useCallback(async () => {
    try {
      setSetting(await getTerminalSetting(apiTarget));
      setError('');
    } catch (cause) {
      setError(messageOf(cause));
    }
  },[apiTarget]);

  useEffect(() => {
    void load();
  },[load]);

  return { setting,error };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
