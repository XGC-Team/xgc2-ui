import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'config-asset-catalog-controls.css'), 'utf8');

describe('config asset catalog control layout', () => {
  it('keeps the tag filter and sort selects the same compact width without stretching', () => {
    expect(css).toMatch(
      /\.config-asset-catalog-tag-filter,\n\.config-asset-catalog-sort \{\n {2}flex: 0 1 auto;\n {2}width: auto;\n {2}max-width: 100%;\n\}/,
    );
    expect(css).not.toMatch(/\.config-asset-catalog-tag-filter[^{]*\{[^}]*flex:\s*1 /);
    expect(css).not.toMatch(/\.config-asset-catalog-tag-filter[^{]*\{[^}]*flex-grow:\s*[1-9]/);
    expect(css).not.toMatch(/--size-grid-column-default/);
  });
});
