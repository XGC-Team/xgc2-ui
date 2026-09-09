import type {
  Page,
  ProductNavigationSection,
  ProductWebComposition,
} from '../../shared/productWebComposition';

export type { AuditTab,HostTab,Page } from '../../shared/productWebComposition';
export type NavPageSection = ProductNavigationSection;

export function navSectionsForPage(
  composition: ProductWebComposition,
  page: Page,
  hostSections?: readonly NavPageSection[],
  terminalSections?: readonly NavPageSection[],
) {
  if (page === 'system' && hostSections) return hostSections;
  // Agent identity filters out Hosts management; Core keeps product composition.
  if (page === 'terminal' && terminalSections) return terminalSections;
  return composition.navigation.sections[page] ?? [];
}

export function validPagesFor(composition: ProductWebComposition) {
  return new Set<Page>(composition.routes.map((route) => route.page));
}

export function validSectionsFor(composition: ProductWebComposition,page: Page) {
  return new Set((composition.navigation.sections[page] ?? []).map((section) => section.id));
}
