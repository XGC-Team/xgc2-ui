import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { initializeSkin, readStoredSkin, useSkin } from './useSkin';

describe('skin contract', () => {
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
});
