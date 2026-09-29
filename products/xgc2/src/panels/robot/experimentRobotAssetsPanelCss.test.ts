import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'experiment-robot-assets-panel.css'),
  'utf8',
);

describe('Experiment Robot assets Parameters visual contract', () => {
  it('opens Robot parameters in the shared wide drawer while the gallery keeps the single scroll flow', () => {
    const workspace = css.match(/\.experiment-robot-assets-panel-workspace \{[^}]*\}/s)?.[0] ?? '';
    const gallery = css.match(/\.experiment-robot-assets-panel-gallery \{[^}]*\}/s)?.[0] ?? '';
    const nestedScroll = css.match(/\.experiment-robot-assets-panel-scroll \{[^}]*\}/s)?.[0] ?? '';

    expect(workspace).toContain('display: flex;');
    expect(workspace).toContain('overflow: hidden;');
    expect(gallery).toContain('overflow-y: auto;');
    // No docked inspector rail: the shared wide ConfigDrawer owns the surface.
    expect(css).not.toContain('.experiment-robot-assets-panel-inspector');
    expect(css).not.toContain('.experiment-robot-assets-panel-inspector-heading');
    expect(nestedScroll).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll);/);
  });

  it('keeps the Robot drawer title mark bounded beside the Robot name', () => {
    const title = css.match(/\.experiment-robot-assets-panel-robot-drawer-title \{[^}]*\}/s)?.[0] ?? '';
    const mark = css.match(/\.experiment-robot-assets-panel-robot-drawer-mark \{[^}]*\}/s)?.[0] ?? '';
    expect(title).toContain('display: flex;');
    expect(title).toContain('align-items: center;');
    expect(mark).toContain('width: 40px;');
  });

  it('reserves the error feedback slot without changing the toolbar or list height', () => {
    const result = css.match(/\.experiment-robot-assets-panel-feedback \{[^}]*\}/s)?.[0] ?? '';
    expect(result).toContain('height: var(--size-control-compact);');
    expect(result).toContain('min-height: var(--size-control-compact);');
    expect(result).toContain('white-space: nowrap;');
  });

  it('lets the shared FormSection own Parameters group titles without local header chrome', () => {
    expect(css).not.toContain('.experiment-robot-assets-panel-settings-group > header');
    expect(css).not.toContain('.experiment-robot-assets-panel-settings-group-title');
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
    expect(add).toContain('opacity: var(--opacity-hidden);');
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

  it('leaves Parameters field label typography to the shared FormField skin', () => {
    expect(css).not.toContain('.experiment-robot-assets-panel-field > label');
    expect(css).not.toContain('.experiment-robot-assets-panel-pose-field > label');
    expect(css).not.toContain('.experiment-robot-assets-panel-sensor-switch > label');
  });

  it('keeps Robot starting-pose fields on the shared FormSection dual-column grid',() => {
    const poseFields = css.match(/\.experiment-robot-assets-panel-pose-fields[^{]*\{[^}]*\}/s)?.[0] ?? '';
    // The wrapper is a markable host, so it must keep a real box (no
    // display:contents); it spans the full FormSection row and mirrors the
    // shared body grid for its own fields.
    expect(poseFields).not.toContain('display: contents;');
    expect(poseFields).toContain('grid-column: 1 / -1;');
    expect(poseFields).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(poseFields).toContain('var(--space-layout-default) var(--space-layout-comfortable)');
    const narrow = css.match(/@media \(max-width: 720px\) \{\s*\.experiment-robot-assets-panel-pose-fields \{[^}]*\}/s)?.[0] ?? '';
    expect(narrow).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).not.toContain('.experiment-robot-assets-panel-world-origin-fields');
  });

  it('defers asset parameter layout to the shared FormSection grid',() => {
    const assetGrid = css.match(/\.experiment-robot-assets-panel-asset-parameters-grid[^{]*\{[^}]*\}/s)?.[0] ?? '';
    expect(assetGrid).toContain('display: contents;');
    expect(css).not.toContain('.experiment-robot-assets-panel-asset-parameters-card:is(:hover, :focus-visible)');
    expect(css).not.toContain('.experiment-robot-assets-panel-readonly-field > dd');
  });

  it('keeps the always-visible Robot source line inside the select flow above the portrait', () => {
    const source = css.match(/^\.experiment-robot-assets-panel-robot-source \{[^}]*\}/ms)?.[0] ?? '';
    const unknown = css.match(/\.experiment-robot-assets-panel-robot-source\[data-xgc-source='unknown'\] \{[^}]*\}/s)?.[0] ?? '';
    const next = css.match(/\.experiment-robot-assets-panel-robot-source-next \{[^}]*\}/s)?.[0] ?? '';
    expect(source).not.toContain('font-size:');
    expect(source).not.toContain('font-weight:');
    expect(source).not.toMatch(/position\s*:\s*absolute/);
    expect(source).not.toContain('display: contents;');
    // The words carry the meaning; unknown and next-start only de-emphasise.
    expect(unknown).toContain('color: var(--color-text-muted);');
    expect(next).toContain('color: var(--color-text-muted);');
    expect(css).not.toMatch(/robot-source[^{]*:hover/);
    const type = css.match(/button\.experiment-robot-assets-panel-robot-select,[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
    expect(type).toContain('.experiment-robot-assets-panel-robot-source');
    expect(type).toContain('.experiment-robot-assets-panel-assignment-name');
    expect(type).toContain('.experiment-robot-assets-panel-slot-name');
    expect(type).toContain('font-family: var(--font-sans);');
    expect(type).toContain('font-size: var(--font-lg);');
    expect(type).toContain('font-weight: var(--weight-medium);');
    expect(type.match(/font-size:/g)).toHaveLength(1);
    expect(type.match(/font-weight:/g)).toHaveLength(1);
  });
});
