// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { RobotRemoteControlSurface,type RobotRemoteControlSurfaceProps } from './RobotRemoteControlSurface';
import type { SubmitRemoteControlIntent } from './useRobotRemoteControlController';

let lifetime = 0;
let props:RobotRemoteControlSurfaceProps;
const submit = vi.fn<SubmitRemoteControlIntent>();

function lastIntent() { return submit.mock.calls.at(-1)?.[2]; }
async function key(type:'keydown'|'keyup',value:string,repeat = false,target:Element|Document|Window = window) {
  await act(async () => { fireEvent(target,new KeyboardEvent(type,{ key:value,bubbles:true,repeat })); });
}
function deferred() {
  let resolve!:()=>void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise,resolve };
}

describe('shared remote control surface lifetime',() => {
  beforeEach(() => {
    submit.mockReset().mockResolvedValue(undefined);
    props = {
      identity:`entry/session/${++lifetime}`,controllerId:'exact-controller',
      robots:[{ id:'scout-3',name:'Workshop Scout' }],canMotion:true,submit,
    };
    vi.stubGlobal('fetch',vi.fn(() => { throw new Error('The surface must only use its bound submit port.'); }));
  });
  afterEach(async () => {
    await act(async () => cleanup());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mounts without station state and retains held keys across title, callbacks and robot-name rerenders',async () => {
    const view = render(<RobotRemoteControlSurface {...props} />);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('group',{ name:'Remote controller for Workshop Scout' })).toBeInTheDocument();
    await key('keydown','ArrowUp');
    expect(lastIntent()).toMatchObject({ longitudinal:1,release:false });
    view.rerender(<RobotRemoteControlSurface {...props} robots={[{ id:'scout-3',name:'Renamed Scout' }]} onError={() => undefined} />);
    await key('keydown','Z');
    expect(lastIntent()).toMatchObject({ longitudinal:1,yaw:1 });
    await key('keyup','z');
    await key('keyup','ArrowUp');
    expect(lastIntent()).toMatchObject({ longitudinal:0,lateral:0,yaw:0,release:false });
    expect(submit.mock.calls.every(([id,robots]) => id === 'exact-controller' && robots.join(',') === 'scout-3')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('releases a held key even when focus has moved into a menu',async () => {
    render(<RobotRemoteControlSurface {...props} />);
    await key('keydown','ArrowUp');
    const menu = document.createElement('div');
    menu.setAttribute('role','menu');
    document.body.appendChild(menu);
    await key('keyup','ArrowUp',false,menu);
    expect(lastIntent()).toMatchObject({ longitudinal:0,release:false });
    menu.remove();
  });

  it.each(['blur','hidden','pagehide'] as const)('zeros every axis on %s without allowing key repeat to restart it',async event => {
    render(<RobotRemoteControlSurface {...props} />);
    await key('keydown','ArrowUp');
    await key('keydown','z');
    await act(async () => {
      if (event === 'hidden') {
        vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
        fireEvent(document,new Event('visibilitychange'));
      } else fireEvent(window,new Event(event));
    });
    expect(lastIntent()).toMatchObject({ longitudinal:0,lateral:0,yaw:0,release:false });
    const count = submit.mock.calls.length;
    await key('keydown','ArrowUp',true);
    await key('keyup','ArrowUp');
    expect(submit).toHaveBeenCalledTimes(count);
    await key('keydown','ArrowUp');
    expect(lastIntent()).toMatchObject({ longitudinal:1,release:false });
  });

  it.each(['pointerUp','pointerCancel','lostPointerCapture'] as const)('ends held pointer motion on %s',async event => {
    render(<RobotRemoteControlSurface {...props} />);
    const button = screen.getByRole('button',{ name:'Forward' });
    button.setPointerCapture = vi.fn();
    await act(async () => fireEvent.pointerDown(button,{ pointerId:1 }));
    expect(lastIntent()).toMatchObject({ longitudinal:1,release:false });
    await act(async () => fireEvent[event](button,{ pointerId:1 }));
    expect(lastIntent()).toMatchObject({ longitudinal:0,lateral:0,yaw:0,release:false });
  });

  it('cancels latched pointer motion too, while retaining normal click-to-latch behavior',async () => {
    render(<RobotRemoteControlSurface {...props} springReturn={false} />);
    const button = screen.getByRole('button',{ name:'Forward' });
    await act(async () => fireEvent.pointerDown(button,{ pointerId:1 }));
    await act(async () => fireEvent.pointerUp(button,{ pointerId:1 }));
    expect(lastIntent()).toMatchObject({ longitudinal:1 });
    await act(async () => fireEvent.pointerCancel(button,{ pointerId:1 }));
    expect(lastIntent()).toMatchObject({ longitudinal:0,lateral:0,yaw:0 });
  });

  it('Stop replaces queued directions and held-key releases, while preserving gear for a new explicit command',async () => {
    const gate = deferred();
    submit.mockImplementationOnce(() => gate.promise);
    render(<RobotRemoteControlSurface {...props} />);
    await key('keydown','ArrowUp');
    await key('keydown','ArrowLeft');
    await act(async () => fireEvent.click(screen.getByRole('button',{ name:'Fast' })));
    await act(async () => fireEvent.click(screen.getByRole('button',{ name:'Stop' })));
    await key('keydown','ArrowUp',true);
    await key('keyup','ArrowUp');
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(lastIntent()).toEqual({ gear:3,longitudinal:0,lateral:0,yaw:0,release:false });
    await key('keydown','ArrowDown');
    expect(lastIntent()).toEqual({ gear:3,longitudinal:-1,lateral:0,yaw:0,release:false });
  });

  it.each(['unmount','revoke'] as const)('drains a final release and drops queued input on %s',async event => {
    const gate = deferred();
    submit.mockImplementationOnce(() => gate.promise);
    const view = render(<RobotRemoteControlSurface {...props} />);
    await key('keydown','ArrowUp');
    await key('keydown','ArrowLeft');
    if (event === 'unmount') view.unmount();
    else view.rerender(<RobotRemoteControlSurface {...props} canMotion={false} />);
    await key('keydown','ArrowDown');
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(lastIntent()).toMatchObject({ longitudinal:0,lateral:0,yaw:0,release:true });
  });

  it('keeps a replacement exact identity behind its own predecessor release',async () => {
    const gate = deferred();
    const release = deferred();
    submit.mockImplementationOnce(() => gate.promise).mockImplementationOnce(() => release.promise);
    render(<StrictMode><RobotRemoteControlSurface {...props} activateOnMount /></StrictMode>);
    await key('keydown','ArrowUp');
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve());
    expect(lastIntent()).toMatchObject({ release:true,longitudinal:0 });
    expect(submit).toHaveBeenCalledTimes(2);
    await act(async () => release.resolve());
    expect(submit).toHaveBeenCalledTimes(3);
    expect(lastIntent()).toMatchObject({ release:false,longitudinal:1 });
    await key('keyup','ArrowUp');
    expect(lastIntent()).toMatchObject({ longitudinal:0 });
  });

  it('never sends in a read-only mount, including StrictMode, Stop, pointer, keyboard and unmount',async () => {
    const view = render(<StrictMode><RobotRemoteControlSurface {...props} canMotion={false} activateOnMount /></StrictMode>);
    await key('keydown','ArrowUp');
    await act(async () => {
      fireEvent.click(screen.getByRole('button',{ name:'Stop' }));
      fireEvent.pointerDown(screen.getByRole('button',{ name:'Forward' }),{ pointerId:1 });
    });
    view.unmount();
    await act(async () => {});
    expect(submit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the old bound port for its final release when the exact resource changes',async () => {
    const gate = deferred();
    submit.mockImplementationOnce(() => gate.promise);
    const next = vi.fn<SubmitRemoteControlIntent>().mockResolvedValue(undefined);
    const view = render(<RobotRemoteControlSurface {...props} />);
    await key('keydown','ArrowUp');
    view.rerender(<RobotRemoteControlSurface {...props} identity='another-session' controllerId='another-controller'
      robots={[{ id:'scout-4',name:'Other Scout' }]} submit={next} />);
    await key('keydown','ArrowRight');
    expect(next).toHaveBeenCalledWith('another-controller',['scout-4'],expect.objectContaining({ lateral:-1 }));
    await act(async () => gate.resolve());
    expect(submit).toHaveBeenLastCalledWith('exact-controller',['scout-3'],expect.objectContaining({ release:true }));
    expect(next.mock.calls.some(([, ,intent]) => intent.release)).toBe(false);
  });
});
