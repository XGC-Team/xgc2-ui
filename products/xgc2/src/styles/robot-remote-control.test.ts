import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'robot-remote-control.css'), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('robot remote control latch chrome', () => {
  it('keeps the message controller compact and inverse in light theme',() => {
    expect(css).toContain('width: min(16rem, 100%);');
    expect(css).toContain('max-width: 100%;');
    expect(css).not.toContain('robot-remote-target-title');
    expect(css).toContain("[data-skin='light'] .robot-remote-window-message");
    expect(css).toContain('background: var(--color-text-strong);');
    expect(css).toContain(".robot-remote-window-docked[data-xgc-dragging='true'] > header {\n  cursor: default;");
    expect(css).toContain('--remote-key-foreground: var(--color-text-inverse);');
    expect(css).toContain('--remote-key-selected-foreground: var(--color-text-strong);');
    expect(css).toContain('--remote-key-hover-background:');
    expect(css).toContain(".robot-remote-window-message .robot-remote-control-key[aria-pressed='true']");
    expect(css).toContain('background-color: var(--remote-key-foreground);');
    expect(css).toContain(".robot-remote-window-message .robot-remote-control-key[data-tone='danger']:is(:active, [aria-pressed='true']):not(:disabled)");
    expect(rules).toMatch(
      /\[data-tone='danger'\]:is\(:active, \[aria-pressed='true'\]\):not\(:disabled\)[\s\S]*?background-color: var\(--remote-key-foreground\)/,
    );
    expect(rules).not.toMatch(
      /\[data-tone='danger'\]:is\(:active, \[aria-pressed='true'\]\)[^{]*\{[^}]*background-color: transparent/,
    );
    expect(rules).not.toContain(":not([data-tone='danger'])");
    expect(css).not.toContain('background: var(--color-bg-active);');
    expect(rules).not.toContain('--xgc-control-background');
    expect(rules).not.toContain('--control-icon-color');
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
