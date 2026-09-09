import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../domains/experiment/experiment-list.css');

/**
 * Running rows keep the shared ListPage chrome (idle/hover fills are
 * untouched) and reuse the selected-instrument edge plus outer halo.
 * Opening an Experiment must not set catalog selected fill. The product
 * visual contract bans left bars, running-only fills, or transparency.
 */
describe('running Experiment row visual contract', () => {
  const css = readFileSync(cssPath, 'utf8');

  it('reuses the selected-instrument border and outer halo on running rows', () => {
    expect(css).toMatch(/border-color:\s*var\(--color-selection-highlight\)/);
    expect(css).toMatch(/box-shadow:\s*var\(--shadow-selection-highlight-halo\)/);
  });

  it('keeps the halo across hover and selected states', () => {
    // One grouped rule covers bare, hover, and selected running rows.
    const runningRules = css.match(/\.experiment-list-page\s+\.experiment-row\[data-xgc-running[^{]*\{[^}]*\}/g) ?? [];
    expect(runningRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of runningRules) {
      expect(rule).toMatch(/border-color:\s*var\(--color-selection-highlight\)/);
      expect(rule).toMatch(/box-shadow:\s*var\(--shadow-selection-highlight-halo\)/);
    }
    // All three states share one grouped rule: bare, hover, and selected.
    expect(runningRules.join('\n')).toMatch(/\[data-xgc-running='true'\]:hover/);
    expect(runningRules.join('\n')).toMatch(/\[data-xgc-running='true'\]\[data-xgc-selected='true'\]/);
  });

  it('never paints, fades, or edge-marks the running row', () => {
    const rules = css.match(/\.experiment-list-page\s+\.experiment-row\[data-xgc-running[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).not.toMatch(/\bbackground\b/);
      expect(rule).not.toMatch(/\bopacity\b/);
      expect(rule).not.toMatch(/border-left|border-inline-start/);
    }
  });
});

describe('Experiment folder title visual contract', () => {
  const css = readFileSync(cssPath, 'utf8');

  it('uses regular weight for every Experiment folder title without ID exceptions', () => {
    const rule = css.match(/\.experiment-list-folder-name\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-weight:\s*var\(--weight-regular\)/);
    expect(rule).not.toMatch(/--weight-(?:bold|semibold|strong)/);
    expect(css).not.toMatch(/experiment-folder[^,{]*\[data-xgc-id/);
  });
});
