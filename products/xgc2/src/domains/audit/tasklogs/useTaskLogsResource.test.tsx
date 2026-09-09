// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskLogsResource } from './useTaskLogsResource';

const service = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('./taskLogsService', () => ({
  listTaskLogPage: service.list,
}));

beforeEach(() => {
  vi.clearAllMocks();
  service.list.mockResolvedValue(page('initial', 1));
});

describe('useTaskLogsResource', () => {
  it('loads the current filters on mount and supports explicit refresh', async () => {
    const { result } = renderHook(() => useTaskLogsResource({
      q: 'job-1',
      status: 'warning',
      page: 2,
      pageSize: 50,
    }));

    await waitFor(() => expect(result.current.logs[0]?.jobId).toBe('initial'));
    expect(service.list).toHaveBeenCalledWith({
      q: 'job-1',
      status: 'warning',
      page: 2,
      pageSize: 50,
    });

    service.list.mockResolvedValueOnce(page('refreshed', 2));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.logs[0]?.jobId).toBe('refreshed');
    expect(result.current.total).toBe(2);
    expect(result.current.message).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('reloads when pagination or filters change', async () => {
    const view = renderHook(
      ({ q, pageNumber }) => useTaskLogsResource({
        q,
        status: 'all',
        page: pageNumber,
        pageSize: 20,
      }),
      { initialProps: { q: '', pageNumber: 1 } },
    );
    await waitFor(() => expect(view.result.current.logs[0]?.jobId).toBe('initial'));

    service.list.mockResolvedValueOnce(page('filtered', 3));
    view.rerender({ q: 'needle', pageNumber: 3 });

    await waitFor(() => expect(view.result.current.logs[0]?.jobId).toBe('filtered'));
    expect(service.list).toHaveBeenLastCalledWith({
      q: 'needle',
      status: 'all',
      page: 3,
      pageSize: 20,
    });
  });

  it('keeps existing rows on failure and clears the message after recovery', async () => {
    const { result } = renderHook(() => useTaskLogsResource({ page: 1, pageSize: 20 }));
    await waitFor(() => expect(result.current.logs[0]?.jobId).toBe('initial'));

    service.list.mockRejectedValueOnce(new Error('task logs unavailable'));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.logs[0]?.jobId).toBe('initial');
    expect(result.current.total).toBe(1);
    expect(result.current.message).toBe('task logs unavailable');
    expect(result.current.loading).toBe(false);

    service.list.mockResolvedValueOnce(page('recovered', 4));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.logs[0]?.jobId).toBe('recovered');
    expect(result.current.total).toBe(4);
    expect(result.current.message).toBe('');
  });

  it('does not let an older page response replace the current page', async () => {
    const oldPage = deferred<ReturnType<typeof page>>();
    const currentPage = deferred<ReturnType<typeof page>>();
    service.list
      .mockReset()
      .mockImplementationOnce(() => oldPage.promise)
      .mockImplementationOnce(() => currentPage.promise);
    const view = renderHook(
      ({ pageNumber }) => useTaskLogsResource({ page: pageNumber, pageSize: 20 }),
      { initialProps: { pageNumber: 1 } },
    );
    await waitFor(() => expect(service.list).toHaveBeenCalledOnce());

    view.rerender({ pageNumber: 2 });
    await waitFor(() => expect(service.list).toHaveBeenCalledTimes(2));
    await act(async () => currentPage.resolve(page('current', 1)));
    expect(view.result.current.logs[0]?.jobId).toBe('current');
    expect(view.result.current.loading).toBe(false);

    await act(async () => oldPage.resolve(page('stale', 1)));
    expect(view.result.current.logs[0]?.jobId).toBe('current');
    expect(view.result.current.loading).toBe(false);
  });
});

function page(jobId: string, total: number) {
  return {
    rows: [{
      offset: `${total}`,
      jobId,
      sequence: '1',
      eventType: 'job.queued',
      level: 'info',
      createdAt: '2026-05-20T00:00:00.000Z',
    }],
    total,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((next) => { resolve = next; });
  return { promise, resolve };
}
