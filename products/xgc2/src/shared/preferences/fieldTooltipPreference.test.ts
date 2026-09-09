// @vitest-environment jsdom

import { afterEach,describe,expect,it,vi } from 'vitest';
import {
  FIELD_TOOLTIPS_CHANGE_EVENT,
  FIELD_TOOLTIPS_STORAGE_KEY,
  readFieldTooltipsEnabled,
  writeFieldTooltipsEnabled,
} from './fieldTooltipPreference';

describe('fieldTooltipPreference', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to off when nothing is stored', () => {
    expect(readFieldTooltipsEnabled()).toBe(false);
  });

  it('only enables when storage is the explicit string true', () => {
    window.localStorage.setItem(FIELD_TOOLTIPS_STORAGE_KEY, 'false');
    expect(readFieldTooltipsEnabled()).toBe(false);
    window.localStorage.setItem(FIELD_TOOLTIPS_STORAGE_KEY, '1');
    expect(readFieldTooltipsEnabled()).toBe(false);
    window.localStorage.setItem(FIELD_TOOLTIPS_STORAGE_KEY, 'true');
    expect(readFieldTooltipsEnabled()).toBe(true);
  });

  it('persists and notifies listeners when written', () => {
    const listener = vi.fn();
    window.addEventListener(FIELD_TOOLTIPS_CHANGE_EVENT, listener);
    writeFieldTooltipsEnabled(true);
    expect(window.localStorage.getItem(FIELD_TOOLTIPS_STORAGE_KEY)).toBe('true');
    expect(readFieldTooltipsEnabled()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    writeFieldTooltipsEnabled(false);
    expect(window.localStorage.getItem(FIELD_TOOLTIPS_STORAGE_KEY)).toBe('false');
    expect(readFieldTooltipsEnabled()).toBe(false);
    window.removeEventListener(FIELD_TOOLTIPS_CHANGE_EVENT, listener);
  });
});
