import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)),'panel-config.css'),'utf8');

describe('Panel config long combobox labels',() => {
  it('ellipsizes the closed Workflow value and wraps its portaled option',() => {
    expect(css).toMatch(/\.panel-workflow-binding-select > button > span \{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(css).toMatch(/\[data-xgc-role="select-option"\]\[data-xgc-id\^="ros-control:"\] \{[^}]*padding-block:\s*var\(--space-sm\);[^}]*white-space:\s*normal;/s);
    expect(css).toMatch(/\[data-xgc-role="select-option"\]\[data-xgc-id\^="ros-control:"\] > span \{[^}]*overflow-wrap:\s*anywhere;/s);
  });
});
