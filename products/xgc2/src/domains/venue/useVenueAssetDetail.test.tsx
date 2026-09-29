/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVenueAssetDetail } from './useVenueAssetDetail';
import { getVenueAssetDetail, type VenueAssetDetail } from './venueAssetService';

vi.mock('./venueAssetService', () => ({
  getVenueAssetDetail: vi.fn(),
  venueAssetMediaUrl: (name: string) => `/api/scenes/${encodeURIComponent(name)}/media`,
  venueAssetPreviewUrl: (name: string) => `/api/scenes/${encodeURIComponent(name)}/preview`,
}));
const saved = (name: string): VenueAssetDetail => ({
  name, kind: 'obstacle', origin: 'user', createdAt: '', note: '', onSelect: '', labels: [],
  parts: [], fieldSite: false, replayable: false, replayIssues: [], revisions: [],
});

describe('useVenueAssetDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never pairs previous scene data with the new scene URL, even before effects run', async () => {
    vi.mocked(getVenueAssetDetail).mockImplementation(async (name) => saved(name));
    const renders: Array<{ selected: string; loaded?: string }> = [];
    const { result, rerender } = renderHook(({ name }) => {
      const state = useVenueAssetDetail(name);
      renders.push({ selected: name, loaded: state.detail?.name });
      return state;
    }, { initialProps: { name: 'first' } });
    await waitFor(() => expect(result.current.detail?.name).toBe('first'));
    expect(result.current.mediaUrl).toBe('/api/scenes/first/media');
    expect(result.current.previewUrl).toBe('/api/scenes/first/preview');
    rerender({ name: 'second' });
    await waitFor(() => expect(result.current.detail?.name).toBe('second'));
    expect(result.current.previewUrl).toBe('/api/scenes/second/preview');
    expect(renders.some((rendered) => rendered.selected === 'second' && rendered.loaded === 'first')).toBe(false);
  });

  it('ignores a late result from an aborted selection', async () => {
    let finishFirst: ((value: VenueAssetDetail) => void) | undefined;
    vi.mocked(getVenueAssetDetail).mockImplementation((name) => name === 'first'
      ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve(saved(name)));
    const { result, rerender } = renderHook(({ name }) => useVenueAssetDetail(name), { initialProps: { name: 'first' } });
    const signal = vi.mocked(getVenueAssetDetail).mock.calls[0][1];
    rerender({ name: 'second' });
    await waitFor(() => expect(result.current.detail?.name).toBe('second'));
    await act(async () => finishFirst?.(saved('first')));
    expect(signal?.aborted).toBe(true);
    expect(result.current.detail?.name).toBe('second');
  });

  it('rejects a server response for another asset instead of silently substituting it', async () => {
    vi.mocked(getVenueAssetDetail).mockResolvedValue(saved('wrong-scene'));
    const { result } = renderHook(() => useVenueAssetDetail('selected'));
    await waitFor(() => expect(result.current.error).toContain('does not match'));
    expect(result.current.detail).toBeUndefined();
  });
});
