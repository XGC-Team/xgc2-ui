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

  it('keeps one scroll viewport inside the bounded table chrome', () => {
    const boundedTable = dataTableStyles.slice(
      dataTableStyles.indexOf(".xgc-data-table[data-body-scroll='true'] {"),
      dataTableStyles.indexOf(".xgc-data-table[data-sticky-header='true'] th {"),
    );

    // The chrome shell clips but never scrolls; the inner viewport scrolls
    // both axes. No split-axis plumbing or per-section block boxes: one table
    // owns all column geometry and the sticky header never drifts.
    expect(boundedTable).toContain('overflow: clip');
    expect(boundedTable).toContain('.xgc-data-table-viewport');
    expect(boundedTable).toContain('overflow: auto');
    expect(boundedTable).not.toContain('overflow-y: hidden');
    expect(boundedTable).not.toContain('display: block');
    expect(boundedTable).not.toContain('table-layout: fixed');
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
