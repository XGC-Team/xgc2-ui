// @vitest-environment jsdom
import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { useRecordingLibrary } from './useRecordingLibrary';

const service = vi.hoisted(() => ({
  list: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../recording/recordingPublic', () => ({
  listRecordings: service.list,
  downloadRecording: service.download,
  deleteRecording: service.remove,
}));

function recording(id: string, extra: Record<string, unknown> = {}) {
  return { id, name: id, size: 1024, createdAt: '2026-07-18T00:00:00.000Z', ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockResolvedValue([recording('a.webm'), recording('b.webm')]);
  service.download.mockResolvedValue(new Blob(['video']));
  service.remove.mockResolvedValue({ deleted: 'a.webm' });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:playback') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

describe('useRecordingLibrary', () => {
  it('loads recordings on mount, newest-first from the service', async () => {
    const { result } = renderHook(() => useRecordingLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(service.list).toHaveBeenCalledOnce();
    expect(result.current.recordings.map((item) => item.id)).toEqual(['a.webm', 'b.webm']);
    expect(result.current.error).toBe('');
  });

  it('keeps the newest refresh result when an earlier list request settles last', async () => {
    const earlier = deferred<ReturnType<typeof recording>[]>();
    const current = deferred<ReturnType<typeof recording>[]>();
    service.list
      .mockReset()
      .mockImplementationOnce(() => earlier.promise)
      .mockImplementationOnce(() => current.promise);
    const { result } = renderHook(() => useRecordingLibrary());

    let refreshPromise!: Promise<void>;
    act(() => { refreshPromise = result.current.refresh(); });
    await act(async () => current.resolve([recording('current.webm')]));
    await refreshPromise;
    expect(result.current.recordings.map((item) => item.id)).toEqual(['current.webm']);
    expect(result.current.loading).toBe(false);

    await act(async () => earlier.resolve([recording('stale.webm')]));
    expect(result.current.recordings.map((item) => item.id)).toEqual(['current.webm']);
    expect(result.current.loading).toBe(false);
  });

  it('filters the list by a case-insensitive name query', async () => {
    const { result } = renderHook(() => useRecordingLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setQuery('B.WEB'));
    expect(result.current.filtered.map((item) => item.id)).toEqual(['b.webm']);
  });

  it('downloads a blob playback URL for the selected recording', async () => {
    const { result } = renderHook(() => useRecordingLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.select('a.webm'));
    await waitFor(() => expect(result.current.playbackUrl).toBe('blob:playback'));
    expect(service.download).toHaveBeenCalledWith('a.webm');
    expect(result.current.selected?.id).toBe('a.webm');
  });

  it('surfaces a playback error when the download fails', async () => {
    service.download.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useRecordingLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.select('a.webm'));
    await waitFor(() => expect(result.current.playbackError).toBe('boom'));
    expect(result.current.playbackUrl).toBe('');
  });

  it('stops playback, clears the selection, and revokes the local Blob URL', async () => {
    const { result } = renderHook(() => useRecordingLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.select('a.webm'));
    await waitFor(() => expect(result.current.playbackUrl).toBe('blob:playback'));

    act(() => result.current.stopPlayback());

    expect(result.current.selectedId).toBe('');
    expect(result.current.playbackUrl).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:playback');
  });

  it('deletes a recording and clears the selection when it was selected', async () => {
    const { result } = renderHook(() => useRecordingLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.select('a.webm'));
    await waitFor(() => expect(result.current.playbackUrl).toBe('blob:playback'));

    service.list.mockResolvedValueOnce([recording('b.webm')]);
    await act(async () => { await result.current.remove('a.webm'); });

    expect(service.remove).toHaveBeenCalledWith('a.webm');
    expect(result.current.selectedId).toBe('');
    expect(result.current.recordings.map((item) => item.id)).toEqual(['b.webm']);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => { resolve = onResolve; });
  return { promise,resolve };
}
