// @vitest-environment jsdom

import { act,render,screen,waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../profiles/core-dev';
import {
  ProductWebCompositionProvider,
  type ProductWebComposition,
} from '../shared/productWebComposition';
import { useNavigation } from './navigationContext';
import { NavigationProvider } from './navigationStore';

function renderWithComposition(
  ui: ReactElement,
  composition: ProductWebComposition = productWebComposition,
) {
  return render(
    <ProductWebCompositionProvider composition={composition}>
      {ui}
    </ProductWebCompositionProvider>,
  );
}

describe('NavigationProvider', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    document.documentElement.lang = '';
    delete document.documentElement.dataset.skin;
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('persists the UI language and updates the document language', () => {
    renderWithComposition(
      <NavigationProvider>
        <LanguageProbe />
      </NavigationProvider>,
    );

    act(() => screen.getByTestId('set-zh').click());

    expect(screen.getByTestId('language')).toHaveTextContent('zh-CN');
    expect(window.localStorage.getItem('xgc-language')).toBe('"zh-CN"');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('restores the canonical persisted language value', () => {
    window.localStorage.setItem('xgc-language', JSON.stringify('zh-CN'));

    renderWithComposition(
      <NavigationProvider>
        <LanguageProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('language')).toHaveTextContent('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it.each(['toolbox','unknownPage'])(
    'rejects retired xgc.nav.page value %s instead of keeping a compatibility migration',
    async (retiredPage) => {
      window.localStorage.setItem('xgc.nav.page', JSON.stringify(retiredPage));

      renderWithComposition(
        <NavigationProvider>
          <SystemSectionProbe />
        </NavigationProvider>,
      );

      expect(screen.getByTestId('page')).toHaveTextContent('home');
      expect(screen.getByTestId('host-tab')).toHaveTextContent('overview');
      await waitFor(() => expect(window.localStorage.getItem('xgc.nav.page')).toBe('"home"'));
      expect(window.localStorage.getItem('xgc.nav.hostTab')).toBeNull();
      expect(window.localStorage.getItem('xgc.nav.section.system')).toBe('"overview"');
    },
  );

  it('restores and persists composition-driven section state for any contributed page', async () => {
    const template = productWebComposition.navigation.sections.system?.[0];
    if (!template) throw new Error('test composition requires a section template');
    const composition: ProductWebComposition = {
      ...productWebComposition,
      navigation: {
        ...productWebComposition.navigation,
        sections: {
          ...productWebComposition.navigation.sections,
          settings: [
            { ...template,id: 'primary' },
            { ...template,id: 'secondary' },
          ],
        },
        sectionDefaults: {
          ...productWebComposition.navigation.sectionDefaults,
          settings: 'primary',
        },
      },
    };
    window.localStorage.setItem('xgc.nav.page', JSON.stringify('settings'));
    window.localStorage.setItem('xgc.nav.section.settings', JSON.stringify('secondary'));

    renderWithComposition(
      <NavigationProvider>
        <GenericSectionProbe />
      </NavigationProvider>,
      composition,
    );

    expect(screen.getByTestId('page')).toHaveTextContent('settings');
    expect(screen.getByTestId('page-section')).toHaveTextContent('secondary');
    act(() => screen.getByTestId('set-primary-section').click());
    expect(screen.getByTestId('page-section')).toHaveTextContent('primary');
    await waitFor(() => expect(window.localStorage.getItem('xgc.nav.section.settings')).toBe('"primary"'));
  });

  it('restores and persists the collapsed navigation sidebar preference', async () => {
    window.localStorage.setItem('xgc.nav.sidebarCollapsed', JSON.stringify(true));

    const { unmount } = renderWithComposition(
      <NavigationProvider>
        <SidebarProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('collapsed');
    act(() => screen.getByTestId('toggle-sidebar').click());
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');
    await waitFor(() => expect(window.localStorage.getItem('xgc.nav.sidebarCollapsed')).toBe('false'));

    unmount();
    renderWithComposition(
      <NavigationProvider>
        <SidebarProbe />
      </NavigationProvider>,
    );
    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');
  });

  it('ignores a malformed persisted sidebar preference', () => {
    window.localStorage.setItem('xgc.nav.sidebarCollapsed', JSON.stringify('collapsed'));

    renderWithComposition(
      <NavigationProvider>
        <SidebarProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('sidebar-state')).toHaveTextContent('expanded');
  });

  it('uses light as the default fallback without mutating an invalid stored preference', () => {
    window.localStorage.setItem('xgc.skin', 'xgc');

    renderWithComposition(
      <NavigationProvider>
        <SkinProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('skin')).toHaveTextContent('light');
    expect(document.documentElement.dataset.skin).toBe('light');
    expect(window.localStorage.getItem('xgc.skin')).toBe('xgc');
  });

  it('defaults language to English on first run', () => {
    renderWithComposition(
      <NavigationProvider>
        <LanguageProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('language')).toHaveTextContent('en-US');
    expect(document.documentElement.lang).toBe('en');
  });

  it('restores and switches the light theme at the document root', () => {
    window.localStorage.setItem('xgc.skin', 'light');

    renderWithComposition(
      <NavigationProvider>
        <SkinProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('skin')).toHaveTextContent('light');
    expect(document.documentElement.dataset.skin).toBe('light');
    act(() => screen.getByTestId('set-dark').click());
    expect(document.documentElement.dataset.skin).toBe('dark');
  });

  it('restores a direct automation workflow location before paint and clears it when leaving Automations', () => {
    window.localStorage.setItem('xgc.nav.page', JSON.stringify('experiment'));
    window.location.hash = '#/automations/local/workflows/central-sim';

    renderWithComposition(
      <NavigationProvider>
        <PageNavigationProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('page')).toHaveTextContent('automations');
    act(() => screen.getByTestId('leave-automations').click());
    expect(screen.getByTestId('page')).toHaveTextContent('experiment');
    expect(window.location.hash).toBe('');
  });

  it('commits repeated page navigation immediately without waiting for document view transitions', () => {
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true,value: startViewTransition });

    renderWithComposition(
      <NavigationProvider>
        <PageNavigationProbe />
      </NavigationProvider>,
    );

    act(() => screen.getByTestId('leave-automations').click());
    act(() => screen.getByTestId('go-robot-assets').click());

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(screen.getByTestId('page')).toHaveTextContent('robotAssets');
  });

  it('commits the destination page immediately', () => {
    renderWithComposition(
      <NavigationProvider>
        <PageNavigationProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('page')).toHaveTextContent('home');
    act(() => screen.getByTestId('go-robot-assets').click());
    expect(screen.getByTestId('page')).toHaveTextContent('robotAssets');
  });

  it('commits a configuration hash change immediately', () => {
    renderWithComposition(
      <NavigationProvider>
        <PageProbe />
      </NavigationProvider>,
    );

    act(() => {
      window.location.hash = '#/experiments';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('page')).toHaveTextContent('experiment');
  });

  it('restores the target encoded in an automation deep link', () => {
    window.localStorage.setItem('xgc.nav.targetCoreId', JSON.stringify('stale-remote-core'));
    window.location.hash = '#/automations/agent%2Ffield/workflows/central-sim';

    renderWithComposition(
      <NavigationProvider>
        <TargetProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('managed-host')).toHaveTextContent('agent/field');
    expect(screen.getByTestId('target-core')).toBeEmptyDOMElement();
    expect(screen.getByTestId('page')).toHaveTextContent('automations');
  });

  it('rejects persisted and deep-linked Agents when AgentLink.ComputeTargets is disabled', async () => {
    window.localStorage.setItem('xgc.nav.managedHostId', JSON.stringify('agent-a'));
    window.location.hash = '#/automations/agent-a/workflows/mission-a';

    renderWithComposition(
      <NavigationProvider>
        <TargetProbe />
      </NavigationProvider>,
      { ...productWebComposition,agentLinkComputeTargets: false },
    );

    expect(screen.getByTestId('managed-host')).toHaveTextContent('local');
    expect(screen.getByTestId('target-core')).toBeEmptyDOMElement();
    expect(screen.getByTestId('page')).toHaveTextContent('automations');
    expect(window.location.hash).toBe('#/automations/local/workflows/mission-a');
    await waitFor(() => expect(window.localStorage.getItem('xgc.nav.managedHostId')).toBe('"local"'));
  });

  it('restores an experiment detail location before paint and clears it when leaving Experiments', () => {
    window.localStorage.setItem('xgc.nav.page', JSON.stringify('home'));
    window.location.hash = '#/experiments/experiment%2Ffield';

    renderWithComposition(
      <NavigationProvider>
        <PageNavigationProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('page')).toHaveTextContent('experiment');
    act(() => screen.getByTestId('go-robot-assets').click());
    expect(screen.getByTestId('page')).toHaveTextContent('robotAssets');
    expect(window.location.hash).toBe('');
  });

  it.each([
    ['#/assets/robots/robot-a', 'robotAssets'],
  ])('restores asset detail location %s into its own page', (hash, page) => {
    window.localStorage.setItem('xgc.nav.page', JSON.stringify('home'));
    window.location.hash = hash;

    renderWithComposition(
      <NavigationProvider>
        <PageProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('page')).toHaveTextContent(page);
  });

  it('clears an unknown asset location through the generic invalid-assets path', () => {
    window.location.hash = '#/assets/unknown/asset-a';

    renderWithComposition(
      <NavigationProvider>
        <PageProbe />
      </NavigationProvider>,
    );

    expect(screen.getByTestId('page')).toHaveTextContent('home');
    expect(window.location.hash).toBe('');
  });

  it('persists the shared Experiment GCS preference across pages and remounts', () => {
    const first = renderWithComposition(
      <NavigationProvider>
        <GcsModeProbe />
      </NavigationProvider>,
    );

    act(() => screen.getByTestId('go-experiment').click());
    act(() => screen.getByTestId('enable-gcs').click());
    expect(screen.getByTestId('page')).toHaveTextContent('experiment');
    expect(screen.getByTestId('gcs-mode')).toHaveTextContent('on');

    act(() => screen.getByTestId('go-robot-assets').click());
    expect(screen.getByTestId('page')).toHaveTextContent('robotAssets');
    expect(screen.getByTestId('gcs-mode')).toHaveTextContent('on');
    expect(window.localStorage.getItem('xgc.nav.experimentGcsMode')).toBe('true');
    first.unmount();

    renderWithComposition(
      <NavigationProvider>
        <GcsModeProbe />
      </NavigationProvider>,
    );
    expect(screen.getByTestId('gcs-mode')).toHaveTextContent('on');
  });

  it('keeps one GCS preference across dashboard navigation and browser tabs', () => {
    renderWithComposition(
      <NavigationProvider>
        <GcsModeProbe />
      </NavigationProvider>,
    );

    act(() => screen.getByTestId('go-experiment').click());
    act(() => screen.getByTestId('enable-gcs').click());
    act(() => screen.getByTestId('go-robot-assets').click());
    expect(screen.getByTestId('page')).toHaveTextContent('robotAssets');
    expect(screen.getByTestId('gcs-mode')).toHaveTextContent('on');

    act(() => screen.getByTestId('go-experiment').click());
    expect(screen.getByTestId('page')).toHaveTextContent('experiment');
    expect(screen.getByTestId('gcs-mode')).toHaveTextContent('on');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'xgc.nav.experimentGcsMode',
        newValue: JSON.stringify(false),
      }));
    });
    expect(screen.getByTestId('page')).toHaveTextContent('experiment');
    expect(screen.getByTestId('gcs-mode')).toHaveTextContent('off');
  });
});

function LanguageProbe() {
  const nav = useNavigation();
  return (
    <>
      <span data-testid="language">{nav.language}</span>
      <button type="button" data-testid="set-zh" onClick={() => nav.setLanguage('zh-CN')} />
    </>
  );
}

function SkinProbe() {
  const nav = useNavigation();
  return (
    <>
      <span data-testid="skin">{nav.skin}</span>
      <button type="button" data-testid="set-dark" onClick={() => nav.setSkin('dark')} />
    </>
  );
}

function SidebarProbe() {
  const nav = useNavigation();
  return (
    <>
      <span data-testid="sidebar-state">{nav.sidebarCollapsed ? 'collapsed' : 'expanded'}</span>
      <button type="button" data-testid="toggle-sidebar" onClick={() => nav.setSidebarCollapsed((current) => !current)} />
    </>
  );
}

function PageProbe() {
  const nav = useNavigation();
  return <span data-testid="page">{nav.page}</span>;
}

function SystemSectionProbe() {
  const nav = useNavigation();
  return <><span data-testid="page">{nav.page}</span><span data-testid="host-tab">{nav.pageSection('system')}</span></>;
}

function GenericSectionProbe() {
  const nav = useNavigation();
  return (
    <>
      <span data-testid="page">{nav.page}</span>
      <span data-testid="page-section">{nav.pageSection('settings')}</span>
      <button type="button" data-testid="set-primary-section" onClick={() => nav.setPageSection('settings','primary')} />
    </>
  );
}

function PageNavigationProbe() {
  const nav = useNavigation();
  return (
    <>
      <span data-testid="page">{nav.page}</span>
      <button type="button" data-testid="leave-automations" onClick={() => nav.navigatePage('experiment')} />
      <button type="button" data-testid="go-robot-assets" onClick={() => nav.navigatePage('robotAssets')} />
    </>
  );
}

function GcsModeProbe() {
  const nav = useNavigation();
  return (
    <>
      <span data-testid="page">{nav.page}</span>
      <span data-testid="gcs-mode">{nav.gcsMode ? 'on' : 'off'}</span>
      <button type="button" data-testid="go-experiment" onClick={() => nav.navigatePage('experiment')} />
      <button type="button" data-testid="enable-gcs" onClick={() => nav.setGcsMode(true)} />
      <button type="button" data-testid="go-robot-assets" onClick={() => nav.navigatePage('robotAssets')} />
    </>
  );
}

function TargetProbe() {
  const nav = useNavigation();
  return <><span data-testid="page">{nav.page}</span><span data-testid="managed-host">{nav.managedHostId}</span><span data-testid="target-core">{nav.targetCoreId}</span></>;
}
