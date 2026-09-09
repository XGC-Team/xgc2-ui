// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { MediaEdgeSessionHandle } from '../../domains/execution/executionPublic';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelPluginContext } from '../types';
import { CameraVideoPanel } from './CameraVideoPanel';

const mediaMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
}));
const panelContext:PanelPluginContext<readonly ['visualization']> = {
  ports:{ actions:{},data:{},authoring:{},interactions:{} },
};

vi.mock('../../domains/execution/executionPublic', async (importOriginal) => {
  const original = await importOriginal() as Record<string,unknown>;
  return {
    ...original,
    createMediaEdgeSession: mediaMocks.createSession,
  };
});

describe('CameraVideoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaMocks.createSession.mockResolvedValue(sessionHandle());
  });

  it('opens the configured Edge directly and attaches only the delivered track stream', async () => {
    const { container } = render(<CameraVideoPanel
      panel={panel('http://192.0.2.20:18090/', 'front')}
      context={panelContext}
    />);

    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    const options = mediaMocks.createSession.mock.calls[0][0];
    expect(options).toMatchObject({
      edgeUrl: 'http://192.0.2.20:18090',
      sourceId: 'front',
    });
    expect(options).not.toHaveProperty('targetId');
    expect(options).not.toHaveProperty('edgeInstanceId');

    const stream = { id: 'one-track-stream' } as MediaStream;
    const track = Object.assign(new EventTarget(), { id: 'video-track' }) as MediaStreamTrack;
    act(() => options.onTrack(stream, track));

    const video = container.querySelector('[data-xgc-role="camera-video-stream"]') as HTMLVideoElement;
    expect(video).toHaveAttribute('data-xgc-id', 'camera-panel:front');
    expect(video.srcObject).toBe(stream);
    fireEvent.playing(video);
    expect(container.querySelector('[data-xgc-role="camera-video-live"]')).toHaveTextContent('front');
    expect(container.querySelector('[data-xgc-role="camera-video-live"]'))
      .toHaveAttribute('data-xgc-id', 'camera-panel');
    fireEvent.waiting(video);
    expect(container.querySelector('[data-xgc-role="camera-video-panel"]')).toHaveAttribute('data-state', 'waiting');
    fireEvent.playing(video);
    act(() => track.dispatchEvent(new Event('mute')));
    expect(container.querySelector('[data-xgc-role="camera-video-panel"]')).toHaveAttribute('data-state', 'waiting');
  });

  it('reports decoded video dimensions and measured presented-frame rate', async () => {
    let frameCallback: VideoFrameRequestCallback | undefined;
    const onPlaybackMetricsChange = vi.fn();
    const { container } = render(<CameraVideoPanel
      panel={panel('http://192.0.2.20:18090/', 'front')}
      context={panelContext}
      onPlaybackMetricsChange={onPlaybackMetricsChange}
    />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    const video = container.querySelector('[data-xgc-role="camera-video-stream"]') as HTMLVideoElement;
    Object.defineProperties(video, {
      videoWidth:{ configurable:true,value:3840 },
      videoHeight:{ configurable:true,value:2160 },
      requestVideoFrameCallback:{ configurable:true,value:vi.fn((callback:VideoFrameRequestCallback) => {
        frameCallback = callback;
        return 1;
      }) },
      cancelVideoFrameCallback:{ configurable:true,value:vi.fn() },
    });

    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(onPlaybackMetricsChange).toHaveBeenLastCalledWith({
      width:3840,height:2160,
    }));
    fireEvent.playing(video);
    await waitFor(() => expect(frameCallback).toBeDefined());
    act(() => frameCallback?.(1_000, { presentedFrames:10 } as VideoFrameCallbackMetadata));
    act(() => frameCallback?.(2_000, { presentedFrames:40 } as VideoFrameCallbackMetadata));
    await waitFor(() => expect(onPlaybackMetricsChange).toHaveBeenLastCalledWith({
      width:3840,height:2160,fps:30,
    }));
  });

  it('keeps playing after decode starts when the remote track arrives before negotiation reports connected', async () => {
    const stream = { id: 'early-track-stream' } as MediaStream;
    const track = Object.assign(new EventTarget(), { id: 'early-video-track' }) as MediaStreamTrack;
    mediaMocks.createSession.mockImplementationOnce(async (options) => {
      options.onTrack(stream, track);
      options.onStateChange?.('connected');
      return sessionHandle();
    });

    const { container } = render(<CameraVideoPanel panel={panel()} context={panelContext} />);

    await waitFor(() => expect((container.querySelector(
      '[data-xgc-role="camera-video-stream"]',
    ) as HTMLVideoElement).srcObject).toBe(stream));
    fireEvent.playing(container.querySelector('[data-xgc-role="camera-video-stream"]') as HTMLVideoElement);
    expect(container.querySelector(
      '[data-xgc-role="camera-video-panel"]',
    )).toHaveAttribute('data-state', 'playing');
    const video = container.querySelector('[data-xgc-role="camera-video-stream"]') as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);
  });

  it('keeps the existing session and stream across document visibility changes', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mediaMocks.createSession.mockResolvedValue(sessionHandle(close));
    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const view = render(<CameraVideoPanel panel={panel()} context={panelContext} />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    const options = mediaMocks.createSession.mock.calls[0][0];
    const signal = options.signal as AbortSignal;
    const stream = { id: 'persistent-stream' } as MediaStream;
    const track = Object.assign(new EventTarget(), { id: 'persistent-track' }) as MediaStreamTrack;
    act(() => options.onTrack(stream, track));
    const video = view.container.querySelector(
      '[data-xgc-role="camera-video-stream"]',
    ) as HTMLVideoElement;

    try {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(mediaMocks.createSession).toHaveBeenCalledOnce();
      expect(signal.aborted).toBe(false);
      expect(close).not.toHaveBeenCalled();
      expect(video.srcObject).toBe(stream);

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(mediaMocks.createSession).toHaveBeenCalledOnce();
      expect(signal.aborted).toBe(false);
      expect(close).not.toHaveBeenCalled();
      expect(video.srcObject).toBe(stream);
    } finally {
      if (originalVisibility) {
        Object.defineProperty(document, 'visibilityState', originalVisibility);
      } else {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    }

    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith('consumer-unmounted');
  });

  it('does not negotiate until both direct connection fields are valid', () => {
    const view = render(<CameraVideoPanel panel={panel('', 'front')} context={panelContext} />);
    expect(screen.getByText('Configure Media Edge')).toBeInTheDocument();
    expect(mediaMocks.createSession).not.toHaveBeenCalled();

    view.rerender(<CameraVideoPanel
      panel={panel('http://edge.example:18090/path', 'front')}
      context={panelContext}
    />);
    expect(screen.getByText('Invalid Media Edge URL')).toBeInTheDocument();
    expect(mediaMocks.createSession).not.toHaveBeenCalled();

    view.rerender(<CameraVideoPanel
      panel={panel('http://edge.example:18090', '../front')}
      context={panelContext}
    />);
    expect(screen.getByText('Invalid camera source')).toBeInTheDocument();
    expect(mediaMocks.createSession).not.toHaveBeenCalled();
  });

  it('shows a failed state without an in-body retry when an established remote track ends', async () => {
    const view = render(<CameraVideoPanel panel={panel()} context={panelContext} />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    const options = mediaMocks.createSession.mock.calls[0][0];
    const track = Object.assign(new EventTarget(), { id: 'video-track' }) as MediaStreamTrack;
    act(() => options.onTrack({ id: 'stream' } as MediaStream, track));
    act(() => track.dispatchEvent(new Event('ended')));

    expect(screen.getByText('The remote video track ended.')).toBeInTheDocument();
    expect(view.container.querySelector('[data-xgc-role="camera-video-panel"]')).toHaveAttribute('data-state', 'failed');
    expect(view.container.querySelector('[data-xgc-role="camera-video-retry"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

    view.rerender(<CameraVideoPanel panel={panel()} context={panelContext} connectionAttempt={1} />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledTimes(2));
  });

  it('aborts and closes the session when the configured source changes', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mediaMocks.createSession.mockResolvedValue(sessionHandle(close));
    const view = render(<CameraVideoPanel panel={panel()} context={panelContext} />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    const firstSignal = mediaMocks.createSession.mock.calls[0][0].signal as AbortSignal;

    view.rerender(<CameraVideoPanel
      panel={panel('http://192.0.2.21:18091', 'rear')}
      context={panelContext}
    />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith('consumer-unmounted');
    expect(mediaMocks.createSession.mock.calls[1][0]).toMatchObject({
      edgeUrl: 'http://192.0.2.21:18091',
      sourceId: 'rear',
    });
  });

  it('closes tracks locally without remote release when the typed owner is stopping',async () => {
    const close=vi.fn().mockResolvedValue(undefined);
    mediaMocks.createSession.mockResolvedValue(sessionHandle(close));
    const track={
      addEventListener:vi.fn(),removeEventListener:vi.fn(),stop:vi.fn(),
    } as unknown as MediaStreamTrack;
    const view=render(<CameraVideoPanel panel={panel()} context={panelContext}
      ownerLifecycle="running" />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    const options=mediaMocks.createSession.mock.calls[0][0];
    act(() => options.onTrack({ id:'stream' } as MediaStream,track));
    view.rerender(<CameraVideoPanel panel={panel()} context={panelContext}
      connectionEnabled={false} ownerLifecycle="stopping" />);
    expect(close).toHaveBeenCalledWith('owner-stopping');
    expect(track.removeEventListener).toHaveBeenCalledWith('mute',expect.any(Function));
    expect(track.removeEventListener).toHaveBeenCalledWith('ended',expect.any(Function));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mediaMocks.createSession).toHaveBeenCalledOnce();
  });

  it('fills the panel with cover and does not letterbox a connecting pad', async () => {
    const { container } = render(<CameraVideoPanel
      panel={panel('http://192.0.2.20:18090', 'gazebo_world_camera', { imageFit: 'cover' })}
      context={panelContext}
    />);
    const root = container.querySelector('[data-xgc-role="camera-video-panel"]');
    expect(root).toHaveAttribute('data-state', 'connecting');
    expect(root).toHaveAttribute('data-image-fit', 'cover');
    expect(root).toHaveAttribute('data-has-frame', 'false');
    expect(screen.getByText('Connecting to gazebo_world_camera')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    const rootStyle = getComputedStyle(root as HTMLElement);
    expect(rootStyle.backgroundColor).not.toBe('rgb(0, 0, 0)');
    expect(rootStyle.backgroundColor).not.toBe('#000');
    expect(rootStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 1)');
    const video = container.querySelector('[data-xgc-role="camera-video-stream"]') as HTMLVideoElement;
    expect(video.getAttribute('poster') ?? '').toMatch(/^data:image\/gif;base64,/);
    expect(video.style.width).toBe('');
    expect(video.style.height).toBe('');
    expect(video.style.objectFit).toBe('');

    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledOnce());
    fireEvent.playing(video);
    expect(root).toHaveAttribute('data-state', 'playing');
    expect(root).toHaveAttribute('data-image-fit', 'cover');
    expect(video.style.objectFit).not.toBe('contain');
  });

  it('keeps an early connection failure inside the expected contained video box',async () => {
    mediaMocks.createSession.mockRejectedValueOnce(new Error('Failed to fetch'));
    const bounds=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({
      x:0,y:0,top:0,left:0,right:800,bottom:600,width:800,height:600,
      toJSON:() => ({}),
    });
    try {
      const { container }=render(<CameraVideoPanel panel={panel()} context={panelContext}
        expectedSourceSize={{ width:3840,height:2160 }} />);
      expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
      const state=container.querySelector<HTMLElement>('[data-xgc-role="camera-video-state"]')!;
      await waitFor(() => expect(state.style.width).toBe('800px'));
      expect(state.style.height).toBe('450px');
      expect(state.style.justifySelf).toBe('center');
      expect(state.style.alignSelf).toBe('center');
    } finally {
      bounds.mockRestore();
    }
  });

  it('shows a negotiation error without an in-body retry', async () => {
    mediaMocks.createSession
      .mockRejectedValueOnce(new Error('remote answer rejected'))
      .mockResolvedValueOnce(sessionHandle());
    const view = render(<CameraVideoPanel panel={panel()} context={panelContext} />);

    expect(await screen.findByText('remote answer rejected')).toBeInTheDocument();
    expect(view.container.querySelector('[data-xgc-role="camera-video-retry"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

    view.rerender(<CameraVideoPanel panel={panel()} context={panelContext} connectionAttempt={1} />);
    await waitFor(() => expect(mediaMocks.createSession).toHaveBeenCalledTimes(2));
  });
});

function panel(
  edgeUrl = 'http://192.0.2.20:18090',
  sourceId = 'front',
  extra: Record<string, unknown> = {},
): PanelInstance {
  return {
    id: 'camera-panel',
    pluginId: 'camera-video',
    title: 'Camera video',
    gridPos: { x: 0,y: 0,w: 8,h: 5 },
    query: {},
    options: { edgeUrl,sourceId,...extra },
    fieldConfig: {},
    portBindings: [{ portId:'video',kind:'data',projection:'camera.video.v1' }],
  };
}

function sessionHandle(close = vi.fn().mockResolvedValue(undefined)): MediaEdgeSessionHandle {
  return {
    answer: {
      sessionId: '0123456789abcdef0123456789abcdef',
      sdp: 'v=0',
      dataChannelLabel: 'xgc-media-control.v1',
      source: {
        id: 'front',width: 1920,height: 1080,fps: 30,frameId: 'camera',codec: 'H264',
      },
    },
    close,
  };
}
