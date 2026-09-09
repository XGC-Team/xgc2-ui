// @vitest-environment jsdom

import { act,cleanup,renderHook,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { useHostLogsResource } from './useHostLogsResource';

const { listHostLogSources,readHostLogChunk } = vi.hoisted(() => ({
  listHostLogSources: vi.fn(),
  readHostLogChunk: vi.fn(),
}));

vi.mock('./hostLogActions', () => ({ listHostLogSources,readHostLogChunk }));

const sources = [
  { id: 'syslog',path: '/var/log/syslog',size: 10,modTime: 'now' },
  { id: 'kernel',path: '/var/log/kern.log',size: 20,modTime: 'now' },
];

describe('useHostLogsResource', () => {
  beforeEach(() => {
    listHostLogSources.mockResolvedValue(sources);
    readHostLogChunk.mockImplementation(async (sourceId: string) => ({
      sourceId,
      content: `${sourceId} line`,
      nextOffset: 4,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads once on open and reads only the selected bounded chunk', async () => {
    const { result,rerender } = renderHook(() => useHostLogsResource({
      managedHostId: 'agent-b',
      targetCoreId: 'core-a',
      requestsAllowed: true,
    }));

    await waitFor(() => expect(result.current.chunk?.sourceId).toBe('syslog'));
    expect(listHostLogSources).toHaveBeenCalledTimes(1);
    expect(listHostLogSources).toHaveBeenCalledWith({ targetCoreId: 'core-a',managedHostId: 'agent-b' });
    expect(readHostLogChunk).toHaveBeenCalledWith('syslog',{
      targetCoreId: 'core-a',
      managedHostId: 'agent-b',
      offset: 0,
      limitBytes: 65_536,
    });

    rerender();
    expect(listHostLogSources).toHaveBeenCalledTimes(1);
    expect(readHostLogChunk).toHaveBeenCalledTimes(1);

    act(() => result.current.selectSource('kernel'));
    await waitFor(() => expect(result.current.chunk?.sourceId).toBe('kernel'));
    expect(readHostLogChunk).toHaveBeenCalledTimes(2);
  });

  it('makes zero requests while the connection gate is closed', async () => {
    const { result } = renderHook(() => useHostLogsResource({
      managedHostId: 'agent-b',
      targetCoreId: 'core-a',
      requestsAllowed: false,
    }));

    await act(async () => Promise.resolve());
    act(() => result.current.selectSource('syslog'));
    await act(async () => result.current.refresh());

    expect(listHostLogSources).not.toHaveBeenCalled();
    expect(readHostLogChunk).not.toHaveBeenCalled();
  });
});
