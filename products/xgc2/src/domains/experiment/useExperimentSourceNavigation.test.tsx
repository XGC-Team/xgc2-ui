// @vitest-environment jsdom
import { act,cleanup,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getExperiment } from './experimentService';
import { openExperimentSourceLocation,readStoredExperimentLocation } from './experimentNavigation';
import { useExperimentLocation } from './useExperimentLocation';
import type { ExperimentDocument } from './experimentModel';

vi.mock('./experimentService', () => ({ getExperiment: vi.fn() }));

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/#/experiments/previous/gcs');
  vi.mocked(getExperiment).mockReset().mockImplementation(async (resourceId) => experiment(resourceId));
});
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('Experiment source navigation', () => {
  it('replaces a parked location through its owner before the page restore runs', async () => {
    const hook = renderHook(({ page }) => useExperimentLocation(page, 'agent-a'), { initialProps: { page: 'experiment' } });
    hook.rerender({ page: 'home' });
    window.history.replaceState(null, '', '/');
    await act(async () => {
      const result = await openExperimentSourceLocation({ targetId: 'agent-a',resourceId: 'requested',preferActivity: true }, () => {
        window.history.replaceState(null, '', '/');
        hook.rerender({ page: 'experiment' });
      });
      expect(result).toBe(true);
    });
    expect(hook.result.current.selectedExperimentId).toBe('requested');
    expect(hook.result.current.selectedDashboardId).toBe('activity');
    expect(window.location.hash).toBe('#/experiments/requested/activity');
    expect(readStoredExperimentLocation()).toEqual({ resourceId: 'requested',dashboardId: 'activity' });
    hook.rerender({ page: 'home' });
    window.history.replaceState(null, '', '/');
    hook.rerender({ page: 'experiment' });
    expect(window.location.hash).toBe('#/experiments/requested/activity');
  });

  it('consumes a cold-route request after mount and activates only once', async () => {
    const activate = vi.fn();
    const pending = openExperimentSourceLocation({ targetId: 'local',resourceId: 'cold',dashboardId: 'gcs' }, activate);
    const hook = renderHook(() => useExperimentLocation('experiment', 'local'));
    await act(async () => { expect(await pending).toBe(true); });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(hook.result.current.selectedExperimentId).toBe('cold');
    expect(window.location.hash).toBe('#/experiments/cold/gcs');
  });

  it('preserves the parked location when the source or dashboard no longer exists', async () => {
    const hook = renderHook(() => useExperimentLocation('home', 'agent-a'));
    const activate = vi.fn();
    await act(async () => {
      expect(await openExperimentSourceLocation({ targetId: 'agent-a',resourceId: 'requested',dashboardId: 'deleted' }, activate)).toBe(false);
    });
    expect(hook.result.current.selectedExperimentId).toBe('previous');
    expect(activate).not.toHaveBeenCalled();
    vi.mocked(getExperiment).mockRejectedValueOnce(new Error('not found'));
    await act(async () => {
      expect(await openExperimentSourceLocation({ targetId: 'agent-a',resourceId: 'deleted' }, activate)).toBe(false);
    });
    expect(window.location.hash).toBe('#/experiments/previous/gcs');
  });

  it('rejects an unrelated target without reading the source', async () => {
    renderHook(() => useExperimentLocation('home', 'agent-b'));
    await expect(openExperimentSourceLocation({ targetId: 'agent-a',resourceId: 'requested' }, vi.fn())).resolves.toBe(false);
    expect(getExperiment).not.toHaveBeenCalled();
  });

  it('cancels a late source read when the execution target changes', async () => {
    let resolve!: (value: ExperimentDocument) => void;
    vi.mocked(getExperiment).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const hook = renderHook(({ targetId }) => useExperimentLocation('home', targetId), { initialProps: { targetId: 'agent-a' } });
    const activate = vi.fn();
    const pending = openExperimentSourceLocation({ targetId: 'agent-a',resourceId: 'late' }, activate);
    await act(async () => { await Promise.resolve(); });
    const signal = vi.mocked(getExperiment).mock.calls[0][1];
    hook.rerender({ targetId: 'agent-b' });
    expect(signal?.aborted).toBe(true);
    await expect(pending).resolves.toBe(false);
    await act(async () => { resolve(experiment('late')); });
    expect(hook.result.current.selectedExperimentId).toBe('previous');
    expect(activate).not.toHaveBeenCalled();
  });
});

function experiment(resourceId: string): ExperimentDocument {
  return { head: { resourceId },spec: { dashboards: [
    { id: 'gcs',panels: [] },
    { id: 'activity',panels: [{ pluginId: 'ground-station-activity' }] },
  ] } } as unknown as ExperimentDocument;
}
