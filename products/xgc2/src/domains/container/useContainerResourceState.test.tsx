// @vitest-environment jsdom

import { useCallback } from 'react';
import { act,renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { useContainerResourceState } from './useContainerResourceState';

describe('useContainerResourceState target epochs', () => {
  it('hides the previous target synchronously and does not revive it across A to B to A', async () => {
    const targetB = deferred<string[]>();
    let targetACalls = 0;
    const loadTarget = vi.fn((identity: string) => {
      if (identity === 'B') return targetB.promise;
      targetACalls += 1;
      return Promise.resolve([targetACalls === 1 ? 'A-old' : 'A-current']);
    });
    const { result,rerender } = renderHook(({ identity }) => {
      const load = useCallback(() => loadTarget(identity),[identity]);
      return useContainerResourceState<string[]>({ initialValue: [],load,loadFailure: 'load failed' });
    },{ initialProps: { identity: 'A' } });
    await waitFor(() => expect(result.current.value).toEqual(['A-old']));

    rerender({ identity: 'B' });
    expect(result.current.value).toEqual([]);
    expect(result.current.error).toBe('');
    expect(result.current.output).toBe('');

    rerender({ identity: 'A' });
    expect(result.current.value).toEqual([]);
    await waitFor(() => expect(result.current.value).toEqual(['A-current']));

    await act(async () => targetB.resolve(['B-stale']));
    expect(result.current.value).toEqual(['A-current']);
  });

  it('drops late mutation feedback and refresh work after the target changes', async () => {
    const mutation = deferred<{ output: string }>();
    const afterMutation = vi.fn();
    const command = vi.fn(() => mutation.promise);
    const loadTarget = vi.fn((identity: string) => Promise.resolve([`${identity}-value`]));
    const { result,rerender } = renderHook(({ identity }) => {
      const load = useCallback(() => loadTarget(identity),[identity]);
      return useContainerResourceState<string[]>({
        initialValue: [],load,loadFailure: 'load failed',afterMutation,
      });
    },{ initialProps: { identity: 'A' } });
    await waitFor(() => expect(result.current.value).toEqual(['A-value']));
    let mutationResult!: Promise<boolean>;
    act(() => {
      mutationResult = result.current.execute(command,'completed');
    });

    rerender({ identity: 'B' });
    expect(result.current.value).toEqual([]);
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.value).toEqual(['B-value']));
    await act(async () => mutation.resolve({ output: 'stale A output' }));

    await expect(mutationResult).resolves.toBe(false);
    expect(result.current.output).toBe('');
    expect(result.current.error).toBe('');
    expect(afterMutation).not.toHaveBeenCalled();
    expect(loadTarget.mock.calls.filter(([identity]) => identity === 'A')).toHaveLength(1);
  });

  it('rejects an old callback before it can submit a command after target confirmation', async () => {
    const command = vi.fn().mockResolvedValue({ output: 'should not run' });
    const { result,rerender } = renderHook(({ identity }) => {
      const load = useCallback(() => Promise.resolve([identity]),[identity]);
      return useContainerResourceState<string[]>({ initialValue: [],load,loadFailure: 'load failed' });
    },{ initialProps: { identity: 'A' } });
    await waitFor(() => expect(result.current.value).toEqual(['A']));
    const oldExecute = result.current.execute;

    rerender({ identity: 'B' });
    await expect(oldExecute(command,'completed')).resolves.toBe(false);
    expect(command).not.toHaveBeenCalled();
  });

  it('admits only one same-frame mutation lease', async () => {
    const pending = deferred<{ output: string }>();
    const command = vi.fn(() => pending.promise);
    const { result } = renderHook(() => {
      const load = useCallback(() => Promise.resolve(['value']),[]);
      return useContainerResourceState<string[]>({ initialValue: [],load,loadFailure: 'load failed' });
    });
    await waitFor(() => expect(result.current.value).toEqual(['value']));
    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    act(() => {
      first = result.current.execute(command,'completed');
      duplicate = result.current.execute(command,'completed');
    });

    expect(command).toHaveBeenCalledOnce();
    await expect(duplicate).resolves.toBe(false);
    await act(async () => pending.resolve({ output: 'owner output' }));
    await expect(first).resolves.toBe(true);
    expect(result.current.output).toBe('owner output');
  });

  it('does not let an old epoch finally clear a newer target mutation', async () => {
    const oldMutation = deferred<{ output: string }>();
    const currentMutation = deferred<{ output: string }>();
    const { result,rerender } = renderHook(({ identity }) => {
      const load = useCallback(() => Promise.resolve([identity]),[identity]);
      return useContainerResourceState<string[]>({ initialValue: [],load,loadFailure: 'load failed' });
    },{ initialProps: { identity: 'A' } });
    await waitFor(() => expect(result.current.value).toEqual(['A']));
    let oldCommand!: Promise<boolean>;
    act(() => { oldCommand = result.current.execute(() => oldMutation.promise,'old'); });

    rerender({ identity: 'B' });
    await waitFor(() => expect(result.current.value).toEqual(['B']));
    let currentCommand!: Promise<boolean>;
    act(() => { currentCommand = result.current.execute(() => currentMutation.promise,'current'); });
    expect(result.current.busy).toBe(true);

    await act(async () => oldMutation.resolve({ output: 'old output' }));
    await expect(oldCommand).resolves.toBe(false);
    expect(result.current.busy).toBe(true);
    expect(result.current.output).toBe('');

    await act(async () => currentMutation.resolve({ output: 'current output' }));
    await expect(currentCommand).resolves.toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.output).toBe('current output');
  });
});

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((next) => { resolve = next; });
  return { promise,resolve };
}
