import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'terminal-workspace.css'),
  'utf8',
);

describe('Terminal page clip', () => {
  it('keeps the shared focus halo outside the Terminal page slot', () => {
    const page = css.match(/\.terminal-page \{[^}]*\}/s)?.[0] ?? '';

    expect(page).toContain('overflow: clip;');
    expect(page).toContain('overflow-clip-margin: var(--stroke-strong);');
    expect(page).not.toMatch(/overflow:\s*hidden/);
  });

  it('stretches only the Terminal route for the PTY three-column, not User scripts catalog', () => {
    const route =
      css.match(
        /\.xgc-workspace-content > \[data-xgc-route-page="terminal"\]:not\(\[hidden\]\) \{[^}]*\}/s,
      )?.[0] ?? '';

    expect(route).toContain('justify-self: stretch');
    expect(css).not.toMatch(
      /\[data-xgc-role="terminal-usernode-scripts-page"\][^}]*justify-self:\s*stretch/,
    );
  });

  it('aligns headings and body with distinct tracks for host names and full script commands', () => {
    const body = css.match(/\.terminal-body-content \{[^}]*\}/s)?.[0] ?? '';
    const chrome = css.match(/\.terminal-chrome \{[^}]*\}/s)?.[0] ?? '';

    expect(body).toMatch(
      /grid-template-columns:\s*var\(--terminal-col-targets\)\s+var\(--terminal-col-console\)\s+var\(--terminal-col-scripts\)/,
    );
    expect(chrome).toMatch(
      /grid-template-columns:\s*var\(--terminal-col-targets\)\s+var\(--terminal-col-console\)\s+var\(--terminal-col-scripts\)/,
    );
  });

  it('separates auxiliary columns with spacing instead of repeated heading borders', () => {
    const chrome = css.match(/\.terminal-chrome \{[^}]*\}/s)?.[0] ?? '';
    const headingPair = css.match(/\.terminal-column-heading,\s*\.terminal-toolbar \{[^}]*\}/s)?.[0] ?? '';

    expect(chrome).not.toMatch(/border-block-end/);
    expect(headingPair).not.toMatch(/border-block-end/);
    expect(css).not.toMatch(/\.terminal-column-heading \{[^}]*border-block-end/s);
  });

  it('keeps descenders of Local group titles inside the compact label', () => {
    const title = css.match(
      /\.terminal-sidebar-group-title\.xgc-control-button strong \{[^}]*\}/s,
    )?.[0] ?? '';

    expect(title).toContain('line-height: var(--line-height-tight);');
    expect(title).not.toMatch(/line-height:\s*var\(--line-height-none\)/);
  });
});
