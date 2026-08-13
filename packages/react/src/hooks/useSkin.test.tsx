import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeSkin, readStoredSkin, useSkin } from './useSkin';

describe('skin contract', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.skin;
  });

  it('initializes the document before React mounts', () => {
    localStorage.setItem('product.skin', 'dark');
    expect(initializeSkin({ storageKey: 'product.skin' })).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
  });

  it('persists only supported skins', () => {
    localStorage.setItem('product.skin', 'unknown');
    expect(readStoredSkin({ storageKey: 'product.skin' })).toBe('light');
    const { result } = renderHook(() => useSkin({ storageKey: 'product.skin' }));
    act(() => result.current[1]('dark'));
    expect(localStorage.getItem('product.skin')).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
  });

  it('reads a new storage authority before rendering when storageKey changes', () => {
    localStorage.setItem('alpha.skin', 'dark');
    localStorage.setItem('bravo.skin', 'light');
    const { result, rerender } = renderHook(
      ({ storageKey }) => useSkin({ storageKey }),
      { initialProps: { storageKey: 'alpha.skin' } },
    );
    expect(result.current[0]).toBe('dark');

    rerender({ storageKey: 'bravo.skin' });
    expect(result.current[0]).toBe('light');
    expect(localStorage.getItem('alpha.skin')).toBe('dark');
    expect(localStorage.getItem('bravo.skin')).toBe('light');
    expect(document.documentElement.dataset.skin).toBe('light');
  });

  it('synchronizes same-document hooks through one storage subscription', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const first = renderHook(() => useSkin({ storageKey: 'shared.skin' }));
    const second = renderHook(() => useSkin({ storageKey: 'shared.skin' }));

    expect(addEventListener.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1);
    act(() => first.result.current[1]('dark'));
    expect(first.result.current[0]).toBe('dark');
    expect(second.result.current[0]).toBe('dark');
    expect(localStorage.getItem('shared.skin')).toBe('dark');
  });

  it('synchronizes external storage events without writing unrelated keys', () => {
    localStorage.setItem('external.skin', 'light');
    localStorage.setItem('unrelated.preference', 'keep');
    const { result } = renderHook(() => useSkin({ storageKey: 'external.skin' }));

    act(() => {
      localStorage.setItem('external.skin', 'dark');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'external.skin',
        newValue: 'dark',
        oldValue: 'light',
        storageArea: localStorage,
      }));
    });

    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
    expect(localStorage.getItem('unrelated.preference')).toBe('keep');
  });

  it('keeps same-document hooks authoritative when persistent storage is blocked', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is blocked', 'SecurityError');
    });
    const first = renderHook(() => useSkin({ storageKey: 'blocked.skin' }));
    const second = renderHook(() => useSkin({ storageKey: 'blocked.skin' }));

    act(() => first.result.current[1]('dark'));
    expect(setItem).toHaveBeenCalledWith('blocked.skin', 'dark');
    expect(first.result.current[0]).toBe('dark');
    expect(second.result.current[0]).toBe('dark');
    expect(readStoredSkin({ storageKey: 'blocked.skin' })).toBe('dark');
    expect(document.documentElement.dataset.skin).toBe('dark');
  });
});
