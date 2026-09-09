import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot-flight.css'), 'utf8');

describe('robot flight rate list', () => {
  it('does not draw a second silver bezel inside the Robot card', () => {
    const instrumentRule = css.match(/\.robot-flight-instrument \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(instrumentRule).toContain('border: 0;');
    expect(instrumentRule).toContain('box-shadow: none;');
    expect(instrumentRule).not.toContain('var(--color-robot-flight-border)');
    expect(instrumentRule).not.toContain('var(--color-robot-flight-separator)');
    const embedded = css.match(/\.robot-flight-instrument\[data-xgc-embedded="true"\] \{[^}]*\}/s)?.[0] ?? '';
    expect(embedded).toContain('border-radius: 0;');
  });

  it('keeps LPOS/VPOS/VVEL/LSP on one shared left label track', () => {
    expect(css).toContain(`.robot-flight-frequency-list {
  left: 8px;
  /* Shared label track sized to LPOS/VPOS, so LSP keeps the same left edge. */
  grid-template-columns: max-content minmax(0, auto);
  column-gap: 3px;
  justify-items: start;
}`);
    expect(css).toContain(`.robot-flight-frequency-list > span {
  /* Markable host: keep a box. Children still occupy the shared label/value tracks. */
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  min-width: 0;
}`);
    expect(css).toContain(`.robot-flight-frequency-list small {
  justify-self: start;
}`);
    expect(css).not.toMatch(
      /\.robot-flight-frequency-list span,\n\.robot-flight-status-list span \{[^}]*justify-content:\s*flex-end/,
    );
  });

  it('keeps compact metric readouts without narrowing the attitude field', () => {
    expect(css).toContain(`.robot-flight-instrument-attitude,
.robot-flight-sky,
.robot-flight-ground {`);
    expect(css).toContain('.robot-flight-metric-ruler {');
    expect(css).toContain('.robot-flight-metric-ruler span {');
    expect(css).toContain('.robot-flight-instrument[data-xgc-embedded="true"] {');
    expect(css).toMatch(/\[data-xgc-embedded="true"\] \{[^}]*min-height:\s*0;/s);
    expect(css).toContain('.robot-flight-pitch-mark {');
    expect(css).toContain('.robot-flight-pitch-mark-hit {');
    expect(css).toContain('pointer-events: auto');
    expect(css).toMatch(/\.robot-flight-pitch-mark text,\s*\.robot-flight-pitch-mark line,\s*\.robot-flight-pitch-mark-hit \{/s);
    expect(css).not.toContain('display: contents');
    expect(css).not.toContain('.robot-flight-metric-tape {');
    expect(css).not.toContain('.robot-flight-attitude-bezel {');
  });

  it('dims the attitude when idle or offline without fading the bottom chrome', () => {
    expect(css).toContain(`[data-xgc-health="idle"] .robot-flight-sky,
.robot-flight-instrument[data-xgc-health="idle"] .robot-flight-ground,
.robot-flight-instrument[data-xgc-health="idle"] .robot-flight-yaw-compass,
.robot-flight-instrument[data-xgc-connection="offline"] .robot-flight-sky,
.robot-flight-instrument[data-xgc-connection="offline"] .robot-flight-ground,
.robot-flight-instrument[data-xgc-connection="offline"] .robot-flight-yaw-compass {
  opacity: var(--opacity-disabled);
}`);
    const panel = css.match(/\.robot-flight-bottom-panel \{[^}]*\}/s)?.[0] ?? '';
    const outline = css.match(/\.robot-flight-bottom-panel::before \{[^}]*\}/s)?.[0] ?? '';
    expect(panel).toContain('background-color: var(--color-robot-flight-panel-fill);');
    expect(outline).toContain('background-color: var(--color-robot-flight-panel-fill);');
    expect(panel).not.toContain('opacity:');
    expect(outline).not.toContain('opacity:');
  });

  it('aligns the single climb readout with the first row of both side lists',() => {
    const center = css.match(/\.robot-flight-hud-center \{[^}]*\}/s)?.[0] ?? '';
    const row = css.match(/\.robot-flight-hud-center div \{[^}]*\}/s)?.[0] ?? '';
    expect(center).toContain('bottom: 39px;');
    expect(row).toContain('min-height: var(--robot-flight-font-emphasis);');
    expect(row).toContain('align-items: center;');
  });

  it('keeps the climb direction arrow large enough to preserve its tip',() => {
    const direction = css.match(/\.robot-flight-climb-direction \{[^}]*\}/s)?.[0] ?? '';
    expect(direction).toContain('font-size: var(--robot-flight-font-emphasis);');
    expect(direction).toContain('font-weight: var(--weight-bold);');
    expect(direction).toContain('min-width: 1em;');
    expect(direction).toContain('color: var(--color-robot-flight-value);');
    expect(css).not.toContain('.robot-flight-climb-direction[data-xgc-direction="up"]');
    expect(css).not.toContain('.robot-flight-climb-direction[data-xgc-direction="down"]');
    expect(css).not.toContain('--color-robot-flight-climb-up');
    expect(css).not.toContain('--color-robot-flight-climb-down');
  });

  it('wraps mode status in a compact pedestal with single/double density contracts',() => {
    const pedestal = css.match(/\.robot-flight-bottom-status \{[^}]*\}/s)?.[0] ?? '';
    const outline = css.match(/\.robot-flight-bottom-panel::before \{[^}]*\}/s)?.[0] ?? '';
    const labels = css.match(/\.robot-flight-bottom-status span \{[^}]*\}/s)?.[0] ?? '';
    const singleInstrument = css.match(/\.robot-instrument-grid\[data-xgc-layout="single"\] \.robot-flight-instrument \{[^}]*\}/s)?.[0] ?? '';
    const single = css.match(/\.robot-instrument-grid\[data-xgc-layout="single"\] \.robot-flight-bottom-status \{[^}]*\}/s)?.[0] ?? '';
    const doubleInstrument = css.match(/\.robot-instrument-grid\[data-xgc-layout="double"\] \.robot-flight-instrument \{[^}]*\}/s)?.[0] ?? '';
    const double = css.match(/\.robot-instrument-grid\[data-xgc-layout="double"\] \.robot-flight-bottom-status \{[^}]*\}/s)?.[0] ?? '';

    expect(pedestal).toContain('bottom: 63px;');
    expect(pedestal).toContain('width: min(var(--robot-flight-status-pedestal-width), calc(100% - 16px - (var(--robot-flight-panel-inline-inset) * 2) - (var(--stroke-thin) * 2)));');
    expect(pedestal).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(pedestal).not.toMatch(/background:|border:|box-shadow:/);
    expect(outline).toContain('top: calc(var(--robot-flight-status-pedestal-height) * -1);');
    expect(outline).toContain('height: calc(var(--robot-flight-status-pedestal-height) + 3px);');
    expect(outline).toContain('background-color: var(--color-robot-flight-panel-fill);');
    expect(outline).toContain('var(--color-robot-flight-panel-start) 94%');
    expect(outline).toContain('var(--color-robot-flight-panel-start) 100%');
    expect(outline).toContain('border-bottom: 0;');
    expect(outline).toContain('border-radius: var(--radius-card) var(--radius-card) 0 0;');
    expect(labels).toContain('text-overflow: ellipsis;');
    expect(singleInstrument).toContain('--robot-flight-status-pedestal-width: 168px;');
    expect(single).toContain('gap: var(--space-lg);');
    expect(single).toContain('padding-inline: var(--space-lg);');
    expect(doubleInstrument).toContain('--robot-flight-status-pedestal-width: 132px;');
    expect(double).toContain('gap: var(--space-xs);');
    expect(double).toContain('padding-inline: var(--space-md);');
    expect(css).toContain('.robot-flight-bottom-status[data-xgc-columns="3"]');
    expect(css).toContain('--robot-flight-status-pedestal-width: 252px;');
    expect(css).toContain('--robot-flight-status-pedestal-width: 200px;');
    expect(css).toContain('.robot-flight-bottom-status span[data-xgc-tone="danger"]');
    expect(css).toContain('.robot-flight-bottom-status span[data-xgc-tone="success"]');
  });

  it('switches left frequency labels by the explicit single/double layout contract',() => {
    expect(css).toMatch(/\.robot-flight-frequency-label-full,\s*\.robot-flight-frequency-value-full \{\s*display: none;/s);
    expect(css).toMatch(/\.robot-instrument-grid\[data-xgc-layout="single"\] \.robot-flight-frequency-label-compact,\s*\.robot-instrument-grid\[data-xgc-layout="single"\] \.robot-flight-frequency-value-compact \{\s*display: none;/s);
    expect(css).toMatch(/\.robot-instrument-grid\[data-xgc-layout="single"\] \.robot-flight-frequency-label-full,\s*\.robot-instrument-grid\[data-xgc-layout="single"\] \.robot-flight-frequency-value-full \{\s*display: inline;/s);
    expect(css).toContain('.robot-flight-frequency-value-compact,\n.robot-flight-frequency-value-full {\n  white-space: pre;\n}');
    expect(css).toContain('.robot-flight-frequency-unit {\n  white-space: pre;\n}');
    expect(css).toContain('.robot-flight-climb-readout {\n  white-space: pre;\n}');
  });

  it('paints command-stream frequency success separately from sensor danger', () => {
    expect(css).toContain('.robot-flight-frequency-value[data-xgc-tone="danger"]');
    expect(css).toContain('.robot-flight-frequency-value[data-xgc-tone="success"]');
  });
});
