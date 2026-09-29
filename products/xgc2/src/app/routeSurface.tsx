import { memo, Suspense, useCallback, type ReactNode } from 'react';
import {
  ProductRouteVisibilityProvider,
  RouteReadyProvider,
} from '../shared/routeReady';
import type { ParkedRouteSlot } from './routeSurfaceModel';

/**
 * Memo boundary: a parked page re-renders only when its own visibility, slot
 * or content element changes; the page's own state and subscriptions update
 * as usual. The DOM identity of every visited page is unchanged.
 */
export const ParkedProductRoute = memo(function ParkedProductRoute({
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
});
