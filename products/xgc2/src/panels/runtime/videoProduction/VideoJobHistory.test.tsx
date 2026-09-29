// @vitest-environment jsdom
import { act,fireEvent,render } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { ExperimentSurfaceVisibilityProvider } from '../../../domains/experiment/experimentPublic';
import { ProductRouteVisibilityProvider } from '../../../shared/routeReady';
import { VideoJobHistory } from './VideoJobHistory';

const api = vi.hoisted(() => ({
  listVideoJobs: vi.fn(),cancelPreparedVideoJob: vi.fn(),downloadVideoArtifact: vi.fn(),publishVideoJobToGallery: vi.fn(),
}));
vi.mock('../../../domains/recording/recordingPublic',() => api);

async function elapse(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept,fail) => { resolve = accept;reject = fail; });
  return { promise,resolve,reject };
}

function videoJob(experimentId: string,id: string) {
  return {
    id,experimentId,bagId: 'bag-1',rendition: { kind: 'video' as const },status: 'running' as const,
    createdAt: '2026-09-27T00:00:00Z',updatedAt: '2026-09-27T00:00:00Z',requestSha256: '0'.repeat(64),
    outputFrames: 10,renderedFrames: 1,encodedFrames: 0,captureCount: 0,
  };
}

describe('VideoJobHistory polling',() => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.listVideoJobs.mockReset();
    api.listVideoJobs.mockResolvedValue({ items: [] });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('polls the render history only while its dashboard and route are visible',async () => {
    const view = (dashboard: boolean,route: boolean) => <ProductRouteVisibilityProvider visible={route}>
      <ExperimentSurfaceVisibilityProvider visible={dashboard}>
        <VideoJobHistory experimentId="exp-1" id="video" revision={0} />
      </ExperimentSurfaceVisibilityProvider>
    </ProductRouteVisibilityProvider>;
    const { rerender } = render(view(false,true));
    await elapse(10_000);
    expect(api.listVideoJobs).not.toHaveBeenCalled();

    rerender(view(true,true));
    await elapse(0);
    expect(api.listVideoJobs).toHaveBeenCalledTimes(1);
    await elapse(3_000);
    expect(api.listVideoJobs).toHaveBeenCalledTimes(2);

    rerender(view(true,false));
    await elapse(30_000);
    expect(api.listVideoJobs).toHaveBeenCalledTimes(2);
    rerender(view(true,true));
    await elapse(0);
    expect(api.listVideoJobs).toHaveBeenCalledTimes(3);
  });
  it('drops an obsolete Experiment response before it can replace the current page',async () => {
    const oldPage = deferred<{items: ReturnType<typeof videoJob>[]}>();
    const currentPage = deferred<{items: ReturnType<typeof videoJob>[]}>();
    api.listVideoJobs.mockReset();
    api.listVideoJobs.mockImplementationOnce(() => oldPage.promise).mockImplementationOnce(() => currentPage.promise);
    const view = (experimentId: string) => <ProductRouteVisibilityProvider visible>
      <ExperimentSurfaceVisibilityProvider visible>
        <VideoJobHistory experimentId={experimentId} id="video" revision={0} />
      </ExperimentSurfaceVisibilityProvider>
    </ProductRouteVisibilityProvider>;
    const rendered = render(view('exp-1'));
    await elapse(0);
    expect(api.listVideoJobs).toHaveBeenNthCalledWith(1,'exp-1',0);

    rendered.rerender(view('exp-2'));
    expect(api.listVideoJobs).toHaveBeenCalledTimes(1);
    await act(async () => { oldPage.resolve({ items: [videoJob('exp-1','old-job')] }); });
    expect(rendered.container.querySelector('[data-xgc-id="old-job"]')).toBeNull();
    expect(api.listVideoJobs).toHaveBeenNthCalledWith(2,'exp-2',0);

    await act(async () => { currentPage.resolve({ items: [videoJob('exp-2','current-job')] }); });
    expect(rendered.container.querySelector('[data-xgc-id="current-job"]')).not.toBeNull();
  });

  it('does not expose a previous Experiment page or reuse its pagination offset',async () => {
    const olderPage = deferred<{items: ReturnType<typeof videoJob>[]}>();
    const currentPage = deferred<{items: ReturnType<typeof videoJob>[]}>();
    api.listVideoJobs.mockReset();
    api.listVideoJobs
      .mockResolvedValueOnce({ items: [videoJob('exp-1','old-job')],nextOffset: 25 })
      .mockImplementationOnce(() => olderPage.promise)
      .mockImplementationOnce(() => currentPage.promise);
    const view = (experimentId: string) => <ProductRouteVisibilityProvider visible>
      <ExperimentSurfaceVisibilityProvider visible>
        <VideoJobHistory experimentId={experimentId} id="video" revision={0} />
      </ExperimentSurfaceVisibilityProvider>
    </ProductRouteVisibilityProvider>;
    const rendered = render(view('exp-1'));
    await elapse(0);
    expect(rendered.container.querySelector('[data-xgc-id="old-job"]')).not.toBeNull();

    const older = rendered.container.querySelector('[data-xgc-role="video-history-next"]');
    expect(older).not.toBeNull();
    fireEvent.click(older!);
    expect(api.listVideoJobs).toHaveBeenNthCalledWith(2,'exp-1',25);

    rendered.rerender(view('exp-2'));
    expect(rendered.container.querySelector('[data-xgc-id="old-job"]')).toBeNull();
    await act(async () => { olderPage.resolve({ items: [] }); });
    expect(api.listVideoJobs).toHaveBeenNthCalledWith(3,'exp-2',0);
    await act(async () => { currentPage.resolve({ items: [] }); });
  });

});
