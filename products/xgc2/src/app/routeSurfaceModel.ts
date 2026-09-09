import type {
  Page,
  ProductPermissionSurface,
  ProductRouteComponent,
  ProductRouteContribution,
} from '../shared/productWebComposition';

export type ParkedRouteSlot = {
  key: string;
  page: Page;
  sectionId: string;
  permissionSurface: ProductPermissionSurface;
  component: ProductRouteComponent;
};

export function parkedRouteKey(page: Page, sectionId: string, hasSectionComponent: boolean): string {
  return hasSectionComponent ? `${page}::${sectionId}` : page;
}

export function currentParkedRouteSlot(
  route: ProductRouteContribution,
  sectionId: string,
): ParkedRouteSlot {
  const section = route.sectionRoutes?.[sectionId];
  const selected = section ?? route;
  return {
    key: parkedRouteKey(route.page, sectionId, Boolean(section)),
    page: route.page,
    sectionId: section ? sectionId : '',
    permissionSurface: selected.permissionSurface ?? route.permissionSurface ?? route.page,
    component: selected.component,
  };
}

export function resolveParkedRouteSlot(
  key: string,
  routes: ReadonlyMap<string, ProductRouteContribution>,
): ParkedRouteSlot | undefined {
  const separator = key.indexOf('::');
  const page = (separator === -1 ? key : key.slice(0, separator)) as Page;
  const sectionId = separator === -1 ? '' : key.slice(separator + 2);
  const route = routes.get(page);
  if (!route) return undefined;
  if (sectionId) {
    const section = route.sectionRoutes?.[sectionId];
    if (!section) return undefined;
    return {
      key,
      page: route.page,
      sectionId,
      permissionSurface: section.permissionSurface ?? route.permissionSurface ?? route.page,
      component: section.component,
    };
  }
  return {
    key: route.page,
    page: route.page,
    sectionId: '',
    permissionSurface: route.permissionSurface ?? route.page,
    component: route.component,
  };
}

export function visibleParkedRouteKey(
  currentKey: string,
  readyKeys: ReadonlySet<string>,
): string | null {
  return readyKeys.has(currentKey) ? currentKey : null;
}
