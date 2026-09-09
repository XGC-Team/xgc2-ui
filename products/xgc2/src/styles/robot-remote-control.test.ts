import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot-remote-control.css'), 'utf8');

describe('robot remote control latch chrome', () => {
  it('keeps latched keys inset without the shared 120ms active fade', () => {
    expect(css).toContain('.robot-remote-window .robot-remote-control-key {\n  transition: none;\n}');
    expect(css).toContain(".robot-remote-window .robot-remote-control-key[aria-pressed='true']");
    expect(css).toContain(".robot-remote-window .robot-remote-control-key[aria-pressed='true']:hover:not(:disabled)");
    expect(css).toContain('background: var(--color-bg-active);');
    expect(css).toContain('box-shadow: inset 0 var(--stroke-thin) var(--stroke-strong) var(--color-shadow-overlay-soft);');
    const latchSurface = css.match(/\.robot-remote-window \.robot-remote-control-key\[aria-pressed='true'\]:focus-visible \{[^}]*\}/)?.[0] ?? '';
    expect(latchSurface).not.toMatch(/^\s*color:/m);
    expect(css).toContain(".robot-remote-window .robot-remote-control-key[aria-pressed='true']:not([data-tone='danger']) {\n  color: var(--color-text-strong);");
    expect(css).not.toContain('Applying');
    expect(css).not.toContain('color-mix');
  });

  it('keeps the message controller compact and inverse in light theme',() => {
    expect(css).toContain('width: min(16rem, 100%);');
    expect(css).toContain("[data-skin='light'] .robot-remote-window-message");
    expect(css).toContain('background: var(--color-text-strong);');
    expect(css).toContain(".robot-remote-window-docked[data-xgc-dragging='true'] > header {\n  cursor: default;");
  });

  it('keeps a 4x2 shortcut table centered under the yaw keys',() => {
    expect(css).toContain('repeat(3, var(--size-control-compact));');
    expect(css).toContain('"left stop right shortcuts shortcuts"');
    expect(css).toContain('". backward . shortcuts shortcuts"');
    expect(css).not.toContain('yaw-left yaw-right"\n    ". backward');
    expect(css).toContain('border-spacing: var(--space-xs) 0;');
    expect(css).toContain('width: 50%;');
    expect(css).toContain('text-align: center;');
    expect(css).toContain('text-transform: lowercase;');
    expect(css).not.toContain('.robot-remote-shortcuts th {\n  padding-inline-end: 1ch;\n  text-align: left;');
    expect(css).not.toContain('--font-xs');
  });
});
