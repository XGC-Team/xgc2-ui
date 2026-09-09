// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { browserLanguagePreference,isAppLanguage } from './languagePreference';

describe('language preference', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('navigator', { language: 'en-US' });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('accepts only supported language identifiers', () => {
    expect(isAppLanguage('en-US')).toBe(true);
    expect(isAppLanguage('zh-CN')).toBe(true);
    expect(isAppLanguage('zh')).toBe(false);
  });

  it('derives the first-run default from the browser language', () => {
    vi.stubGlobal('navigator', { language: 'zh-Hans-CN' });
    expect(browserLanguagePreference()).toBe('zh-CN');
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(browserLanguagePreference()).toBe('en-US');
  });
});
