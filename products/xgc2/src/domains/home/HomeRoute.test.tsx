// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import {
  ProductWebCompositionProvider,
  type HomeCardContribution,
  type HomeCardProps,
  type ProductWebComposition,
} from '../../shared/productWebComposition';
import { HomeRoute } from './HomeRoute';

function FakeCardA({ runtime }: HomeCardProps) {
  return (
    <div data-xgc-role="home-card-fixture" data-xgc-id="card-a" data-language={runtime.language}>
      card-a
    </div>
  );
}

function FakeCardB({ runtime }: HomeCardProps) {
  return (
    <div data-xgc-role="home-card-fixture" data-xgc-id="card-b" data-language={runtime.language}>
      card-b
    </div>
  );
}

const cards: [HomeCardContribution,...HomeCardContribution[]] = [
  { owner: 'Home.RecordingLibrary',id: 'card-a',component: FakeCardA },
  { owner: 'Home.RecordingLibrary',id: 'card-b',component: FakeCardB },
];

const runtime = { language: 'en-US' as const };
const surface = {
  productFeatures: ['fixture'],
  targetAction: 'fixture access',
  targetCapabilities: ['fixture.read'],
  remoteVisibility: 'control-plane' as const,
  remoteManagedHostAdmission: () => false,
};

function baseComposition(home?: ProductWebComposition['home']): ProductWebComposition {
  return {
    id: 'home-route-test',
    agentLinkComputeTargets: false,
    routes: home ? [home.route] : [{ page: 'experiment',component: () => null,surface }],
    navigation: {
      defaultPage: home ? 'home' : 'experiment',
      primary: [],
      operations: [],
      sections: {},
      sectionDefaults: {},
    },
    settings: { sections: [] },
    developer: {},
    home,
  };
}

function renderHome(home: NonNullable<ProductWebComposition['home']>) {
  return render(
    <ProductWebCompositionProvider composition={baseComposition(home)}>
      <HomeRoute runtime={runtime} />
    </ProductWebCompositionProvider>,
  );
}

describe('HomeRoute', () => {
  it('renders ordered composition cards under stable home selectors without placeholders', () => {
    const { container } = renderHome({
      route: { page: 'home',component: () => null,surface },
      cards,
    });

    const page = container.querySelector('[data-xgc-role="home-page"][data-xgc-id="home"]');
    expect(page).toBeInTheDocument();
    expect(page).toHaveClass('home-page','xgc-workspace-full-span');

    const gallery = container.querySelector('[data-xgc-role="home-card-gallery"]');
    expect(gallery).toBeInTheDocument();
    expect(gallery).toHaveClass('home-gallery');

    const rendered = [...(gallery?.querySelectorAll('[data-xgc-role="home-card-fixture"]') ?? [])];
    expect(rendered.map((node) => node.getAttribute('data-xgc-id'))).toEqual(['card-a','card-b']);
    expect(rendered.every((node) => node.getAttribute('data-language') === 'en-US')).toBe(true);
    expect(container.querySelector('[data-xgc-role="home-card-placeholder"]')).toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="home-card-placeholder"]')).toHaveLength(0);
  });

  it('throws when composition lacks home', () => {
    expect(() => render(
      <ProductWebCompositionProvider composition={baseComposition(undefined)}>
        <HomeRoute runtime={runtime} />
      </ProductWebCompositionProvider>,
    )).toThrow('HomeRoute requires composition.home');
  });
});
