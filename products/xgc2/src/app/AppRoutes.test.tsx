// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { useState,type ReactElement } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../profiles/core-dev';
import { productWebComposition as dockerAppStoreComposition } from '../../test-fixtures/core-with-docker-appstore';
import type { AgentEffective,ManagedHost } from '../domains/managedHost/managedHostPublic';
import type * as ManagedHostPublicModule from '../domains/managedHost/managedHostPublic';
import { agentEffectiveFixture,managedHostFixture } from '../test/managedHostTestFixture';
import {
  createPreloadableProductRoute,
  ProductWebCompositionProvider,
} from '../shared/productWebComposition';
import { useDeferRouteReady } from '../shared/routeReady';
import { AppRoutes } from './AppRoutes';

const routeState = vi.hoisted(() => ({
  disabledReason: '',
  managedHostRegistryStatus: 'ready' as 'loading' | 'ready' | 'error',
  managedHostRegistryError: '',
  pageSections: { system: 'overview' } as Record<string,string>,
  managedHostId: 'local',
  managedHosts: [] as ManagedHost[],
  page: 'experiment',
  language: 'en-US' as const,
  requestedPermissionPage: vi.fn(),
  routeRenders: { operations: 0,experiment: 0 },
}));

vi.mock('./navigationContext', () => ({
  useNavigation: (select?: (state: never) => unknown) => {
    const navigationState = ({
    managedHostId: routeState.managedHostId,
    page: routeState.page,
    language: routeState.language,
    pageSection: (page: string) => routeState.pageSections[page] ?? '',
  });
    return select ? select(navigationState as never) : navigationState;
  },
}));

vi.mock('../domains/managedHost/managedHostPublic', async (importOriginal) => {
  const actual = await importOriginal<typeof ManagedHostPublicModule>();
  return {
    ...actual,
    useManagedHosts: () => routeState.managedHosts,
    useManagedHostRegistryStatus: () => routeState.managedHostRegistryStatus,
    useManagedHostRegistryError: () => routeState.managedHostRegistryError,
  };
});

vi.mock('./useTargetCore', () => ({
  useTargetCore: (page: string) => {
    routeState.requestedPermissionPage(page);
    return { disabledReason: routeState.disabledReason };
  },
}));

vi.mock('../domains/experiment/ExperimentRoute', () => ({
  ExperimentRoute: () => {
    routeState.routeRenders.experiment += 1;
    return <div data-testid="experiment-route">Experiment route</div>;
  },
}));

vi.mock('../domains/toolbox/ToolboxRoute', () => ({
  ToolboxRoute: () => <div data-testid="maintenance-route">Maintenance route</div>,
}));

vi.mock('../domains/host/HostRoute', () => ({
  HostRoute: () => <div data-testid="system-route">System route</div>,
}));

vi.mock('../domains/execution/OperationsRoute', () => ({
  OperationsRoute: () => {
    routeState.routeRenders.operations += 1;
    return <div data-testid="operations-route">Operations route</div>;
  },
}));

vi.mock('../domains/audit/tasklogs/TaskLogsRoute', () => ({
  TaskLogsRoute: () => <div data-testid="task-logs-route">Task logs route</div>,
}));

vi.mock('../domains/appstore/AppStoreRoute', () => ({
  AppStoreRoute: () => <div data-testid="app-store-route">App Store route</div>,
}));

vi.mock('../domains/container/ContainerRoute', () => ({
  ContainerRoute: () => <div data-testid="containers-route">Containers route</div>,
}));

describe('AppRoutes', () => {
  beforeEach(() => {
    routeState.disabledReason = '';
    routeState.managedHostRegistryStatus = 'ready';
    routeState.managedHostRegistryError = '';
    routeState.pageSections = { system: 'overview' };
    routeState.managedHostId = 'local';
    routeState.managedHosts = [];
    routeState.page = 'experiment';
    routeState.language = 'en-US';
    routeState.requestedPermissionPage.mockClear();
    routeState.routeRenders = { operations: 0,experiment: 0 };
    document.querySelector('[data-xgc-role="product-web-bootstrap-status"]')?.remove();
  });

  it('does not paint a local Loading page theater while a lazy destination chunk loads', async () => {
    let resolveRoute!: (value:{ default:() => ReactElement }) => void;
    const pending = createPreloadableProductRoute(() => new Promise((resolve) => {
      resolveRoute = resolve;
    }));
    const composition = {
      ...productWebComposition,
      routes: productWebComposition.routes.map((route) => (
        route.page === 'experiment'
          ? { ...route,component: pending.component,preload: pending.preload }
          : route
      )),
    };
    routeState.page = 'experiment';
    renderRoutes(composition);

    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading workspace' }))
      .toHaveAttribute('data-xgc-role', 'workspace-busy-overlay');
    expect(screen.queryByTestId('experiment-route')).not.toBeInTheDocument();
    await waitFor(() => expect(resolveRoute).toBeTypeOf('function'));
    resolveRoute({ default: () => <div data-testid="experiment-route">Experiment route</div> });
    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
  });

  it('retries an aborted lazy route and keeps unrecoverable failures visible', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new DOMException('aborted','AbortError'))
      .mockResolvedValueOnce({ default: () => <div data-testid="experiment-route">Experiment route</div> });
    const retryable = createPreloadableProductRoute(loader);
    routeState.page = 'experiment';
    const composition = {
      ...productWebComposition,
      routes: productWebComposition.routes.map((route) => (
        route.page === 'experiment'
          ? { ...route,component: retryable.component,preload: retryable.preload }
          : route
      )),
    };

    renderRoutes(composition);

    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);

    const failedLoader = vi.fn().mockRejectedValue(new Error('module unavailable'));
    const failed = createPreloadableProductRoute(failedLoader);
    const failedComposition = {
      ...composition,
      routes: composition.routes.map((route) => (
        route.page === 'experiment' ? { ...route,component: failed.component,preload: failed.preload } : route
      )),
    };
    renderRoutes(failedComposition);

    expect(await screen.findByRole('alert')).toHaveTextContent('This page could not load.');
    expect(screen.getByRole('button',{ name:'Retry' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{ name:'Retry' }));
    await waitFor(() => expect(failedLoader).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('This page could not load.');
  });

  it('renders a direct route component without requiring a Suspense fallback', async () => {
    const composition = {
      ...productWebComposition,
      routes: productWebComposition.routes.map((route) => (
        route.page === 'experiment'
          ? { ...route,component: DirectExperimentRoute }
          : route
      )),
    };
    routeState.page = 'experiment';
    renderRoutes(composition);

    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading workspace' })).not.toBeInTheDocument();
  });

  it('keeps the Experiment workspace parked after the first visit', async () => {
    routeState.page = 'experiment';
    const view = renderRoutes();
    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();

    routeState.page = 'operations';
    view.rerender(
      <ProductWebCompositionProvider composition={productWebComposition}>
        <AppRoutes />
      </ProductWebCompositionProvider>,
    );

    expect(await screen.findByTestId('operations-route')).toBeInTheDocument();
    expect(screen.getByTestId('experiment-route')).toBeInTheDocument();
    const parked = screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]');
    expect(parked).toHaveAttribute('hidden');
    expect(parked).not.toHaveClass('xgc-workspace-full-span');
  });

  it('keeps Operations parked while Experiment is the visible workspace', async () => {
    routeState.page = 'operations';
    const view = renderRoutes();
    expect(await screen.findByTestId('operations-route')).toBeInTheDocument();

    routeState.page = 'experiment';
    view.rerender(
      <ProductWebCompositionProvider composition={productWebComposition}>
        <AppRoutes />
      </ProductWebCompositionProvider>,
    );

    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
    expect(screen.getByTestId('operations-route')).toBeInTheDocument();
    expect(screen.getByTestId('operations-route').closest('[data-xgc-role="product-route-surface"]')).toHaveAttribute('hidden');
    expect(screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]'))
      .toHaveAttribute('data-xgc-route-revealed', 'true');
  });

  it('does not re-render parked pages for navigation that leaves them unchanged', async () => {
    routeState.page = 'experiment';
    const view = renderRoutes();
    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
    routeState.page = 'operations';
    const rerender = () => view.rerender(
      <ProductWebCompositionProvider composition={productWebComposition}>
        <AppRoutes />
      </ProductWebCompositionProvider>,
    );
    rerender();
    expect(await screen.findByTestId('operations-route')).toBeInTheDocument();
    const before = { ...routeState.routeRenders };

    // Another page's section changes: neither visited page is affected.
    routeState.pageSections = { system: 'files' };
    rerender();
    // Switching pages flips visibility; the pages' own content is unchanged.
    routeState.page = 'experiment';
    rerender();

    expect(screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]'))
      .toHaveAttribute('data-xgc-route-revealed', 'true');
    expect(routeState.routeRenders).toEqual(before);
  });

  it('switches immediately and covers the destination until it is ready', async () => {
    const composition = {
      ...productWebComposition,
      routes: productWebComposition.routes.map((route) => (
        route.page === 'experiment' ? { ...route,component: DeferredExperimentRoute } : route
      )),
    };
    routeState.page = 'operations';
    const view = renderRoutes(composition);
    expect(await screen.findByTestId('operations-route')).toBeInTheDocument();

    routeState.page = 'experiment';
    view.rerender(
      <ProductWebCompositionProvider composition={composition}>
        <AppRoutes />
      </ProductWebCompositionProvider>,
    );

    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
    expect(screen.getByTestId('operations-route').closest('[data-xgc-role="product-route-surface"]'))
      .toHaveAttribute('hidden');
    expect(screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]'))
      .toHaveAttribute('hidden');
    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading workspace' }))
      .toHaveAttribute('data-xgc-role', 'workspace-busy-overlay');

    fireEvent.click(screen.getByTestId('finish-experiment'));
    await waitFor(() => {
      expect(screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]'))
        .toHaveAttribute('data-xgc-route-revealed', 'true');
    });
    expect(screen.getByTestId('operations-route').closest('[data-xgc-role="product-route-surface"]')).toHaveAttribute('hidden');
    expect(screen.queryByRole('status', { name: 'Loading workspace' })).not.toBeInTheDocument();
  });

  it('keeps full-page bootstrap until the landing page is ready and does not stack a workspace overlay', async () => {
    const composition = {
      ...productWebComposition,
      routes: productWebComposition.routes.map((route) => (
        route.page === 'experiment' ? { ...route,component: DeferredExperimentRoute } : route
      )),
    };
    const bootstrap = document.createElement('div');
    bootstrap.dataset.xgcRole = 'product-web-bootstrap-status';
    bootstrap.setAttribute('role', 'status');
    bootstrap.setAttribute('aria-label', 'Loading workspace');
    document.body.append(bootstrap);
    routeState.page = 'experiment';
    renderRoutes(composition);

    expect(document.querySelector('[data-xgc-role="product-web-bootstrap-status"]')).not.toBeNull();
    expect(document.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    expect(screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]'))
      .toHaveAttribute('hidden');

    fireEvent.click(screen.getByTestId('finish-experiment'));
    await waitFor(() => {
      expect(screen.getByTestId('experiment-route').closest('[data-xgc-role="experiment-route-surface"]'))
        .toHaveAttribute('data-xgc-route-revealed', 'true');
    });
    expect(document.querySelector('[data-xgc-role="product-web-bootstrap-status"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
  });

  it('normalizes a page absent from the generated composition to its default route', async () => {
    routeState.page = 'appStore';

    renderRoutes();

    expect(await screen.findByTestId('experiment-route')).toBeInTheDocument();
    expect(screen.queryByText(/profile does not enable product\.app-store/)).not.toBeInTheDocument();
    expect(routeState.requestedPermissionPage).toHaveBeenCalledWith('experiment');
  });

  it('guards System Maintenance with the maintenance profile surface', async () => {
    routeState.page = 'system';
    routeState.pageSections.system = 'maintenance';

    renderRoutes();

    expect(await screen.findByTestId('maintenance-route')).toBeInTheDocument();
    expect(routeState.requestedPermissionPage).toHaveBeenCalledWith('maintenance');
  });

  it('renders the contributed Task logs route instead of the generic audit category route', async () => {
    routeState.page = 'audit';
    routeState.pageSections.audit = 'task';

    renderRoutes();

    expect(await screen.findByTestId('task-logs-route')).toBeInTheDocument();
    expect(routeState.requestedPermissionPage).toHaveBeenCalledWith('audit');
  });

  it('waits for the first registry snapshot before classifying a remote target', () => {
    routeState.page = 'operations';
    routeState.managedHostId = 'agent-a';
    routeState.managedHostRegistryStatus = 'loading';

    renderRoutes();

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument();
    expect(screen.queryByText(/no longer registered/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('operations-route')).not.toBeInTheDocument();
    expect(routeState.requestedPermissionPage).not.toHaveBeenCalled();
  });

  it('fails closed with a recoverable registry error instead of loading forever', () => {
    routeState.page = 'operations';
    routeState.managedHostId = 'agent-a';
    routeState.managedHostRegistryStatus = 'error';
    routeState.managedHostRegistryError = '503 Service Unavailable';

    renderRoutes();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/Agent registry is unavailable/)).toHaveTextContent('503 Service Unavailable');
    expect(screen.queryByTestId('operations-route')).not.toBeInTheDocument();
  });

  it('blocks a direct Agent Experiment route even when unrelated profile leaves are enabled', () => {
    routeState.page = 'experiment';
    routeState.managedHostId = 'agent-a';
    routeState.managedHosts = [managedHostFixture({ effectiveProfile: agentEffectiveFixture(true) })];

    renderRoutes();

    expect(screen.getByText('Agent A profile does not enable the experiment page.')).toBeInTheDocument();
    expect(screen.queryByTestId('experiment-route')).not.toBeInTheDocument();
  });

  it('blocks direct Agent Maintenance when the System surface lacks its exact leaf', () => {
    const profile = agentEffectiveFixture(false);
    profile.Surfaces.System = true;
    profile.System.Files = true;
    routeState.page = 'system';
    routeState.pageSections.system = 'maintenance';
    routeState.managedHostId = 'agent-a';
    routeState.managedHosts = [managedHostFixture({ effectiveProfile: profile })];

    renderRoutes();

    expect(screen.getByText('Agent A profile does not enable the maintenance System tab.')).toBeInTheDocument();
    expect(screen.queryByTestId('maintenance-route')).not.toBeInTheDocument();
  });

  it('renders a compiled remote page only when its Surface and System tab are enabled', async () => {
    const profile = agentEffectiveFixture(false);
    profile.Surfaces.System = true;
    profile.System.Files = true;
    routeState.page = 'system';
    routeState.pageSections.system = 'files';
    routeState.managedHostId = 'agent-a';
    routeState.managedHosts = [managedHostFixture({ effectiveProfile: profile })];

    renderRoutes();

    expect(await screen.findByTestId('system-route')).toBeInTheDocument();
  });

  it('executes AppStore leaf admission and never admits the Core-only Docker leaf', () => {
    const profile = agentEffectiveFixture(false);
    profile.Surfaces.AppStore = true;
    profile.Surfaces.Containers = true;
    routeState.managedHostId = 'agent-a';
    routeState.managedHosts = [managedHostFixture({ effectiveProfile: profile })];

    routeState.page = 'appStore';
    const appStore = renderRoutes(dockerAppStoreComposition);
    expect(screen.getByTestId('app-store-route')).toBeInTheDocument();
    appStore.unmount();

    routeState.page = 'containers';
    renderRoutes(dockerAppStoreComposition);
    expect(screen.getByText('Agent A profile does not enable the containers page.')).toBeInTheDocument();
    expect(screen.queryByTestId('containers-route')).not.toBeInTheDocument();
  });

  it.each([
    ['missing', () => []],
    ['offline', (profile: AgentEffective) => [managedHostFixture({ connectivity: 'offline',effectiveProfile: profile })]],
    ['known sparse', () => [managedHostFixture({ enrollment: 'known',effectiveProfile: null })]],
    ['nil profile', () => [managedHostFixture({ effectiveProfile: null })]],
    ['malformed profile', () => [managedHostFixture({
      effectiveProfile: { Surfaces: { Operations: true },System: {} } as AgentEffective,
    })]],
    ['management unavailable', (profile: AgentEffective) => [managedHostFixture({
      managementConnection: 'unavailable',
      effectiveProfile: profile,
    })]],
  ])('fails closed without mounting a remote Operations route for %s', (_case,buildHosts) => {
    const profile = agentEffectiveFixture(false);
    profile.Surfaces.Operations = true;
    routeState.page = 'operations';
    routeState.managedHostId = 'agent-a';
    routeState.managedHosts = buildHosts(profile);

    renderRoutes();

    expect(screen.queryByTestId('operations-route')).not.toBeInTheDocument();
    expect(screen.getByText(/Agent|agent/i)).toBeInTheDocument();
    expect(routeState.requestedPermissionPage).not.toHaveBeenCalled();
  });
});

function renderRoutes(composition = productWebComposition) {
  return render(
    <ProductWebCompositionProvider composition={composition}>
      <AppRoutes />
    </ProductWebCompositionProvider>,
  );
}

function DirectExperimentRoute() {
  return <div data-testid="experiment-route">Experiment route</div>;
}

function DeferredExperimentRoute() {
  const [ready,setReady] = useState(false);
  useDeferRouteReady(!ready);
  return (
    <div>
      <div data-testid="experiment-route">{ready ? 'ready' : 'pending'}</div>
      <button type="button" data-testid="finish-experiment" onClick={() => setReady(true)}>finish</button>
    </div>
  );
}
