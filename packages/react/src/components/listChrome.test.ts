import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = join(dirname(fileURLToPath(import.meta.url)), '../styles.css');

function shippedStyles(): string {
  return readFileSync(stylesPath, 'utf8');
}

function ruleBody(css: string, selector: string): string {
  const needle = `${selector} {`;
  const start = css.indexOf(needle);
  if (start < 0) {
    throw new Error(`missing rule ${selector} in ${stylesPath}`);
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) {
    throw new Error(`unclosed rule ${selector} in ${stylesPath}`);
  }
  return css.slice(open + 1, close);
}

function background(css: string, selector: string): string {
  const body = ruleBody(css, selector);
  const match = body.match(/(?:^|\n)\s*background\s*:\s*([^;]+);/);
  const value = match?.[1]?.trim();
  if (!value) {
    throw new Error(`${selector} has no background in ${stylesPath}`);
  }
  return value;
}

describe('shared list chrome', () => {
  it('uses recessed gray for table headers and pagination footers', () => {
    const css = shippedStyles();
    expect(stylesPath.endsWith('src/styles.css')).toBe(true);
    expect(background(css, '.xgc-data-table th')).toBe('var(--color-bg-subtle)');
    expect(background(css, '.xgc-log-table-head')).toBe('var(--color-bg-subtle)');
    expect(background(css, '.xgc-pagination')).toBe('var(--color-bg-subtle)');
  });
});
