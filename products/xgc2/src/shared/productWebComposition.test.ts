import { lazy } from 'react';
import { Circle } from 'lucide-react';
import { describe,expect,it,vi } from 'vitest';
import {
  assembleProductWebComposition,
  createPreloadableProductRoute,
  defineProductOwnerIdentity,
  preloadProductRoute,
  type ProductOwnerContribution,
  type ProductRouteSurfacePolicy,
  type ProductWebComposition,
} from './productWebComposition';

const label = { 'en-US': 'Fixture','zh-CN': '测试' } as const;
const surface: ProductRouteSurfacePolicy = {
  productFeatures: ['fixture'],
  targetAction: 'fixture access',
  targetCapabilities: ['fixture.read'],
  remoteVisibility: 'control-plane',
  remoteManagedHostAdmission: () => false,
};
const FixtureRoute = () => null;
const FixtureSettings = lazy(async () => ({ default: () => null }));

function baseComposition(): ProductWebComposition {
  return {
    id: 'assembler-fixture',
    agentLinkComputeTargets: false,
    routes: [{ page: 'settings',component: FixtureRoute,surface }],
    navigation: {
      defaultPage: 'settings',
      primary: [{ id: 'settings',label,icon: Circle }],
      operations: [],
      sections: {
        settings: [{ id: 'general',label,icon: Circle }],
      },
      sectionDefaults: { settings: 'general' },
    },
    settings: { sections: [{ id: 'general',component: FixtureSettings }] },
    developer: {},
  };
}

describe('assembleProductWebComposition', () => {
  it('deduplicates preload work and renders the resolved component without another suspension', async () => {
    const loader = vi.fn(async () => ({ default: FixtureRoute }));
    const route = createPreloadableProductRoute(loader);

    const first = route.preload();
    const second = route.preload();
    expect(second).toBe(first);
    expect(loader).not.toHaveBeenCalled();
    await first;

    const renderResolved = route.component as unknown as (
      props: Record<string,never>,
    ) => { type: unknown };
    const element = renderResolved({});
    expect(element.type).toBe(FixtureRoute);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('retries a failed preload before exposing the route failure', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new DOMException('aborted','AbortError'))
      .mockResolvedValueOnce({ default: FixtureRoute });
    const route = createPreloadableProductRoute(loader);

    await route.preload();

    const renderResolved = route.component as unknown as (
      props: Record<string,never>,
    ) => { type: unknown };
    expect(renderResolved({}).type).toBe(FixtureRoute);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('prefers a section preloader and falls back to the parent page preloader', async () => {
    const pagePreload = vi.fn(async () => undefined);
    const sectionPreload = vi.fn(async () => undefined);
    const composition = baseComposition();
    composition.routes = [{
      ...composition.routes[0]!,
      preload: pagePreload,
      sectionRoutes: {
        advanced: { component: FixtureRoute,preload: sectionPreload },
      },
    }];

    await preloadProductRoute(composition,'settings','advanced');
    await preloadProductRoute(composition,'settings','general');

    expect(sectionPreload).toHaveBeenCalledTimes(1);
    expect(pagePreload).toHaveBeenCalledTimes(1);
  });

  it('merges typed contributions without mutating the base composition', () => {
    const base = baseComposition();
    const owner = contribution({
      routes: [{ page: 'audit',component: FixtureRoute,surface }],
      navigation: {
        operations: [{ id: 'audit',label,icon: Circle }],
        sections: [{
          page: 'audit',
          items: [{ id: 'activity',label,icon: Circle }],
        }],
        sectionDefaults: [{ page: 'audit',sectionId: 'activity' }],
      },
    });

    const assembled = assembleProductWebComposition(base,owner);

    expect(assembled.routes.map((route) => route.page)).toEqual(['settings','audit']);
    expect(assembled.navigation.operations.map((item) => item.id)).toEqual(['audit']);
    expect(assembled.navigation.sections.audit?.map((section) => section.id)).toEqual(['activity']);
    expect(assembled.navigation.sectionDefaults.audit).toBe('activity');
    expect(base.routes.map((route) => route.page)).toEqual(['settings']);
    expect(base.navigation.sections.audit).toBeUndefined();
  });

  it('inserts owner operations before Settings so Settings stays last', () => {
    const base = baseComposition();
    base.navigation.operations = [
      { id: 'system',label,icon: Circle },
      { id: 'settings',label,icon: Circle },
    ];
    const owner = contribution({
      routes: [{ page: 'audit',component: FixtureRoute,surface }],
      navigation: {
        operations: [{ id: 'audit',label,icon: Circle }],
      },
    });

    const assembled = assembleProductWebComposition(base,owner);
    expect(assembled.navigation.operations.map((item) => item.id))
      .toEqual(['system','audit','settings']);
  });

  it('rejects duplicate routes and navigation ids deterministically', () => {
    const duplicateRoute = contribution({
      routes: [{ page: 'settings',component: FixtureRoute,surface }],
    });
    const duplicateNavigation = contribution({
      navigation: {
        operations: [{ id: 'settings',label,icon: Circle }],
      },
    });

    expect(() => assembleProductWebComposition(baseComposition(),duplicateRoute))
      .toThrow('Duplicate product route contribution for page "settings".');
    expect(() => assembleProductWebComposition(baseComposition(),duplicateNavigation))
      .toThrow('Duplicate product navigation contribution for id "settings".');
  });

  it('rejects duplicate section ids and defaults deterministically', () => {
    const duplicateSection = contribution({
      navigation: {
        sections: [{
          page: 'settings',
          items: [{ id: 'general',label,icon: Circle }],
        }],
      },
    });
    const duplicateDefault = contribution({
      navigation: {
        sectionDefaults: [{ page: 'settings',sectionId: 'general' }],
      },
    });

    expect(() => assembleProductWebComposition(baseComposition(),duplicateSection))
      .toThrow('Duplicate product section contribution for page "settings" id "general".');
    expect(() => assembleProductWebComposition(baseComposition(),duplicateDefault))
      .toThrow('Duplicate product section default for page "settings".');
  });

  it('rejects missing defaults and duplicate settings adapters fail closed', () => {
    const missingDefault = contribution({
      navigation: {
        sectionDefaults: [{ page: 'audit',sectionId: 'missing' }],
      },
    });
    const duplicateSettings = contribution({
      settings: { sections: [{ id: 'general',component: FixtureSettings }] },
    });

    expect(() => assembleProductWebComposition(baseComposition(),missingDefault))
      .toThrow('Product section default for page "audit" references missing id "missing".');
    expect(() => assembleProductWebComposition(baseComposition(),duplicateSettings))
      .toThrow('Duplicate product settings contribution for id "general".');
  });

  it('preflights owner dependencies before merging any route, navigation, or settings', () => {
    const base = baseComposition();
    const required = defineProductOwnerIdentity('required-owner');
    const dependent: ProductOwnerContribution = {
      owner: defineProductOwnerIdentity('dependent-owner'),
      requires: [required],
      routes: [{ page: 'audit',component: FixtureRoute,surface }],
      navigation: { operations: [{ id: 'audit',label,icon: Circle }] },
      settings: { sections: [{ id: 'dependent',component: FixtureSettings }] },
    };

    expect(() => assembleProductWebComposition(base,dependent))
      .toThrow('Product owner "dependent-owner" requires earlier owner "required-owner".');
    expect(base.routes.map((route) => route.page)).toEqual(['settings']);
    expect(base.navigation.operations).toEqual([]);
    expect(base.settings.sections.map((section) => section.id)).toEqual(['general']);
  });

  it('requires dependencies to precede dependents in the frozen product order', () => {
    const required = defineProductOwnerIdentity('required-owner');
    const dependent: ProductOwnerContribution = {
      owner: defineProductOwnerIdentity('dependent-owner'),
      requires: [required],
    };

    expect(() => assembleProductWebComposition(
      baseComposition(),
      dependent,
      { owner: required },
    )).toThrow('Product owner "dependent-owner" requires earlier owner "required-owner".');

    expect(() => assembleProductWebComposition(
      baseComposition(),
      { owner: required },
      dependent,
    )).not.toThrow();
  });

  it('rejects duplicate owner identities and duplicate diagnostic names during preflight', () => {
    const ownerIdentity = defineProductOwnerIdentity('duplicate-owner');
    const first: ProductOwnerContribution = { owner: ownerIdentity };

    expect(() => assembleProductWebComposition(baseComposition(),first,{ owner: ownerIdentity }))
      .toThrow('Duplicate product owner contribution for "duplicate-owner".');
    expect(() => assembleProductWebComposition(
      baseComposition(),
      first,
      { owner: defineProductOwnerIdentity('duplicate-owner') },
    )).toThrow('Duplicate product owner contribution for "duplicate-owner".');
  });

  it('merges section routes onto existing pages and rejects missing parent or duplicates', () => {
    const withAudit: ProductOwnerContribution = {
      owner: defineProductOwnerIdentity('audit-owner'),
      routes: [{ page: 'audit',component: FixtureRoute,surface }],
    };
    const taskSection: ProductOwnerContribution = {
      owner: defineProductOwnerIdentity('task-section-owner'),
      routeSections: [{
        page: 'audit',
        sectionId: 'task',
        route: { component: FixtureRoute,surface },
      }],
    };
    const assembled = assembleProductWebComposition(baseComposition(),withAudit,taskSection);
    const audit = assembled.routes.find((route) => route.page === 'audit');
    expect(audit?.sectionRoutes?.task?.component).toBe(FixtureRoute);

    expect(() => assembleProductWebComposition(baseComposition(),taskSection))
      .toThrow('Product section route for page "audit" references missing parent route.');
    expect(() => assembleProductWebComposition(baseComposition(),withAudit,taskSection,{
      owner: defineProductOwnerIdentity('duplicate-task-section'),
      routeSections: [{
        page: 'audit',
        sectionId: 'task',
        route: { component: FixtureRoute,surface },
      }],
    })).toThrow('Duplicate product section route for page "audit" id "task".');
  });
});

function contribution(
  value: Omit<ProductOwnerContribution,'owner'>,
): ProductOwnerContribution {
  return {
    owner: defineProductOwnerIdentity('fixture-owner'),
    ...value,
  };
}
