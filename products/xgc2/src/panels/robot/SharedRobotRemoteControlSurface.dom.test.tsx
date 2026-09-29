// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { SharedSurfaceClient,SharedSurfaceProjection } from '../../shared/sharedSurface';
import type { RobotRemoteControlSurface as RemoteControlComponent,RobotRemoteControlSurfaceProps } from './RobotRemoteControlSurface';
import type { RemoteControlIntent } from './useRobotRemoteControlController';

const observed = vi.hoisted(() => ({ props:undefined as RobotRemoteControlSurfaceProps|undefined }));
// Keep the real controls and queue mounted; inspect only the adapter's bound port.
vi.mock('./RobotRemoteControlSurface',async importOriginal => {
  const actual = await importOriginal<{ RobotRemoteControlSurface:typeof RemoteControlComponent }>();
  return { ...actual,RobotRemoteControlSurface:(props:RobotRemoteControlSurfaceProps) => {
    observed.props = props;
    return <actual.RobotRemoteControlSurface {...props} />;
  } };
});
import { remoteMotionHeldError } from '../../domains/robot/robotPublic';
import { SharedRobotRemoteControlSurface } from './SharedRobotRemoteControlSurface';

let projection:SharedSurfaceProjection;
const request = vi.fn<SharedSurfaceClient['request']>();
const client:SharedSurfaceClient = { request };
let lifetime = 0;
const intent:RemoteControlIntent = { gear:2,longitudinal:1,lateral:0,yaw:0,release:false };
const wire = (patch: Record<string,unknown> = {}) => ({
  gear:intent.gear,longitudinal:intent.longitudinal,lateral:intent.lateral,yaw:intent.yaw,
  release:Boolean(intent.release),generation:0,takeover:false,...patch,
});
async function key(type:'keydown'|'keyup',value:string) {
  await act(async () => { fireEvent(window,new KeyboardEvent(type,{ key:value,bubbles:true })); });
}

describe('shared remote controller scoped adapter',() => {
  beforeEach(() => {
    observed.props = undefined;
    request.mockReset().mockImplementation(async () => new Response('{}',{ status:200 }));
    projection = {
      contractVersion:1,moduleId:'experiment.remote-control',viewContractVersion:1,
      entryId:`entry-${++lifetime}`,name:'Workshop remote',expiresAt:'2026-09-20T12:00:00Z',
      actions:['surface.read','remote.motion'],
      endpoints:[{ id:'motion',method:'POST',path:'/api/access/entry/motion',protocol:'http',action:'remote.motion' }],
      surface:{ kind:'remote-controller',experimentId:'experiment-1',sessionId:'session-1',controllerId:'controller-1',robotIds:['opaque-robot-1'] },
      robots:[{ id:'opaque-robot-1',name:'Workshop Scout' }],
    };
    vi.stubGlobal('fetch',vi.fn(() => { throw new Error('No station fallback.'); }));
  });
  afterEach(async () => {
    await act(async () => cleanup());
    vi.unstubAllGlobals();
  });

  it('renders the granted asset name and sends only motion fields through the exact endpoint',async () => {
    const view = render(<StrictMode><SharedRobotRemoteControlSurface projection={projection} client={client} /></StrictMode>);
    expect(screen.getByText('Workshop Scout')).toBeInTheDocument();
    expect(screen.queryByText('opaque-robot-1')).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    await key('keydown','ArrowUp');
    expect(request).toHaveBeenLastCalledWith('motion',{ body:wire() });
    view.rerender(<StrictMode><SharedRobotRemoteControlSurface projection={{ ...projection,name:'New entry title' }} client={client} /></StrictMode>);
    await key('keyup','ArrowUp');
    expect(request).toHaveBeenLastCalledWith('motion',{ body:wire({ longitudinal:0 }) });
    view.unmount();
    await act(async () => {});
    expect(request).toHaveBeenLastCalledWith('motion',{ body:wire({ longitudinal:0,release:true }) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects another controller or robot set and strips resource identity from the command body',async () => {
    render(<SharedRobotRemoteControlSurface projection={projection} client={client} />);
    const send = observed.props!.submit;
    await expect(send('other-controller',['opaque-robot-1'],intent)).rejects.toThrow(/granted controller/);
    await expect(send('controller-1',['other-robot'],intent)).rejects.toThrow(/granted controller/);
    await expect(send('controller-1',['opaque-robot-1','other-robot'],intent)).rejects.toThrow(/granted controller/);
    expect(request).not.toHaveBeenCalled();
    const injected = { ...intent,robotIds:['other-robot'],controllerId:'other-controller',sessionId:'other-session',targetId:'remote' };
    await send('controller-1',['opaque-robot-1'],injected);
    expect(request).toHaveBeenCalledExactlyOnceWith('motion',{ body:wire() });
  });

  it.each(['action','endpoint','method','protocol','endpoint-action','duplicate'] as const)('is fully read-only when the required %s does not authorize motion',async missing => {
    if (missing === 'action') projection = { ...projection,actions:['surface.read'] };
    else if (missing === 'endpoint') projection = { ...projection,endpoints:[] };
    else if (missing === 'duplicate') projection = { ...projection,endpoints:[...projection.endpoints,...projection.endpoints] };
    else {
      const endpoint = { ...projection.endpoints[0]! };
      if (missing === 'method') endpoint.method = 'GET';
      if (missing === 'protocol') endpoint.protocol = 'sse';
      if (missing === 'endpoint-action') endpoint.action = 'surface.read';
      projection = { ...projection,endpoints:[endpoint] };
    }
    const view = render(<StrictMode><SharedRobotRemoteControlSurface projection={projection} client={client} /></StrictMode>);
    expect(observed.props?.canMotion).toBe(false);
    expect(screen.getByRole('button',{ name:'Forward' })).toBeDisabled();
    await key('keydown','ArrowUp');
    await act(async () => fireEvent.click(screen.getByRole('button',{ name:'Stop' })));
    await expect(observed.props!.submit('controller-1',['opaque-robot-1'],intent)).rejects.toThrow(/granted controller/);
    view.unmount();
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { moduleId:'experiment.camera' },
    { viewContractVersion:2 },
    { surface:{ kind:'experiment-panel' } },
    { surface:{ kind:'remote-controller',experimentId:'experiment-1',controllerId:'controller-1',robotIds:['opaque-robot-1'] } },
    { robots:[] },
    { robots:[{ id:'opaque-robot-1',name:'' }] },
    { robots:[{ id:'other-robot',name:'Other Scout' }] },
    { robots:[{ id:'opaque-robot-1',name:'Scout' },{ id:'opaque-robot-1',name:'Duplicate' }] },
  ])('rejects an incompatible or incomplete owner payload: %j',async patch => {
    render(<SharedRobotRemoteControlSurface projection={{ ...projection,...patch }} client={client} />);
    expect(screen.getByText('This remote controller is unavailable.')).toBeInTheDocument();
    expect(observed.props).toBeUndefined();
    await key('keydown','ArrowUp');
    expect(request).not.toHaveBeenCalled();
  });

  it('propagates transport denial but displays only a localized failure, not its private body',async () => {
    const denied = Object.assign(new Error('403 Forbidden: /internal/controllers/opaque-robot-1'),{ name:'HTTPError',status:403 });
    request.mockRejectedValue(denied);
    render(<SharedRobotRemoteControlSurface projection={projection} client={client} />);
    const failure = observed.props!.submit('controller-1',['opaque-robot-1'],intent);
    await expect(failure).rejects.toBe(denied);
    await key('keydown','ArrowUp');
    expect(screen.getByText('The control command did not complete. Try again.')).toBeInTheDocument();
    expect(screen.queryByText(/opaque-robot-1|internal\/controllers/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers takeover when another operator holds the robots',async () => {
    request.mockRejectedValue(remoteMotionHeldError({ error:'robot is controlled by another operator',code:'motion_held' }));
    render(<SharedRobotRemoteControlSurface projection={projection} client={client} />);
    await key('keydown','ArrowUp');
    expect(screen.getByText('Another operator is controlling these robots.')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Take control' })).toBeInTheDocument();
    expect(screen.queryByText('The control command did not complete. Try again.')).not.toBeInTheDocument();
    expect(screen.queryByText(/opaque-robot-1/)).not.toBeInTheDocument();
  });

  it('revocation closes the old bound queue and cannot revive its queued direction',async () => {
    let resolve!:()=>void;
    request.mockImplementationOnce(() => new Promise<Response>(done => { resolve = () => done(new Response('{}')); }));
    const view = render(<SharedRobotRemoteControlSurface projection={projection} client={client} />);
    await key('keydown','ArrowUp');
    await key('keydown','ArrowLeft');
    view.rerender(<SharedRobotRemoteControlSurface projection={{ ...projection,actions:['surface.read'],endpoints:[] }} client={client} />);
    await key('keydown','ArrowDown');
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith('motion',{ body:wire({ longitudinal:0,release:true }) });
  });
});
