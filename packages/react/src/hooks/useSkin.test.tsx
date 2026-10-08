import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemorySkinStore, initializeSkin, useSkin, type SkinStore, type XGCSkin } from './useSkin';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function managedStore(initialSkin: XGCSkin) {
  let skin = initialSkin;
  const listeners = new Set<() => void>();
  const pending: Array<{ next: XGCSkin } & ReturnType<typeof deferred<void>>> = [];
  const store: SkinStore = {
    getSnapshot: () => skin,
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }),
    setSkin: vi.fn((next: XGCSkin) => {
      const call = { next, ...deferred<void>() };
      pending.push(call);
      return call.promise;
    }),
  };
  return {
    store,
    listeners,
    pending,
    publish(next: XGCSkin) {
      skin = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const strict = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

describe('explicit skin authority', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => { delete document.documentElement.dataset.skin; });

  it('restores the product authority before first paint without initialization writes', async () => {
    const restoration = deferred<XGCSkin>();
    const loadStore = async () => managedStore(await restoration.promise);
    const startup = loadStore();
    expect(document.documentElement.dataset.skin).toBeUndefined();
    restoration.resolve('dark');
    const owner = await startup;

    expect(initializeSkin({ store: owner.store })).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
    const { result } = renderHook(() => useSkin({ store: owner.store }), { wrapper: strict });
    expect(result.current[0]).toBe('dark');
    expect(owner.store.setSkin).not.toHaveBeenCalled();
  });

  it('makes memory storage explicit and publishes synchronously without persistence', async () => {
    const store = createMemorySkinStore('light');
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const completion = store.setSkin('dark');
    expect(store.getSnapshot()).toBe('dark');
    expect(listener).toHaveBeenCalledTimes(1);
    await completion;
    await store.setSkin('dark');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribe();
    await store.setSkin('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('gives each memory subscription its own cleanup', async () => {
    const store = createMemorySkinStore('light');
    const listener = vi.fn();
    const first = store.subscribe(listener);
    const second = store.subscribe(listener);
    first();
    await store.setSkin('dark');
    expect(listener).toHaveBeenCalledTimes(1);
    second();
    await store.setSkin('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('waits for the owner commit and updates all subscribers from the published snapshot', async () => {
    const owner = managedStore('light');
    const first = renderHook(() => useSkin({ store: owner.store }));
    const second = renderHook(() => useSkin({ store: owner.store }));
    let completed = false;
    const completion = first.result.current[1]('dark').then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(first.result.current[0]).toBe('light');
    expect(second.result.current[0]).toBe('light');
    expect(document.documentElement.dataset.skin).toBe('light');

    await act(async () => {
      owner.publish('dark');
      owner.pending[0]!.resolve();
      await completion;
    });
    expect(completed).toBe(true);
    expect(first.result.current[0]).toBe('dark');
    expect(second.result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
  });

  it('propagates owner failure and leaves the authoritative skin visible', async () => {
    const owner = managedStore('light');
    const { result } = renderHook(() => useSkin({ store: owner.store }));
    const failure = new Error('preferences revision conflict');
    const completion = result.current[1]('dark');
    const assertion = expect(completion).rejects.toBe(failure);
    await act(async () => { owner.pending[0]!.reject(failure); await assertion; });
    expect(owner.store.setSkin).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe('light');
    expect(owner.store.getSnapshot()).toBe('light');
    expect(document.documentElement.dataset.skin).toBe('light');
  });

  it('evaluates an updater once against the authority at call time under StrictMode', async () => {
    const owner = managedStore('light');
    const { result } = renderHook(() => useSkin({ store: owner.store }), { wrapper: strict });
    const update = vi.fn((skin: XGCSkin) => skin === 'dark' ? 'light' : 'dark');
    let completion!: Promise<void>;
    act(() => {
      // The owner changed before React rendered; the captured hook value is old.
      owner.publish('dark');
      completion = result.current[1](update);
    });
    expect(update).toHaveBeenCalledExactlyOnceWith('dark');
    expect(owner.store.setSkin).toHaveBeenCalledExactlyOnceWith('light');
    await act(async () => { owner.publish('light'); owner.pending[0]!.resolve(); await completion; });
  });

  it('accepts external owner changes without a setter call', () => {
    const owner = managedStore('light');
    const { result } = renderHook(() => useSkin({ store: owner.store }));
    act(() => owner.publish('dark'));
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
    expect(owner.store.setSkin).not.toHaveBeenCalled();
  });

  it('cleans up StrictMode subscriptions and keeps the subscription stable on rerender', () => {
    const owner = managedStore('dark');
    const { rerender, unmount } = renderHook(() => useSkin({ store: owner.store }), { wrapper: strict });
    expect(owner.listeners.size).toBe(1);
    const subscriptions = vi.mocked(owner.store.subscribe).mock.calls.length;
    rerender();
    expect(owner.store.subscribe).toHaveBeenCalledTimes(subscriptions);
    expect(owner.listeners.size).toBe(1);
    unmount();
    expect(owner.listeners.size).toBe(0);
    expect(owner.store.setSkin).not.toHaveBeenCalled();
  });

  it('does not let a previous store completion overwrite the current document skin', async () => {
    const old = managedStore('light');
    const current = managedStore('light');
    const { result, rerender, unmount } = renderHook(({ store }) => useSkin({ store }), {
      initialProps: { store: old.store },
    });
    const completion = result.current[1]('dark');
    rerender({ store: current.store });
    expect(old.listeners.size).toBe(0);
    expect(current.listeners.size).toBe(1);
    await act(async () => { old.publish('dark'); old.pending[0]!.resolve(); await completion; });
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.dataset.skin).toBe('light');
    unmount();
    expect(current.listeners.size).toBe(0);
  });

  it('does not apply a late setter completion after unmount', async () => {
    const owner = managedStore('light');
    const { result, unmount } = renderHook(() => useSkin({ store: owner.store }));
    const completion = result.current[1]('dark');
    unmount();
    initializeSkin({ store: createMemorySkinStore('light') });
    owner.publish('dark');
    owner.pending[0]!.resolve();
    await completion;
    expect(document.documentElement.dataset.skin).toBe('light');
  });

  it('forwards concurrent calls and leaves commit order to the owner', async () => {
    const owner = managedStore('light');
    const { result } = renderHook(() => useSkin({ store: owner.store }));
    const first = result.current[1]('dark');
    const second = result.current[1]('light');
    expect(owner.pending.map((call) => call.next)).toEqual(['dark', 'light']);
    // Both writes committed in order, but the first acknowledgement is delayed.
    await act(async () => {
      owner.publish('dark');
      owner.publish('light');
      owner.pending[1]!.resolve();
      await second;
    });
    await act(async () => { owner.pending[0]!.resolve(); await first; });
    expect(result.current[0]).toBe('light');
    expect(document.documentElement.dataset.skin).toBe('light');
  });

  it('preserves the method receiver of an injected store', async () => {
    class Store implements SkinStore {
      skin: XGCSkin = 'dark';
      listeners = new Set<() => void>();
      getSnapshot() { return this.skin; }
      subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
      async setSkin(next: XGCSkin) { this.skin = next; this.listeners.forEach((listener) => listener()); }
    }
    const store = new Store();
    initializeSkin({ store });
    const { result, unmount } = renderHook(() => useSkin({ store }));
    await act(async () => result.current[1]('light'));
    expect(result.current[0]).toBe('light');
    unmount();
    expect(store.listeners.size).toBe(0);
  });

  it('rejects invalid values without a fallback or a store write', async () => {
    const invalid = 'sepia' as XGCSkin;
    expect(() => createMemorySkinStore(invalid)).toThrow(TypeError);
    const store = createMemorySkinStore('light');
    await expect(store.setSkin(invalid)).rejects.toThrow(TypeError);
    expect(store.getSnapshot()).toBe('light');
    const owner = managedStore('light');
    const { result } = renderHook(() => useSkin({ store: owner.store }));
    await expect(result.current[1](invalid)).rejects.toThrow(TypeError);
    await expect(result.current[1](() => invalid)).rejects.toThrow(TypeError);
    expect(owner.store.setSkin).not.toHaveBeenCalled();
    expect(() => initializeSkin({ store: { ...owner.store, getSnapshot: () => invalid } })).toThrow(TypeError);
  });

  it('never accesses browser persistence or registers storage event fallback', async () => {
    const unavailable = () => { throw new Error('browser persistence is unavailable'); };
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable);
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(unavailable);
    const addListener = vi.spyOn(window, 'addEventListener');
    const store = createMemorySkinStore('light');
    initializeSkin({ store });
    const { result } = renderHook(() => useSkin({ store }));
    await act(async () => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(addListener.mock.calls.filter(([event]) => event === 'storage')).toEqual([]);
  });
});
