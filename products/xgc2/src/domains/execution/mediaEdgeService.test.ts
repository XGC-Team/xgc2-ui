// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import { requestExternalJSON } from '../../api/http';
import {
  MEDIA_EDGE_CONTROL_DATA_CHANNEL,
  closeMediaEdgeSession,
  createMediaEdgeSession,
  createMediaEdgeSessionController,
  decodeMediaEdgeSessionAnswer,
  mediaEdgeSessionURL,
  mediaEdgeSourceSessionsURL,
  normalizeMediaEdgeURL,
  openMediaEdgeSession,
  type MediaEdgeSessionAnswer,
} from './mediaEdgeService';

vi.mock('../../api/http', () => ({ requestExternalJSON: vi.fn() }));

const reference = {
  edgeUrl: 'http://192.0.2.20:18090/',
  sourceId: 'front.camera',
};
const normalizedReference = {
  edgeUrl: 'http://192.0.2.20:18090',
  sourceId: 'front.camera',
};

describe('mediaEdgeService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens and closes a strictly decoded session through the selected edge', async () => {
    vi.mocked(requestExternalJSON)
      .mockResolvedValueOnce(answerPayload())
      .mockResolvedValueOnce(undefined);
    const signal = new AbortController().signal;

    await expect(openMediaEdgeSession(reference, 'v=0\\r\\no=browser', signal))
      .resolves.toEqual(answer());
    expect(requestExternalJSON).toHaveBeenNthCalledWith(
      1,
      'http://192.0.2.20:18090/api/v1/sources/front.camera/sessions',
      {
        method: 'POST',cache: 'no-store',
        body: JSON.stringify({ sdp: 'v=0\\r\\no=browser' }),signal,
      },
    );

    await closeMediaEdgeSession(reference, '0123456789abcdef0123456789abcdef', signal);
    expect(requestExternalJSON).toHaveBeenNthCalledWith(
      2,
      'http://192.0.2.20:18090/api/v1/sessions/0123456789abcdef0123456789abcdef',
      { method: 'DELETE',cache: 'no-store',signal },
    );
  });

  it('normalizes one strict HTTP origin and validates media IDs before requesting', async () => {
    expect(normalizeMediaEdgeURL('https://EDGE.example:18443/')).toBe('https://edge.example:18443');
    expect(mediaEdgeSourceSessionsURL(reference))
      .toBe('http://192.0.2.20:18090/api/v1/sources/front.camera/sessions');
    expect(mediaEdgeSessionURL(reference, 'session-1'))
      .toBe('http://192.0.2.20:18090/api/v1/sessions/session-1');
    expect(() => mediaEdgeSourceSessionsURL({ ...reference,sourceId: 'front/camera' }))
      .toThrow(/sourceId/);
    expect(() => mediaEdgeSessionURL(reference, ''))
      .toThrow(/sessionId/);
    for (const edgeUrl of [
      '/edge',
      'ftp://192.0.2.20:18090',
      ' http://192.0.2.20:18090',
      'http://operator:secret@192.0.2.20:18090',
      'http://192.0.2.20:18090/control',
      'http://192.0.2.20:18090/.',
      'http://192.0.2.20:18090/%2e',
      'http://192.0.2.20:18090?source=front',
      'http://192.0.2.20:18090#front',
    ]) {
      expect(() => mediaEdgeSourceSessionsURL({ ...reference,edgeUrl })).toThrow(/edgeUrl/);
    }
    await expect(openMediaEdgeSession(reference, '   ')).rejects.toThrow(/offer\.sdp/);
    expect(requestExternalJSON).not.toHaveBeenCalled();
  });

  it('rejects malformed or mismatched answers instead of guessing protocol fields', () => {
    const invalid: unknown[] = [
      { ...answerPayload(),extra: true },
      { ...answerPayload(),sessionId: 'bad/session' },
      { ...answerPayload(),sdp: '' },
      { ...answerPayload(),dataChannelLabel: 'legacy-control' },
      { ...answerPayload(),source: { ...answerPayload().source,id: 'other' } },
      { ...answerPayload(),source: { ...answerPayload().source,width: 12 } },
      { ...answerPayload(),source: { ...answerPayload().source,height: 9000 } },
      { ...answerPayload(),source: { ...answerPayload().source,fps: Number.NaN } },
      { ...answerPayload(),source: { ...answerPayload().source,codec: 'VP8' } },
      { ...answerPayload(),source: { ...answerPayload().source,unknown: true } },
    ];
    for (const value of invalid) {
      expect(() => decodeMediaEdgeSessionAnswer(value, reference.sourceId)).toThrow();
    }
    expect(() => decodeMediaEdgeSessionAnswer(null)).toThrow(/must be an object/);
  });

  it('negotiates recvonly video, waits for ICE, and delivers a one-track MediaStream', async () => {
    vi.mocked(requestExternalJSON)
      .mockResolvedValueOnce(answerPayload())
      .mockResolvedValueOnce(undefined);
    const peer = new FakePeerConnection('gathering');
    const track = { id: 'camera-track' } as MediaStreamTrack;
    const stream = { id: 'camera-stream' } as MediaStream;
    const mediaStreamFactory = vi.fn(() => stream);
    const onStream = vi.fn();
    const controller = createMediaEdgeSessionController(
      { reference,onStream },
      {
        peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
        mediaStreamFactory,
      },
    );

    const connecting = controller.connect();
    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalledOnce());
    expect(requestExternalJSON).not.toHaveBeenCalled();
    peer.completeICE();
    await expect(connecting).resolves.toEqual(answer());

    expect(peer.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',sdp: 'v=0\\r\\no=edge',
    });
    peer.emitTrack(track);
    expect(mediaStreamFactory).toHaveBeenCalledWith([track]);
    expect(onStream).toHaveBeenCalledWith(stream, track);

    const firstClose = controller.close();
    const secondClose = controller.close();
    expect(secondClose).toBe(firstClose);
    await firstClose;
    expect(peer.close).toHaveBeenCalledOnce();
    expect(vi.mocked(requestExternalJSON).mock.calls.filter(([,init]) => init?.method === 'DELETE')).toHaveLength(1);
    peer.emitTrack(track);
    expect(onStream).toHaveBeenCalledOnce();
    await expect(controller.connect()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts ICE gathering and closes locally without creating a remote session', async () => {
    const peer = new FakePeerConnection('gathering');
    const controller = createMediaEdgeSessionController(
      { reference,onStream: vi.fn() },
      { peerConnectionFactory: () => peer as unknown as RTCPeerConnection },
    );

    const connecting = controller.connect();
    await vi.waitFor(() => expect(peer.setLocalDescription).toHaveBeenCalledOnce());
    const closing = controller.close();
    await expect(connecting).rejects.toMatchObject({ name: 'AbortError' });
    await closing;

    expect(peer.close).toHaveBeenCalledOnce();
    expect(requestExternalJSON).not.toHaveBeenCalled();
  });

  it('waits for an in-flight answer so close can delete the exact remote session', async () => {
    const peer = new FakePeerConnection('complete');
    const pending = deferred<MediaEdgeSessionAnswer>();
    let negotiationSignal: AbortSignal | undefined;
    const openSession = vi.fn((_reference: typeof reference,_sdp: string,signal?: AbortSignal) => {
      negotiationSignal = signal;
      return pending.promise;
    });
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const controller = createMediaEdgeSessionController(
      { reference,onStream: vi.fn() },
      {
        peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
        openSession,
        closeSession,
      },
    );

    const connecting = controller.connect();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());
    const firstClose = controller.close();
    const secondClose = controller.close();
    expect(negotiationSignal?.aborted).toBe(false);
    pending.resolve(answer());

    await expect(connecting).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.all([firstClose,secondClose]);
    expect(closeSession).toHaveBeenCalledOnce();
    expect(closeSession).toHaveBeenCalledWith(normalizedReference, answer().sessionId);
    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('supports effect cleanup while the session POST is still in flight', async () => {
    const peer = new FakePeerConnection('complete');
    const pending = deferred<MediaEdgeSessionAnswer>();
    let negotiationSignal: AbortSignal | undefined;
    const openSession = vi.fn((_reference: typeof reference,_sdp: string,signal?: AbortSignal) => {
      negotiationSignal = signal;
      return pending.promise;
    });
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const abort = new AbortController();
    const onStateChange = vi.fn();
    const opening = createMediaEdgeSession(
      {
        ...reference,
        onTrack: vi.fn(),
        onStateChange,
        signal: abort.signal,
      },
      {
        peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
        openSession,
        closeSession,
      },
    );

    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());
    abort.abort();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(negotiationSignal?.aborted).toBe(false);
    pending.resolve(answer());

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(closeSession).toHaveBeenCalledOnce();
    expect(closeSession).toHaveBeenCalledWith(normalizedReference, answer().sessionId);
    expect(peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(onStateChange.mock.calls.map(([state]) => state))
      .toEqual(['connecting','closed']);
  });

  it('closes local receiver and delivered tracks without DELETE when the owner is stopping', async () => {
    const peer = new FakePeerConnection('complete');
    const receiverTrack = { stop:vi.fn() } as unknown as MediaStreamTrack;
    const deliveredTrack = Object.assign(new EventTarget(),{ stop:vi.fn() }) as unknown as MediaStreamTrack;
    peer.getReceivers.mockReturnValue([{ track:receiverTrack }] as RTCRtpReceiver[]);
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const controller = createMediaEdgeSessionController({ reference,onStream:vi.fn() },{
      peerConnectionFactory:() => peer as unknown as RTCPeerConnection,
      mediaStreamFactory:() => ({ id:'stream' }) as MediaStream,
      openSession:vi.fn().mockResolvedValue(answer()),closeSession,
    });
    await controller.connect();
    peer.emitTrack(deliveredTrack);
    await controller.close('owner-stopping');
    expect(peer.close).toHaveBeenCalledOnce();
    expect(receiverTrack.stop).toHaveBeenCalledOnce();
    expect(deliveredTrack.stop).toHaveBeenCalledOnce();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it('aborts an owner-stopping POST and still skips DELETE if the server accepts it', async () => {
    const peer = new FakePeerConnection('complete');
    const pending = deferred<MediaEdgeSessionAnswer>();
    const closeSession = vi.fn().mockResolvedValue(undefined);
    let negotiationSignal: AbortSignal | undefined;
    const openSession = vi.fn((_reference: typeof reference,_sdp: string,signal?: AbortSignal) => {
      negotiationSignal = signal;
      return pending.promise;
    });
    const abort = new AbortController();
    const opening = createMediaEdgeSession({
      ...reference,onTrack:vi.fn(),signal:abort.signal,
    },{
      peerConnectionFactory:() => peer as unknown as RTCPeerConnection,
      openSession,closeSession,
    });
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());
    abort.abort('owner-stopping');
    expect(negotiationSignal?.aborted).toBe(true);
    pending.resolve(answer());
    await expect(opening).rejects.toMatchObject({ name:'AbortError' });
    expect(peer.close).toHaveBeenCalledOnce();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it('returns an idempotent session handle and reports connected lifecycle state', async () => {
    const peer = new FakePeerConnection('complete');
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const onStateChange = vi.fn();
    const handle = await createMediaEdgeSession(
      { ...reference,onTrack: vi.fn(),onStateChange },
      {
        peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
        openSession: vi.fn().mockResolvedValue(answer()),
        closeSession,
      },
    );

    expect(handle.answer).toEqual(answer());
    expect(onStateChange.mock.calls.map(([state]) => state))
      .toEqual(['connecting','connected']);
    const firstClose = handle.close();
    const secondClose = handle.close();
    expect(secondClose).toBe(firstClose);
    await firstClose;
    expect(closeSession).toHaveBeenCalledOnce();
    expect(onStateChange.mock.calls.map(([state]) => state))
      .toEqual(['connecting','connected','closed']);
  });

  it('reports a failed peer and releases its remote session', async () => {
    const peer = new FakePeerConnection('complete');
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const onStateChange = vi.fn();
    const handle = await createMediaEdgeSession(
      { ...reference,onTrack: vi.fn(),onStateChange },
      {
        peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
        openSession: vi.fn().mockResolvedValue(answer()),
        closeSession,
      },
    );

    peer.fail();
    await vi.waitFor(() => expect(closeSession).toHaveBeenCalledOnce());
    expect(onStateChange.mock.calls.map(([state]) => state))
      .toEqual(['connecting','connected','failed','closed']);
    await handle.close();
    expect(closeSession).toHaveBeenCalledOnce();
  });

  it('deletes an opened session when applying the remote answer fails', async () => {
    vi.mocked(requestExternalJSON)
      .mockResolvedValueOnce(answerPayload())
      .mockResolvedValueOnce(undefined);
    const peer = new FakePeerConnection('complete');
    peer.setRemoteDescription.mockRejectedValueOnce(new Error('invalid remote answer'));
    const controller = createMediaEdgeSessionController(
      { reference,onStream: vi.fn() },
      { peerConnectionFactory: () => peer as unknown as RTCPeerConnection },
    );

    await expect(controller.connect()).rejects.toThrow('invalid remote answer');
    expect(peer.close).toHaveBeenCalledOnce();
    expect(requestExternalJSON).toHaveBeenNthCalledWith(
      2,
      mediaEdgeSessionURL(reference, answer().sessionId),
      { method: 'DELETE',cache: 'no-store',signal: undefined },
    );
    await controller.close();
    expect(requestExternalJSON).toHaveBeenCalledTimes(2);
  });
});

class FakePeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState;
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescription | null = null;
  readonly addTransceiver = vi.fn();
  readonly createOffer = vi.fn(async () => ({ type: 'offer',sdp: 'v=0\\r\\no=initial' } as RTCSessionDescriptionInit));
  readonly setLocalDescription = vi.fn(async (_description: RTCSessionDescriptionInit) => {
    this.localDescription = {
      type: 'offer',sdp: 'v=0\\r\\no=browser-with-candidates',
    } as RTCSessionDescription;
  });
  readonly setRemoteDescription = vi.fn(async (_description: RTCSessionDescriptionInit) => undefined);
  readonly getReceivers = vi.fn(() => [] as RTCRtpReceiver[]);
  readonly close = vi.fn();

  constructor(state: RTCIceGatheringState) {
    super();
    this.iceGatheringState = state;
  }

  completeICE() {
    this.iceGatheringState = 'complete';
    this.dispatchEvent(new Event('icegatheringstatechange'));
  }

  emitTrack(track: MediaStreamTrack) {
    this.dispatchEvent(Object.assign(new Event('track'), { track }));
  }

  fail() {
    this.connectionState = 'failed';
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

function answerPayload(): MediaEdgeSessionAnswer {
  return {
    sessionId: '0123456789abcdef0123456789abcdef',
    sdp: 'v=0\\r\\no=edge',
    dataChannelLabel: MEDIA_EDGE_CONTROL_DATA_CHANNEL,
    source: {
      id: 'front.camera',width: 1920,height: 1080,fps: 30,
      frameId: 'front_camera_optical_frame',codec: 'H264',
    },
  };
}

function answer(): MediaEdgeSessionAnswer {
  return answerPayload();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => { resolve = onResolve; });
  return { promise,resolve };
}
