// @vitest-environment jsdom

import { afterEach,describe,expect,it } from 'vitest';
import {
  lichtblickLayoutWasBootstrapped,
  markLichtblickLayoutBootstrapped,
} from './lichtblickLayoutBootstrap';

describe('lichtblickLayoutBootstrap', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('is unset until this process has loaded once', () => {
    expect(lichtblickLayoutWasBootstrapped('local', 'process-lichtblick')).toBe(false);
    markLichtblickLayoutBootstrapped('local', 'process-lichtblick');
    expect(lichtblickLayoutWasBootstrapped('local', 'process-lichtblick')).toBe(true);
    expect(lichtblickLayoutWasBootstrapped('local', 'process-other')).toBe(false);
  });
});
