// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import {
  stoppedRemoteIntent,
  useRobotRemoteControlController,
  type RemoteControlIntent,
} from './useRobotRemoteControlController';

describe('useRobotRemoteControlController', () => {
  it('arms a zero intent on open, then coalesces later changes to one queued workflow', async () => {
    const completions: Array<() => void> = [];
    const submit = vi.fn(() => new Promise<void>((resolve) => completions.push(resolve)));
    const robotIds = ['px4-01'];
    const hook = renderHook(() => useRobotRemoteControlController({
      identity:'controller-1:px4-01:1',
      controllerId:'controller-1',
      robotIds,
      submit,
    }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenLastCalledWith('controller-1',['px4-01'],stoppedRemoteIntent);

    const forward: RemoteControlIntent = { gear:1,longitudinal:1,lateral:0,yaw:0 };
    const forwardLeft: RemoteControlIntent = { gear:1,longitudinal:1,lateral:1,yaw:0 };
    const latest: RemoteControlIntent = { gear:2,longitudinal:1,lateral:1,yaw:-1 };

    act(() => {
      hook.result.current.send(forward);
      hook.result.current.send(forwardLeft);
      hook.result.current.send(latest);
    });
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => completions.shift()?.());
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit).toHaveBeenLastCalledWith('controller-1',['px4-01'],latest);

    await act(async () => completions.shift()?.());
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('re-asserts a restored intent instead of arming zero', async () => {
    const submit = vi.fn(async () => undefined);
    const restored: RemoteControlIntent = { gear:2,longitudinal:1,lateral:-1,yaw:0 };
    renderHook(() => useRobotRemoteControlController({
      identity:'controller-2:scout-01',
      controllerId:'controller-2',
      robotIds:['scout-01'],
      submit,
      initialIntent:restored,
    }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenLastCalledWith('controller-2',['scout-01'],restored);
  });

  it('finishes once with zero after the in-flight request, even when its window unmounts',async () => {
    const completions:Array<()=>void> = [];
    const submit = vi.fn(() => new Promise<void>((resolve) => completions.push(resolve)));
    let finish:()=>Promise<void> = () => { throw new Error('Controller is not ready.'); };
    const onFinishReady = (_id:string,close:()=>Promise<void>) => { finish = close; };
    const hook = renderHook(({ submit }) => useRobotRemoteControlController({
      identity:'closing',controllerId:'closing',robotIds:['px4-01'],submit,onFinishReady,
    }),{ initialProps:{ submit } });
    await act(async () => { completions.shift()?.(); });
    act(() => {
      hook.result.current.send({ gear:1,longitudinal:1,lateral:0,yaw:0 });
      hook.result.current.send({ gear:1,longitudinal:1,lateral:1,yaw:0 });
    });
    const closing = finish();
    expect(finish()).toBe(closing);
    const nextTargetSubmit = vi.fn(async ():Promise<void> => undefined);
    hook.rerender({ submit:nextTargetSubmit });
    act(() => hook.result.current.send({ gear:3,longitudinal:-1,lateral:0,yaw:1 }));
    hook.unmount();
    expect(submit).toHaveBeenCalledTimes(2);
    await act(async () => { completions.shift()?.(); });
    expect(submit).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenLastCalledWith('closing',['px4-01'],stoppedRemoteIntent);
    let finished = false;
    void closing.then(() => { finished = true; });
    expect(finished).toBe(false);
    await act(async () => { completions.shift()?.();await closing; });
    expect(finished).toBe(true);
    expect(submit).toHaveBeenCalledTimes(3);
    expect(nextTargetSubmit).not.toHaveBeenCalled();
  });

  it('explicit Stop replaces an old queued direction and permits a later operator command',async () => {
    let finishForward:()=>void = () => { throw new Error('Forward was not submitted.'); };
    const submit = vi.fn(async (_id:string,_robots:readonly string[],intent:RemoteControlIntent) => {
      if (intent.longitudinal === 1 && intent.lateral === 0) {
        await new Promise<void>((resolve) => { finishForward = resolve; });
      }
    });
    const hook = renderHook(() => useRobotRemoteControlController({
      identity:'stop',controllerId:'stop',robotIds:['px4-01'],submit,
    }));
    await act(async () => {});
    act(() => {
      hook.result.current.send({ gear:1,longitudinal:1,lateral:0,yaw:0 });
      hook.result.current.send({ gear:1,longitudinal:1,lateral:1,yaw:0 });
      hook.result.current.send(stoppedRemoteIntent,true);
    });
    expect(submit).toHaveBeenCalledTimes(2);
    await act(async () => { finishForward(); });
    expect(submit).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenLastCalledWith('stop',['px4-01'],stoppedRemoteIntent);
    const backward:RemoteControlIntent = { gear:1,longitudinal:-1,lateral:0,yaw:0 };
    await act(async () => hook.result.current.send(backward));
    expect(submit).toHaveBeenLastCalledWith('stop',['px4-01'],backward);
  });

  it('still sends the final zero when the preceding motion request fails',async () => {
    let rejectMotion:(cause:Error)=>void = () => { throw new Error('Motion was not submitted.'); };
    const submit = vi.fn(async (_id:string,_robots:readonly string[],intent:RemoteControlIntent) => {
      if (intent.longitudinal) await new Promise<void>((_resolve,reject) => { rejectMotion = reject; });
    });
    let finish:()=>Promise<void> = () => { throw new Error('Controller is not ready.'); };
    const onFinishReady = (_id:string,close:()=>Promise<void>) => { finish = close; };
    const hook = renderHook(() => useRobotRemoteControlController({
      identity:'failed',controllerId:'failed',robotIds:['px4-01'],submit,onFinishReady,
    }));
    await act(async () => {});
    act(() => hook.result.current.send({ gear:1,longitudinal:1,lateral:0,yaw:0 }));
    const closing = finish();
    hook.unmount();
    await act(async () => { rejectMotion(new Error('motion failed'));await closing; });
    expect(submit).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenLastCalledWith('failed',['px4-01'],stoppedRemoteIntent);
  });

  it('does not block a different controller while one robot request is pending',async () => {
    let finishFirst:()=>void = () => { throw new Error('First controller was not submitted.'); };
    const submit = vi.fn(async (id:string) => {
      if (id === 'first') await new Promise<void>((resolve) => { finishFirst = resolve; });
    });
    renderHook(() => useRobotRemoteControlController({ identity:'first',controllerId:'first',robotIds:['px4-01'],submit }));
    const second = renderHook(() => useRobotRemoteControlController({ identity:'second',controllerId:'second',robotIds:['px4-02'],submit }));
    await act(async () => {});
    const forward:RemoteControlIntent = { gear:1,longitudinal:1,lateral:0,yaw:0 };
    await act(async () => second.result.current.send(forward));
    expect(submit).toHaveBeenLastCalledWith('second',['px4-02'],forward);
    await act(async () => { finishFirst(); });
  });
});
