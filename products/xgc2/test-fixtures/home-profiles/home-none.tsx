import { FlaskConical } from 'lucide-react';
import type { ProductWebComposition } from '../../src/shared/productWebComposition';

export { ProductWebEntry } from '../../src/app/ProductWebEntry';

function ExperimentFixtureRoute() {
  return <div data-xgc-role="home-none-default-route">Experiment fixture</div>;
}

/** No Home imports: the first valid non-Home route is the deterministic default. */
export const productWebComposition: ProductWebComposition = {
  id: 'home-none',
  agentLinkComputeTargets: false,
  routes: [{
    page: 'experiment',
    component: ExperimentFixtureRoute,
    surface: {
      productFeatures: ['experiments'],
      targetAction: 'experiment management',
      targetCapabilities: ['experiment.read', 'experiment.manage'],
      remoteVisibility: 'capability',
      remoteManagedHostAdmission: () => false,
    },
  }],
  navigation: {
    defaultPage: 'experiment',
    primary: [{
      id: 'experiment',
      label: { 'en-US': 'Experiments','zh-CN': '实验' },
      icon: FlaskConical,
    }],
    operations: [],
    sections: {},
    sectionDefaults: {},
  },
  settings: { sections: [] },
  developer: {},
};
