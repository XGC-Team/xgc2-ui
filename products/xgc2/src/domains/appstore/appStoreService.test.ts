import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import {
  getAppStoreInstallDiff,
  getAppStoreSnapshot,
  installAppStoreApp,
  operateAppStoreInstall,
  saveAppStoreSetting,
  syncCatalogAppStore,
} from './appStoreService';
import type { AppStoreSetting } from './appStoreModel';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({})),
  withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
}));

describe('appStoreService typed actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes snapshots, settings and version diffs to the selected execution target', async () => {
    const options = { targetCoreId: 'edge-core' };
    const setting: AppStoreSetting = {
      id: 'default',registry: 'ghcr',imageSource: 'default',mirrorPrefix: '',updatedAt: '',
    };

    await getAppStoreSnapshot('core:edge-core', options);
    await saveAppStoreSetting('agent/a', setting, options);
    await getAppStoreInstallDiff('install/id', 'agent/a', '1.0 + beta', options);

    expect(request).toHaveBeenNthCalledWith(1, '/app-store/snapshot?targetId=local', undefined, options);
    expect(request).toHaveBeenNthCalledWith(2, '/app-store/settings?targetId=agent%2Fa', {
      method: 'PUT',body: JSON.stringify(setting),
    }, { ...options,auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(3, '/app-store/installed/install%2Fid/diff?targetId=agent%2Fa&version=1.0+%2B+beta', undefined, options);
  });

  it('uses dedicated action endpoints and command identity headers', async () => {
    const intent = { requestId: 'request-1',idempotencyKey: 'request-1',reason: 'operator request' };
    await syncCatalogAppStore({ action: 'sync',...intent });
    await installAppStoreApp('app/id', { action: 'install',version: '1.0.0',...intent });
    await operateAppStoreInstall('install/id', { action: 'restart',...intent });

    const headers = { 'X-Request-ID': 'request-1','Idempotency-Key': 'request-1' };
    expect(request).toHaveBeenNthCalledWith(1, '/app-store/catalog/actions', {
      method: 'POST',headers,body: JSON.stringify({ action: 'sync',...intent,targetId: 'local' }),
    }, { auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(2, '/app-store/apps/app%2Fid/actions', {
      method: 'POST',headers,body: JSON.stringify({ action: 'install',version: '1.0.0',...intent,targetId: 'local' }),
    }, { auth: 'terminal' });
    expect(request).toHaveBeenNthCalledWith(3, '/app-store/installed/install%2Fid/actions', {
      method: 'POST',headers,body: JSON.stringify({ action: 'restart',...intent,targetId: 'local' }),
    }, { auth: 'terminal' });
  });
});
