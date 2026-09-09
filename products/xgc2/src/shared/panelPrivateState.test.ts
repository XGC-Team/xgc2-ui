// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import {
  panelPrivateStateKey,
  panelStateKey,
  usePanelPrivateState,
  usePanelState,
} from './panelPrivateState';

const leftPanel = { experimentId: 'experiment-1',dashboardId: 'gcs',panelId: 'panel-a' };
const rightPanel = { experimentId: 'experiment-1',dashboardId: 'gcs',panelId: 'panel-b' };

describe('panel private state keys', () => {
  it('names the experiment, dashboard, and panel, and falls back to default for each', () => {
    expect(panelPrivateStateKey(leftPanel, 'view')).toBe('xgc.panel.experiment-1.gcs.panel-a.view');
    expect(panelPrivateStateKey({}, 'view')).toBe('xgc.panel.default.default.default.view');
    expect(panelPrivateStateKey({ ...leftPanel,dashboardId: '  ' }, 'view'))
      .toBe('xgc.panel.experiment-1.default.panel-a.view');
  });

  it('widens the key only for a declared experiment scope, and drops the instance segments when it does', () => {
    expect(panelStateKey({ ...leftPanel,shared: 'experiment' }, 'robot.selection'))
      .toBe('xgc.experiment.experiment-1.robot.selection');
    expect(panelStateKey({ shared: 'experiment' }, 'robot.selection'))
      .toBe('xgc.experiment.default.robot.selection');
    // No declaration keeps the panel's own slot, whatever the key is called.
    expect(panelStateKey(leftPanel, 'robot.selection'))
      .toBe('xgc.panel.experiment-1.gcs.panel-a.robot.selection');
  });
});

describe('usePanelPrivateState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps two instances of the same plugin on separate values', () => {
    const left = renderHook(() => usePanelPrivateState(leftPanel, 'page', 0));
    const right = renderHook(() => usePanelPrivateState(rightPanel, 'page', 0));

    act(() => left.result.current[1](3));

    expect(left.result.current[0]).toBe(3);
    expect(right.result.current[0]).toBe(0);
    expect(window.localStorage.getItem(panelPrivateStateKey(leftPanel, 'page'))).toBe('3');
    expect(window.localStorage.getItem(panelPrivateStateKey(rightPanel, 'page'))).toBeNull();
  });

  it('shares one value between every component naming the same key', () => {
    const header = renderHook(() => usePanelPrivateState(leftPanel, 'view', 'double'));
    const body = renderHook(() => usePanelPrivateState(leftPanel, 'view', 'double'));

    act(() => header.result.current[1]('list'));

    expect(body.result.current[0]).toBe('list');
    act(() => body.result.current[1]((current) => current === 'list' ? 'single' : 'list'));
    expect(header.result.current[0]).toBe('single');
  });

  it('reads what another tab wrote and ignores writes to other keys', () => {
    const view = renderHook(() => usePanelPrivateState(leftPanel, 'view', 'double'));
    const key = panelPrivateStateKey(leftPanel, 'view');

    act(() => {
      window.localStorage.setItem(key, JSON.stringify('workflow'));
      window.dispatchEvent(new StorageEvent('storage', {
        key,newValue: JSON.stringify('workflow'),storageArea: window.localStorage,
      }));
    });
    expect(view.result.current[0]).toBe('workflow');

    act(() => {
      window.localStorage.setItem(panelPrivateStateKey(rightPanel, 'view'), JSON.stringify('list'));
      window.dispatchEvent(new CustomEvent('xgc-panel-state', {
        detail: { key: panelPrivateStateKey(rightPanel, 'view') },
      }));
    });
    expect(view.result.current[0]).toBe('workflow');
  });

  it('falls back to the initial value for absent and unreadable keys, and never migrates old ones', () => {
    window.localStorage.setItem('xgc.robot.instrument.view.experiment-1', 'list');
    window.localStorage.setItem(panelPrivateStateKey(rightPanel, 'view'), 'not json');

    const missing = renderHook(() => usePanelPrivateState(leftPanel, 'view', 'double'));
    const broken = renderHook(() => usePanelPrivateState(rightPanel, 'view', 'double'));

    expect(missing.result.current[0]).toBe('double');
    expect(broken.result.current[0]).toBe('double');
    expect(window.localStorage.getItem('xgc.robot.instrument.view.experiment-1')).toBe('list');
  });

  it('holds one identity for object values so subscribers do not re-render forever', () => {
    const sizes = { list: 12,single: 12,double: 12 };
    const first = renderHook(() => usePanelPrivateState(leftPanel, 'page-sizes', sizes));
    const initialValue = first.result.current[0];
    first.rerender();
    expect(first.result.current[0]).toBe(initialValue);

    act(() => first.result.current[1]({ ...sizes,list: 4 }));
    const stored = first.result.current[0];
    first.rerender();
    expect(first.result.current[0]).toBe(stored);
    expect(stored).toEqual({ list: 4,single: 12,double: 12 });
  });
});

describe('usePanelState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps one value across every panel of a plugin that declares the experiment scope', () => {
    const instruments = renderHook(() => usePanelState(
      { ...leftPanel,shared: 'experiment' }, 'robot.selection', [] as string[]));
    const control = renderHook(() => usePanelState(
      { ...rightPanel,shared: 'experiment' }, 'robot.selection', [] as string[]));
    const other = renderHook(() => usePanelState(
      { ...leftPanel,experimentId: 'experiment-2',shared: 'experiment' }, 'robot.selection', [] as string[]));

    act(() => instruments.result.current[1](['px4-01']));

    expect(control.result.current[0]).toEqual(['px4-01']);
    expect(other.result.current[0]).toEqual([]);
  });

  it('keeps the same key per instance when no scope is declared', () => {
    const left = renderHook(() => usePanelState(leftPanel, 'robot.selection', [] as string[]));
    const right = renderHook(() => usePanelState(rightPanel, 'robot.selection', [] as string[]));

    act(() => left.result.current[1](['px4-01']));

    expect(left.result.current[0]).toEqual(['px4-01']);
    expect(right.result.current[0]).toEqual([]);
  });
});
