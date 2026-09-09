import { lazy } from 'react';
import { Store } from 'lucide-react';
import {
  defineProductOwnerIdentity,
  type ProductOwnerContribution,
} from '../../shared/productWebComposition';
import { productDockerOwnerIdentity } from '../container/containerPublic';
import { AppStoreRoute } from './AppStoreRoute';
import { appStoreNavigationCopy } from './appStoreNavigationCopy';
import { appStoreSurfacePolicy } from './appStoreSurfacePolicy';

const AppStoreSettingsAdapter = lazy(() =>
  import('./AppStoreSettingsAdapterRoute').then((module) => ({
    default: module.AppStoreSettingsAdapter,
  })),
);

const label = (key: keyof (typeof appStoreNavigationCopy)['en-US']) => ({
  'en-US': appStoreNavigationCopy['en-US'][key],
  'zh-CN': appStoreNavigationCopy['zh-CN'][key],
} as const);

/**
 * Compile-time Product.AppStore leaf: owns App Store route, ops nav, and Settings section.
 * Requires Product.Docker in the same composition (AppStore always needs Docker).
 */
const productAppStoreOwnerIdentity = defineProductOwnerIdentity('Product.AppStore');

export const productAppStoreContribution = {
  owner: productAppStoreOwnerIdentity,
  requires: [productDockerOwnerIdentity],
  routes: [{
    page: 'appStore',
    component: AppStoreRoute,
    surface: appStoreSurfacePolicy,
  }],
  navigation: {
    operations: [{
      id: 'appStore',
      label: label('navLabel'),
      icon: Store,
    }],
  },
  settings: {
    sections: [{ id: 'app-store',component: AppStoreSettingsAdapter }],
  },
} as const satisfies ProductOwnerContribution;
