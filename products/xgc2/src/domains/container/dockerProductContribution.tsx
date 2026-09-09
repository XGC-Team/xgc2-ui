import { Boxes,Container,HardDrive,Layers,Network } from 'lucide-react';
import type { ProductOwnerContribution } from '../../shared/productWebComposition';
import { ContainerRoute } from './ContainerRoute';
import { dockerNavigationCopy } from './dockerNavigationCopy';
import { productDockerOwnerIdentity } from './dockerProductIdentity';
import { dockerSurfacePolicy } from './dockerSurfacePolicy';

const label = (key: keyof (typeof dockerNavigationCopy)['en-US']) => ({
  'en-US': dockerNavigationCopy['en-US'][key],
  'zh-CN': dockerNavigationCopy['zh-CN'][key],
} as const);

/**
 * Compile-time Product.Docker leaf: owns Containers route, ops nav item, and tabs.
 * App hosts must import this contribution object — never the container domain tree.
 */
export const productDockerContribution = {
  owner: productDockerOwnerIdentity,
  routes: [{
    page: 'containers',
    component: ContainerRoute,
    surface: dockerSurfacePolicy,
  }],
  navigation: {
    operations: [{
      id: 'containers',
      label: label('navLabel'),
      icon: Container,
    }],
    sections: [{
      page: 'containers',
      items: [
        { id: 'containers',label: label('tabContainers'),icon: Container },
        { id: 'compose',label: label('tabCompose'),icon: Layers },
        { id: 'images',label: label('tabImages'),icon: Boxes },
        { id: 'networks',label: label('tabNetworks'),icon: Network },
        { id: 'volumes',label: label('tabVolumes'),icon: HardDrive },
      ],
    }],
    sectionDefaults: [{ page: 'containers',sectionId: 'containers' }],
  },
} as const satisfies ProductOwnerContribution;
