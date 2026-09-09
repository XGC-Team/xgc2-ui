import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'gazebo-world-camera-panel.css'), 'utf8');

describe('gazebo world camera header view switcher geometry', () => {
  it('keeps the shared segmented icon track instead of Run-sized squares', () => {
    const wrap = css.match(/\.gazebo-world-camera-panel-header-actions \{[^}]*\}/s)?.[0] ?? '';
    const nav = css.match(
      /\.gazebo-world-camera-panel-header-actions \[data-xgc-role="gazebo-world-camera-view-switcher"\] \{[^}]*\}/s,
    )?.[0] ?? '';

    expect(wrap).toContain('flex: 0 0 auto;');
    expect(nav).toContain('flex: 0 0 auto;');
    expect(nav).not.toContain('padding: 0');
    expect(nav).not.toContain('background: transparent');
    expect(css).not.toMatch(
      /\[data-xgc-role="gazebo-world-camera-view"\] \{[^}]*--size-control-compact/s,
    );
  });
});
