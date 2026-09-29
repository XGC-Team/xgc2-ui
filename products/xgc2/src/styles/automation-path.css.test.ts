import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'automation-path.css'),
  'utf8',
);

function rule(selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`missing rule for ${selector}`);
  return css.slice(open + 1, close);
}

describe('AutomationPathPicker entry typography', () => {
  it('lets file and folder names use control line-height instead of a fixed button height', () => {
    const entry = rule('.automation-path-picker-entry');
    expect(entry).toContain('height: auto;');
    expect(entry).toContain('min-height: var(--size-control-default);');
    expect(entry).toContain('line-height: var(--line-height-control);');
    expect(entry).toContain('padding-block: var(--space-xs);');
    expect(entry).not.toMatch(/min-height:\s*calc\(/);
    expect(entry).not.toContain('--line-height-none');

    const label = rule('.automation-path-picker-entry > span');
    expect(label).toContain('min-width: 0;');
    expect(label).toContain('overflow: hidden;');
    expect(label).toContain('text-overflow: ellipsis;');
    expect(label).toContain('white-space: nowrap;');
    expect(label).toContain('line-height: var(--line-height-control);');
  });
});
