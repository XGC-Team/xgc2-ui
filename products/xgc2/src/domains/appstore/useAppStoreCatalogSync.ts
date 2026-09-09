import { useCallback,useEffect,useRef,useState } from 'react';
import type { StatusTone } from '@xgc2/ui-react';
import type { ApiTargetOptions } from '../../api/http';
import { usePolling } from '../../hooks/usePolling';
import { appStoreJobIntent } from './appStoreActionModel';
import type { AppStoreSnapshot } from './appStoreModel';
import { syncCatalogAppStore } from './appStoreService';

type CatalogFeedback = { tone: StatusTone;text: string };
const REFRESH_ATTEMPTS = 20;
const REFRESH_INTERVAL_MS = 500;

export function useAppStoreCatalogSync({ targetId,targetKey,apiTarget,refreshSnapshot }: {
  targetId: string;
  targetKey: string;
  apiTarget: ApiTargetOptions;
  refreshSnapshot: () => Promise<AppStoreSnapshot | undefined>;
}) {
  const generationRef = useRef(0);
  const pollAttemptsRef = useRef(0);
  const autoSyncedTargetsRef = useRef(new Set<string>());
  const [initialLoading,setInitialLoading] = useState(true);
  const [submitting,setSubmitting] = useState(false);
  const [polling,setPolling] = useState(false);
  const [feedback,setFeedback] = useState<CatalogFeedback | null>(null);

  const sync = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pollAttemptsRef.current = 0;
    setPolling(false);
    setSubmitting(true);
    // No intermediate toast — only terminal success / error / timeout below.
    setFeedback(null);
    try {
      const intent = appStoreJobIntent('app.catalog-sync', 'catalog', targetId);
      await syncCatalogAppStore({ action: 'sync',...intent }, apiTarget);
      if (generationRef.current !== generation) return;
      setSubmitting(false);
      setPolling(true);
    } catch (cause) {
      if (generationRef.current !== generation) return;
      setFeedback({ tone: 'danger',text: messageOf(cause) });
      setSubmitting(false);
      setPolling(false);
    }
  }, [apiTarget,targetId]);

  usePolling({
    enabled: polling,
    intervalMs: REFRESH_INTERVAL_MS,
    task: async () => {
      const generation = generationRef.current;
      try {
        const next = await refreshSnapshot();
        if (generationRef.current !== generation) return;
        if (next?.apps.length) {
          setFeedback({ tone: 'success',text: 'Catalog updated.' });
          setPolling(false);
          return;
        }
        pollAttemptsRef.current += 1;
        if (pollAttemptsRef.current >= REFRESH_ATTEMPTS) {
          setFeedback({ tone: 'warning',text: 'Catalog sync is still running. Reopen the page to retry the snapshot.' });
          setPolling(false);
        }
      } catch (cause) {
        if (generationRef.current !== generation) return;
        setFeedback({ tone: 'danger',text: messageOf(cause) });
        setPolling(false);
      }
    },
  });

  useEffect(() => {
    let active = true;
    generationRef.current += 1;
    setSubmitting(false);
    setPolling(false);
    setInitialLoading(true);
    setFeedback(null);
    void (async () => {
      try {
        const next = await refreshSnapshot();
        if (!active) return;
        setInitialLoading(false);
        if (!next || next.apps.length > 0 || autoSyncedTargetsRef.current.has(targetKey)) return;
        autoSyncedTargetsRef.current.add(targetKey);
        await sync();
      } catch (cause) {
        if (!active) return;
        setInitialLoading(false);
        setFeedback({ tone: 'danger',text: messageOf(cause) });
      }
    })();
    return () => {
      active = false;
      generationRef.current += 1;
    };
  }, [refreshSnapshot,sync,targetKey]);

  return { feedback,initialLoading,sync,syncing: submitting || polling };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
