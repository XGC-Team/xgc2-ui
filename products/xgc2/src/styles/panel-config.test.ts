import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)),'panel-config.css'),'utf8');

describe('Panel config long combobox labels',() => {
  it('constrains the Workflow select shell and lets the shared trigger ellipsize, while the portaled option wraps',() => {
    expect(css).toMatch(/\.panel-workflow-binding-select \{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
    expect(css).not.toMatch(/\.panel-workflow-binding-select > button/);
    expect(css).toMatch(/\[data-xgc-role="select-option"\]\[data-xgc-id\^="ros-control:"\] \{[^}]*padding-block:\s*var\(--space-sm\);[^}]*white-space:\s*normal;/s);
    expect(css).toMatch(/\[data-xgc-role="select-option"\]\[data-xgc-id\^="ros-control:"\] > span \{[^}]*overflow-wrap:\s*anywhere;/s);
  });
});
