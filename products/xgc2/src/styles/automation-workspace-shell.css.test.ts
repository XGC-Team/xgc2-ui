import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'automation-workspace-shell.css'),
  'utf8',
);

describe('Automation workspace shell CSS', () => {
  it('does not let workspace-only chrome selectors apply to parked or other pages', () => {
    expect(css).not.toMatch(/^\s*\[data-xgc-spinning="true"\]\s*\{/m);
    expect(css).not.toContain(':has(> [data-xgc-role="automation-definition-detail"])');
    expect(css).toContain('[data-xgc-route-page="automations"]:not([hidden])');
    expect(css).toContain('.page-topbar-actions .automation-workspace-command-control [data-xgc-spinning="true"]');
    expect(css).not.toContain('.page-topbar-actions [data-xgc-spinning="true"],');
  });
});
