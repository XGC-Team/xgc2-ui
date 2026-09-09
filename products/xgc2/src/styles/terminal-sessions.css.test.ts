import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'terminal-sessions.css'),
  'utf8',
);

describe('Terminal session tabs', () => {
  it('places status after the session title', () => {
    expect(css).toMatch(/\.terminal-session-tabs \[data-xgc-role="terminal-session-tab-select"\] \{\s*flex-direction:\s*row-reverse;/);
    const select = css.match(/\.terminal-session-tabs \[data-xgc-role="terminal-session-tab-select"\] \{[^}]*\}/s)?.[0] ?? '';
    expect(select).toContain('justify-content: flex-end;');
  });

  it('hugs session titles instead of stretching every tab to the workspace max', () => {
    const strip = css.match(/\.terminal-session-tabs \{[^}]*\}/s)?.[0] ?? '';
    const tab = css.match(/\.terminal-session-tabs \[data-xgc-role="terminal-session-tab"\] \{[^}]*\}/s)?.[0] ?? '';
    const select = css.match(/\.terminal-session-tabs \[data-xgc-role="terminal-session-tab-select"\] \{[^}]*\}/s)?.[0] ?? '';
    const close = css.match(/\.terminal-session-tabs \[data-xgc-role="terminal-session-tab-close"\] \{[^}]*\}/s)?.[0] ?? '';

    expect(strip).toContain('width: 100%;');
    expect(strip).toContain('container-type: inline-size;');
    expect(tab).toContain('width: auto;');
    expect(tab).toContain('max-width: min(var(--size-workspace-tab-max), 100cqi);');
    expect(tab).not.toMatch(/^\s*width:\s*min\(var\(--size-workspace-tab-max\)/m);
    expect(tab).toContain('flex: 0 0 auto;');
    expect(select).toContain('width: auto;');
    expect(select).toContain('flex: 0 1 auto;');
    expect(select).toContain('max-width: min(var(--size-workspace-tab-content-max), 100cqi);');
    expect(select).not.toContain('max-width: none;');
    expect(close).toContain('flex: 0 0 auto;');
  });

  it('keeps status on the tab title type line', () => {
    const attention = css.match(/\.terminal-session-attention \{[^}]*\}/s)?.[0] ?? '';
    const chrome = css.match(
      /\.terminal-session-attention \.terminal-session-status \{[^}]*\}/s,
    )?.[0] ?? '';

    expect(attention).toContain('font-size: var(--font-base);');
    expect(attention).toContain('font-weight: var(--weight-regular);');
    expect(attention).toContain('line-height: var(--line-height-none);');
    expect(chrome).toContain('font-size: inherit;');
    expect(chrome).toContain('font-weight: inherit;');
    expect(chrome).toContain('line-height: inherit;');
    expect(css).not.toMatch(/terminal-session-attention[^{]*\{[^}]*font-size:\s*var\(--font-sm\)/);
  });

  it('keeps the layout toggle on the same type line as session tabs', () => {
    const option = css.match(
      /\.terminal-layout-toggle \[data-xgc-role="terminal-layout-toggle-option"\] \{[^}]*\}/s,
    )?.[0] ?? '';

    expect(option).toContain('font-family: var(--font-sans);');
    expect(option).toContain('font-size: var(--font-base);');
    expect(option).toContain('font-weight: var(--weight-regular);');
    expect(option).toContain('line-height: var(--line-height-none);');
  });
});
