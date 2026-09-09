import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'usernode-script-editor.css'),
  'utf8',
);

describe('User script source editor', () => {
  it('centers the User scripts catalog host in the Terminal flex wrapper', () => {
    const page = css.match(/\[data-xgc-role="terminal-usernode-scripts-page"\] \{[^}]*\}/s)?.[0] ?? '';
    const host =
      css.match(
        /\[data-xgc-role="terminal-usernode-scripts-page"\] > \[data-xgc-role="usernode-assets-page"\] \{[^}]*\}/s,
      )?.[0] ?? '';

    expect(page).toContain('align-items: center');
    expect(page).not.toMatch(/align-items:\s*stretch/);
    expect(host).toContain('align-self: center');
    expect(host).toContain('margin-inline: auto');
    expect(host).not.toMatch(/width:\s*100%/);
    expect(host).not.toMatch(/justify-self:\s*stretch/);
  });

  it('keeps Script body as leftover-height chrome, not a one-line form control', () => {
    const field = css.match(/\.usernode-source-field(?:\.xgc-form-field)? \{[^}]*\}/s)?.[0] ?? '';
    const editor = css.match(/\.usernode-source-editor\.xgc-textarea-control \{[^}]*\}/s)?.[0] ?? '';

    expect(field).toContain('flex: 1 1 auto');
    expect(field).toContain('min-height: 0');
    expect(editor).toContain('flex: 1 1 auto');
    expect(editor).toContain('min-height: 0');
    expect(editor).toContain('grid-template-rows: minmax(0, 1fr)');
    expect(css).toMatch(/\.usernode-script-identity \{[^}]*flex:\s*0 0 auto/s);
    expect(css).not.toMatch(/\.usernode-source-label/);
    const detail = css.match(/\[data-xgc-role="usernode-asset-detail"\] \{[^}]*\}/s)?.[0] ?? '';
    expect(detail).toContain('width: min(1120px, 100%)');
    expect(detail).toContain('margin-inline: auto');
    expect(detail).toContain('align-self: center');
    expect(detail).not.toMatch(/width:\s*100%/);
  });
});
