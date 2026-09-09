import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'robot-instrument-list.css'), 'utf8');
const baseCss = readFileSync(join(here, 'robot-instrument-base.css'), 'utf8');
const boardCss = readFileSync(join(here, 'robot-instrument-board.css'), 'utf8');

function ruleBody(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escaped} \\{(?<body>[^}]*)\\}`))?.groups?.body;
}

function cssPx(source: string, name: string) {
  const match = source.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(\\d+)px`));
  return match ? Number(match[1]) : Number.NaN;
}

describe('robot instrument list shell', () => {
  it('places identity in a card topbar above the approved 4x2 telemetry body', () => {
    const grid = ruleBody(
      baseCss,
      '.robot-instrument-grid[data-xgc-layout="list"]',
    );
    const sharedGrid = ruleBody(boardCss, '.robot-instrument-grid');
    const card = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-instrument-card',
    );
    const header = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-instrument-card > header',
    );
    const vector = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-value',
    );

    expect(grid).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(grid).toContain('width: 100%');
    expect(grid).toContain('max-width: 100%');
    expect(grid).toContain('min-width: 0');
    expect(grid).not.toContain('--robot-instrument-selection-gutter');
    expect(grid).not.toContain('--robot-instrument-inline-gutter');
    expect(grid).toContain('gap: var(--space-2xs)');
    expect(sharedGrid).toContain('--robot-instrument-selection-gutter: var(--space-lg)');
    expect(sharedGrid).toContain('--robot-instrument-inline-gutter: var(--space-sm)');
    expect(sharedGrid).toContain('padding-block: var(--robot-instrument-selection-gutter)');
    expect(sharedGrid).toContain('padding-inline: var(--robot-instrument-inline-gutter)');
    expect(grid).toContain('overflow-x: hidden');
    expect(grid).toContain('scrollbar-gutter: stable both-edges');
    expect(card).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(card).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(card).toContain('padding: var(--stroke-thin) var(--space-2xs)');
    expect(card).toContain('max-height: var(--robot-instrument-list-row-max-height)');
    expect(card).toContain('width: 100%');
    expect(card).toContain('max-width: 100%');
    expect(card).toContain('min-width: 0');
    expect(css).not.toContain('--robot-list-identity-width:');
    expect(baseCss).not.toContain('--robot-list-metric-min-width:');

    expect(header).toContain('border-bottom: var(--stroke-thin) solid var(--color-border-muted)');
    expect(header).not.toContain('border-right: var(--stroke-thin)');
    expect(header).toContain('white-space: nowrap');
    expect(header).toContain('height: var(--robot-list-topbar-height)');
    expect(header).toContain('grid-template-columns: minmax(0, 1fr) max-content');

    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(css).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))');
    expect(vector).toContain('display: flex');
    expect(vector).toContain('justify-content: center');
    expect(vector).toContain('white-space: pre');
    expect(css).not.toContain('216px');
  });

  it('keeps the 90px 4x2 geometry at every supported container width', () => {
    const historical = cssPx(baseCss, '--robot-list-historical-compact-row');
    const line = cssPx(baseCss, '--robot-list-topbar-line-height');
    const raised = 128;
    const narrow = containerBlock(css, '32rem');
    expect(historical).toBe(70);
    expect(line).toBe(20);
    expect(baseCss).not.toContain('--robot-list-topbar-wrap-width');
    expect(historical + line).toBe(90);
    expect(historical + line).toBeLessThan(raised);
    expect(baseCss).toMatch(
      /--robot-list-topbar-height:\s*var\(--robot-list-topbar-line-height\)/,
    );
    expect(baseCss).toMatch(
      /--robot-instrument-list-row-max-height:\s*calc\(\s*var\(--robot-list-historical-compact-row\) \+ var\(--robot-list-topbar-height\)\s*\)/,
    );
    expect(baseCss).not.toMatch(/--robot-instrument-list-row-max-height:\s*128px/);
    expect(narrow).not.toContain('grid-template-rows:');
    expect(narrow).not.toContain('grid-template-columns: repeat(2,');
    expect(narrow).not.toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).not.toContain('@container (max-width: 16rem)');
    expect(css).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/--font-(2xs|3xs|4xs)/);
  });

  it('ellipsizes only narrow labels while keeping three values and rates complete', () => {
    const vector = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-value',
    );
    const axis = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-axis',
    );
    const digits = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-axis .robot-list-metric-digits',
    );
    const sign = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-axis .robot-list-metric-sign',
    );
    const dt = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-instrument-card dl > div > dt',
    );
    const title = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-title',
    );
    const rate = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-rate',
    );
    const body = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-body',
    );
    const readout = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-readout',
    );
    const scalar = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-value',
    );
    const narrow = containerBlock(css, '32rem');
    const narrowTitle = ruleBody(
      narrow,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-title',
    );
    const narrowAxis = ruleBody(
      narrow,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-axis',
    );
    const narrowDigits = ruleBody(
      narrow,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-axis .robot-list-metric-digits',
    );
    const narrowSign = ruleBody(
      narrow,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-metric-vector-axis .robot-list-metric-sign',
    );

    expect(title).toBeTruthy();
    expect(dt).toContain('justify-content: space-between');
    expect(dt).toContain('padding-inline: var(--space-2xs)');
    expect(dt).toContain('box-sizing: border-box');
    expect(title).not.toContain('width: 100%');
    expect(body).not.toContain('9px');
    expect(body).toContain('place-items: center');
    expect(readout).toContain('justify-content: center');
    expect(scalar).toContain('grid-template-columns: 1ch max-content max-content');
    expect(css).toContain('.robot-list-metric-unit');
    expect(vector).toContain('display: flex');
    expect(vector).toContain('justify-content: center');
    expect(vector).toContain('white-space: pre');
    expect(vector).not.toContain('grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr) max-content minmax(0, 1fr)');
    expect(axis).toContain('display: grid');
    expect(axis).toContain('max-width: 6ch');
    expect(axis).toContain('flex: 1 1 0');
    expect(axis).toContain('min-width: 0');
    expect(axis).not.toContain('justify-content: flex-end');
    expect(axis).not.toContain('width: 100%');
    expect(sign).toContain('text-align: right');
    expect(digits).toContain('display: grid');
    expect(digits).toContain('grid-template-columns: minmax(0, 2fr) max-content minmax(0, 2fr)');
    expect(digits).not.toContain('min-width: 5ch');
    expect(css).toContain('.robot-metric-vector-int');
    expect(css).toContain('.robot-metric-vector-frac');
    expect(css).not.toContain('display: contents');
    expect(css).not.toContain('.robot-metric-vector-axis-label');
    expect(css).not.toMatch(/\.robot-metric-vector-[\w-]*[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    expect(rate).not.toContain('display: none');
    expect(rate).not.toContain('grid-row: 2');
    expect(rate).toContain('flex: 0 0 auto');
    expect(rate).toContain('white-space: nowrap');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(css).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('grid-auto-flow: row');
    expect(narrowTitle).toContain('min-width: 0');
    expect(narrowTitle).toContain('overflow: hidden');
    expect(narrowTitle).toContain('text-overflow: clip');
    expect(narrowAxis).toContain('min-width: 0');
    expect(narrowDigits).toContain('min-width: 0');
    expect(narrowSign).toContain('overflow: visible');
    expect(narrowSign).not.toContain('width: 1ch');
    expect(narrow).toMatch(/\.robot-instrument-card \{[^}]*padding-inline:\s*0/s);
    expect(narrow).toMatch(/\.robot-instrument-card dl > div \{[^}]*padding-inline:\s*0/s);
    expect(narrow).toMatch(/dl > div > dt \{[^}]*padding-inline:\s*var\(--space-2xs\)/s);
    expect(narrow).not.toMatch(/dl > div > dt \{[^}]*padding-inline:\s*0/s);
    expect(narrow).not.toMatch(/--robot-instrument-inline-gutter:\s*0/);
    expect(narrow).toContain('font-size: var(--font-xs)');
    expect(narrow).not.toContain('display: none');
    expect(narrow).not.toMatch(/\.robot-(?:metric-vector|list-metric-(?:value|readout|rate|digits))[\w-]*[^{}]*\{[^}]*text-overflow:\s*ellipsis/);
    expect(narrow).not.toMatch(/order\s*:/);
  });

  it('reserves one readable four-glyph trailing track with no visible icon boxes or Scout exception', () => {
    const trailing = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-header-trailing',
    );
    const status = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-header-status',
    );
    const title = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-metric-title',
    );

    expect(trailing).toContain('min-inline-size: 5rem');
    expect(trailing).toContain('gap: var(--space-xs)');
    expect(status).toContain('min-width: 0');
    expect(status).toContain('flex: 0 0 auto');
    expect(status).not.toContain('robot-list-header-status-square');
    expect(css).not.toContain('--robot-list-header-status-square');
    expect(css).not.toContain('.robot-list-header-status .robot-instrument-status-glyph');
    expect(title).toContain('text-overflow: clip');
    expect(title).not.toContain('ellipsis');
    expect(css).not.toMatch(/scout[-_]?0?3/i);
    expect(css).toContain('.robot-list-flight-primary-state[data-xgc-tone="success"]');
    expect(css).toContain('.robot-list-flight-primary-state [data-xgc-tone="success"]');
  });

  it('puts list header identity and MANUAL/ARMED/GROUND on the same markable word type', () => {
    expect(css).toMatch(
      /\.robot-card-identity > strong,\s*\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-list-header-word \{\s*font-family:\s*var\(--font-sans\);\s*font-size:\s*var\(--font-sm\);\s*font-weight:\s*var\(--weight-regular\);\s*line-height:\s*var\(--line-height-none\);\s*pointer-events:\s*auto;/,
    );
    const primary = ruleBody(
      css,
      '.robot-instrument-grid[data-xgc-layout="list"] .robot-list-primary-state',
    );

    expect(primary).not.toContain('font-family: var(--font-mono)');
    expect(primary).not.toContain('font-size: var(--font-xs)');
    expect(css).not.toMatch(
      /\[data-xgc-density="comfortable"\][^{]*header strong[^{]*\{[^}]*font-size:\s*var\(--font-sm\)/,
    );
    expect(css).toContain('.robot-list-header-word[data-xgc-tone="success"]');
    expect(css).toContain('.robot-list-header-word[data-xgc-tone="danger"]');
  });

  it('keeps the PX4 setpoint mask five-field tile hittable', () => {
    expect(css).toContain('.robot-setpoint-mask-labels');
    expect(css).toContain('.robot-setpoint-mask-states-row');
    expect(css).toContain('.robot-setpoint-mask-sep');
    expect(css).toMatch(
      /dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-labels,\s*\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-instrument-card dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-states-row \{[^}]*display:\s*flex/,
    );
    expect(css).toMatch(
      /dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-labels,\s*\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-instrument-card dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-states-row \{[^}]*justify-content:\s*center/,
    );
    expect(css).toMatch(
      /dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-labels \{[^}]*column-gap:\s*var\(--space-2xs\)/,
    );
    expect(css).toMatch(
      /dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-states-row \{[^}]*column-gap:\s*0/,
    );
    expect(css).toMatch(
      /dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-labels,\s*\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-instrument-card dl > div\.robot-metric-setpoint-mask > \.robot-setpoint-mask-states-row \{[^}]*overflow:\s*visible/,
    );
    expect(css).toMatch(
      /\.robot-metric-setpoint-mask > dt,\s*\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-metric-setpoint-mask > dd \{[^}]*pointer-events:\s*auto/,
    );
    expect(css).not.toMatch(/repeat\(5, max-content\)/);
  });

  it('turns the selected list halo red while chassis hold is latched', () => {
    expect(css).toMatch(
      /\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-instrument-card\[data-xgc-chassis-hold="true"\] \{[^}]*border-color:\s*var\(--color-danger\)/,
    );
    expect(css).toMatch(
      /\.robot-instrument-grid\[data-xgc-layout="list"\] \.robot-instrument-card\[data-xgc-chassis-hold="true"\] \{[^}]*box-shadow:[^}]*--color-danger/,
    );
  });
});

function containerBlock(source: string, maxWidth: string) {
  const start = source.indexOf(`@container (max-width: ${maxWidth})`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  return '';
}
