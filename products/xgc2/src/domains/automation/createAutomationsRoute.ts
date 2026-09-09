import { createElement } from 'react';
import type { ProductRouteComponent } from '../../shared/productWebComposition';
import { AutomationsRoute } from './AutomationsRoute';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';

/** Bind one generated product's frozen Automation node graph to its route. */
export function createAutomationsRoute(
  composition: AutomationNodeWebComposition,
): ProductRouteComponent {
  function ProductAutomationsRoute() {
    return createElement(AutomationsRoute,{ nodeComposition: composition });
  }
  ProductAutomationsRoute.displayName = 'ProductAutomationsRoute';
  return ProductAutomationsRoute;
}
