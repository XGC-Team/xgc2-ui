import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const focusCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'focus.css'),
  'utf8',
);

describe('shared focus contract', () => {
  it('paints one outer ring on shared input shells and suppresses the inner field', () => {
    expect(focusCss).toMatch(/\.xgc-input,\s*\n\s*\.xgc-input-control/);
    expect(focusCss).toMatch(/outline-offset:\s*0;/);
    expect(focusCss).toMatch(/\.xgc-input > input,/);
    expect(focusCss).toMatch(/\.xgc-select-control \.xgc-select-trigger/);
    const inputs = focusCss.slice(0, focusCss.indexOf(' * Navigation lives'));
    expect(inputs).not.toMatch(/outline-offset:\s*calc\(-1 \* var\(--stroke-strong\)\)/);
  });

  it('stays unlayered so consumer resets cannot erase the indicator', () => {
    const withoutComments = focusCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/@layer/);
  });

  it('keeps the workspace tab rename editor inside the tab footprint', () => {
    const start = focusCss.indexOf('.xgc-workspace-tab-input');
    const rule = focusCss.slice(start);
    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(':has(> input:focus-visible)');
    expect(rule).toContain('border-color: var(--color-border-focus);');
    expect(rule).toContain('outline: 0;');
    expect(rule).toContain(
      'box-shadow: inset 0 0 0 var(--stroke-thin) var(--color-border-focus);',
    );
  });

  it('keeps navigation focus inside the clipped control without changing its box', () => {
    const navigation = focusCss.match(/:is\(body, #root\) :where\(\s*\.xgc-workspace-tab-select,[\s\S]*?\):focus-visible \{([^}]*)\}/);
    expect(navigation).not.toBeNull();
    for (const control of ['workspace-tab-delete', 'workspace-tab-add', 'panel-view-switcher-button']) {
      expect(navigation?.[0]).toContain(`.xgc-${control}`);
    }
    expect(navigation?.[1]).toContain('outline-offset: calc(-1 * var(--stroke-strong));');
    expect(navigation?.[1]).not.toMatch(/(?:padding|margin|height|outline|box-shadow):/);
  });
});
