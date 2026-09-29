// @vitest-environment jsdom
import { lazy, StrictMode, useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteReadyProvider } from '../../../shared/routeReady';
import type { SharedSurfaceClient, SharedSurfaceContribution, SharedSurfaceProjection, SharedSurfaceProps } from '../../../shared/sharedSurface';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(), getProjection: vi.fn(), takeToken: vi.fn(), mounted: vi.fn(), cleanup: vi.fn(),
  surfaces: [] as SharedSurfaceContribution[],
  openEvents: vi.fn((_client: SharedSurfaceClient, _handlers: {
    onProjection: (projection: SharedSurfaceProjection) => void; onClosed: () => void;
  }) => ({ close: vi.fn() })),
}));
vi.mock('./accessEntryService', () => ({
  bootstrapAccessEntry: mocks.bootstrap, getAccessEntryProjection: mocks.getProjection,
  takeAccessEntryFragmentToken: mocks.takeToken, openAccessEntryEvents: mocks.openEvents,
}));
vi.mock('../../../shared/productWebComposition', () => ({ useProductWebComposition: () => ({ sharedSurfaces: mocks.surfaces }) }));
import { AccessEntryPage } from './AccessEntryPage';

const projection: SharedSurfaceProjection = {
  contractVersion: 1, entryId: 'entry-1', name: 'Shared preview', expiresAt: '2027-09-20T12:00:00Z',
  moduleId: 'preview', viewContractVersion: 1, actions: ['surface.read', 'preview.read'],
  endpoints: [
    { id: 'surface.events', method: 'GET', path: '/api/access/entry/events', protocol: 'sse', action: 'surface.read' },
    { id: 'preview.read', method: 'GET', path: '/api/access/entry/preview', protocol: 'http', action: 'preview.read' },
  ],
  surface: { resourceId: 'resource-1', sessionId: 'session-1' },
};
function SelectedLeaf({ client }: SharedSurfaceProps) {
  useEffect(() => { mocks.mounted(); return () => mocks.cleanup(); }, []);
  return <button onClick={() => void client.request('preview.read')}>Read selected preview</button>;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('generic access entry host', () => {
  let selectedLoad = vi.fn(async () => ({ default: SelectedLeaf }));
  let unrelatedLoad = vi.fn(async () => ({ default: () => <div>Unrelated feature</div> }));
  beforeEach(() => {
    vi.clearAllMocks();
    selectedLoad = vi.fn(async () => ({ default: SelectedLeaf }));
    unrelatedLoad = vi.fn(async () => ({ default: () => <div>Unrelated feature</div> }));
    mocks.surfaces = [
      { moduleId: 'preview', viewContractVersion: 1, component: lazy(selectedLoad) },
      { moduleId: 'unrelated', viewContractVersion: 1, component: lazy(unrelatedLoad) },
    ];
    mocks.takeToken.mockReturnValue('');
    mocks.getProjection.mockResolvedValue(projection);
    mocks.openEvents.mockReturnValue({ close: vi.fn() });
  });

  it('exchanges only once under StrictMode and lazily loads only the exact compiled owner', async () => {
    const gate = deferred<SharedSurfaceProjection>();
    mocks.takeToken.mockReturnValue('one-time');
    mocks.bootstrap.mockReturnValue(gate.promise);
    render(<StrictMode><AccessEntryPage /></StrictMode>);
    expect(mocks.takeToken).toHaveBeenCalledOnce();
    expect(mocks.bootstrap).toHaveBeenCalledExactlyOnceWith('one-time');
    expect(mocks.getProjection).not.toHaveBeenCalled();
    expect(selectedLoad).not.toHaveBeenCalled();
    gate.resolve(projection);
    expect(await screen.findByRole('button', { name: 'Read selected preview' })).toBeTruthy();
    expect(selectedLoad).toHaveBeenCalledOnce();
    expect(unrelatedLoad).not.toHaveBeenCalled();
  });

  it('allows the selected owner only its projected API, without loading any main app APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<AccessEntryPage />);
      const action = await screen.findByRole('button', { name: 'Read selected preview' });
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(action);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toBe('/api/access/entry/preview');
      expect(unrelatedLoad).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([
    { moduleId: 'not-included' }, { viewContractVersion: 2 }, { contractVersion: 2 },
    { contractVersion: undefined }, { actions: [] }, { endpoints: [] }, { name: '' },
  ])('fails closed before mounting any owner for %j', async (change) => {
    mocks.getProjection.mockResolvedValue({ ...projection, ...change });
    render(<AccessEntryPage />);
    expect(await screen.findByText('链接无效、已过期或此功能不可用。')).toBeTruthy();
    expect(selectedLoad).not.toHaveBeenCalled();
    expect(unrelatedLoad).not.toHaveBeenCalled();
    expect(mocks.openEvents).not.toHaveBeenCalled();
  });

  it.each(['ready', 'denied'] as const)('releases bootstrap only when %s has meaningful content', async (outcome) => {
    const gate = deferred<SharedSurfaceProjection>(), onReady = vi.fn();
    mocks.getProjection.mockReturnValue(gate.promise);
    render(<RouteReadyProvider onReady={onReady}><AccessEntryPage /></RouteReadyProvider>);
    expect(screen.getByRole('status', { name: 'Connecting' })).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => outcome === 'ready' ? gate.resolve(projection) : gate.reject(new Error('401')));
    if (outcome === 'ready') await screen.findByRole('button', { name: 'Read selected preview' });
    else await screen.findByText('链接无效、已过期或此功能不可用。');
    expect(onReady).toHaveBeenCalled();
  });

  it.each([
    { entryId: 'other' }, { moduleId: 'unrelated' }, { surface: { resourceId: 'other', sessionId: 'session-1' } },
    { surface: { resourceId: 'resource-1', sessionId: 'other-session' } },
    { actions: ['surface.read'] }, { endpoints: [projection.endpoints[0]] },
  ])('unmounts instead of accepting changed scope/identity %j', async (change) => {
    const close = vi.fn();
    mocks.openEvents.mockReturnValue({ close });
    render(<AccessEntryPage />);
    await screen.findByRole('button', { name: 'Read selected preview' });
    const handlers = mocks.openEvents.mock.calls.at(-1)![1];
    act(() => handlers.onProjection({ ...projection, ...change }));
    expect(screen.getByText('该分享已停止、撤销或发生变化，请重新打开有效链接。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read selected preview' })).toBeNull();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    act(() => handlers.onProjection(projection));
    expect(screen.queryByRole('button', { name: 'Read selected preview' })).toBeNull();
    expect(unrelatedLoad).not.toHaveBeenCalled();
  });

  it('ignores identical state and never remounts after revocation, even if composition rerenders', async () => {
    const close = vi.fn();
    mocks.openEvents.mockReturnValue({ close });
    const view = render(<AccessEntryPage />);
    await screen.findByRole('button', { name: 'Read selected preview' });
    const handlers = mocks.openEvents.mock.calls.at(-1)![1];
    act(() => handlers.onProjection({ ...projection, surface: { sessionId: 'session-1', resourceId: 'resource-1' } }));
    expect(mocks.mounted).toHaveBeenCalledOnce();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    act(() => handlers.onClosed());
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    mocks.surfaces = [...mocks.surfaces];
    view.rerender(<AccessEntryPage />);
    act(() => handlers.onProjection(projection));
    expect(screen.queryByRole('button', { name: 'Read selected preview' })).toBeNull();
    expect(mocks.mounted).toHaveBeenCalledOnce();
  });
});
