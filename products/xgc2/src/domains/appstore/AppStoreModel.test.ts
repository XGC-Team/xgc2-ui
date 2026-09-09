import { describe,expect,it } from 'vitest';
import { appCategoryLabel,isBlockingInstallState,isInstalledApp,isVisibleInstallState } from './appStoreCatalogModel';
import {
  APP_STORE_REGISTRY_IMAGE_PREFIX,
  imagePrefixForAppStoreRegistry,
  withAppStoreRegistry,
  type AppStoreInstall,
  type AppStoreSetting,
} from './appStoreModel';

describe('App Store model', () => {
  it('keeps durable install status grouping explicit', () => {
    const visibleStates = ['running', 'stopped', 'installing', 'upgrading', 'error'];
    const blockingStates = ['running', 'stopped', 'installing', 'upgrading'];
    for (const status of visibleStates) {
      expect(isInstalledApp(appStoreInstall(status))).toBe(true);
      expect(isVisibleInstallState(appStoreInstall(status))).toBe(true);
      expect(isBlockingInstallState(appStoreInstall(status))).toBe(blockingStates.includes(status));
    }
    expect(isInstalledApp(appStoreInstall('uninstalled'))).toBe(false);
  });

  it('formats catalog categories without execution-side projections', () => {
    expect(appCategoryLabel('deployment')).toBe('Deployment');
    expect(appCategoryLabel('custom')).toBe('custom');
  });

  it('maps each selectable registry to its canonical image prefix', () => {
    expect(imagePrefixForAppStoreRegistry('aliyun')).toBe(APP_STORE_REGISTRY_IMAGE_PREFIX.aliyun);
    expect(imagePrefixForAppStoreRegistry('ghcr')).toBe(APP_STORE_REGISTRY_IMAGE_PREFIX.ghcr);
    expect(imagePrefixForAppStoreRegistry('custom')).toBe(APP_STORE_REGISTRY_IMAGE_PREFIX.aliyun);

    const base: AppStoreSetting = {
      id: 'default',
      registry: 'aliyun',
      imageSource: 'mirror',
      mirrorPrefix: APP_STORE_REGISTRY_IMAGE_PREFIX.aliyun,
      updatedAt: '',
    };
    expect(withAppStoreRegistry(base, 'ghcr')).toEqual({
      ...base,
      registry: 'ghcr',
      imageSource: 'default',
      mirrorPrefix: APP_STORE_REGISTRY_IMAGE_PREFIX.ghcr,
    });
    expect(withAppStoreRegistry(base, 'aliyun')).toEqual({
      ...base,
      registry: 'aliyun',
      imageSource: 'mirror',
      mirrorPrefix: APP_STORE_REGISTRY_IMAGE_PREFIX.aliyun,
    });
  });
});

function appStoreInstall(status: string): AppStoreInstall {
  return {
    id: `install-${status}`,appId: 'app',appKey: 'demo',appDetailId: 'detail',name: 'Demo',version: '1.0.0',
    status,message: '',source: 'catalog',installPath: '/tmp/demo',containerName: 'demo',serviceName: 'demo',httpPort: 0,
    env: {},dockerCompose: '',createdAt: '',updatedAt: '',
  };
}
