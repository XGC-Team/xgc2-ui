import { useCallback,useEffect,useRef,useState } from 'react';
import { useDelayedTask } from '../../hooks/useDelayedTask';
import {
  checkRobotAssetReachability,
  type RobotAssetReachability,
} from './robotAssetService';

export const ROBOT_REACHABILITY_FEEDBACK_MS = 3000;

export type RobotAssetReachabilityState = {
  status: 'checking' | 'reachable' | 'unreachable' | 'error' | 'checked';
  result?: RobotAssetReachability;
  message?: string;
};

type TimedRobotAssetReachabilityState = RobotAssetReachabilityState & {
  feedbackUntil?: number;
};

export function useRobotAssetReachability(
  probe: (resourceId: string) => Promise<RobotAssetReachability> = checkRobotAssetReachability,
) {
  const [reachabilityById,setReachabilityById] = useState<Record<string,TimedRobotAssetReachabilityState>>({});
  const checking = useRef(new Set<string>());
  const nextFeedbackUntil = Object.values(reachabilityById).reduce<number | undefined>(
    (earliest,state) => state.feedbackUntil === undefined
      ? earliest : earliest === undefined ? state.feedbackUntil : Math.min(earliest,state.feedbackUntil),
    undefined,
  );

  useEffect(() => () => {
    checking.current.clear();
  }, []);

  useDelayedTask({
    enabled: nextFeedbackUntil !== undefined,
    delayMs: nextFeedbackUntil === undefined ? 0 : Math.max(0,nextFeedbackUntil - Date.now()),
    task: () => {
      const now = Date.now();
      setReachabilityById((current) => {
        let changed = false;
        const next: Record<string,TimedRobotAssetReachabilityState> = {};
        Object.entries(current).forEach(([resourceId,state]) => {
          if (state.feedbackUntil === undefined || state.feedbackUntil > now) {
            next[resourceId] = state;
            return;
          }
          changed = true;
          next[resourceId] = { ...state,status: 'checked',feedbackUntil: undefined };
        });
        return changed ? next : current;
      });
    },
  });

  const settle = useCallback((resourceId: string,state: RobotAssetReachabilityState) => {
    setReachabilityById((current) => ({
      ...current,[resourceId]: { ...state,feedbackUntil: Date.now() + ROBOT_REACHABILITY_FEEDBACK_MS },
    }));
  }, []);

  const checkReachability = useCallback(async (resourceId: string) => {
    if (checking.current.has(resourceId)) return;
    checking.current.add(resourceId);
    setReachabilityById((current) => ({
      ...current,[resourceId]: { status: 'checking',result: current[resourceId]?.result },
    }));
    try {
      const result = await probe(resourceId);
      settle(resourceId,{ status: result.reachable ? 'reachable' : 'unreachable',result });
    } catch (cause) {
      settle(resourceId,{
        status: 'error',message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      checking.current.delete(resourceId);
    }
  }, [probe,settle]);

  return { reachabilityById,checkReachability };
}
