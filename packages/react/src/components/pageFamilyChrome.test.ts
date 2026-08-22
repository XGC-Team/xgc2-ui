import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = join(dirname(fileURLToPath(import.meta.url)), '../styles.css');

function ruleDeclarations(css: string, selector: string): Map<string, string> {
  const needle = `${selector} {`;
  const start = css.indexOf(needle);
  if (start < 0) throw new Error(`missing rule ${selector} in ${stylesPath}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`unclosed rule ${selector} in ${stylesPath}`);
  const declarations = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map(declarations.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return [];
    return [[declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()]];
  }));
}

describe('page-family visual geometry', () => {
  it('keeps compact settings geometry independently owned from resource directories', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const configToggle = ruleDeclarations(css, '.xgc-config-section-toggle');
    const configTitle = ruleDeclarations(css, '.xgc-config-section-title');
    const configBody = ruleDeclarations(css, '.xgc-config-section-body');
    const configRow = ruleDeclarations(css, '.xgc-config-section-body > .xgc-form-field');
    const listFolder = ruleDeclarations(css, '.xgc-list-folder-title');
    const listFolderTitle = ruleDeclarations(css, '.xgc-list-folder-title strong');

    expect(configToggle.get('min-height')).toBe('var(--size-control-default)');
    expect(configToggle.get('padding')).toBe('0 var(--space-md)');
    expect(configTitle.get('font-size')).toBe('var(--font-base)');
    expect(configTitle.get('font-weight')).toBe('var(--weight-regular)');
    expect(configTitle.get('line-height')).toBe('var(--line-height-tight)');
    expect(configBody.get('padding')).toBe('0 var(--space-xl) var(--space-xs)');
    expect(configRow.get('padding')).toBe('var(--space-sm) 0');

    expect(listFolder.get('min-height')).toBe('30px');
    expect(listFolder.get('padding')).toBe('0 var(--xgc-list-folder-title-padding-inline, 0)');
    expect(listFolderTitle.get('font-size')).toBe('var(--font-base)');
    expect(listFolderTitle.get('font-weight')).toBe('var(--weight-regular)');
  });
});
