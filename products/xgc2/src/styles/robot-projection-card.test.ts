import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'robot-projection-card.css'),
  'utf8',
);

describe('robot projection card hover overlay', () => {
  it('keeps overlay row layout on domain content and does not restyle the family tooltip', () => {
    expect(css).not.toContain('.xgc-tooltip');
    expect(css).not.toContain('body:has(');
    expect(css).toContain('.robot-instrument-detail-overlay');
    expect(css).toContain('pointer-events: auto;');
    expect(css).toContain('.robot-instrument-detail-row {');
    expect(css).toContain('display: grid;');
    expect(css).not.toMatch(/\.robot-instrument-detail-row \{[^}]*display:\s*contents/s);
    expect(css).toContain('font-family: var(--font-mono);');
    expect(css).toContain('color: var(--color-text-muted);');
  });
});
