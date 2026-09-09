// @vitest-environment jsdom

import { afterEach,describe,expect,it,vi } from 'vitest';
import {
  MARK_PROMPT_DOCK_CHANGE_EVENT,
  MARK_PROMPT_DOCK_STORAGE_KEY,
  readMarkPromptDockVisible,
  writeMarkPromptDockVisible,
} from './markPromptDockPreference';

describe('markPromptDockPreference', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to visible when nothing is stored', () => {
    expect(readMarkPromptDockVisible()).toBe(true);
  });

  it('only hides when storage is the explicit string false', () => {
    window.localStorage.setItem(MARK_PROMPT_DOCK_STORAGE_KEY, 'true');
    expect(readMarkPromptDockVisible()).toBe(true);
    window.localStorage.setItem(MARK_PROMPT_DOCK_STORAGE_KEY, '0');
    expect(readMarkPromptDockVisible()).toBe(true);
    window.localStorage.setItem(MARK_PROMPT_DOCK_STORAGE_KEY, 'false');
    expect(readMarkPromptDockVisible()).toBe(false);
  });

  it('persists and notifies listeners when written', () => {
    const listener = vi.fn();
    window.addEventListener(MARK_PROMPT_DOCK_CHANGE_EVENT, listener);
    writeMarkPromptDockVisible(false);
    expect(window.localStorage.getItem(MARK_PROMPT_DOCK_STORAGE_KEY)).toBe('false');
    expect(readMarkPromptDockVisible()).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    writeMarkPromptDockVisible(true);
    expect(window.localStorage.getItem(MARK_PROMPT_DOCK_STORAGE_KEY)).toBe('true');
    expect(readMarkPromptDockVisible()).toBe(true);
    window.removeEventListener(MARK_PROMPT_DOCK_CHANGE_EVENT, listener);
  });
});
