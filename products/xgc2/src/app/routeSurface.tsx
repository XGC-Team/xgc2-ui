import { Suspense, useCallback, type ReactNode } from 'react';
import {
  ProductRouteVisibilityProvider,
  RouteReadyProvider,
} from '../shared/routeReady';
import type { ParkedRouteSlot } from './routeSurfaceModel';

export function ParkedProductRoute({
  slot,
  revealed,
  onReady,
  children,
}: {
  slot: ParkedRouteSlot;
  revealed: boolean;
  onReady: (key: string) => void;
  children: ReactNode;
}) {
  const handleReady = useCallback(() => onReady(slot.key), [onReady, slot.key]);
  return (
    <div
      hidden={!revealed}
      inert={!revealed ? true : undefined}
      aria-hidden={!revealed}
      data-xgc-role={slot.page === 'experiment' ? 'experiment-route-surface' : 'product-route-surface'}
      data-xgc-id={slot.key}
      data-xgc-route-page={slot.page}
      data-xgc-route-slot={slot.key}
      data-xgc-route-revealed={revealed ? 'true' : undefined}
    >
      <ProductRouteVisibilityProvider visible={revealed}>
        <Suspense fallback={null}>
          <RouteReadyProvider onReady={handleReady}>
            {children}
          </RouteReadyProvider>
        </Suspense>
      </ProductRouteVisibilityProvider>
    </div>
  );
}
