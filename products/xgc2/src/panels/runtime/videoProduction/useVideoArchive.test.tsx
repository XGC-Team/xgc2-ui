// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ROSBagRecording } from '../../../domains/recording/recordingPublic';
import { useVideoArchive } from './useVideoArchive';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../../domains/recording/recordingPublic',() => ({ listROSBagRecordings:list }));
const bag = (id:string): ROSBagRecording => ({ id,name:`${id}.bag`,path:`/archive/${id}.bag`,size:1024,createdAt:'2026-09-20T00:00:00Z' });
const page = (ids:string[],nextOffset?:number) => ({ items:ids.map(bag),offset:0,limit:100,total:ids.length,truncated:nextOffset !== undefined,nextOffset });
function deferred<T>() {
  let resolve!: (value:T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise,resolve };
}

describe('video recording scope',() => {
  beforeEach(() => vi.resetAllMocks());

  it('sends the scope on every page and preserves a generic archive query',async () => {
    list.mockResolvedValueOnce(page(['one'],100)).mockResolvedValueOnce(page(['one','two'])).mockResolvedValueOnce(page(['other']));
    const view = renderHook(({ experimentId }) => useVideoArchive(experimentId),{ initialProps:{ experimentId:'exp-one' as string | undefined } });
    await waitFor(() => expect(view.result.current.nextOffset).toBe(100));
    await act(async () => view.result.current.load(100));
    expect(list.mock.calls.map(([params]) => params)).toEqual([{ experimentId:'exp-one',offset:0 },{ experimentId:'exp-one',offset:100 }]);
    expect(view.result.current.bags.map((item) => item.id)).toEqual(['one','two']);
    view.rerender({ experimentId:undefined });
    await waitFor(() => expect(view.result.current.bags.map((item) => item.id)).toEqual(['other']));
    expect(list).toHaveBeenLastCalledWith({ offset:0 },expect.any(AbortSignal));
  });

  it('clears the previous scope and cursor while loading and ignores a late old page',async () => {
    const older = deferred<ReturnType<typeof page>>(),all = deferred<ReturnType<typeof page>>();
    list.mockResolvedValueOnce(page(['current'],100)).mockReturnValueOnce(older.promise).mockReturnValueOnce(all.promise);
    const view = renderHook(({ experimentId }) => useVideoArchive(experimentId),{ initialProps:{ experimentId:'exp-one' as string | undefined } });
    await waitFor(() => expect(view.result.current.loaded).toBe(true));
    let pending!:Promise<void>;
    act(() => { pending = view.result.current.load(100); });
    const oldSignal = list.mock.calls[1][1] as AbortSignal;
    view.rerender({ experimentId:undefined });
    expect(oldSignal.aborted).toBe(true);
    expect(view.result.current.bags).toEqual([]);
    expect(view.result.current.nextOffset).toBeUndefined();
    expect(view.result.current.loaded).toBe(false);
    await act(async () => { all.resolve(page(['all'])); });
    await act(async () => { older.resolve(page(['old-page']));await pending; });
    expect(view.result.current.bags.map((item) => item.id)).toEqual(['all']);
  });

  it('keeps the newest refresh when an aborted transport still resolves',async () => {
    const first = deferred<ReturnType<typeof page>>(),second = deferred<ReturnType<typeof page>>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderHook(() => useVideoArchive('exp-one'));
    let pending!:Promise<void>;
    act(() => { pending = view.result.current.load(); });
    await act(async () => { second.resolve(page(['fresh']));await pending; });
    await act(async () => { first.resolve(page(['stale'])); });
    expect(view.result.current.bags.map((item) => item.id)).toEqual(['fresh']);
  });

  it('survives StrictMode replay and aborts the active query on unmount',async () => {
    const first = deferred<ReturnType<typeof page>>(),second = deferred<ReturnType<typeof page>>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderHook(() => useVideoArchive('exp-one'),{ wrapper:StrictMode });
    expect(list).toHaveBeenCalledTimes(2);
    expect((list.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    await act(async () => { second.resolve(page(['current']));first.resolve(page(['replayed'])); });
    expect(view.result.current.bags.map((item) => item.id)).toEqual(['current']);
    view.unmount();
    expect((list.mock.calls[1][1] as AbortSignal).aborted).toBe(true);
  });
});
