import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFrameStore, useFrameStoreSelector } from './frameStore';

describe('frameStore', () => {
  it('coalesces multiple updates into one microtask notification', async () => {
    const store = createFrameStore({ value: 0 }, { schedule: 'microtask' });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ value: 1 });
    store.set({ value: 2 });
    store.set({ value: 3 });

    expect(store.getSnapshot()).toEqual({ value: 3 });
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not re-render a selector when an unrelated slice changes', async () => {
    const store = createFrameStore({ robotA: 1, robotB: 1 }, { schedule: 'microtask' });
    const renders = vi.fn();

    function RobotA() {
      const value = useFrameStoreSelector(store, (snapshot) => snapshot.robotA);
      renders(value);
      return <span>{value}</span>;
    }

    render(<RobotA />);
    expect(screen.getByText('1')).toBeInTheDocument();

    await act(async () => {
      store.set((snapshot) => ({ ...snapshot, robotB: 2 }));
      await Promise.resolve();
    });

    expect(renders).toHaveBeenCalledTimes(1);

    await act(async () => {
      store.set((snapshot) => ({ ...snapshot, robotA: 2 }));
      await Promise.resolve();
    });

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(renders).toHaveBeenCalledTimes(2);
  });
});
