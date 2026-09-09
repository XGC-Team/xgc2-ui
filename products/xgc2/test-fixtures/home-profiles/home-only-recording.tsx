import { Home } from 'lucide-react';
import { createHomePageAdapter } from '../../src/app/home/createHomePageAdapter';
import { HomeRoute } from '../../src/domains/home/HomeRoute';
import { createRecordingLibraryCardContribution } from '../../src/domains/home/RecordingLibraryCardContribution';
import type { ProductWebComposition } from '../../src/shared/productWebComposition';

export { ProductWebEntry } from '../../src/app/ProductWebEntry';

const label = { 'en-US': 'Home','zh-CN': '主页' } as const;
const HomePage = createHomePageAdapter(HomeRoute);
const surface = {
  productFeatures: ['home'],
  targetAction: 'Core access',
  targetCapabilities: ['core.view'],
  remoteVisibility: 'capability' as const,
  remoteManagedHostAdmission: () => false,
};

/** Recording Home card with zero actions (Files open-folder owner disabled). */
export const productWebComposition = {
  id: 'home-only-recording',
  agentLinkComputeTargets: false,
  home: {
    route: { page: 'home',component: HomePage,surface },
    cards: [createRecordingLibraryCardContribution([])],
  },
  routes: [{ page: 'home',component: HomePage,surface }],
  navigation: {
    defaultPage: 'home',
    primary: [{ id: 'home',label,icon: Home }],
    operations: [],
    sections: {},
    sectionDefaults: {},
  },
  settings: { sections: [] },
  developer: {},
} satisfies ProductWebComposition;
