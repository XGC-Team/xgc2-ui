// @vitest-environment jsdom

import { afterEach,describe,expect,it,vi } from 'vitest';
import {
  TEXT_SELECTION_CHANGE_EVENT,
  TEXT_SELECTION_STORAGE_KEY,
  initializeTextSelectionPreference,
  readTextSelectionEnabled,
  writeTextSelectionEnabled,
} from './textSelectionPreference';

describe('textSelectionPreference', () => {
  afterEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.xgcTextSelection;
  });

  it('uses the caller build default only when no valid override is stored', () => {
    expect(readTextSelectionEnabled(true)).toBe(true);
    expect(readTextSelectionEnabled(false)).toBe(false);
    window.localStorage.setItem(TEXT_SELECTION_STORAGE_KEY, 'invalid');
    expect(readTextSelectionEnabled(false)).toBe(false);
    window.localStorage.setItem(TEXT_SELECTION_STORAGE_KEY, 'true');
    expect(readTextSelectionEnabled(false)).toBe(true);
    window.localStorage.setItem(TEXT_SELECTION_STORAGE_KEY, 'false');
    expect(readTextSelectionEnabled(true)).toBe(false);
  });

  it('initializes and writes the document-level selection contract', () => {
    expect(initializeTextSelectionPreference(false)).toBe(false);
    expect(document.documentElement).toHaveAttribute('data-xgc-text-selection','restricted');

    const listener = vi.fn();
    window.addEventListener(TEXT_SELECTION_CHANGE_EVENT,listener);
    writeTextSelectionEnabled(true);
    expect(window.localStorage.getItem(TEXT_SELECTION_STORAGE_KEY)).toBe('true');
    expect(document.documentElement).toHaveAttribute('data-xgc-text-selection','enabled');
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(TEXT_SELECTION_CHANGE_EVENT,listener);
  });
});
