import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import {
  listUsernodeAssets,
  listUsernodeNamespaces,
  projectUsernodeAssetsForTerminal,
  type UsernodeTerminalScriptItem,
} from '../usernode/usernodePublic';

/**
 * Loads Core user-script assets for the Terminal User scripts rail and subpage.
 * Never pass managedHostId: Agents have no usernode catalog; authoring stays on Core.
 */
export function useTerminalUserScripts(
  targetCoreId?: string,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled === true;
  const normalizedTargetCoreId = targetCoreId?.trim() ?? '';
  const apiTarget = useMemo<ApiTargetOptions | undefined>(
    () => (normalizedTargetCoreId ? { targetCoreId: normalizedTargetCoreId } : undefined),
    [normalizedTargetCoreId],
  );
  const [items, setItems] = useState<UsernodeTerminalScriptItem[]>([]);
  const [ready, setReady] = useState(!enabled);
  const [error, setError] = useState('');
  const liveTarget = useRef(apiTarget);
  liveTarget.current = apiTarget;

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setError('');
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    setError('');
    void (async () => {
      try {
        const [assets, namespaces] = await Promise.all([
          listUsernodeAssets(undefined, apiTarget),
          listUsernodeNamespaces(undefined, apiTarget),
        ]);
        if (cancelled || liveTarget.current !== apiTarget) return;
        setItems(projectUsernodeAssetsForTerminal(assets, namespaces));
        setReady(true);
      } catch (cause) {
        if (cancelled || liveTarget.current !== apiTarget) return;
        setItems([]);
        setError(cause instanceof Error ? cause.message : String(cause));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiTarget, enabled]);

  return { items, ready, error };
}
