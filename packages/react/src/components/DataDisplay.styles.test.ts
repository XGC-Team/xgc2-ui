import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const tokens = readFileSync(resolve(process.cwd(), '../tokens/src/index.css'), 'utf8');
const dataTableStyles = styles.slice(styles.indexOf('.xgc-data-table {'), styles.indexOf('.xgc-pagination {'));

describe('data table visual contract', () => {
  it.each(['dark', 'light'])('keeps %s table chrome theme-tokenized', (skin) => {
    const skinBlock = tokens.match(new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
    expect(skinBlock).toMatch(/--color-bg-surface:/);
    expect(skinBlock).toMatch(/--color-bg-subtle:/);
    expect(dataTableStyles).toContain('background: var(--color-bg-surface)');
    expect(dataTableStyles).toContain('background: var(--color-bg-subtle)');
    expect(dataTableStyles).not.toMatch(/(?:background|color|border(?:-color)?):\s*(?:#|rgb\(|hsl\()/i);
  });

  it('assigns the vertical gutter only to the bounded row viewport', () => {
    const boundedTable = dataTableStyles.slice(
      dataTableStyles.indexOf(".xgc-data-table[data-body-scroll='true'] {"),
      dataTableStyles.indexOf(".xgc-data-table[data-sticky-header='true'] th {"),
    );
    const rowViewport = dataTableStyles.slice(
      dataTableStyles.indexOf(".xgc-data-table[data-body-scroll='true'] > table > tbody {"),
      dataTableStyles.indexOf(".xgc-data-table[data-body-scroll='true'] > table > tbody > tr {"),
    );

    expect(boundedTable).toContain('overflow-x: auto');
    expect(boundedTable).toContain('overflow-y: hidden');
    expect(boundedTable).toContain('scrollbar-gutter: auto');
    expect(rowViewport).toContain('overflow-y: auto');
    expect(rowViewport).toContain('scrollbar-gutter: stable');
  });

  it('keeps sticky header chrome above the row viewport without a mask or offset', () => {
    const stickyHeader = dataTableStyles.slice(
      dataTableStyles.indexOf(".xgc-data-table[data-sticky-header='true'] th {"),
      dataTableStyles.indexOf('.xgc-data-table-sort {'),
    );

    expect(stickyHeader).toContain('position: sticky');
    expect(stickyHeader).toContain('z-index: var(--z-sticky)');
    expect(stickyHeader).not.toMatch(/mask|negative|margin\s*:/i);
  });
});
