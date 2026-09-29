import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Heading, Text } from './Typography';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Typography.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing rule ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return new Map(body.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':');
    return separator < 0 ? [] : [[declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()]];
  }));
}

describe('Typography roles', () => {
  it('keeps the semantic element independent from the visual variant', () => {
    render(
      <>
        <Text as="p" variant="meta">Updated 2 h ago</Text>
        <Heading as="h3" variant="page">Experiments</Heading>
      </>,
    );
    expect(screen.getByText('Updated 2 h ago').tagName).toBe('P');
    expect(screen.getByText('Updated 2 h ago')).toHaveAttribute('data-variant', 'meta');
    expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute('data-variant', 'page');
  });

  it.each([
    ['body', 'body'],
    ['secondary', 'body'],
    ['label', 'label'],
    ['meta', 'meta'],
    ['caption', 'caption'],
    ['code', 'code'],
  ])('renders Text %s from the %s role only', (variant, role) => {
    const rule = declarations(`.xgc-text[data-variant='${variant}']`);
    expect(rule.get('font-size')).toBe(`var(--type-${role}-size)`);
    expect(rule.get('font-weight')).toBe(`var(--type-${role}-weight)`);
    expect(rule.get('line-height')).toBe(`var(--type-${role}-line-height)`);
  });

  it.each([
    ['page', 'display'],
    ['section', 'title'],
    ['panel', 'chrome'],
  ])('renders Heading %s from the %s role only', (variant, role) => {
    const rule = declarations(`.xgc-heading[data-variant='${variant}']`);
    expect(rule.get('font-size')).toBe(`var(--type-${role}-size)`);
    expect(rule.get('font-weight')).toBe(`var(--type-${role}-weight)`);
    expect(rule.get('line-height')).toBe(`var(--type-${role}-line-height)`);
    expect(rule.get('letter-spacing')).toBe(`var(--type-${role}-tracking)`);
  });

  it('never picks primitive steps or literal type values', () => {
    expect(css).not.toMatch(/var\(--(?:font-(?:xs|sm|md|base|lg|xl|2xl)|weight-[a-z]+|line-height-[a-z]+|tracking-[a-z]+)\)/);
    expect(css).not.toMatch(/(?:font-size|font-weight|line-height|letter-spacing)\s*:\s*-?\d/);
  });
});
