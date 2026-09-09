import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot-instrument-status.css'), 'utf8');

describe('robot instrument status glyph geometry',() => {
  it('keeps flight and ground HUD status slots independent of tooltip text width',() => {
    const cluster = css.match(/\.robot-instrument-status-icons \{[^}]*\}/s)?.[0] ?? '';
    const glyph = css.match(/\.robot-instrument-status-glyph \{[^}]*\}/s)?.[0] ?? '';

    expect(cluster).toContain('display: grid');
    expect(cluster).toContain('grid-auto-flow: column');
    expect(cluster).toContain('grid-auto-columns: var(--size-icon-lg)');
    expect(cluster).toContain('justify-content: start');
    expect(cluster).toContain('gap: var(--space-2xs)');
    expect(glyph).toContain('width: var(--size-icon-lg)');
    expect(glyph).toContain('height: var(--size-icon-lg)');
    expect(glyph).toContain('min-width: 0');
    expect(glyph).toContain('overflow: hidden');
  });

  it('keeps compact original artwork inside the square slot',() => {
    const connection = css.match(/\.robot-instrument-connection-icon \{[^}]*\}/s)?.[0] ?? '';
    const pin = css.match(/\.robot-instrument-location-icon \{[^}]*\}/s)?.[0] ?? '';

    expect(connection).toContain('width: var(--size-icon-sm)');
    expect(connection).toContain('height: var(--size-icon-sm)');
    expect(pin).toContain('width: var(--size-icon-xs)');
    expect(pin).toContain('height: var(--size-icon-xs)');
    expect(css).not.toMatch(/\.robot-instrument-connection-icon svg[^}]*width:\s*100%/);
    expect(css).not.toMatch(/\.robot-instrument-battery \{\s*width:\s*100%;\s*height:\s*100%/);
  });
});
