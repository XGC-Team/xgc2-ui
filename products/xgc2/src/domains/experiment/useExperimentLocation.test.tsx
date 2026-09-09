// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import {
  experimentLastLocationStorageKey,
  storeExperimentLocation,
} from './experimentNavigation';
import { useExperimentLocation } from './useExperimentLocation';

describe('useExperimentLocation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('ignores retired navigation keys when there is no current Experiment location', () => {
    window.localStorage.setItem('xgc.nav.selectedExperimentId', 'stale');
    window.localStorage.setItem('xgc.nav.experimentView', 'detail');
    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.view).toBe('list');
    expect(result.current.selectedExperimentId).toBe('');
  });

  it('persists and restores the last viewed Experiment dashboard after a remount', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-last/gcs');
    const first = renderHook(() => useExperimentLocation());
    first.unmount();
    window.history.replaceState(null, '', '/');

    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('exp-last');
    expect(result.current.selectedDashboardId).toBe('gcs');
    expect(window.location.hash).toBe('#/experiments/exp-last/gcs');
  });

  it('lets an explicit Experiment deep link override the stored location', () => {
    storeExperimentLocation('exp-last', 'gcs');
    window.history.replaceState(null, '', '/#/experiments/exp-linked');
    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.selectedExperimentId).toBe('exp-linked');
    expect(result.current.selectedDashboardId).toBe('config');
    expect(window.localStorage.getItem(experimentLastLocationStorageKey())).toBe(JSON.stringify({
      resourceId: 'exp-linked',dashboardId: 'config',
    }));
  });

  it('falls back to the Experiment list for malformed current persistence', () => {
    window.localStorage.setItem(experimentLastLocationStorageKey(), '{broken');
    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.view).toBe('list');
    expect(result.current.selectedExperimentId).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('restores a detail location and writes navigation changes back to the hash', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-1');
    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('exp-1');
    act(() => {
      result.current.setSelectedExperimentId('exp-2');
      result.current.setView('detail');
    });
    expect(window.location.hash).toBe('#/experiments/exp-2');
  });

  it('tracks browser history locations without consulting a resource catalog', () => {
    const { result } = renderHook(() => useExperimentLocation());
    act(() => {
      window.history.replaceState(null, '', '/#/experiments/exp-1');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('exp-1');
  });

  it('owns the global list event and invalid-detail replacement', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-1');
    const { result } = renderHook(() => useExperimentLocation());

    act(() => window.dispatchEvent(new CustomEvent('xgc:experiment-list')));
    expect(result.current.view).toBe('list');
    expect(result.current.selectedExperimentId).toBe('exp-1');
    expect(window.location.hash).toBe('#/experiments');
    expect(window.localStorage.getItem(experimentLastLocationStorageKey())).toBeNull();

    act(() => {
      result.current.setSelectedExperimentId('missing');
      result.current.setView('detail');
      result.current.replaceInvalidDetailWithList();
    });
    expect(result.current.view).toBe('list');
    expect(result.current.selectedExperimentId).toBe('');
    expect(window.location.hash).toBe('#/experiments');
    expect(window.localStorage.getItem(experimentLastLocationStorageKey())).toBeNull();
  });

  it('stays on the Experiment list after remount when the hash is already the list', () => {
    storeExperimentLocation('exp-last', 'gcs');
    window.history.replaceState(null, '', '/#/experiments');
    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.view).toBe('list');
    expect(result.current.selectedExperimentId).toBe('');
    expect(window.location.hash).toBe('#/experiments');
    expect(window.localStorage.getItem(experimentLastLocationStorageKey())).toBeNull();
  });

  it('forgets the stored Experiment after an explicit list event so remount stays on the list', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-1');
    const first = renderHook(() => useExperimentLocation());
    act(() => window.dispatchEvent(new CustomEvent('xgc:experiment-list')));
    expect(window.localStorage.getItem(experimentLastLocationStorageKey())).toBeNull();
    first.unmount();
    window.history.replaceState(null, '', '/');

    const { result } = renderHook(() => useExperimentLocation());

    expect(result.current.view).toBe('list');
    expect(result.current.selectedExperimentId).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('commits dashboard selection to the hash and ignores a stale hashchange', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-1');
    const { result } = renderHook(() => useExperimentLocation());
    act(() => result.current.setSelectedDashboardId('gcs'));
    expect(result.current.selectedDashboardId).toBe('gcs');
    expect(window.location.hash).toBe('#/experiments/exp-1/gcs');

    act(() => {
      result.current.setSelectedDashboardId('config');
      result.current.setSelectedDashboardId('gcs');
      result.current.setSelectedDashboardId('config');
    });
    expect(result.current.selectedDashboardId).toBe('config');
    expect(window.location.hash).toBe('#/experiments/exp-1');

    window.history.replaceState(null, '', '/#/experiments/exp-1/gcs');
    act(() => {
      window.history.replaceState(null, '', '/#/experiments/exp-1');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.selectedDashboardId).toBe('config');
    expect(result.current.selectedExperimentId).toBe('exp-1');
  });

  it('restores a GCS dashboard deep-link without dropping the Experiment resource', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-1/gcs');
    const { result } = renderHook(() => useExperimentLocation());
    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('exp-1');
    expect(result.current.selectedDashboardId).toBe('gcs');
  });

  it('replaces a legacy detail resource without dropping its dashboard', () => {
    window.history.replaceState(null, '', '/#/experiments/legacy/gcs');
    const { result } = renderHook(() => useExperimentLocation());

    act(() => result.current.replaceDetailResourceId('current'));

    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('current');
    expect(result.current.selectedDashboardId).toBe('gcs');
    expect(window.location.hash).toBe('#/experiments/current/gcs');
    expect(window.localStorage.getItem(experimentLastLocationStorageKey())).toBe(JSON.stringify({
      resourceId:'current',dashboardId:'gcs',
    }));
  });

  it('keeps and restores the last Experiment selection when sidebar navigation clears the hash', () => {
    window.history.replaceState(null, '', '/#/experiments/exp-1');
    const { result,rerender } = renderHook(
      ({ page }) => useExperimentLocation(page),
      { initialProps: { page: 'experiment' } },
    );
    rerender({ page: 'home' });
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('exp-1');

    rerender({ page: 'experiment' });
    expect(window.location.hash).toBe('#/experiments/exp-1');

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.view).toBe('detail');
    expect(result.current.selectedExperimentId).toBe('exp-1');
    expect(window.location.hash).toBe('#/experiments/exp-1');
  });
});
