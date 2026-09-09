// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe,expect,it,vi } from 'vitest';
import { productWebComposition as coreReleaseComposition } from '../../profiles/core-release';
import { productWebComposition } from '../../test-fixtures/core-with-docker-appstore';
import { productAppStoreContribution } from '../domains/appstore/appStorePublic';
import { SettingsPage } from '../domains/settings/SettingsPage';
import {
  assembleProductWebComposition,
  localizedProductText,
  ProductWebCompositionProvider,
  type Page,
} from '../shared/productWebComposition';

vi.mock('../domains/container/ContainerRoute', () => ({
  ContainerRoute: () => <div data-testid="docker-route">Docker route</div>,
}));

vi.mock('../domains/appstore/AppStoreRoute', () => ({
  AppStoreRoute: () => <div data-testid="app-store-route">App Store route</div>,
}));

vi.mock('../domains/appstore/AppStoreSettingsAdapterRoute', () => ({
  AppStoreSettingsAdapter: ({ language }: { language: string }) => (
    <div data-testid="app-store-settings-adapter" data-language={language}>App Store settings</div>
  ),
}));

describe('positive Docker and AppStore product composition', () => {
  it('fails closed before merging an AppStore contribution without Docker', () => {
    const routePages = coreReleaseComposition.routes.map((route) => route.page);
    const operationIds = coreReleaseComposition.navigation.operations.map((item) => item.id);
    const settingsIds = coreReleaseComposition.settings.sections.map((section) => section.id);

    expect(() => assembleProductWebComposition(coreReleaseComposition,productAppStoreContribution))
      .toThrow('Product owner "Product.AppStore" requires earlier owner "Product.Docker".');
    expect(coreReleaseComposition.routes.map((route) => route.page)).toEqual(routePages);
    expect(coreReleaseComposition.navigation.operations.map((item) => item.id)).toEqual(operationIds);
    expect(coreReleaseComposition.settings.sections.map((section) => section.id)).toEqual(settingsIds);
  });

  it('contributes the exact routes, operations navigation, Docker tabs, and settings adapter', () => {
    const routePages = productWebComposition.routes.map((route) => route.page);
    const operations = productWebComposition.navigation.operations;

    expect(routePages.slice(-2)).toEqual(['containers','appStore']);
    // Settings stays last on the ops rail; Docker/App Store insert before it.
    expect(operations.map((item) => item.id).slice(-3)).toEqual(['containers','appStore','settings']);
    expect(operations.slice(-3,-1).map((item) => localizedProductText(item.label,'en-US')))
      .toEqual(['Containers','App store']);
    expect(operations.at(-1)?.id).toBe('settings');
    expect(productWebComposition.navigation.sections.containers?.map((section) => section.id))
      .toEqual(['containers','compose','images','networks','volumes']);
    expect(productWebComposition.navigation.sectionDefaults.containers).toBe('containers');
    expect(productWebComposition.settings.sections.map((section) => section.id))
      .toEqual(['appearance','field-tooltips','app-store']);
    expect(route('containers').surface).toMatchObject({
      productFeatures: ['containers'],
      targetAction: 'container management',
      targetCapabilities: ['containers.read','containers.manage'],
      remoteVisibility: 'local-only',
    });
    expect(route('appStore').surface).toMatchObject({
      productFeatures: ['app-store'],
      targetAction: 'app store access',
      targetCapabilities: ['app-store'],
      remoteVisibility: 'capability',
    });

    expect(route('containers').surface.remoteManagedHostAdmission({})).toBe(false);
    expect(route('appStore').surface.remoteManagedHostAdmission({
      Surfaces: { AppStore: true },
    })).toBe(false);
  });

  it('renders both contributed routes from the positive composition', () => {
    const DockerRoute = route('containers').component;
    const AppStoreRoute = route('appStore').component;

    render(
      <ProductWebCompositionProvider composition={productWebComposition}>
        <Suspense fallback={null}>
          <DockerRoute />
          <AppStoreRoute />
        </Suspense>
      </ProductWebCompositionProvider>,
    );

    expect(screen.getByTestId('docker-route')).toBeInTheDocument();
    expect(screen.getByTestId('app-store-route')).toBeInTheDocument();
  });

  it('renders the AppStore-owned Settings adapter only in the positive composition', async () => {
    render(
      <ProductWebCompositionProvider composition={productWebComposition}>
        <SettingsPage
          skin="light"
          language="zh-CN"
          onLanguageChange={vi.fn()}
          onSkinChange={vi.fn()}
        />
      </ProductWebCompositionProvider>,
    );

    expect(await screen.findByTestId('app-store-settings-adapter'))
      .toHaveAttribute('data-language','zh-CN');
    expect(screen.getByLabelText('语言')).toBeInTheDocument();
    expect(screen.getByLabelText('字段帮助提示')).toBeInTheDocument();
  });
});

function route(page: Page) {
  const contribution = productWebComposition.routes.find((candidate) => candidate.page === page);
  if (!contribution) throw new Error(`Missing positive route ${page}`);
  return contribution;
}
