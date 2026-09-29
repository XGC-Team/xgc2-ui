// @vitest-environment jsdom

import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { DEFAULT_LOCAL_MEDIA_EDGE_URL } from '../../config/urls';
import type { CreateMediaEdgeSessionOptions,MediaEdgeSessionHandle } from '../../domains/execution/mediaEdgePublic';
import type { SharedSurfaceClient,SharedSurfaceProjection } from '../../shared/sharedSurface';
import { SharedCameraSurface } from './SharedCameraSurface';

const media=vi.hoisted(() => ({ createSession:vi.fn() }));
vi.mock('../../domains/execution/mediaEdgePublic',async (importOriginal) => ({
  ...await importOriginal() as Record<string,unknown>,
  createMediaEdgeSession:media.createSession,
}));
vi.mock('../../domains/execution/executionPublic',() => {
  throw new Error('Scoped camera must not load station execution stores');
});

const createObjectURL=vi.fn();
const revokeObjectURL=vi.fn();
const answer={
  sessionId:'media-session',sdp:'v=0',dataChannelLabel:'xgc-media-control.v1' as const,
  source:{ id:'front',width:3840,height:2160,fps:30,frameId:'camera',codec:'H264' as const },
};
const handle=():MediaEdgeSessionHandle => ({ answer,close:vi.fn().mockResolvedValue(undefined) });
function projection(overrides:Partial<SharedSurfaceProjection>={}):SharedSurfaceProjection {
  return {
    contractVersion:1,moduleId:'experiment.camera',viewContractVersion:1,
    entryId:'entry-a',name:'Inspection camera',expiresAt:'2030-01-01T00:00:00Z',
    actions:['surface.read','camera.live','camera.snapshot'],
    surface:{ kind:'experiment-panel',experimentId:'experiment-a',sessionId:'run-a',panelId:'panel-a' },
    panel:{ id:'panel-a',pluginId:'camera-intrinsic-calibration',title:'Front inspection camera' },
    media:{ sourceId:'front',processInstanceId:'media-owned-a',
      sessionsPath:`${DEFAULT_LOCAL_MEDIA_EDGE_URL}/never-consume`,sessionPathPrefix:'/legacy/never-consume',
      snapshotPath:`${DEFAULT_LOCAL_MEDIA_EDGE_URL}/never-consume.jpg` },
    endpoints:[
      { id:'media.open',method:'POST',path:'/api/access/entry/media/sessions',protocol:'webrtc',action:'camera.live' },
      { id:'media.close',method:'DELETE',path:'/api/access/entry/media/sessions/:sessionId',protocol:'webrtc',action:'camera.live' },
      { id:'media.snapshot',method:'GET',path:'/api/access/entry/media/snapshot.jpg',protocol:'http',action:'camera.snapshot' },
    ],...overrides,
  };
}
function client() {
  return { request:vi.fn<SharedSurfaceClient['request']>() };
}
function snapshotResponse() {
  return new Response(new Uint8Array([1,2,3]),{ headers:{ 'Content-Type':'image/jpeg' } });
}

beforeEach(() => {
  media.createSession.mockReset().mockResolvedValue(handle());
  createObjectURL.mockReset().mockReturnValue('blob:snapshot-a');
  revokeObjectURL.mockReset();
  vi.stubGlobal('URL',class extends URL {
    static createObjectURL=createObjectURL;
    static revokeObjectURL=revokeObjectURL;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shared camera owner adapter',() => {
  it('reuses the mature viewer and signals only through granted endpoint IDs with exact source decoding',async () => {
    const transport=client();
    transport.request.mockResolvedValueOnce(Response.json(answer)).mockResolvedValueOnce(new Response(null,{ status:204 }));
    const view=render(<SharedCameraSurface projection={projection()} client={transport} />);
    await waitFor(() => expect(media.createSession).toHaveBeenCalledOnce());
    const options=media.createSession.mock.calls[0]![0] as CreateMediaEdgeSessionOptions;
    expect(options).not.toHaveProperty('edgeUrl');
    expect(options).not.toHaveProperty('sourceId');
    expect(view.container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByLabelText('Live video from Front inspection camera')).toHaveAttribute('data-xgc-role','camera-video-stream');
    const signal=new AbortController().signal;
    await expect(options.signaling!.open('offered-sdp',signal)).resolves.toEqual(answer);
    expect(transport.request).toHaveBeenNthCalledWith(1,'media.open',{ body:{ sdp:'offered-sdp' },signal });
    await options.signaling!.close('media-session',signal);
    expect(transport.request).toHaveBeenNthCalledWith(2,'media.close',{ params:{ sessionId:'media-session' },signal });
    transport.request.mockResolvedValueOnce(Response.json({ ...answer,source:{ ...answer.source,id:'outside-grant' } }));
    await expect(options.signaling!.open('offered-sdp')).rejects.toThrow('does not match the requested source');
    expect(view.container.textContent).not.toContain('media-owned-a');
    expect(view.container.textContent).not.toContain('run-a');
    expect(view.container.textContent).not.toContain('127.0.0.1');
  });

  it.each([
    { moduleId:'experiment.remote-control' },
    { viewContractVersion:2 },
    { media:{ sourceId:'front',processInstanceId:'' } },
    { panel:{ id:'foreign-panel',title:'Other camera' } },
    { surface:{ kind:'experiment-panel',experimentId:'experiment-a',sessionId:'',panelId:'panel-a' } },
  ])('refuses invalid module or bound resource projections before any request: %j',async (invalid) => {
    const transport=client();
    render(<SharedCameraSurface projection={projection(invalid)} client={transport} />);
    expect(screen.getByText('This camera entry is unavailable.')).toBeInTheDocument();
    expect(media.createSession).not.toHaveBeenCalled();
    expect(transport.request).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('requires both live authority and valid open/close endpoints, without falling back to legacy paths',() => {
    const transport=client();
    const full=projection();
    const view=render(<SharedCameraSurface projection={projection({ actions:['surface.read'] })} client={transport} />);
    expect(media.createSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<SharedCameraSurface projection={projection({ endpoints:full.endpoints.filter(({ id }) => id!=='media.close') })}
      client={transport} />);
    expect(screen.getByText('Live camera is unavailable.')).toBeInTheDocument();
    expect(media.createSession).not.toHaveBeenCalled();
    view.rerender(<SharedCameraSurface projection={projection({ endpoints:full.endpoints.map((item) => item.id==='media.open'
      ? { ...item,action:'surface.read' } : item) })} client={transport} />);
    expect(media.createSession).not.toHaveBeenCalled();
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('keeps equivalent projected bindings connected and closes on exact owner change or live revocation',async () => {
    const transport=client();
    const first=handle();
    const second=handle();
    media.createSession.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const view=render(<SharedCameraSurface projection={projection()} client={transport} />);
    await waitFor(() => expect(media.createSession).toHaveBeenCalledOnce());
    view.rerender(<SharedCameraSurface projection={projection({ endpoints:[...projection().endpoints].reverse() })}
      client={{ request:transport.request }} />);
    expect(media.createSession).toHaveBeenCalledOnce();
    expect(first.close).not.toHaveBeenCalled();
    view.rerender(<SharedCameraSurface projection={projection({ media:{ sourceId:'front',processInstanceId:'media-owned-b' } })}
      client={transport} />);
    await waitFor(() => expect(media.createSession).toHaveBeenCalledTimes(2));
    expect(first.close).toHaveBeenCalledWith('consumer-unmounted');
    view.rerender(<SharedCameraSurface projection={projection({ actions:['surface.read','camera.snapshot'] })} client={transport} />);
    expect(second.close).toHaveBeenCalledWith('consumer-unmounted');
    expect(view.container.querySelector('video')).toBeNull();
  });

  it('loads only an explicitly requested snapshot and revokes replaced and unmounted image URLs',async () => {
    const transport=client();
    transport.request.mockImplementation(async () => snapshotResponse());
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const view=render(<SharedCameraSurface projection={projection({ actions:['surface.read','camera.snapshot'] })} client={transport} />);
    expect(transport.request).not.toHaveBeenCalled();
    expect(media.createSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Refresh snapshot' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src','blob:first'));
    expect(transport.request).toHaveBeenLastCalledWith('media.snapshot',{ signal:expect.any(AbortSignal) });
    fireEvent.click(screen.getByRole('button',{ name:'Refresh snapshot' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src','blob:second'));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:first');
    view.unmount();
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:second');
  });

  it('aborts retired snapshot bindings and ignores their late bytes without allocating an object URL',async () => {
    const transport=client();
    let finishFirst!:(response:Response) => void;
    transport.request.mockReturnValueOnce(new Promise((resolve) => { finishFirst=resolve; }))
      .mockResolvedValueOnce(snapshotResponse());
    const first=projection({ actions:['surface.read','camera.snapshot'] });
    const view=render(<SharedCameraSurface projection={first} client={transport} />);
    const button=screen.getByRole('button',{ name:'Refresh snapshot' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(transport.request).toHaveBeenCalledOnce();
    const signal=transport.request.mock.calls[0]![1]!.signal!;
    view.rerender(<SharedCameraSurface projection={{ ...first,entryId:'replacement-entry' }} client={transport} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { finishFirst(snapshotResponse()); });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Refresh snapshot' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src','blob:snapshot-a'));
    view.rerender(<SharedCameraSurface projection={{ ...first,actions:['surface.read'] }} client={transport} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:snapshot-a');
  });

  it('shows a usable snapshot failure without exposing server paths or technical IDs',async () => {
    const transport=client();
    transport.request.mockRejectedValue(new Error('process-secret /internal/volume failed upstream 127.0.0.1'));
    const view=render(<SharedCameraSurface projection={projection({ actions:['surface.read','camera.snapshot'] })} client={transport} />);
    fireEvent.click(screen.getByRole('button',{ name:'Refresh snapshot' }));
    expect(await screen.findByText('The snapshot could not be loaded. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Refresh snapshot' })).toBeEnabled();
    expect(view.container.textContent).not.toContain('process-secret');
    expect(view.container.textContent).not.toContain('127.0.0.1');
  });

  it('keeps live transport details out of the shared viewer error',async () => {
    media.createSession.mockRejectedValue(new Error('process-secret /internal/volume failed upstream'));
    const view=render(<SharedCameraSurface projection={projection()} client={client()} />);
    expect(await screen.findByText('Live camera is unavailable.')).toBeInTheDocument();
    expect(view.container.textContent).not.toContain('process-secret');
    expect(view.container.textContent).not.toContain('/internal/volume');
  });
});
