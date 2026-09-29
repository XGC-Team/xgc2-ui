// @vitest-environment jsdom

import { act,cleanup,fireEvent,render,waitFor } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import {
  CameraVideoSurface,
  type CameraVideoPresentation,
  type CameraVideoSessionFactory,
  type CameraVideoSource,
} from './cameraVideoPublic';

vi.mock('../../domains/execution/executionPublic',() => {
  throw new Error('CameraVideoSurface loaded station execution infrastructure');
});

const presentation:CameraVideoPresentation={
  imageFit:'contain',
  showMetadata:true,
  reconnectPolicy:'manual',
};

const ready=(openSession:CameraVideoSessionFactory):CameraVideoSource => ({
  kind:'ready',
  id:'front',
  sessionKey:'grant-a:process-a:front',
  openSession,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('camera playback metrics liveness',() => {
  it('expires measured FPS when decoded presentation stops',async () => {
    let frameCallback:VideoFrameRequestCallback|undefined;
    const onPlaybackMetricsChange=vi.fn();
    const open=vi.fn<CameraVideoSessionFactory>().mockResolvedValue({
      answer:{
        sessionId:'session-front',
        sdp:'v=0',
        dataChannelLabel:'xgc-media-control.v1',
        source:{ id:'front',width:3840,height:2160,fps:30,frameId:'camera',codec:'H264' },
      },
      close:vi.fn().mockResolvedValue(undefined),
    });
    const view=render(<CameraVideoSurface id="camera" source={ready(open)}
      presentation={presentation} onPlaybackMetricsChange={onPlaybackMetricsChange} />);
    await waitFor(() => expect(open).toHaveBeenCalledOnce());

    const video=view.container.querySelector<HTMLVideoElement>('video')!;
    Object.defineProperties(video,{
      videoWidth:{ configurable:true,value:3840 },
      videoHeight:{ configurable:true,value:2160 },
      requestVideoFrameCallback:{ configurable:true,value:vi.fn((callback:VideoFrameRequestCallback) => {
        frameCallback=callback;
        return 1;
      }) },
      cancelVideoFrameCallback:{ configurable:true,value:vi.fn() },
    });

    act(() => open.mock.calls[0]![0].onTrack({ id:'stream' } as MediaStream,
      Object.assign(new EventTarget(),{ stop:vi.fn() }) as unknown as MediaStreamTrack));
    fireEvent.loadedMetadata(video);
    fireEvent.playing(video);
    await waitFor(() => expect(frameCallback).toBeDefined());

    act(() => frameCallback?.(1_000,{ presentedFrames:10 } as VideoFrameCallbackMetadata));
    act(() => frameCallback?.(2_000,{ presentedFrames:40 } as VideoFrameCallbackMetadata));
    await waitFor(() => expect(onPlaybackMetricsChange).toHaveBeenLastCalledWith({
      width:3840,height:2160,fps:30,
    }));

    fireEvent.waiting(video);
    await waitFor(() => expect(onPlaybackMetricsChange).toHaveBeenLastCalledWith({
      width:3840,height:2160,
    }));
  });
});
