// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuditRoute } from './AuditRoute';
import { listAuditLogPage } from './auditService';

const routeState = vi.hoisted(() => ({
  section: 'operation',
}));

vi.mock('../../app/navigationContext', () => ({
  useNavigation: (select?: (state: never) => unknown) => {
    const navigationState = ({
    language: 'en-US',
    pageSection: (page: string) => (page === 'audit' ? routeState.section : ''),
  });
    return select ? select(navigationState as never) : navigationState;
  },
}));

vi.mock('./auditService', () => ({
  listAuditLogPage: vi.fn(),
}));

describe('AuditRoute', () => {
  it('never projects the Task logs section onto the generic audit category', async () => {
    vi.mocked(listAuditLogPage).mockResolvedValue({ rows: [], total: 0 });
    routeState.section = 'task';

    render(<AuditRoute />);

    await waitFor(() => {
      expect(listAuditLogPage).toHaveBeenCalledWith(expect.objectContaining({
        category: 'operation',
      }));
    });
    expect(listAuditLogPage).not.toHaveBeenCalledWith(expect.objectContaining({
      category: 'task',
    }));
  });
});
