// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act,cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { listRecordings,type RecordingFile } from './recordingService';
import {
  classifyScreenRecordingResult,
  useScreenRecordingResult,
  type ScreenRecordingWatch,
} from './useScreenRecordingResult';

vi.mock('./recordingService', () => ({
  listRecordings: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function watch(overrides: Partial<ScreenRecordingWatch> = {}): ScreenRecordingWatch {
  return {
    workflowRunId: 'run-1',
    experimentId: 'exp-a',
    targetId: 'local',
    closed: true,
    ...overrides,
  };
}

function recording(overrides: Partial<RecordingFile> = {}): RecordingFile {
  return {
    id: 'file-1',
    name: 'TASE-4UGVs-simulation-20260920-221530.mp4',
    size: 4_200_000,
    mediaType: 'video/mp4',
    createdAt: '2026-09-20T14:15:32Z',
    experimentId: 'exp-a',
    workflowRunId: 'run-1',
    targetId: 'local',
    recordId: 'record-1',
    status: 'finalized',
    startedAt: '2026-09-20T14:15:30Z',
    finishedAt: '2026-09-20T14:15:32Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listRecordings).mockImplementation(() => deferred<RecordingFile[]>().promise);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('classifyScreenRecordingResult', () => {
  it('saves only an exact finalized file with positive safe-integer size', () => {
    expect(classifyScreenRecordingResult(watch(), [recording()])).toEqual({ status: 'saved', file: recording() });
  });

  it.each([
    ['zero size', recording({ size: 0 })],
    ['non-integer size', recording({ size: 12.5 })],
    ['failed status', recording({ status: 'failed' })],
    ['uncertain status', recording({ status: 'uncertain' })],
    ['still recording', recording({ status: 'recording' })],
    ['missing targetId', recording({ targetId: undefined })],
    ['other target', recording({ targetId: 'host-b' })],
    ['other run', recording({ workflowRunId: 'run-2' })],
    ['other experiment', recording({ experimentId: 'exp-b' })],
  ])('reports no-result for %s', (_label, file) => {
    expect(classifyScreenRecordingResult(watch(), [file])).toEqual({ status: 'no-result' });
  });

  it('refuses to pick an arbitrary first when two exact finalized files match', () => {
    const result = classifyScreenRecordingResult(watch(), [
      recording({ id: 'file-1', recordId: 'record-1' }),
      recording({ id: 'file-2', recordId: 'record-2' }),
    ]);
    expect(result).toEqual({ status: 'error', reason: 'ambiguous-result' });
  });
});

describe('useScreenRecordingResult', () => {
  it('stays idle without a watch and never queries', () => {
    const { result } = renderHook(() => useScreenRecordingResult(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(listRecordings).not.toHaveBeenCalled();
  });

  it('only watches before proven closure — stop acceptance is not a save', () => {
    const { result } = renderHook(() => useScreenRecordingResult(watch({ closed: false })));
    expect(result.current.state).toEqual({ status: 'watching' });
    expect(listRecordings).not.toHaveBeenCalled();
  });

  it('reports unsupported-target for a non-local target without querying local', () => {
    const { result } = renderHook(() => useScreenRecordingResult(watch({ targetId: 'host-b' })));
    expect(result.current.state).toEqual({ status: 'error', reason: 'unsupported-target' });
    expect(listRecordings).not.toHaveBeenCalled();
  });

  it('issues exactly one exact GET after closure and saves the finalized file', async () => {
    const response = deferred<RecordingFile[]>();
    vi.mocked(listRecordings).mockReturnValueOnce(response.promise);
    const { result } = renderHook(() => useScreenRecordingResult(watch()));
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(listRecordings).toHaveBeenCalledTimes(1);
    expect(listRecordings).toHaveBeenCalledWith(expect.objectContaining({
      experimentId: 'exp-a',
      workflowRunId: 'run-1',
    }));
    await act(async () => response.resolve([recording()]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'saved', file: recording() }));
    expect(listRecordings).toHaveBeenCalledTimes(1);
  });

  it('surfaces no-result when the closure produced no exact finalized file', async () => {
    const response = deferred<RecordingFile[]>();
    vi.mocked(listRecordings).mockReturnValueOnce(response.promise);
    const { result } = renderHook(() => useScreenRecordingResult(watch()));
    await act(async () => response.resolve([recording({ status: 'failed' })]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'no-result' }));
  });

  it('surfaces ambiguous-result instead of choosing between two exact matches', async () => {
    const response = deferred<RecordingFile[]>();
    vi.mocked(listRecordings).mockReturnValueOnce(response.promise);
    const { result } = renderHook(() => useScreenRecordingResult(watch()));
    await act(async () => response.resolve([
      recording({ id: 'file-1' }),
      recording({ id: 'file-2', recordId: 'record-2' }),
    ]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', reason: 'ambiguous-result' }));
  });

  it('surfaces request-failed when the archive read fails', async () => {
    const response = deferred<RecordingFile[]>();
    vi.mocked(listRecordings).mockReturnValueOnce(response.promise);
    const { result } = renderHook(() => useScreenRecordingResult(watch()));
    await act(async () => response.reject(new Error('boom')));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', reason: 'request-failed' }));
  });

  it('a late response from a replaced watch never marks the new watch saved', async () => {
    const first = deferred<RecordingFile[]>();
    const second = deferred<RecordingFile[]>();
    vi.mocked(listRecordings)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ current }: { current: ScreenRecordingWatch }) => useScreenRecordingResult(current),
      { initialProps: { current: watch() } },
    );
    rerender({ current: watch({ workflowRunId: 'run-2' }) });
    expect(listRecordings).toHaveBeenCalledTimes(2);
    expect(listRecordings).toHaveBeenLastCalledWith(expect.objectContaining({ workflowRunId: 'run-2' }));
    await act(async () => first.resolve([recording()]));
    await act(async () => second.resolve([]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'no-result' }));
  });

  it('aborts the in-flight read on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(listRecordings).mockImplementationOnce((input) => {
      capturedSignal = input?.signal;
      return deferred<RecordingFile[]>().promise;
    });
    const { unmount } = renderHook(() => useScreenRecordingResult(watch()));
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('still resolves exactly one save under StrictMode effect replay', async () => {
    vi.mocked(listRecordings).mockImplementation(() => Promise.resolve([recording()]));
    const { result } = renderHook(() => useScreenRecordingResult(watch()), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'saved', file: recording() }));
    const savedCalls = vi.mocked(listRecordings).mock.calls.length;
    expect(savedCalls).toBeGreaterThanOrEqual(1);
  });

  it('refresh re-issues the same exact GET and is a no-op before closure', async () => {
    const first = deferred<RecordingFile[]>();
    const second = deferred<RecordingFile[]>();
    vi.mocked(listRecordings)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ current }: { current: ScreenRecordingWatch }) => useScreenRecordingResult(current),
      { initialProps: { current: watch({ closed: false }) } },
    );
    act(() => result.current.refresh());
    expect(listRecordings).not.toHaveBeenCalled();
    rerender({ current: watch() });
    expect(listRecordings).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve([recording({ status: 'failed' })]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'no-result' }));
    act(() => result.current.refresh());
    expect(listRecordings).toHaveBeenCalledTimes(2);
    expect(listRecordings).toHaveBeenLastCalledWith(expect.objectContaining({
      experimentId: 'exp-a',
      workflowRunId: 'run-1',
    }));
    await act(async () => second.resolve([recording()]));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'saved', file: recording() }));
  });

  it('never exposes a stale saved state on the render that switches identity', async () => {
    vi.mocked(listRecordings).mockImplementation(() => Promise.resolve([recording()]));
    const exposedStates: Array<{ status: string }> = [];
    const { result, rerender } = renderHook(
      ({ current }: { current: ScreenRecordingWatch | null }) => {
        const exposed = useScreenRecordingResult(current);
        exposedStates.push(exposed.state);
        return exposed;
      },
      { initialProps: { current: watch() as ScreenRecordingWatch | null } },
    );
    await waitFor(() => expect(result.current.state).toEqual({ status: 'saved', file: recording() }));

    vi.mocked(listRecordings).mockImplementation(() => deferred<RecordingFile[]>().promise);
    const beforeRunSwitch = exposedStates.length;
    rerender({ current: watch({ workflowRunId: 'run-2' }) });
    const afterRunSwitch = exposedStates.slice(beforeRunSwitch);
    expect(afterRunSwitch.length).toBeGreaterThan(0);
    expect(afterRunSwitch[0]).toEqual({ status: 'loading' });
    expect(afterRunSwitch.every((state) => state.status !== 'saved')).toBe(true);

    const beforeNull = exposedStates.length;
    rerender({ current: null });
    const afterNull = exposedStates.slice(beforeNull);
    expect(afterNull[0]).toEqual({ status: 'idle' });
    expect(afterNull.every((state) => state.status !== 'saved')).toBe(true);

    const beforeNonLocal = exposedStates.length;
    rerender({ current: watch({ targetId: 'host-b' }) });
    const afterNonLocal = exposedStates.slice(beforeNonLocal);
    expect(afterNonLocal[0]).toEqual({ status: 'error', reason: 'unsupported-target' });
    expect(afterNonLocal.every((state) => state.status !== 'saved')).toBe(true);

    const beforeOpen = exposedStates.length;
    rerender({ current: watch({ closed: false }) });
    const afterOpen = exposedStates.slice(beforeOpen);
    expect(afterOpen[0]).toEqual({ status: 'watching' });
    expect(afterOpen.every((state) => state.status !== 'saved')).toBe(true);
  });

  it('refresh after an identity switch queries the current render identity, not the previous one', async () => {
    vi.mocked(listRecordings).mockImplementation(() => Promise.resolve([recording()]));
    const { result, rerender } = renderHook(
      ({ current }: { current: ScreenRecordingWatch }) => useScreenRecordingResult(current),
      { initialProps: { current: watch() } },
    );
    await waitFor(() => expect(result.current.state).toEqual({ status: 'saved', file: recording() }));

    vi.mocked(listRecordings).mockImplementation(() => deferred<RecordingFile[]>().promise);
    rerender({ current: watch({ workflowRunId: 'run-2' }) });
    expect(result.current.state).toEqual({ status: 'loading' });
    vi.mocked(listRecordings).mockClear();
    act(() => result.current.refresh());
    expect(listRecordings).toHaveBeenCalledTimes(1);
    expect(listRecordings).toHaveBeenLastCalledWith(expect.objectContaining({
      experimentId: 'exp-a',
      workflowRunId: 'run-2',
    }));
  });
});
