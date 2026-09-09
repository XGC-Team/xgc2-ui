import { describe,expect,it } from 'vitest';
import {
  DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE,
  operationsAuditPageSizeFromViewport,
  sliceAuditPage,
  sortAuditProcesses,
} from './operationsModel';
import type { ProcessInstance } from './executionModel';

function processFixture(id: string, overrides: Partial<ProcessInstance> = {}): ProcessInstance {
  return {
    id,
    targetId: 'local',
    definitionId: 'roscore',
    definitionVersion: '1',
    definitionDigest: 'sha256:test',
    ownerType: 'automation-run',
    ownerId: 'run-42',
    scope: 'automation:auto-7/run:run-42/node:start-ros',
    parameters: {},
    driver: 'host',
    desiredState: 'running',
    observedState: 'running',
    readiness: { status: 'passing' },
    liveness: { status: 'passing' },
    handle: { pid: Number(id.replace(/\D/g, '')) || 1 },
    revision: 1,
    restartCount: 0,
    startedAt: '2026-07-15T02:00:00Z',
    createdAt: '2026-07-15T01:59:58Z',
    updatedAt: '2026-07-15T02:00:05Z',
    ...overrides,
  };
}

describe('operations audit paging', () => {
  it('pages the retained snapshot and cannot walk past it', () => {
    const rows = Array.from({ length: 25 }, (_, index) => processFixture(`p-${String(index + 1).padStart(2, '0')}`));
    const first = sliceAuditPage(rows, 1, DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE);
    const second = sliceAuditPage(rows, 2, DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE);
    const pastEnd = sliceAuditPage(rows, 9, DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE);

    expect(first.total).toBe(25);
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0].id).toBe('p-01');
    expect(second.rows).toHaveLength(5);
    expect(second.rows[0].id).toBe('p-21');
    expect(pastEnd.page).toBe(2);
    expect(pastEnd.rows).toHaveLength(5);
  });

  it('sorts the full retained set before slicing a page', () => {
    const rows = [
      processFixture('b-process', { handle: { pid: 20 } }),
      processFixture('a-process', { handle: { pid: 10 } }),
      processFixture('c-process', { handle: { pid: 30 } }),
    ];
    const sorted = sortAuditProcesses(rows, new Map(), { columnId: 'runtime',direction: 'ascending' });
    const page = sliceAuditPage(sorted, 1, 2);

    expect(sorted.map((row) => row.id)).toEqual(['a-process', 'b-process', 'c-process']);
    expect(page.rows.map((row) => row.id)).toEqual(['a-process', 'b-process']);
  });

  it('fits page size to the visible table body so a page does not need a scrollbar', () => {
    expect(operationsAuditPageSizeFromViewport({
      regionHeight: 760,
      headerHeight: 36,
      paginationHeight: 40,
      rowHeight: 72,
    })).toBe(9);
    expect(operationsAuditPageSizeFromViewport({
      regionHeight: 400,
      headerHeight: 36,
      paginationHeight: 40,
      rowHeight: 72,
    })).toBe(4);
    expect(operationsAuditPageSizeFromViewport({ regionHeight: 0 })).toBe(DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE);
  });
});
