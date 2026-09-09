import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)),'mark-prompt.css'),'utf8');

describe('mark-prompt pin contrast',() => {
  it('keeps the change input on the theme surface so light skin text and selection stay readable',() => {
    const pin = css.match(/\[class~="dev-annotation-pin"\] \{[^}]*\}/s)?.[0] ?? '';
    const input = css.match(/\.dev-annotation-pin input \{[^}]*\}/s)?.[0] ?? '';
    const selection = css.match(/\.dev-annotation-pin input::selection \{[^}]*\}/s)?.[0] ?? '';
    expect(pin).toContain('color: var(--color-text)');
    expect(pin).toContain('background: var(--color-bg-surface)');
    expect(pin).not.toMatch(/background:\s*var\(--color-accent\)/);
    expect(input).toContain('color: var(--color-text)');
    expect(input).not.toMatch(/color:\s*var\(--color-bg-chrome\)/);
    expect(selection).toContain('color: var(--color-text-inverse)');
    expect(selection).toContain('background: var(--color-bg-primary)');
  });
});
