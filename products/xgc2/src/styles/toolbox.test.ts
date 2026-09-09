import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const toolboxCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'toolbox.css'), 'utf8');

describe('toolbox cleanup table selection', () => {
  it('does not paint an overflowing selected-row ring over table borders', () => {
    expect(toolboxCss).toContain(`.toolbox-cleanup-table tbody tr[data-selected='true'] {
  background: var(--color-bg-active);
  box-shadow: none;
  outline: 0;
}`);
    expect(toolboxCss).toContain(`.toolbox-cleanup-table tbody tr[data-selected='true']:hover {
  background: var(--color-bg-active);
  box-shadow: none;
}`);
    expect(toolboxCss).toContain(`.toolbox-cleanup-table tbody tr[data-selected='true'] > td {
  background: inherit;
  box-shadow: none;
  outline: 0;
}`);
    expect(toolboxCss).toContain(
      `.toolbox-cleanup-table tbody tr[data-selected='true']:focus-visible {
  outline: var(--stroke-thin) solid var(--color-border-focus);
  outline-offset: calc(-1 * var(--stroke-strong));
}`,
    );
    expect(toolboxCss).not.toMatch(
      /\.toolbox-cleanup-table tbody tr\[data-selected='true'\][^{]*\{[^}]*outline-offset:\s*0/,
    );
    expect(toolboxCss).not.toMatch(
      /\.toolbox-cleanup-table tbody tr\[data-selected='true'\][\s\S]*?box-shadow:\s*inset/,
    );
    expect(toolboxCss).not.toMatch(/\.toolbox-notice/);
  });
});
