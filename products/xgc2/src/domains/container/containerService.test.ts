import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,withTerminalAuth } from '../../api/http';
import {
  buildContainerImage,
  createContainerVolume,
  getContainerComposeConfig,
  getContainerLogs,
  inspectContainer,
  inspectContainerImage,
  inspectContainerVolume,
  listContainers,
  listContainerVolumes,
  loadContainerImage,
  operateContainer,
  operateContainerComposeProject,
  pruneContainerBuildCache,
  pruneContainerImages,
  pruneContainerVolumes,
  pushContainerImage,
  removeContainerVolume,
  removeContainerVolumes,
  saveContainerImage,
  tagContainerImage,
} from './containerService';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({})),
  requestBlob: vi.fn(() => Promise.resolve(new Blob(['tar']))),
  uploadRequest: vi.fn(() => Promise.resolve({ output: 'Loaded' })),
  withTerminalAuth: vi.fn((options?: object) => ({ ...options,auth: 'terminal' })),
}));

describe('containerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses terminal auth for container list', async () => {
    await listContainers({ targetCoreId: 'core-1' });

    expect(withTerminalAuth).toHaveBeenCalledWith({ targetCoreId: 'core-1' });
    expect(request).toHaveBeenCalledWith('/containers', undefined, { targetCoreId: 'core-1',auth: 'terminal' });
  });

  it('encodes container id path segments', async () => {
    await inspectContainer('a/b c');

    expect(request).toHaveBeenCalledWith('/containers/a%2Fb%20c/inspect', undefined, { auth: 'terminal' });
  });

  it('builds container log query strings', async () => {
    await getContainerLogs('app/id', 50);

    expect(request).toHaveBeenCalledWith('/containers/app%2Fid/logs?tail=50', undefined, { auth: 'terminal' });
  });

  it('clamps container log tail limits', async () => {
    await getContainerLogs('app/id', 999999);

    expect(request).toHaveBeenCalledWith('/containers/app%2Fid/logs?tail=5000', undefined, { auth: 'terminal' });
  });

  it('uses typed container operations with terminal auth', async () => {
    await operateContainer('app/id', 'remove', true, { targetCoreId: 'core-1' });

    expect(request).toHaveBeenCalledWith('/containers/app%2Fid/op', {
      method: 'POST',
      body: JSON.stringify({ operation: 'remove',force: true }),
    }, { targetCoreId: 'core-1',auth: 'terminal' });
  });

  it('uses typed compose operations with terminal auth', async () => {
    await operateContainerComposeProject({ name: 'demo',path: '/tmp/demo',operation: 'down',force: true });

    expect(request).toHaveBeenCalledWith('/container-compose/op', {
      method: 'POST',
      body: JSON.stringify({ name: 'demo',path: '/tmp/demo',operation: 'down',force: true }),
    }, { auth: 'terminal' });
  });

  it('loads compose YAML content by config path with terminal auth', async () => {
    await getContainerComposeConfig('/opt/apps/demo/docker-compose.yml', { targetCoreId: 'core-1' });

    expect(withTerminalAuth).toHaveBeenCalledWith({ targetCoreId: 'core-1' });
    expect(request).toHaveBeenCalledWith(
      '/container-compose/config?path=%2Fopt%2Fapps%2Fdemo%2Fdocker-compose.yml',
      undefined,
      { targetCoreId: 'core-1',auth: 'terminal' },
    );
  });

  it('prunes images and build cache with terminal auth', async () => {
    const { request } = await import('../../api/http');
    await pruneContainerImages(true, { targetCoreId: 'core-1' });
    await pruneContainerBuildCache({ targetCoreId: 'core-1' });

    expect(request).toHaveBeenCalledWith('/container-images/prune', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
    expect(request).toHaveBeenCalledWith('/container-images/builder-prune', {
      method: 'POST',
      body: JSON.stringify({}),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
  });

  it('exports images as blob downloads and imports via multipart upload', async () => {
    const { requestBlob,uploadRequest } = await import('../../api/http');
    await saveContainerImage('nginx:alpine');
    await loadContainerImage(new File(['tar'], 'nginx.tar'));

    expect(requestBlob).toHaveBeenCalledWith('/container-images/save', {
      method: 'POST',
      body: JSON.stringify({ name: 'nginx:alpine' }),
      headers: { 'Content-Type': 'application/json' },
    }, expect.objectContaining({ auth: 'terminal',timeoutMs: 30 * 60_000 }));
    expect(uploadRequest).toHaveBeenCalledWith(
      '/container-images/load',
      expect.any(FormData),
      expect.objectContaining({ auth: 'terminal',timeoutMs: 30 * 60_000 }),
    );
  });

  it('tags, pushes, builds, and inspects images with terminal auth', async () => {
    const { request } = await import('../../api/http');
    await tagContainerImage('nginx:alpine', 'ghcr.io/org/nginx:1', { targetCoreId: 'core-1' });
    await pushContainerImage('ghcr.io/org/nginx:1', { targetCoreId: 'core-1' });
    await buildContainerImage({ name: 'app:dev', dockerfile: 'FROM alpine\n' }, { targetCoreId: 'core-1' });
    await inspectContainerImage('nginx:alpine', { targetCoreId: 'core-1' });

    expect(request).toHaveBeenCalledWith('/container-images/tag', {
      method: 'POST',
      body: JSON.stringify({ source: 'nginx:alpine', target: 'ghcr.io/org/nginx:1' }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
    expect(request).toHaveBeenCalledWith('/container-images/push', {
      method: 'POST',
      body: JSON.stringify({ name: 'ghcr.io/org/nginx:1' }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal',timeoutMs: 30 * 60_000 }));
    expect(request).toHaveBeenCalledWith('/container-images/build', {
      method: 'POST',
      body: JSON.stringify({ name: 'app:dev', dockerfile: 'FROM alpine\n' }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal',timeoutMs: 45 * 60_000 }));
    expect(request).toHaveBeenCalledWith('/container-images/inspect', {
      method: 'POST',
      body: JSON.stringify({ name: 'nginx:alpine' }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
  });

  it('lists, creates, inspects, removes, and prunes volumes with terminal auth', async () => {
    await listContainerVolumes({ targetCoreId: 'core-1' });
    await createContainerVolume({
      name: 'app-data',
      driver: 'local',
      labels: ['env=lab'],
      options: ['type=nfs4'],
    }, { targetCoreId: 'core-1' });
    await inspectContainerVolume('app/data');
    await removeContainerVolume('app/data', { force: true, targetCoreId: 'core-1' });
    await removeContainerVolumes(['a', 'b'], true, { targetCoreId: 'core-1' });
    await pruneContainerVolumes({ targetCoreId: 'core-1' });

    expect(request).toHaveBeenCalledWith('/container-volumes', undefined, expect.objectContaining({
      targetCoreId: 'core-1',
      auth: 'terminal',
    }));
    expect(request).toHaveBeenCalledWith('/container-volumes', {
      method: 'POST',
      body: JSON.stringify({
        name: 'app-data',
        driver: 'local',
        labels: ['env=lab'],
        options: ['type=nfs4'],
      }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
    expect(request).toHaveBeenCalledWith('/container-volumes/app%2Fdata/inspect', undefined, expect.objectContaining({
      auth: 'terminal',
    }));
    expect(request).toHaveBeenCalledWith('/container-volumes/app%2Fdata?force=true', {
      method: 'DELETE',
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
    expect(request).toHaveBeenCalledWith('/container-volumes/delete', {
      method: 'POST',
      body: JSON.stringify({ names: ['a', 'b'], force: true }),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
    expect(request).toHaveBeenCalledWith('/container-volumes/prune', {
      method: 'POST',
      body: JSON.stringify({}),
    }, expect.objectContaining({ targetCoreId: 'core-1',auth: 'terminal' }));
  });
});
