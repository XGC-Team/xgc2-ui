/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_TERMINAL_FONT_FAMILY,
  remeasureTerminalFontWhenReady,
  resolveTerminalFontFamily,
} from './terminalFont';

const SHARED_MONO = '"JetBrains Mono", ui-monospace, monospace';

describe('terminal font family', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--font-mono');
    vi.restoreAllMocks();
  });

  it('renders the untouched legacy default and blank settings in the shared code face', () => {
    document.documentElement.style.setProperty('--font-mono', SHARED_MONO);
    expect(resolveTerminalFontFamily(LEGACY_TERMINAL_FONT_FAMILY)).toBe(SHARED_MONO);
    expect(resolveTerminalFontFamily('')).toBe(SHARED_MONO);
    expect(resolveTerminalFontFamily(undefined)).toBe(SHARED_MONO);
  });

  it('keeps a family the operator chose', () => {
    document.documentElement.style.setProperty('--font-mono', SHARED_MONO);
    expect(resolveTerminalFontFamily('Fira Code, monospace')).toBe('Fira Code, monospace');
  });

  it('falls back to the legacy stack when the shared token is unavailable', () => {
    expect(resolveTerminalFontFamily(LEGACY_TERMINAL_FONT_FAMILY)).toBe(LEGACY_TERMINAL_FONT_FAMILY);
  });

  it('re-measures and refits once the bundled face is loaded', async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    const assigned: string[] = [];
    const term = { options: {} as { fontFamily?: string } };
    Object.defineProperty(term.options, 'fontFamily', {
      configurable: true,
      get: () => assigned.at(-1),
      set: (value: string) => { assigned.push(value); },
    });
    const refit = vi.fn();
    await remeasureTerminalFontWhenReady(term, SHARED_MONO, 13, () => true, refit);
    expect(load).toHaveBeenCalledWith('13px "JetBrains Mono"');
    expect(assigned).toEqual([`${SHARED_MONO} `, SHARED_MONO]);
    expect(refit).toHaveBeenCalledTimes(1);

    const stale = vi.fn();
    await remeasureTerminalFontWhenReady(term, SHARED_MONO, 13, () => false, stale);
    expect(stale).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, 'fonts');
  });
});
