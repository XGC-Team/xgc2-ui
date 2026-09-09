// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import { usePersistentState } from './usePersistentState';

describe('usePersistentState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('rejects invalid stored values with the supplied validator', () => {
    window.localStorage.setItem('xgc.test.mode', JSON.stringify('bad'));

    const { result } = renderHook(() => usePersistentState<'tabs' | 'grid'>(
      'xgc.test.mode',
      'tabs',
      (value): value is 'tabs' | 'grid' => value === 'tabs' || value === 'grid',
    ));

    expect(result.current[0]).toBe('tabs');
  });

  it('loads valid stored values and falls back on malformed storage', () => {
    window.localStorage.setItem('xgc.test.mode', JSON.stringify('grid'));
    const valid = renderHook(() => usePersistentState<'tabs' | 'grid'>(
      'xgc.test.mode',
      'tabs',
      (value): value is 'tabs' | 'grid' => value === 'tabs' || value === 'grid',
    ));
    expect(valid.result.current[0]).toBe('grid');
    valid.unmount();

    window.localStorage.setItem('xgc.test.raw', JSON.stringify({ view: 'all' }));
    const raw = renderHook(() => usePersistentState('xgc.test.raw', { view: 'default' }));
    expect(raw.result.current[0]).toEqual({ view: 'all' });
    raw.unmount();

    window.localStorage.setItem('xgc.test.bad-json', '{bad');
    const malformed = renderHook(() => usePersistentState('xgc.test.bad-json', 'fallback'));
    expect(malformed.result.current[0]).toBe('fallback');
  });

  it('persists valid updates', () => {
    const { result } = renderHook(() => usePersistentState('xgc.test.count', 1, isPositiveInteger));

    act(() => {
      result.current[1](2);
    });

    expect(window.localStorage.getItem('xgc.test.count')).toBe('2');
  });
});

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
