import {
  createContext,
  createElement,
  useState,
  useContext,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AppLanguage } from './localization/languagePreference';

/** Erased page literals only — feature runtime must not hang off this union. */
export type Page =
  | 'home'
  | 'experiment'
  | 'robotAssets'
  | 'automations'
  | 'operations'
  | 'appStore'
  | 'containers'
  | 'system'
  | 'terminal'
  | 'audit'
  | 'settings';

export type HostTab = 'overview' | 'files' | 'processes' | 'host' | 'maintenance' | 'ssh';
export type AuditTab = 'operation' | 'access' | 'system' | 'login';
export type LocalizedProductText = Readonly<Record<AppLanguage,string>>;
export type RemoteManagedHostAdmission = (effectiveProfile: unknown) => boolean;

/**
 * Target / remote / capability policy carried on static route contributions.
 * Generic hosts never hard-code feature page branches; they read this metadata.
 */
export type ProductRouteSurfacePolicy = {
  /** Product capability feature tokens without the `product.` prefix. */
  productFeatures: readonly string[];
  targetAction: string;
  targetCapabilities: readonly string[];
  /**
   * Remote managed-host visibility:
   * - capability: requires product.* tokens on the host
   * - local-only: never shown for remote managed hosts
   * - control-plane: always available remotely without host product tokens
  */
  remoteVisibility: 'capability' | 'local-only' | 'control-plane';
  /**
   * Static owner-supplied Agent profile admission. Generic route/navigation
   * hosts execute this function without knowing the owning page or feature.
   */
  remoteManagedHostAdmission: RemoteManagedHostAdmission;
};

export type ProductNavigationItem = {
  id: Page;
  label: LocalizedProductText;
  icon: LucideIcon;
};

export type ProductNavigationSection = {
  id: string;
  label: LocalizedProductText;
  icon: LucideIcon;
};

export type ProductRouteComponent = ComponentType | LazyExoticComponent<ComponentType>;
export type ProductRoutePreload = () => Promise<unknown>;

/**
 * Suspense-compatible route whose preload fully resolves its component.
 * Unlike React.lazy, rendering after preload does not suspend for a cached
 * import's extra promise microtask (which React 19 may throttle for 300 ms).
 */
export function createPreloadableProductRoute(
  loader: () => Promise<{ default: ProductRouteComponent }>,
): { component: ComponentType; preload: ProductRoutePreload } {
  let status: 'idle' | 'pending' | 'resolved' = 'idle';
  let resolved: ProductRouteComponent | undefined;
  let failure: unknown;
  let pending: Promise<void> | undefined;

  const preload = () => {
    if (status === 'resolved') return Promise.resolve();
    if (pending) return pending;
    status = 'pending';
    const attempt = loadProductRouteWithRetry(loader)
      .then((module) => {
        resolved = module.default;
        failure = undefined;
        status = 'resolved';
      })
      .catch((error: unknown) => {
        failure = error;
        status = 'idle';
        throw error;
      })
      .finally(() => {
        if (pending === attempt) pending = undefined;
      });
    pending = attempt;
    return attempt;
  };

  function PreloadableProductRoute() {
    if (status === 'resolved' && resolved) return createElement(resolved);
    if (failure && status === 'idle' && !pending) {
      const retry = () => {
        failure = undefined;
        return preload();
      };
      return createElement(ProductRouteLoadFailure,{ retry });
    }
    throw preload().then(() => undefined,() => undefined);
  }
  PreloadableProductRoute.displayName = 'PreloadableProductRoute';

  return { component: PreloadableProductRoute,preload };
}

function loadProductRouteWithRetry<T>(loader: () => Promise<T>): Promise<T> {
  const first = deferProductRouteLoad(loader);
  return first.catch((error: unknown) => {
    if (!isRetryableProductRouteLoadError(error)) throw error;
    return deferProductRouteLoad(loader);
  });
}

function deferProductRouteLoad<T>(loader: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(loader);
}

function isRetryableProductRouteLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return candidate.name === 'AbortError'
    || /ERR_ABORTED|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

function ProductRouteLoadFailure({
  retry,
}: {
  retry: () => Promise<void>;
}) {
  const [retrying,setRetrying] = useState(false);
  const handleRetry = () => {
    setRetrying(true);
    void retry().then(() => setRetrying(false),() => setRetrying(false));
  };
  return createElement(
    'div',
    { role: 'alert', 'data-xgc-role': 'product-route-load-error', 'data-xgc-id': 'product-route-load-error' },
    createElement('p',null,'This page could not load.'),
    createElement(
      'button',
      { type: 'button', onClick: handleRetry, disabled: retrying },
      retrying ? 'Retrying…' : 'Retry',
    ),
  );
}

export type ProductSectionRouteContribution = {
  component: ProductRouteComponent;
  preload?: ProductRoutePreload;
  permissionSurface?: Page | 'maintenance';
  surface?: ProductRouteSurfacePolicy;
};

export type ProductRouteContribution = {
  page: Page;
  component: ProductRouteComponent;
  preload?: ProductRoutePreload;
  permissionSurface?: Page | 'maintenance';
  sectionRoutes?: Readonly<Record<string,ProductSectionRouteContribution>>;
  surface: ProductRouteSurfacePolicy;
};

/** Narrow runtime surface injected into Home cards (language only). */
export type HomeRuntimePort = {
  language: AppLanguage;
};

export type HomeCardProps = {
  runtime: HomeRuntimePort;
};

export type HomeCardContribution = {
  owner: 'Home.RecordingLibrary';
  id: string;
  component: ComponentType<HomeCardProps>;
};

export type HomePageContribution = {
  route: Omit<ProductRouteContribution, 'page'> & { page: 'home' };
  cards: readonly [HomeCardContribution, ...HomeCardContribution[]];
};

export type ProductSettingsContext = {
  skin: 'dark' | 'light';
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onSkinChange: (skin: 'dark' | 'light') => void;
};

export type ProductSettingsSection = {
  id: string;
  component: LazyExoticComponent<ComponentType<ProductSettingsContext>>;
};
export type ProductWebOwnerMetadata = {
  enabledOwners: readonly string[];
  deniedOwners: readonly string[];
  modulePrefixes: Readonly<Record<string,readonly string[]>>;
};

export type ProductOwnerIdentity = {
  readonly token: symbol;
  readonly diagnosticName: string;
};

export function defineProductOwnerIdentity(diagnosticName: string): ProductOwnerIdentity {
  return Object.freeze({ token: Symbol(),diagnosticName });
}

/** Append a section route onto an existing page route already present in base/owners. */
export type ProductRouteSectionContribution = {
  page: Page;
  sectionId: string;
  route: ProductSectionRouteContribution;
};

/** Typed leaf contribution merged into a product web composition at build time. */
export type ProductOwnerContribution = {
  owner: ProductOwnerIdentity;
  requires?: readonly ProductOwnerIdentity[];
  routes?: readonly ProductRouteContribution[];
  /**
   * Merge section routes onto an existing page route. Parent page must already
   * exist; duplicate section ids fail closed. Routes are cloned deterministically.
   */
  routeSections?: readonly ProductRouteSectionContribution[];
  navigation?: {
    primary?: readonly ProductNavigationItem[];
    operations?: readonly ProductNavigationItem[];
    sections?: readonly {
      page: Page;
      items: readonly ProductNavigationSection[];
    }[];
    sectionDefaults?: readonly {
      page: Page;
      sectionId: string;
    }[];
  };
  settings?: { sections?: readonly ProductSettingsSection[] };
};

export type ProductWebComposition = {
  id: string;
  /** Exact projection of Core Profile AgentLink.ComputeTargets. */
  agentLinkComputeTargets: boolean;
  routes: readonly ProductRouteContribution[];
  navigation: {
    defaultPage: Page;
    primary: readonly ProductNavigationItem[];
    operations: readonly ProductNavigationItem[];
    sections: Partial<Readonly<Record<Page,readonly ProductNavigationSection[]>>>;
    sectionDefaults: Partial<Readonly<Record<Page,string>>>;
  };
  settings: { sections: readonly ProductSettingsSection[] };
  developer: {
    markPrompt?: LazyExoticComponent<ComponentType<{
      page: string;
      pageId?: string;
      pageSection?: string;
      executionTargetId?: string;
      targetCoreId?: string;
      managedHostId?: string;
    }>>;
    controlGallery?: LazyExoticComponent<ComponentType>;
  };
  home?: HomePageContribution;
};

const ProductWebCompositionContext = createContext<ProductWebComposition | null>(null);

export function ProductWebCompositionProvider({ children,composition }: {
  children: ReactNode;
  composition: ProductWebComposition;
}) {
  return createElement(ProductWebCompositionContext.Provider,{ value: composition },children);
}

export function useProductWebComposition() {
  const composition = useContext(ProductWebCompositionContext);
  if (!composition) throw new Error('useProductWebComposition must be used within ProductWebCompositionProvider');
  return composition;
}

export function localizedProductText(text: LocalizedProductText,language: AppLanguage) {
  return text[language];
}

export function productRouteMap(composition: ProductWebComposition) {
  return new Map(composition.routes.map((route) => [route.page,route]));
}

/** Start loading a contributed route before navigation reaches its Suspense boundary. */
export function preloadProductRoute(
  composition: ProductWebComposition,
  page: Page,
  sectionId = '',
) {
  const route = composition.routes.find((candidate) => candidate.page === page);
  return route?.sectionRoutes?.[sectionId]?.preload?.() ?? route?.preload?.();
}

export function productPageSet(composition: ProductWebComposition) {
  return new Set(composition.routes.map((route) => route.page));
}

export function productPageLabel(composition: ProductWebComposition,page: Page,language: AppLanguage) {
  const item = [...composition.navigation.primary,...composition.navigation.operations]
    .find((candidate) => candidate.id === page);
  return item ? localizedProductText(item.label,language) : page;
}

export type ProductPermissionSurface = Page | 'maintenance';

/** Resolve static surface policy for a permission surface from the composition graph. */
export function resolveSurfacePolicy(
  composition: ProductWebComposition,
  surface: ProductPermissionSurface,
): ProductRouteSurfacePolicy | undefined {
  if (surface === 'maintenance') {
    const system = composition.routes.find((route) => route.page === 'system');
    return system?.sectionRoutes?.maintenance?.surface;
  }
  return composition.routes.find((route) => route.page === surface)?.surface;
}

/**
 * Merge typed owner contributions into a base composition.
 * Duplicate route pages, nav ids, section ids, or section defaults fail closed.
 */
export function assembleProductWebComposition(
  base: ProductWebComposition,
  ...owners: readonly ProductOwnerContribution[]
): ProductWebComposition {
  validateOwnerDependencyClosure(owners);

  let routes = [...base.routes];
  let primary = [...base.navigation.primary];
  let operations = [...base.navigation.operations];
  const sections: Partial<Record<Page,readonly ProductNavigationSection[]>> = {
    ...base.navigation.sections,
  };
  const sectionDefaults: Partial<Record<Page,string>> = { ...base.navigation.sectionDefaults };
  let settingsSections = [...base.settings.sections];

  const routePages = new Set(routes.map((route) => route.page));
  const primaryIds = new Set(primary.map((item) => item.id));
  const operationIds = new Set(operations.map((item) => item.id));
  const settingsIds = new Set(settingsSections.map((section) => section.id));

  for (const owner of owners) {
    for (const route of owner.routes ?? []) {
      if (routePages.has(route.page)) {
        throw new Error(`Duplicate product route contribution for page "${route.page}".`);
      }
      routePages.add(route.page);
      routes = [...routes,route];
    }

    for (const patch of owner.routeSections ?? []) {
      const index = routes.findIndex((candidate) => candidate.page === patch.page);
      if (index < 0) {
        throw new Error(`Product section route for page "${patch.page}" references missing parent route.`);
      }
      const parent = routes[index]!;
      const existingSectionRoutes = parent.sectionRoutes ?? {};
      if (Object.prototype.hasOwnProperty.call(existingSectionRoutes,patch.sectionId)) {
        throw new Error(
          `Duplicate product section route for page "${patch.page}" id "${patch.sectionId}".`,
        );
      }
      routes = [
        ...routes.slice(0,index),
        {
          ...parent,
          sectionRoutes: {
            ...existingSectionRoutes,
            [patch.sectionId]: patch.route,
          },
        },
        ...routes.slice(index + 1),
      ];
    }

    for (const item of owner.navigation?.primary ?? []) {
      if (primaryIds.has(item.id) || operationIds.has(item.id)) {
        throw new Error(`Duplicate product navigation contribution for id "${item.id}".`);
      }
      primaryIds.add(item.id);
      primary = [...primary,item];
    }

    for (const item of owner.navigation?.operations ?? []) {
      if (primaryIds.has(item.id) || operationIds.has(item.id)) {
        throw new Error(`Duplicate product navigation contribution for id "${item.id}".`);
      }
      operationIds.add(item.id);
      // Settings is the terminal ops-rail entry (final configuration). Owner
      // contributions insert before it so Audit/Containers/App Store never push it down.
      operations = insertOperationsBeforeSettings(operations, item);
    }

    for (const contribution of owner.navigation?.sections ?? []) {
      const existing = sections[contribution.page] ?? [];
      const existingIds = new Set(existing.map((section) => section.id));
      for (const item of contribution.items) {
        if (existingIds.has(item.id)) {
          throw new Error(`Duplicate product section contribution for page "${contribution.page}" id "${item.id}".`);
        }
        existingIds.add(item.id);
      }
      sections[contribution.page] = [...existing,...contribution.items];
    }

    for (const contribution of owner.navigation?.sectionDefaults ?? []) {
      if (sectionDefaults[contribution.page] !== undefined) {
        throw new Error(`Duplicate product section default for page "${contribution.page}".`);
      }
      if (!(sections[contribution.page] ?? []).some((section) => section.id === contribution.sectionId)) {
        throw new Error(
          `Product section default for page "${contribution.page}" references missing id "${contribution.sectionId}".`,
        );
      }
      sectionDefaults[contribution.page] = contribution.sectionId;
    }

    for (const section of owner.settings?.sections ?? []) {
      if (settingsIds.has(section.id)) {
        throw new Error(`Duplicate product settings contribution for id "${section.id}".`);
      }
      settingsIds.add(section.id);
      settingsSections = [...settingsSections,section];
    }
  }

  return {
    ...base,
    routes,
    navigation: {
      ...base.navigation,
      primary,
      operations,
      sections,
      sectionDefaults,
    },
    settings: { sections: settingsSections },
  };
}

/** Keep `settings` last when present; otherwise append. */
export function insertOperationsBeforeSettings(
  operations: readonly ProductNavigationItem[],
  item: ProductNavigationItem,
): ProductNavigationItem[] {
  if (item.id === 'settings') {
    const withoutSettings = operations.filter((entry) => entry.id !== 'settings');
    return [...withoutSettings, item];
  }
  const settingsIndex = operations.findIndex((entry) => entry.id === 'settings');
  if (settingsIndex < 0) return [...operations, item];
  return [
    ...operations.slice(0, settingsIndex),
    item,
    ...operations.slice(settingsIndex),
  ];
}

function validateOwnerDependencyClosure(owners: readonly ProductOwnerContribution[]) {
  const seenTokens = new Set<symbol>();
  const seenNames = new Set<string>();
  for (const owner of owners) {
    if (seenTokens.has(owner.owner.token) || seenNames.has(owner.owner.diagnosticName)) {
      throw new Error(`Duplicate product owner contribution for "${owner.owner.diagnosticName}".`);
    }
    seenTokens.add(owner.owner.token);
    seenNames.add(owner.owner.diagnosticName);
    for (const dependency of owner.requires ?? []) {
      if (!seenTokens.has(dependency.token)) {
        throw new Error(
          `Product owner "${owner.owner.diagnosticName}" requires earlier owner "${dependency.diagnosticName}".`,
        );
      }
    }
  }
}
