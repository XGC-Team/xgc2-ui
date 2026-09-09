import { useEffect,useMemo,useRef,useState } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import {
  listRobotAssets,
  useRobotAssetKindComposition,
} from '../robot/robotAssetPublic';
import type { TerminalHost } from './terminalModel';
import { projectRobotAssetsAsTerminalHosts } from './terminalRobotHosts';

/**
 * Loads Core Robot assets and projects SSH-capable ones as TerminalHost login targets.
 * Agent identity must pass enabled=false — robots are Core-local inventory only.
 */
export function useTerminalRobotHosts(
  targetCoreId?: string,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
  const composition = useRobotAssetKindComposition();
  const normalizedTargetCoreId = targetCoreId?.trim() ?? '';
  const apiTarget = useMemo<ApiTargetOptions | undefined>(
    () => (normalizedTargetCoreId ? { targetCoreId: normalizedTargetCoreId } : undefined),
    [normalizedTargetCoreId],
  );
  const [hosts,setHosts] = useState<TerminalHost[]>([]);
  const [ready,setReady] = useState(!enabled);
  const [error,setError] = useState('');
  const liveTarget = useRef(apiTarget);
  liveTarget.current = apiTarget;

  useEffect(() => {
    if (!enabled) {
      setHosts([]);
      setError('');
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    setError('');
    void (async () => {
      try {
        // Pass product composition so extension-kind wire arms decode.
        const assets = await listRobotAssets(undefined, apiTarget, composition);
        if (cancelled || liveTarget.current !== apiTarget) return;
        setHosts(projectRobotAssetsAsTerminalHosts(assets));
        setReady(true);
      } catch (cause) {
        if (cancelled || liveTarget.current !== apiTarget) return;
        setHosts([]);
        setError(cause instanceof Error ? cause.message : String(cause));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiTarget, composition, enabled]);

  return { hosts,ready,error };
}
