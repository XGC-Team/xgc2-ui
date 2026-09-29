// @vitest-environment jsdom

import { act,cleanup,fireEvent,render,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { MediaEdgeSessionHandle } from '../../domains/execution/executionPublic';
import { ExperimentSurfaceVisibilityProvider,type PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelPluginContext } from '../types';
import { CameraVideoPanel } from './CameraVideoPanel';

const mocks=vi.hoisted(() => ({ createSession:vi.fn() }));
vi.mock('../../domains/execution/executionPublic',async (importOriginal) => ({
  ...await importOriginal() as Record<string,unknown>,
  createMediaEdgeSession:mocks.createSession,
}));
const context:PanelPluginContext<readonly ['visualization']>={
  ports:{ actions:{},data:{},authoring:{},interactions:{} },
};
const panel:PanelInstance={
  id:'camera-panel',pluginId:'camera-video',title:'Camera video',
  gridPos:{ x:0,y:0,w:8,h:5 },query:{},fieldConfig:{},
  options:{ edgeUrl:'http://192.0.2.20:18090',sourceId:'front' },
  portBindings:[{ portId:'video',kind:'data',projection:'camera.video.v1' }],
};
const handle=(close=vi.fn().mockResolvedValue(undefined)):MediaEdgeSessionHandle => ({
  answer:{
    sessionId:'0123456789abcdef0123456789abcdef',sdp:'v=0',dataChannelLabel:'xgc-media-control.v1',
    source:{ id:'front',width:1920,height:1080,fps:30,frameId:'camera',codec:'H264' },
  },
  close,
});

function videoIn(container:HTMLElement) {
  return container.querySelector<HTMLVideoElement>('video')!;
}

describe('camera presentation visibility lifecycle',() => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    mocks.createSession.mockResolvedValue(handle());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not negotiate for an initially hidden surface and connects when it becomes visible',async () => {
    const view=render(<CameraVideoPanel panel={panel} context={context} surfaceVisible={false} />);
    expect(view.container.querySelector('video')).toBeNull();
    expect(mocks.createSession).not.toHaveBeenCalled();
    view.rerender(<CameraVideoPanel panel={panel} context={context} surfaceVisible />);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    expect(videoIn(view.container)).not.toBeNull();
  });

  it('releases hidden surface resources and attaches the restored stream to the new video element',async () => {
    const observe=vi.fn();
    const disconnect=vi.fn();
    vi.stubGlobal('ResizeObserver',class {
      observe=observe;
      disconnect=disconnect;
      unobserve=vi.fn();
    });
    const close=vi.fn().mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue(handle(close));
    const view=render(<CameraVideoPanel panel={panel} context={context} />);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    const options=mocks.createSession.mock.calls[0]![0];
    const oldVideo=videoIn(view.container);
    const cancelFrame=vi.fn();
    Object.defineProperties(oldVideo,{
      requestVideoFrameCallback:{ configurable:true,value:vi.fn(() => 0) },
      cancelVideoFrameCallback:{ configurable:true,value:cancelFrame },
    });
    const track=Object.assign(new EventTarget(),{ stop:vi.fn() }) as unknown as MediaStreamTrack;
    act(() => options.onTrack({ id:'first' } as MediaStream,track));
    fireEvent.playing(oldVideo);
    view.rerender(<CameraVideoPanel panel={panel} context={context} surfaceVisible={false} />);
    expect(options.signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledWith('consumer-unmounted');
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(oldVideo.srcObject).toBeNull();
    expect(cancelFrame).toHaveBeenCalledWith(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
    const lateTrack={ stop:vi.fn() } as unknown as MediaStreamTrack;
    act(() => options.onTrack({ id:'late' } as MediaStream,lateTrack));
    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
    view.rerender(<CameraVideoPanel panel={panel} context={context} surfaceVisible />);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(2));
    expect(videoIn(view.container)).not.toBe(oldVideo);
    expect(observe).toHaveBeenCalledTimes(2);
    const stream={ id:'restored' } as MediaStream;
    act(() => mocks.createSession.mock.calls[1]![0].onTrack(stream,track));
    expect(videoIn(view.container).srcObject).toBe(stream);
  });

  it('closes a negotiation that completes after its surface was hidden',async () => {
    let resolve!: (value:MediaEdgeSessionHandle) => void;
    mocks.createSession.mockReturnValue(new Promise<MediaEdgeSessionHandle>((done) => { resolve=done; }));
    const view=render(<CameraVideoPanel panel={panel} context={context} />);
    view.rerender(<CameraVideoPanel panel={panel} context={context} surfaceVisible={false} />);
    const close=vi.fn().mockResolvedValue(undefined);
    await act(async () => { resolve(handle(close)); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith('consumer-unmounted');
    expect(view.container.querySelector('video')).toBeNull();
  });

  it('releases the session while its Experiment dashboard is hidden and renegotiates when shown',async () => {
    const close=vi.fn().mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue(handle(close));
    const dashboard=(visible:boolean) => <ExperimentSurfaceVisibilityProvider visible={visible}>
      <CameraVideoPanel panel={panel} context={context} />
    </ExperimentSurfaceVisibilityProvider>;
    const view=render(dashboard(false));
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(view.container.querySelector('video')).toBeNull();
    view.rerender(dashboard(true));
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    view.rerender(dashboard(false));
    expect(mocks.createSession.mock.calls[0]![0].signal.aborted).toBe(true);
    await waitFor(() => expect(close).toHaveBeenCalledWith('consumer-unmounted'));
    expect(view.container.querySelector('video')).toBeNull();
    view.rerender(dashboard(true));
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(2));
  });

  it('pauses frame metrics in background tabs without renegotiating a healthy session',async () => {
    const visibility=vi.spyOn(document,'visibilityState','get');
    const close=vi.fn().mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue(handle(close));
    const view=render(<CameraVideoPanel panel={panel} context={context} />);
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    const video=videoIn(view.container);
    const request=vi.fn(() => 0);
    const cancel=vi.fn();
    Object.defineProperties(video,{
      requestVideoFrameCallback:{ configurable:true,value:request },
      cancelVideoFrameCallback:{ configurable:true,value:cancel },
    });
    fireEvent.playing(video);
    expect(request).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(cancel).toHaveBeenCalledWith(0);
    expect(close).not.toHaveBeenCalled();
    expect(mocks.createSession.mock.calls[0]![0].signal.aborted).toBe(false);
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });
});
