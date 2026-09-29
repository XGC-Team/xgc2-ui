import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'scientific-gallery.css'), 'utf8');

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped} \\{(?<body>[^}]*)\\}`))?.groups?.body ?? '';
}

describe('scientific gallery bag names', () => {
  it('breaks long filenames inside the token and keeps the list width when the scrollbar appears', () => {
    const list = ruleBody('.scientific-gallery-bag-list');
    const name = ruleBody('.scientific-gallery-bag-name');
    expect(list).toContain('scrollbar-gutter: stable');
    expect(list).not.toContain('scrollbar-gutter: auto');
    expect(name).toContain('word-break: break-all');
    expect(name).toContain('white-space: normal');
  });

  it('keeps the pressed bag row more specific than the transparent resting row', () => {
    const resting = ruleBody('.scientific-gallery-bag-list .scientific-gallery-bag-row.scientific-gallery-bag-row');
    const pressed = ruleBody('.scientific-gallery-bag-list .scientific-gallery-bag-row.scientific-gallery-bag-row[aria-pressed="true"]');
    expect(resting).toContain('background: transparent');
    expect(pressed).toContain('background: var(--color-bg-selected)');
    expect(pressed).toContain('border-color: var(--color-border-primary)');
  });
});
