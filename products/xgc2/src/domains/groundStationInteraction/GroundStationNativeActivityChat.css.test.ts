import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'GroundStationNativeActivityChat.css'), 'utf8');

describe('ground station remote dock host', () => {
  it('hides an empty dock and stacks occupied remotes without a second card', () => {
    expect(css).toContain("[data-xgc-role='ground-station-remote-dock']:empty {\n  display: none;\n}");
    expect(css).toContain("[data-xgc-role='ground-station-remote-dock']:not(:empty) {\n  display: grid;\n  gap: var(--space-md);\n  min-width: 0;\n}");
    expect(css).not.toContain('box-shadow');
    expect(css).not.toContain('position: fixed');
  });

  it('keeps conversation controls in panel chrome without another connection row', () => {
    expect(css).toContain('.ground-station-conversation-header-leading');
    expect(css).toContain('.ground-station-conversation-header-actions');
    expect(css).not.toContain("ground-station-native-connection");
    expect(css).not.toContain('ground-station-native-composer-meta');
  });

  it('keeps the docked remote pad height without an extra shortcut row', () => {
    expect(css).toContain('--remote-message-height: calc(5 * var(--size-control-compact) + 2 * var(--space-xs) + 4 * var(--space-sm) + 2 * var(--stroke-thin));');
    expect(css).toContain('grid-template-rows: var(--size-control-compact) var(--size-control-compact) auto;');
    expect(css).not.toContain('--robot-remote-shortcut-height');
    expect(css).not.toContain('minmax(0, 1fr) var(--robot-remote-shortcut-height)');
  });
});
