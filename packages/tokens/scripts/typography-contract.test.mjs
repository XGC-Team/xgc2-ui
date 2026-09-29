import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const [typographyCss, v016Css, denseCss, baseCss] = await Promise.all([
  read('typography.css'),
  read('v016.css'),
  read('index.css'),
  read('base.css'),
]);

const ROLES = [
  'display', 'heading', 'title', 'emphasis', 'chrome', 'body', 'label', 'control',
  'table-header', 'table-cell', 'meta', 'status', 'caption', 'caption-caps', 'code',
];
const ROLE_KEYWORDS = new Set(['normal', 'uppercase', 'tabular-nums']);

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function rootDeclarations(css) {
  const root = withoutComments(css).match(/(?:^|\n):root\s*\{([\s\S]*?)\n\}/);
  assert.ok(root, 'expected a plain :root block');
  return new Map(
    [...root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
}

function pixels(value) {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value ?? '');
  assert.ok(match, `expected a literal px step, got ${value}`);
  return Number(match[1]);
}

const roles = rootDeclarations(typographyCss);
const v016 = rootDeclarations(v016Css);
const dense = rootDeclarations(denseCss);

test('every text role declares size, weight, line-height and tracking', () => {
  for (const role of ROLES) {
    for (const part of ['size', 'weight', 'line-height', 'tracking']) {
      assert.ok(roles.has(`--type-${role}-${part}`), `missing --type-${role}-${part}`);
    }
  }
  assert.equal(roles.get('--type-code-family'), 'var(--font-mono)');
  assert.equal(roles.get('--type-display-family'), 'var(--font-display)');
  assert.equal(roles.get('--type-caption-caps-transform'), 'uppercase');
  assert.equal(roles.get('--type-numeric-variant'), 'tabular-nums');
  for (const token of roles.keys()) {
    assert.match(token, /^--type-[a-z-]+$/, `${token} is not a role token`);
  }
});

test('roles map onto primitives that both themes define, never literal values', () => {
  for (const [token, value] of roles) {
    if (ROLE_KEYWORDS.has(value)) continue;
    const primitive = /^var\((--(?:font|weight|line-height|tracking)-[\w-]+)\)$/.exec(value)?.[1];
    assert.ok(primitive, `${token} must reference one primitive token without fallback (got ${value})`);
    assert.ok(v016.has(primitive), `${token} references ${primitive}, missing from v016.css`);
    assert.ok(dense.has(primitive), `${token} references ${primitive}, missing from index.css`);
  }
});

test('the effective v016 scale keeps an 11px floor and distinct steps', () => {
  const steps = ['--font-xs', '--font-sm', '--font-base', '--font-lg', '--font-xl', '--font-2xl']
    .map((token) => pixels(v016.get(token)));
  assert.ok(steps[0] >= 11, `--font-xs is the caption floor and must be at least 11px (got ${steps[0]}px)`);
  for (let index = 1; index < steps.length; index += 1) {
    assert.ok(steps[index] - steps[index - 1] >= 1, `type steps must be at least 1px apart: ${steps.join('/')}`);
  }
  assert.equal(v016.get('--font-md'), 'var(--font-sm)', '--font-md is a deprecated alias of --font-sm');
  assert.equal(v016.get('--weight-strong'), 'var(--weight-semibold)', '--weight-strong is a deprecated alias');
  assert.match(v016.get('--tracking-display') ?? '', /^-0?\.\d+em$/, 'display tracking tightens');
});

test('body and element defaults consume roles instead of user-agent styling', () => {
  const css = withoutComments(baseCss);
  assert.match(css, /body\s*\{[^}]*font-size:\s*var\(--type-body-size\)/);
  assert.match(css, /:where\(strong, b\)\s*\{\s*font-weight:\s*var\(--type-emphasis-weight\);\s*\}/);
  assert.match(css, /:where\(th\)\s*\{\s*font-weight:\s*var\(--type-table-header-weight\);\s*\}/);
  assert.match(css, /:where\(code, kbd, samp, pre\)\s*\{\s*font-family:\s*var\(--type-code-family\);\s*\}/);
});
