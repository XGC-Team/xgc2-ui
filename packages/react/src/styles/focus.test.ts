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
    expect(focusCss).not.toMatch(/outline-offset:\s*calc\(-1 \* var\(--stroke-strong\)\)/);
  });

  it('stays unlayered so consumer resets cannot erase the indicator', () => {
    const withoutComments = focusCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/@layer/);
  });
});
