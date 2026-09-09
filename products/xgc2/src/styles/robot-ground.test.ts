import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot-ground.css'), 'utf8');

describe('robot ground instrument layout contract', () => {
  it('reuses the flight HUD chrome instead of a beige numeric board', () => {
    expect(css).toContain('.robot-flight-instrument[data-xgc-role="robot-ground-instrument"]');
    expect(css).toContain('.robot-ground-header-status.robot-instrument-status-icons');
    expect(css).not.toContain('.robot-instrument-status-glyph[data-xgc-tone=');
    expect(css).not.toContain('gap: var(--space-2xs)');
    expect(css).not.toContain('grid-template-rows: 28px minmax(0, 1fr) 40px');
    expect(css).not.toContain('.robot-ground-instrument-body');
    expect(css).not.toContain('.robot-ground-vitals');
    expect(css).not.toContain('.robot-ground-kind-glyph');
    expect(css).not.toContain('.robot-ground-chassis-visual');
    expect(css).not.toContain('robot-response-trend');
    expect(css).not.toMatch(/repeating-(?:linear|radial)-gradient|scanline/i);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    expect(css).not.toContain('[data-skin=');
  });

  it('does not restyle the shared flight attitude, metric rulers, or bottom lists', () => {
    expect(css).not.toContain('.robot-flight-sky');
    expect(css).not.toContain('.robot-flight-metric-ruler');
    expect(css).not.toContain('--robot-ground-yaw-pointer-size');
    expect(css).not.toContain('.robot-flight-frequency-list');
    expect(css).not.toContain('.robot-flight-status-list');
    expect(css).not.toContain('.robot-ground-bottom-metrics');
  });

  it('does not keep a Mecanum-only XY left ruler', () => {
    expect(css).not.toContain('robot-ground-linear-xy');
    expect(css).not.toContain('flex-direction: column');
    expect(css).not.toContain('height: 54px');
  });

  it('does not left-align Ground readings in a second column', () => {
    expect(css).not.toContain('grid-template-columns: subgrid');
    expect(css).not.toContain('10ch');
    expect(css).not.toContain('justify-items: end');
    expect(css).not.toContain('justify-content: flex-end');
    expect(css).not.toContain('justify-content: space-between');
    expect(css).not.toContain('.robot-ground-status-label-full');
    expect(css).not.toContain('.robot-ground-status-label-compact');
  });

  it('keeps Scout chassis mode on a single-column pedestal and hides Mecanum bump', () => {
    expect(css).toContain('[data-xgc-pedestal="chassis"] .robot-flight-bottom-status');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).toContain('[data-xgc-pedestal="none"] .robot-flight-bottom-panel::before');
    expect(css).toContain('content: none');
  });
});
