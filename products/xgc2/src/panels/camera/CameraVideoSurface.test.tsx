// @vitest-environment jsdom

import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import {
  CameraVideoSurface,
  type CameraVideoPresentation,
  type CameraVideoSessionFactory,
  type CameraVideoSource,
} from './cameraVideoPublic';
import type { CameraVideoObservationPort } from './cameraVideoSurfaceTypes';

// A standalone viewer must not load the station's execution/store module at all.
vi.mock('../../domains/execution/executionPublic',() => {
  throw new Error('CameraVideoSurface loaded station execution infrastructure');
});

type Session = Awaited<ReturnType<CameraVideoSessionFactory>>;
type SessionCallbacks = Parameters<CameraVideoSessionFactory>[0];
const presentation:CameraVideoPresentation={ imageFit:'contain',showMetadata:true,reconnectPolicy:'manual' };
const session=(close=vi.fn().mockResolvedValue(undefined)):Session => ({
  answer:{
    sessionId:'session-front',sdp:'v=0',dataChannelLabel:'xgc-media-control.v1',
    source:{ id:'front',width:3840,height:2160,fps:30,frameId:'camera',codec:'H264' },
  },close,
});
const ready=(openSession:CameraVideoSessionFactory,sessionKey='grant-a:process-a:front'):CameraVideoSource => ({
  kind:'ready',id:'front',label:'Front camera',sessionKey,openSession,
});
const videoIn=(container:HTMLElement) => container.querySelector<HTMLVideoElement>('video')!;
const track=() => Object.assign(new EventTarget(),{ stop:vi.fn() }) as unknown as MediaStreamTrack;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('standalone camera surface',() => {
  it('keeps a bound stream across host rerenders and uses the latest factory only for a new attempt',async () => {
    const first=session();
    const firstOpen=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(first);
    const nextOpen=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(session());
    const view=render(<CameraVideoSurface id="guest-camera" source={ready(firstOpen)} presentation={presentation} />);
    await waitFor(() => expect(firstOpen).toHaveBeenCalledOnce());
    const callbacks=firstOpen.mock.calls[0]![0];
    const stream={ id:'original' } as MediaStream;
    act(() => callbacks.onTrack(stream,track()));
    fireEvent.playing(videoIn(view.container));
    const onState=vi.fn();
    view.rerender(<CameraVideoSurface id="guest-camera" source={ready(nextOpen)}
      presentation={{ ...presentation,imageFit:'cover' }} onPlaybackStateChange={onState} />);
    expect(nextOpen).not.toHaveBeenCalled();
    expect(first.close).not.toHaveBeenCalled();
    expect(callbacks.signal?.aborted).toBe(false);
    expect(videoIn(view.container).srcObject).toBe(stream);
    expect(videoIn(view.container)).toHaveAccessibleName('Live video from Front camera');
    expect(onState).toHaveBeenLastCalledWith('playing');

    view.rerender(<CameraVideoSurface id="guest-camera" source={ready(nextOpen)}
      presentation={presentation} connectionAttempt={1} />);
    await waitFor(() => expect(nextOpen).toHaveBeenCalledOnce());
    expect(callbacks.signal?.aborted).toBe(true);
    expect(first.close).toHaveBeenCalledWith('consumer-unmounted');
  });

  it('replaces same-named sources across authorities and discards the old negotiation and callbacks',async () => {
    let resolveFirst!:(value:Session) => void;
    const firstOpen=vi.fn<CameraVideoSessionFactory>().mockReturnValue(new Promise((resolve) => { resolveFirst=resolve; }));
    const nextOpen=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(session());
    const view=render(<CameraVideoSurface id="camera" source={ready(firstOpen)} presentation={presentation} />);
    const oldCallbacks=firstOpen.mock.calls[0]![0];
    view.rerender(<CameraVideoSurface id="camera" source={ready(nextOpen,'grant-b:process-b:front')}
      presentation={presentation} />);
    await waitFor(() => expect(nextOpen).toHaveBeenCalledOnce());
    const stream={ id:'authorized-current' } as MediaStream;
    act(() => nextOpen.mock.calls[0]![0].onTrack(stream,track()));
    fireEvent.playing(videoIn(view.container));
    const lateTrack=track();
    act(() => {
      oldCallbacks.onTrack({ id:'old' } as MediaStream,lateTrack);
      oldCallbacks.onStateChange?.('failed');
    });
    const lateSession=session();
    await act(async () => { resolveFirst(lateSession); });
    expect(oldCallbacks.signal?.aborted).toBe(true);
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(lateSession.close).toHaveBeenCalledWith('consumer-unmounted');
    expect(videoIn(view.container).srcObject).toBe(stream);
    expect(view.container.querySelector('[data-xgc-role="camera-video-panel"]')).toHaveAttribute('data-state','playing');
  });

  it('preserves the exact owner-stopping reason when an in-flight session resolves late',async () => {
    let resolveSession!:(value:Session) => void;
    let callbacks!:SessionCallbacks;
    const open=vi.fn<CameraVideoSessionFactory>((input) => {
      callbacks=input;
      return new Promise((resolve) => { resolveSession=resolve; });
    });
    const view=render(<CameraVideoSurface id="camera" source={ready(open)} presentation={presentation} />);
    view.rerender(<CameraVideoSurface id="camera" source={ready(open)} presentation={presentation}
      ownerLifecycle="stopping" />);
    expect(callbacks.signal?.reason).toBe('owner-stopping');
    const lateSession=session();
    await act(async () => { resolveSession(lateSession); });
    expect(lateSession.close).toHaveBeenCalledExactlyOnceWith('owner-stopping');
    expect(open).toHaveBeenCalledOnce();
  });

  it('releases unavailable bindings and handles synchronous factory failures through the shared error view',async () => {
    const first=session();
    const open=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(first);
    const view=render(<CameraVideoSurface id="camera" source={ready(open)} presentation={presentation} />);
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    view.rerender(<CameraVideoSurface id="camera" presentation={presentation}
      source={{ kind:'waiting',id:'front',title:'Camera unavailable',description:'The bound source is offline.' }} />);
    expect(first.close).toHaveBeenCalledWith('consumer-unmounted');
    expect(screen.getByText('The bound source is offline.')).toBeInTheDocument();
    expect(open).toHaveBeenCalledOnce();
    const refused=vi.fn<CameraVideoSessionFactory>(() => { throw new Error('Source binding expired.'); });
    view.rerender(<CameraVideoSurface id="camera" source={ready(refused)} presentation={presentation} />);
    expect(await screen.findByText('Source binding expired.')).toBeInTheDocument();
    expect(refused).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-xgc-role="camera-video-panel"]')).toHaveAttribute('data-state','failed');
  });

  it('uses the existing reconnect delay and latest bound factory without reconnecting on the host render',async () => {
    vi.useFakeTimers();
    const rejected=vi.fn<CameraVideoSessionFactory>().mockRejectedValue(new Error('Transport unavailable.'));
    const automatic:CameraVideoPresentation={ ...presentation,reconnectPolicy:'automatic' };
    const view=render(<CameraVideoSurface id="camera" source={ready(rejected)} presentation={automatic} />);
    await act(async () => { await Promise.resolve(); });
    const recovered=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(session());
    view.rerender(<CameraVideoSurface id="camera" source={ready(recovered)} presentation={automatic} />);
    expect(recovered).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_999); });
    expect(recovered).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(recovered).toHaveBeenCalledOnce();
  });

  it('latches the actual native display A while B arrives before asynchronous encoding completes',async () => {
    const frames=canvasFrames();
    let port:CameraVideoObservationPort|undefined;
    const receive=vi.fn((next:CameraVideoObservationPort|undefined) => { port=next; });
    const open=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(session());
    const view=render(<CameraVideoSurface id="calibration" source={ready(open)} presentation={presentation} onObservationPortChange={receive} />);
    const video=videoIn(view.container);
    Object.defineProperties(video,{ videoWidth:{ value:3840,configurable:true },videoHeight:{ value:2160,configurable:true } });
    act(() => open.mock.calls[0]![0].onTrack({} as MediaStream,track()));
    fireEvent.loadedMetadata(video);fireEvent.playing(video);
    frames.present('A');
    const canvas=view.container.querySelector<HTMLCanvasElement>('canvas')!;
    vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({ x:10,y:20,left:10,top:20,width:400,height:400,right:410,bottom:420,toJSON:() => ({}) });
    expect(canvas.width).toBe(3840);expect(canvas.height).toBe(2160);
    expect(video).toHaveAttribute('aria-hidden','true');
    expect(port?.latch(210,40)).toBeUndefined(); // outside the contained 16:9 image
    const captured=port!.latch(210,220)!;
    expect(captured.pixel).toEqual([1920,1080]);
    const displayA=captured.display.id;
    const encoded=captured.encode();
    frames.present('B');
    expect(port!.latch(210,220)!.display.id).not.toBe(displayA);
    expect(frames.pixels.get(canvas)).toBe('B');
    frames.finishEncoding();
    const blob=await encoded;
    expect(await readBlob(blob)).toBe('A');
    expect(captured.display).toMatchObject({ width:3840,height:2160,sourceId:'front',clockDomain:'browser-performance',mediaTimeSec:0 });
    captured.release();
    await expect(captured.encode()).rejects.toMatchObject({ name:'AbortError' });
    expect(open).toHaveBeenCalledOnce();
  });

  it('revokes the old display port immediately on source/owner change and changes epoch on reconnect',async () => {
    const frames=canvasFrames();
    let port:CameraVideoObservationPort|undefined;
    const receive=(next:CameraVideoObservationPort|undefined) => { port=next; };
    const open=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(session());
    const view=render(<CameraVideoSurface id="calibration" source={ready(open)} presentation={presentation} onObservationPortChange={receive} />);
    const video=videoIn(view.container);
    Object.defineProperties(video,{ videoWidth:{ value:3840 },videoHeight:{ value:2160 } });
    act(() => open.mock.calls[0]![0].onTrack({} as MediaStream,track()));
    fireEvent.playing(video);frames.present('A');
    const first=port!;
    view.rerender(<CameraVideoSurface id="calibration" source={ready(open,'different-owner')} presentation={presentation} onObservationPortChange={receive} />);
    expect(port).toBeUndefined();expect(first.latch(0,0)).toBeUndefined();
    act(() => open.mock.calls[1]![0].onTrack({} as MediaStream,track()));
    fireEvent.playing(video);frames.present('B');
    expect(port!.sourceEpoch).not.toBe(first.sourceEpoch);
    view.unmount();expect(port).toBeUndefined();
  });

  it('does no canvas work for the ordinary or read-only viewer',async () => {
    const frames=canvasFrames();
    const open=vi.fn<CameraVideoSessionFactory>().mockResolvedValue(session());
    const view=render(<CameraVideoSurface id="ordinary" source={ready(open)} presentation={presentation} />);
    const video=videoIn(view.container);
    Object.defineProperties(video,{ videoWidth:{ value:3840 },videoHeight:{ value:2160 } });
    act(() => open.mock.calls[0]![0].onTrack({} as MediaStream,track()));
    fireEvent.playing(video);frames.present('A');
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(video).not.toHaveAttribute('aria-hidden');
  });
});

function canvasFrames() {
  const callbacks=new Map<number,VideoFrameRequestCallback>();
  const pixels=new Map<HTMLCanvasElement,string>();
  let sequence=0,frame='';
  const encoders:Array<() => void>=[];
  if (!HTMLVideoElement.prototype.requestVideoFrameCallback) Object.defineProperty(HTMLVideoElement.prototype,'requestVideoFrameCallback',{ configurable:true,value:() => 0 });
  if (!HTMLVideoElement.prototype.cancelVideoFrameCallback) Object.defineProperty(HTMLVideoElement.prototype,'cancelVideoFrameCallback',{ configurable:true,value:() => undefined });
  vi.spyOn(HTMLVideoElement.prototype,'requestVideoFrameCallback').mockImplementation(function(callback) {
    const id=++sequence;callbacks.set(id,callback);return id;
  });
  vi.spyOn(HTMLVideoElement.prototype,'cancelVideoFrameCallback').mockImplementation((id) => { callbacks.delete(id); });
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement) {
    return { drawImage:(source:CanvasImageSource) => pixels.set(this,source instanceof HTMLCanvasElement ? pixels.get(source)! : frame) } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(this:HTMLCanvasElement,callback,type) {
    const frozen=pixels.get(this);encoders.push(() => callback(new Blob([frozen ?? ''],{ type })));
  });
  return { pixels,finishEncoding:() => encoders.splice(0).forEach((encode) => encode()),present:(value:string) => {
    frame=value;
    act(() => { for (const [id,callback] of [...callbacks]) {
      callbacks.delete(id);callback(sequence,{ mediaTime:0,presentedFrames:sequence } as VideoFrameCallbackMetadata);
    } });
  } };
}

function readBlob(blob:Blob) {
  return new Promise<string>((resolve,reject) => {
    const reader=new FileReader();reader.onload=() => resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob);
  });
}
