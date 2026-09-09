import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const stylesDir = dirname(fileURLToPath(import.meta.url));
const readStyle = (name: string) => readFileSync(join(stylesDir,name),'utf8');

describe('ROS panel display contract',() => {
  it('keeps running cards opaque and expresses progress through the fill width',() => {
    const css = readStyle('ros-panel-shell-controls.css');
    expect(css).toMatch(/\.ros-panel-service-status-card \{[^}]*background:\s*var\(--color-bg-control\)/s);
    expect(css).not.toMatch(/ros-panel-service-status-card[^}]*background:\s*transparent/s);
  });

  it('wraps two-line service titles without overriding shared heading weight',() => {
    const css = readStyle('ros-panel-shell-controls.css');
    const title = css.match(/\.ros-panel-shell-control-title \{[^}]*\}/s)?.[0] ?? '';
    expect(title).toContain('white-space: pre-line');
    expect(title).not.toMatch(/font-weight/);
    expect(css).not.toMatch(/xgc-workflow-status-card-heading/);
  });

  it('paints a hover surface on idle service tiles',() => {
    const css = readStyle('ros-panel-shell-controls.css');
    const hover = css.match(/\.xgc-control-action-grid\.ros-panel-shell-controls-grid > \.ros-panel-service-status-card:hover \{[^}]*\}/s)?.[0] ?? '';
    expect(hover).toContain('background-color: var(--color-bg-control-hover);');
    expect(hover).toContain('border-color: var(--color-border-hover);');
  });

  it('does not re-declare the family measured-progress token as a product alias',() => {
    const css = readStyle('skin.css');
    expect(css).not.toMatch(/--color-ros-service-ready-progress/);
    expect(css).not.toMatch(/--color-progress-measured:/);
  });
});
