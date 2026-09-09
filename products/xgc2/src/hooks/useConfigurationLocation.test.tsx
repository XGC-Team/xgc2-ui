// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it } from 'vitest';
import { useConfigurationLocation } from './useConfigurationLocation';

describe('useConfigurationLocation', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('restores, opens, closes, and replaces invalid detail locations using stable IDs', () => {
    window.location.hash = '#/assets/robots/script%2Ffield';
    const { result } = renderHook(() => useConfigurationLocation('robotAsset'));

    expect(result.current.resourceId).toBe('script/field');
    act(() => result.current.open('script next'));
    expect(result.current.resourceId).toBe('script next');
    expect(window.location.hash).toBe('#/assets/robots/script%20next');

    act(() => result.current.close());
    expect(result.current.resourceId).toBe('');
    expect(window.location.hash).toBe('#/assets/robots');

    act(() => result.current.open('deleted'));
    act(() => result.current.replaceInvalidWithList());
    expect(result.current.resourceId).toBe('');
    expect(window.location.hash).toBe('#/assets/robots');
  });

  it('keeps the last robot asset while parked when another page writes the hash', () => {
    window.location.hash = '#/assets/robots/scout-mini';
    const { result,rerender } = renderHook(
      ({ active }) => useConfigurationLocation('robotAsset', active),
      { initialProps: { active: true } },
    );
    expect(result.current.resourceId).toBe('scout-mini');

    rerender({ active: false });
    act(() => {
      window.history.replaceState(null, '', '/#/experiments/exp-1');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.resourceId).toBe('scout-mini');

    rerender({ active: true });
    expect(window.location.hash).toBe('#/assets/robots/scout-mini');
  });

  it('keeps and restores the last robot asset when sidebar navigation clears the hash', () => {
    window.location.hash = '#/assets/robots/scout-mini';
    const { result,rerender } = renderHook(
      ({ active }) => useConfigurationLocation('robotAsset', active),
      { initialProps: { active: true } },
    );

    rerender({ active: false });
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.resourceId).toBe('scout-mini');

    rerender({ active: true });
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.resourceId).toBe('scout-mini');
    expect(window.location.hash).toBe('#/assets/robots/scout-mini');
  });
});
