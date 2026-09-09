import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'experiment-robot-assets-panel.css'),
  'utf8',
);

describe('Experiment Robot assets Parameters visual contract', () => {
  it('keeps assembly and Robot parameters in one scroll flow while hiding the inactive inspector', () => {
    const workspace = css.match(/\.experiment-robot-assets-panel-workspace \{[^}]*\}/s)?.[0] ?? '';
    const detail = css.match(/\.experiment-robot-assets-panel-inspector \{[^}]*\}/s)?.[0] ?? '';
    const parked = css.match(/\.experiment-robot-assets-panel-inspector\[hidden\] \{[^}]*\}/s)?.[0] ?? '';
    const nestedScroll = css.match(/\.experiment-robot-assets-panel-scroll \{[^}]*\}/s)?.[0] ?? '';

    expect(workspace).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(workspace).toContain('overflow-y: auto;');
    expect(detail).not.toContain('border-inline-start:');
    expect(parked).toContain('display: none;');
    expect(nestedScroll).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll);/);
  });

  it('reserves the error feedback slot without changing the toolbar or list height', () => {
    const result = css.match(/\.experiment-robot-assets-panel-feedback \{[^}]*\}/s)?.[0] ?? '';
    expect(result).toContain('height: var(--size-control-compact);');
    expect(result).toContain('min-height: var(--size-control-compact);');
    expect(result).toContain('white-space: nowrap;');
  });

  it('keeps parameter groups as unframed content with aligned titles', () => {
    const header = css.match(/\.experiment-robot-assets-panel-settings-group > header \{[^}]*\}/s)?.[0] ?? '';
    const title = css.match(/\.experiment-robot-assets-panel-settings-group > header > strong \{[^}]*\}/s)?.[0] ?? '';

    expect(header).toContain('padding: 0;');
    expect(header).not.toContain('background:');
    expect(header).not.toContain('border-bottom:');
    expect(title).toContain('color: var(--color-text-heading);');
    expect(title).toContain('font-size: var(--font-base);');
    expect(title).toContain('font-weight: var(--weight-strong);');
    expect(title).toContain('line-height: var(--line-height-tight);');
    expect(css).not.toMatch(/settings-group[^}]*40px/);
    expect(css).not.toMatch(/:nth-(?:child|last-child|of-type)/);
    expect(css).not.toMatch(/data-xgc-id/);
  });

  it('keeps Add-robots candidate cards shorter and narrower than the assembly portraits', () => {
    const card = css.match(/^\.experiment-robot-assets-panel-asset-card \{[^}]*\}/ms)?.[0] ?? '';
    const mark = css.match(/\.experiment-robot-assets-panel-asset-card \.experiment-robot-assets-panel-robot-mark \{[^}]*\}/s)?.[0] ?? '';
    const pickerList = css.match(/\.experiment-robot-assets-picker-drawer \.experiment-robot-assets-panel-item-list \{[^}]*\}/s)?.[0] ?? '';
    expect(card).toContain('min-height: 176px;');
    expect(card).not.toContain('min-height: 250px;');
    expect(mark).toContain('width: 80px;');
    expect(pickerList).toContain('minmax(min(100%, 148px), 1fr)');
  });

  it('reveals UAV and UGV Add robots on group hover or focus instead of a standing add tile', () => {
    const add = css.match(/^\.experiment-robot-assets-panel-group-add \{[^}]*\}/ms)?.[0] ?? '';
    expect(add).toContain('opacity: 0;');
    expect(css).toContain('.experiment-robot-assets-panel-group:is(:hover,:focus-within) .experiment-robot-assets-panel-group-add');
    expect(css).toContain('.experiment-robot-assets-panel-group-add:focus-visible');
    expect(css).toContain('@media (hover: none)');
    expect(css).not.toContain('experiment-robot-assets-panel-add-tile');
    expect(css).not.toContain('experiment-robot-assets-panel-add-orbit');
  });

  it('lets the Robot gallery wrap to its available width without restoring compact table rows', () => {
    const galleryRules = [...css.matchAll(/[^{}]*\.experiment-robot-assets-panel-item-list[^{}]*\{[^}]*\}/gs)]
      .map((match) => match[0]).join('\n');
    const robotCardRules = [...css.matchAll(/[^{}]*\.experiment-robot-assets-panel-robot-card[^{}]*\{[^}]*\}/gs)]
      .map((match) => match[0]).join('\n');

    expect(galleryRules).toContain('display: grid;');
    expect(galleryRules).toMatch(/grid-template-columns:\s*repeat\(auto-(?:fit|fill),\s*minmax\(/);
    expect(robotCardRules).not.toMatch(/(?:min-)?height:\s*38px;/);
    expect(robotCardRules).not.toContain('height: var(--experiment-robot-assets-item-height);');
    expect(css).not.toMatch(/:nth-(?:child|last-child|of-type)/);
  });

  it('bounds the independent candidate search to its available width', () => {
    const search = css.match(/\.experiment-robot-assets-panel-search \{[^}]*\}/s)?.[0] ?? '';
    expect(search).toContain('min-width: 0;');
    expect(search).toContain('max-width: var(--size-grid-column-wide);');
  });

  it('keeps FormField and pose-field labels on one base typography rule', () => {
    const labels = css.match(/\.experiment-robot-assets-panel-field,\s*\.experiment-robot-assets-panel-pose-field \{[^}]*\}/s)?.[0] ?? '';
    const sharedLabels = css.match(/\.experiment-robot-assets-panel-field > label,\s*\.experiment-robot-assets-panel-pose-field > label,\s*\.experiment-robot-assets-panel-sensor-switch > label \{[^}]*\}/s)?.[0] ?? '';

    expect(labels).toContain('font-size: var(--font-base);');
    expect(labels).toContain('font-weight: var(--weight-regular);');
    expect(labels).toContain('line-height: var(--line-height-tight);');
    expect(sharedLabels).toContain('font-size: var(--font-base);');
    expect(sharedLabels).toContain('font-weight: var(--weight-regular);');
    expect(sharedLabels).toContain('line-height: var(--line-height-tight);');
  });

  it('keeps Robot starting-pose fields in two columns without restoring inline world-origin fields',() => {
    const poseFields = css.match(/\.experiment-robot-assets-panel-pose-fields \{[^}]*\}/s)?.[0] ?? '';
    expect(poseFields).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).not.toContain('.experiment-robot-assets-panel-world-origin-fields');
  });

  it('uses the editable field grid for asset parameters without making the whole group interactive',() => {
    const assetGrid = css.match(/^\.experiment-robot-assets-panel-asset-parameters-grid \{[^}]*\}/ms)?.[0] ?? '';
    expect(assetGrid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(assetGrid).toContain('gap: var(--space-lg) var(--space-xl);');
    expect(assetGrid).toContain('padding: 0;');
    expect(css).not.toContain('.experiment-robot-assets-panel-asset-parameters-card:is(:hover, :focus-visible)');
    expect(css).not.toContain('.experiment-robot-assets-panel-readonly-field > dd');
  });
});
