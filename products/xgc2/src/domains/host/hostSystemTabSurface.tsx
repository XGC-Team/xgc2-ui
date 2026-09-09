import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { HostSystemTab } from './hostCapabilityModel';

export type ParkedHostSystemTab = Exclude<HostSystemTab, 'maintenance'>;

type SystemTabDeferApi = {
  setDeferred: (id: string, deferred: boolean) => void;
};

const SystemTabDeferContext = createContext<SystemTabDeferApi | null>(null);

/**
 * Keep this System tab mounted until it has real content, then reveal it.
 * Missing provider is a no-op so Overview stays testable in isolation.
 */
// eslint-disable-next-line react-refresh/only-export-components -- context consumer hook
export function useDeferSystemTabReady(deferred: boolean) {
  const api = useContext(SystemTabDeferContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!api) return undefined;
    api.setDeferred(id, deferred);
    return () => api.setDeferred(id, false);
  }, [api, deferred, id]);
}

function SystemTabReadyProvider({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  const deferredIds = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  const setDeferred = useCallback((id: string, deferred: boolean) => {
    const had = deferredIds.current.has(id);
    if (deferred === had) return;
    if (deferred) deferredIds.current.add(id);
    else deferredIds.current.delete(id);
    setTick((value) => value + 1);
  }, []);
  const api = useMemo(() => ({ setDeferred }), [setDeferred]);
  useLayoutEffect(() => {
    if (deferredIds.current.size === 0) onReady();
  }, [onReady, tick]);
  return (
    <SystemTabDeferContext.Provider value={api}>
      {children}
    </SystemTabDeferContext.Provider>
  );
}

export function SystemTabSurface({
  tab,
  revealed,
  fillWorkspace = true,
  onReady,
  children,
}: {
  tab: ParkedHostSystemTab;
  revealed: boolean;
  fillWorkspace?: boolean;
  onReady: (tab: ParkedHostSystemTab) => void;
  children: ReactNode;
}) {
  const handleReady = useCallback(() => onReady(tab), [onReady, tab]);
  return (
    <div
      hidden={!revealed}
      inert={!revealed ? true : undefined}
      aria-hidden={!revealed}
      data-xgc-role="system-tab-surface"
      data-xgc-id={tab}
      data-xgc-tab-revealed={revealed ? 'true' : undefined}
      className={fillWorkspace ? 'xgc-host-fill-workspace' : undefined}
    >
      <SystemTabReadyProvider onReady={handleReady}>
        {children}
      </SystemTabReadyProvider>
    </div>
  );
}
