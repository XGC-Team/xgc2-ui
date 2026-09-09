import { createElement,type ComponentType } from 'react';
import { HostRoute,type HostRouteProps } from './HostRoute';
import type { HostSystemComposition } from './hostSystemComposition';

/** Bind a generated product's static System graph to the generic route. */
export function createHostRoute(composition: HostSystemComposition): ComponentType {
  const StaticHostRoute: ComponentType<HostRouteProps> = HostRoute;
  function ProductHostRoute() {
    return createElement(StaticHostRoute,{ composition });
  }
  ProductHostRoute.displayName = 'ProductHostRoute';
  return ProductHostRoute;
}
