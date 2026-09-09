// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it } from 'vitest';
import { ugvChassisHoldKey,useUgvChassisHold } from './ugvChassisHoldStore';

const scope = { experimentId:'experiment-a',shared:'experiment' as const };

describe('useUgvChassisHold',() => {
  afterEach(() => {
    window.localStorage.removeItem(ugvChassisHoldKey(scope));
  });

  it('shares the experiment-wide latch and ignores non-boolean storage',() => {
    const key = ugvChassisHoldKey(scope);
    window.localStorage.setItem(key, JSON.stringify('yes'));
    const first = renderHook(() => useUgvChassisHold(scope));
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1](true));
    expect(JSON.parse(window.localStorage.getItem(key) ?? 'false')).toBe(true);
    const second = renderHook(() => useUgvChassisHold(scope));
    expect(second.result.current[0]).toBe(true);
  });

  it('uses one experiment key across Robot control and instruments panel ids',() => {
    const control = { experimentId:'experiment-a',panelId:'robot-control',shared:'experiment' as const };
    const instruments = { experimentId:'experiment-a',panelId:'robot-instruments',shared:'experiment' as const };
    expect(ugvChassisHoldKey(control)).toBe(ugvChassisHoldKey(instruments));
    const writer = renderHook(() => useUgvChassisHold(control));
    act(() => writer.result.current[1](true));
    const reader = renderHook(() => useUgvChassisHold(instruments));
    expect(reader.result.current[0]).toBe(true);
  });
});
