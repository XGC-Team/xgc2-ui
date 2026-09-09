import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'robot-instrument-board.css'),
  'utf8',
);

describe('robot instrument board shell', () => {
  it('uses one pane gutter token set for every presentation', () => {
    const rule = css.match(
      /\.robot-instrument-grid \{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(rule).toContain('--robot-instrument-selection-gutter: var(--space-lg);');
    expect(rule).toContain('--robot-instrument-inline-gutter: var(--space-sm);');
    expect(rule).toContain('padding-block: var(--robot-instrument-selection-gutter);');
    expect(rule).toContain('padding-inline: var(--robot-instrument-inline-gutter);');
    expect(css).not.toContain('--space-panel-padding');
  });

  it('balances the reserved scrollbar gutter around instrument boards', () => {
    const rule = css.match(
      /\.robot-instrument-grid:is\(\[data-xgc-layout="single"\], \[data-xgc-layout="double"\]\) \{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(rule).toContain('scrollbar-gutter: stable both-edges;');
  });

  it('inherits the framed Panel surface instead of painting a second gray pane', () => {
    const rule = css.match(
      /\.robot-instruments-panel \{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(rule).toContain('background: transparent;');
    expect(rule).not.toContain('--color-bg-subtle');
  });

  it('leaves the visible frame to the instrument instead of drawing a second silver border', () => {
    const rule = css.match(
      /\.robot-instrument-card\[data-xgc-presentation="instrument"\] \{(?<body>[^}]*)\}/,
    )?.groups?.body;

    expect(rule).toContain('background: var(--color-robot-flight-panel-fill);');
    expect(rule).toContain('border: 0;');
    expect(rule).toContain('border-radius: var(--radius-card);');
    expect(rule).not.toContain('background: transparent;');
    expect(rule).not.toContain('var(--stroke-strong)');
    expect(css).not.toContain(
      '.robot-instrument-card[data-xgc-presentation="instrument"][data-xgc-platform="ground"]',
    );
  });
});
