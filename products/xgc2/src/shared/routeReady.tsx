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

/* eslint-disable react-refresh/only-export-components -- route ready context and consumer hooks */

const ProductRouteVisibilityContext = createContext(true);

type RouteDeferApi = {
  setDeferred: (id: string, deferred: boolean) => void;
};

const RouteDeferContext = createContext<RouteDeferApi | null>(null);

/** True while this parked surface is the visible workspace. Isolated tests default to visible. */
export function useProductRouteVisible() {
  return useContext(ProductRouteVisibilityContext);
}

/**
 * Keep the destination behind its route loading surface until its first content is ready.
 * Missing provider is a no-op so domain pages stay testable in isolation.
 */
export function useDeferRouteReady(deferred: boolean) {
  const api = useContext(RouteDeferContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!api) return undefined;
    api.setDeferred(id, deferred);
    return () => api.setDeferred(id, false);
  }, [api, deferred, id]);
}

export function ProductRouteVisibilityProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <ProductRouteVisibilityContext.Provider value={visible}>
      {children}
    </ProductRouteVisibilityContext.Provider>
  );
}

export function RouteReadyProvider({ onReady, children }: { onReady: () => void; children: ReactNode }) {
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
    <RouteDeferContext.Provider value={api}>
      {children}
    </RouteDeferContext.Provider>
  );
}
