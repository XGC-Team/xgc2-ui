/**
 * @vitest-environment jsdom
 */
import { afterEach,describe,expect,it } from 'vitest';
import { getThemeToken } from '../theme';

describe('getThemeToken', () => {
  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset.skin;
    document.documentElement.style.removeProperty('--test-theme-token');
  });

  it('reads tokens from the active application skin', () => {
    document.documentElement.dataset.skin = 'light';
    document.documentElement.style.setProperty('--test-theme-token', '#46556b');

    expect(getThemeToken('--test-theme-token', '#000000')).toBe('#46556b');
  });

  it('uses the fallback when the active skin does not define the token', () => {
    document.documentElement.dataset.skin = 'light';

    expect(getThemeToken('--missing-theme-token', '#123456')).toBe('#123456');
  });
});
