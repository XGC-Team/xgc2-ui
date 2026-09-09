import { createElement,type ComponentType } from 'react';
import { TerminalRoute,type TerminalRouteProps } from './TerminalRoute';
import type { TerminalComposition } from './terminalComposition';

/** Bind a product's static Terminal leaf graph to the generic route. */
export function createTerminalRoute(composition: TerminalComposition): ComponentType {
  const StaticTerminalRoute: ComponentType<TerminalRouteProps> = TerminalRoute;
  function ProductTerminalRoute() {
    return createElement(StaticTerminalRoute,{ composition });
  }
  ProductTerminalRoute.displayName = 'ProductTerminalRoute';
  return ProductTerminalRoute;
}
