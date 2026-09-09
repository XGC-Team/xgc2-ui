import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot-px4-control.css'), 'utf8');

describe('PX4 action tiles', () => {
  it('keeps product-owned card geometry without duplicating the shared tile layout', () => {
    expect(css).toMatch(/\.robot-px4-action-card \{[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.robot-px4-action-card \{[^}]*isolation:\s*isolate;/s);
    expect(css).not.toMatch(/\.robot-px4-action-card > \.xgc-workflow-status-card-heading\s*\{/);
    expect(css).not.toMatch(/\.robot-px4-action-card > \.xgc-workflow-status-card-progress\s*\{/);
    expect(css).toMatch(/\.robot-px4-action-title \{[^}]*flex-direction:\s*row;/s);
    expect(css).toMatch(/\.robot-px4-action-title \{[^}]*align-items:\s*center;/s);
    expect(css).toMatch(/\.robot-px4-action-title \{[^}]*gap:\s*1ch;/s);
    expect(css).toMatch(/\.robot-px4-action-title \{[^}]*font-size:\s*var\(--font-base\);/s);
    expect(css).toMatch(/\.robot-px4-action-title \{[^}]*white-space:\s*nowrap;/s);
    expect(css).not.toMatch(/\.robot-px4-action-title \{[^}]*gap:\s*0;/s);
    expect(css).not.toMatch(/\.robot-px4-action-title \{[^}]*font-size:\s*var\(--font-lg\)/s);
    expect(css).not.toMatch(/\.robot-px4-action-card[^{]*font-size:/);
    expect(css).toMatch(/\.robot-px4-action-icon \{[^}]*width:\s*1em;/s);
  });
});

describe('PX4 mode shortcuts', () => {
  it('packs three equal columns to the left instead of stretching to the combobox', () => {
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*justify-self:\s*start;/s);
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*inline-grid;/s);
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\);/s);
    expect(css).not.toMatch(/\.robot-px4-mode-shortcuts \{[^}]*[^-]width:\s*100%;/s);
  });

  it('pins Position/Altitude/Offboard to compact control height instead of the leftover 1fr', () => {
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*align-self:\s*start;/s);
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*align-items:\s*start;/s);
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*max-height:\s*var\(--size-control-compact\);/s);
    expect(css).toMatch(/\.robot-px4-mode-shortcuts \{[^}]*grid-auto-rows:\s*var\(--size-control-compact\);/s);
    expect(css).toMatch(/\[data-xgc-role="px4-set-mode-shortcut"\] \{[^}]*--xgc-control-height:\s*var\(--size-control-compact\);/s);
    expect(css).toMatch(/\[data-xgc-role="px4-set-mode-shortcut"\] \{[^}]*max-height:\s*var\(--size-control-compact\);/s);
    expect(css).toMatch(/\[data-xgc-role="px4-set-mode-shortcut"\] \{[^}]*font-size:\s*var\(--font-xs\);/s);
    expect(css).toMatch(/\[data-xgc-role="px4-set-mode-shortcut"\] \{[^}]*padding-inline:\s*var\(--space-2xs\);/s);
    expect(css).not.toMatch(/\.robot-px4-mode-shortcuts \{[^}]*height:\s*100%;/s);
    expect(css).not.toMatch(/\[data-xgc-role="px4-set-mode-shortcut"\] \{[^}]*height:\s*100%;/s);
  });

  it('uses one equal-width track for the two first-row and four second-row action tiles', () => {
    expect(css).toMatch(/\.robot-px4-operator-layout \{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
    expect(css).toMatch(/\.robot-px4-operator-layout \{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.robot-px4-mode-group \{[^}]*grid-template-columns:\s*subgrid/s);
    expect(css).toMatch(/\.robot-px4-action-grid \{[^}]*grid-template-columns:\s*subgrid/s);
    expect(css).toMatch(/"select select apply arm-test"/);
    expect(css).toMatch(/"shortcuts shortcuts apply arm-test"/);
    expect(css).toMatch(/\.robot-px4-mode-apply \{[^}]*grid-area:\s*apply;/s);
    expect(css).toMatch(/\.robot-px4-arm-test \{[^}]*grid-area:\s*arm-test;/s);
    expect(css).toMatch(/\.robot-px4-mode-apply,\s*\.robot-px4-arm-test \{[^}]*align-self:\s*stretch;/s);
    expect(css).toMatch(/\.robot-px4-action-card \{[^}]*height:\s*100%;/s);
    expect(css).not.toMatch(/\.robot-px4-action-card \{[^}]*aspect-ratio:/s);
    expect(css).not.toMatch(/\.robot-px4-mode-apply \{[^}]*--xgc-control-height:\s*100%;/s);
    expect(css).not.toMatch(/--px4-tile-edge:/);
  });
});

describe('UGV e-stop', () => {
  it('keeps the latched tile on the same action-card shell as PX4', () => {
    expect(css).toMatch(/\[data-xgc-role="ugv-control-view"\] \.robot-px4-operator-layout > \.robot-px4-action-grid \{[^}]*grid-row:\s*1;/s);
    expect(css).toMatch(/\[data-xgc-role="ugv-control-view"\] \.robot-px4-estop-slot \{[^}]*grid-column:\s*1;/s);
    expect(css).not.toMatch(/\.robot-px4-operator-layout > \.robot-px4-action-grid:first-child \{[^}]*grid-row:\s*2;/s);
    expect(css).not.toContain('[data-held=');
    expect(css).not.toMatch(/\.robot-ugv-estop-card/);
    expect(css).not.toMatch(/\.robot-ugv-control-panel/);
    expect(css).not.toContain(".robot-px4-action-card[data-xgc-tone='danger']");
    expect(css).toMatch(/\[data-xgc-role="ugv-chassis-hold"\]\[data-xgc-layout="tile"\]\[data-xgc-appearance="solid"\]\[data-xgc-tone="danger"\]\[aria-pressed="true"\]/);
    expect(css).toMatch(/\[aria-pressed="true"\][^{]*\{[^}]*box-shadow:[^}]*color-danger/s);
    expect(css).not.toMatch(/\[data-xgc-role="ugv-chassis-hold"\][^{]*\{[^}]*inset/s);
    expect(css).toMatch(/\[data-xgc-role="ugv-control-view"\] \.robot-px4-operator-layout,[^}]*overflow:\s*visible/s);
    expect(css).toMatch(/\[data-xgc-role="ugv-control-view"\] \.robot-px4-estop-slot \.robot-px4-action-card \{[^}]*overflow:\s*visible/s);
  });
});
