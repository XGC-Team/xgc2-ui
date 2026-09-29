import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'GroundStationDecisionResponse.css'), 'utf8');

describe('ground station compact decision actions', () => {
  it('keeps compact Set mode and Cancel equal width on one row with a static ring', () => {
    expect(css).toContain('.xgc-ground-station-decision-response[data-xgc-appearance="compact"] .xgc-ground-station-decision-actions');
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('.xgc-ground-station-decision-request .xgc-ground-station-decision-response[data-xgc-appearance="compact"] .xgc-ground-station-decision-choice');
    expect(css).toContain('flex: 1 1 0');
    expect(css).toContain('border-radius: var(--radius-control)');
    expect(css).toContain('justify-content: flex-start');
    expect(css).toContain('margin-inline-start: auto');
    expect(css).toContain('background: var(--xgc-decision-fg)');
    expect(css).toContain('background: var(--xgc-decision-fg)');
    expect(css).toContain('color: var(--xgc-decision-bg)');
    expect(css).toContain('[data-xgc-variant="ring"]');
    expect(css).toContain('transition: none');
    expect(css).not.toMatch(/animation\s*:/);
    expect(css).not.toMatch(/indeterminate/);
  });
});
