import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PanelFrame.css'),
  'utf8',
);

describe('PanelFrame header status clip', () => {
  it('keeps the shared focus halo outside the headerStatus clip edge', () => {
    const status = css.match(/\.xgc-panel-frame-status \{[^}]*\}/s)?.[0] ?? '';

    expect(status).toContain('overflow: clip;');
    expect(status).toContain('overflow-clip-margin: var(--stroke-strong);');
    expect(status).not.toMatch(/overflow:\s*hidden/);
  });

  it('does not square every leading icon view switcher', () => {
    expect(css).not.toMatch(/\[data-xgc-presentation='icons'\]/);
  });
});
