import { useCallback,useRef,useState } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import { getAppStoreSnapshot } from './appStoreService';
import { DEFAULT_APP_STORE_SETTING,type AppStoreSnapshot } from './appStoreModel';

const EMPTY_SNAPSHOT: AppStoreSnapshot = {
  apps: [],
  details: [],
  installed: [],
  setting: DEFAULT_APP_STORE_SETTING,
};

export function useAppStoreSnapshot({ targetId,targetKey,apiTarget }: {
  targetId: string;
  targetKey: string;
  apiTarget: ApiTargetOptions;
}) {
  const requestRef = useRef({ targetKey,generation: 0 });
  if (requestRef.current.targetKey !== targetKey) {
    requestRef.current = { targetKey,generation: requestRef.current.generation + 1 };
  }
  const [snapshot,setSnapshot] = useState<AppStoreSnapshot>(EMPTY_SNAPSHOT);
  const [error,setError] = useState('');

  const refresh = useCallback(async () => {
    const requestKey = targetKey;
    const generation = requestRef.current.generation + 1;
    requestRef.current.generation = generation;
    try {
      const next = await getAppStoreSnapshot(targetId, apiTarget);
      if (requestRef.current.targetKey !== requestKey || requestRef.current.generation !== generation) return undefined;
      setSnapshot(next);
      setError('');
      return next;
    } catch (cause) {
      if (requestRef.current.targetKey === requestKey && requestRef.current.generation === generation) {
        setError(messageOf(cause));
      }
      return undefined;
    }
  }, [apiTarget,targetId,targetKey]);

  return { ...snapshot,error,refresh };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
