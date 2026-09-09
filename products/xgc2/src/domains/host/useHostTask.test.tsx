// @vitest-environment jsdom

import { act,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { useHostTask } from './useHostTask';

describe('useHostTask isolation', () => {
  it('does not clear another controller busy state when one task completes', async () => {
    const overview = deferred<void>();
    const files = deferred<void>();
    function Harness() {
      const overviewTask = useHostTask();
      const filesTask = useHostTask();
      return (
        <>
          <button onClick={() => void overviewTask.run('refresh',() => overview.promise)}>overview</button>
          <button onClick={() => void filesTask.run('refresh',() => files.promise)}>files</button>
          <span data-testid="overview-busy">{String(overviewTask.isBusy())}</span>
          <span data-testid="files-busy">{String(filesTask.isBusy())}</span>
        </>
      );
    }
    render(<Harness />);
    await act(async () => {
      screen.getByRole('button',{ name: 'overview' }).click();
      screen.getByRole('button',{ name: 'files' }).click();
    });
    expect(screen.getByTestId('overview-busy')).toHaveTextContent('true');
    expect(screen.getByTestId('files-busy')).toHaveTextContent('true');

    await act(async () => overview.resolve(undefined));
    expect(screen.getByTestId('overview-busy')).toHaveTextContent('false');
    expect(screen.getByTestId('files-busy')).toHaveTextContent('true');
    await act(async () => files.resolve(undefined));
  });

  it('keeps a task busy for its owner and rejects a concurrent invocation with the same key', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    function Harness() {
      const task = useHostTask();
      return (
        <>
          <button onClick={() => void task.run('refresh',() => first.promise)}>first</button>
          <button onClick={() => void task.run('refresh',() => second.promise)}>second</button>
          <span data-testid="busy">{String(task.isBusy('refresh'))}</span>
        </>
      );
    }
    render(<Harness />);
    await act(async () => {
      screen.getByRole('button',{ name: 'first' }).click();
      screen.getByRole('button',{ name: 'second' }).click();
    });
    await act(async () => first.resolve(undefined));
    expect(screen.getByTestId('busy')).toHaveTextContent('false');
    await act(async () => second.resolve(undefined));
  });

  it('rejects a duplicate kill task in the same frame', async () => {
    const pending = deferred<void>();
    const kill = vi.fn(() => pending.promise);
    let taskApi!: ReturnType<typeof useHostTask>;
    function Harness() {
      taskApi = useHostTask('host-a');
      return null;
    }
    render(<Harness />);
    let first!: Promise<void | undefined>;
    let duplicate!: Promise<void | undefined>;
    act(() => {
      first = taskApi.run('kill:42',kill);
      duplicate = taskApi.run('kill:42',kill);
    });

    expect(kill).toHaveBeenCalledOnce();
    await expect(duplicate).resolves.toBeUndefined();
    await act(async () => pending.resolve(undefined));
    await first;
  });
});

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((next) => { resolve = next; });
  return { promise,resolve };
}
