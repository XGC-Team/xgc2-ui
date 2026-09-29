import { describe,expect,it,vi } from 'vitest';
import { createPanelInvocationRequest } from './panelInvocationRequest';
import type { PanelActionInvocation } from './types';

function deferred<T>() {
  let resolve!: (value:T) => void;
  let reject!: (cause:unknown) => void;
  const promise = new Promise<T>((yes,no) => { resolve=yes;reject=no; });
  return { promise,resolve,reject };
}
const receipt: PanelActionInvocation = { id:'own',status:'running',revision:1 };

describe('submitted Panel command cancellation',() => {
  it('queues Stop before admission and controls only the eventual accepted id',async () => {
    const admission = deferred<PanelActionInvocation>();
    const control = vi.fn(async () => undefined);
    const request = createPanelInvocationRequest({ invoke:() => admission.promise,control },{},'Plot',
      () => ({ id:'unrelated',status:'running',revision:99 }));
    const cancel = request.cancel('Stop plotting');
    expect(request.cancelRequested).toBe(true);
    expect(control).not.toHaveBeenCalled();
    admission.resolve(receipt);
    await cancel;
    expect(control).toHaveBeenCalledTimes(1);
    expect(control).toHaveBeenCalledWith(receipt,'cancel','Stop plotting');
  });
  it('uses the newest revision of its own retained Run without shared latest',async () => {
    const control = vi.fn(async () => undefined);
    const current: PanelActionInvocation = { ...receipt,revision:5 };
    const request = createPanelInvocationRequest({ invoke:async () => receipt,control },{},'Plot',() => current);
    await request.cancel('Stop');
    expect(control).toHaveBeenCalledWith(current,'cancel','Stop');
  });
  it('coalesces repeat Stop clicks during admission and cancellation',async () => {
    const admission = deferred<PanelActionInvocation>();
    const control = vi.fn(async () => undefined);
    const request = createPanelInvocationRequest({ invoke:() => admission.promise,control },{},'Plot',() => undefined);
    const first = request.cancel('Stop');
    const second = request.cancel('Stop');
    expect(second).toBe(first);
    admission.resolve(receipt);
    await first;
    expect(control).toHaveBeenCalledTimes(1);
  });
  it('cancels through the exact terminal anchor so Core includes its remaining children',async () => {
    const control = vi.fn(async () => undefined);
    const request = createPanelInvocationRequest({ invoke:async () => receipt,control },{},'Plot',
      () => ({ ...receipt,status:'succeeded',revision:2 }));
    await request.cancel('Stop');
    expect(control).toHaveBeenCalledWith({ ...receipt,status:'succeeded',revision:2 },'cancel','Stop');
  });
  it('queues Stop for a succeeded admission without waiting for a child detail seed',async () => {
    const admission = deferred<PanelActionInvocation>();
    const control = vi.fn(async () => undefined);
    const request = createPanelInvocationRequest({ invoke:() => admission.promise,control },{},'Plot',() => undefined);
    const cancel = request.cancel('Stop');
    const joined: PanelActionInvocation = { ...receipt,status:'succeeded',revision:3 };
    admission.resolve(joined);
    await cancel;
    expect(control).toHaveBeenCalledExactlyOnceWith(joined,'cancel','Stop');
  });
  it('reports cancel rejection and permits an explicit retry',async () => {
    const control = vi.fn().mockRejectedValueOnce(new Error('revision conflict')).mockResolvedValue(undefined);
    const request = createPanelInvocationRequest({ invoke:async () => receipt,control },{},'Plot',() => undefined);
    await expect(request.cancel('Stop')).rejects.toThrow('revision conflict');
    expect(request.cancelRequested).toBe(false);
    await request.cancel('Retry Stop');
    expect(control).toHaveBeenCalledTimes(2);
  });
  it('does not cancel anything merely because the caller releases its observation',async () => {
    const admission = deferred<PanelActionInvocation>();
    const control = vi.fn(async () => undefined);
    const request = createPanelInvocationRequest({ invoke:() => admission.promise,control },{},'Plot',() => undefined);
    admission.resolve(receipt);
    await request.result;
    expect(control).not.toHaveBeenCalled();
  });
});
