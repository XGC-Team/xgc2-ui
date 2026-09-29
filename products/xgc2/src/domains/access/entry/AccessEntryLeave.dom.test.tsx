// @vitest-environment jsdom
import { lazy, useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedSurfaceContribution } from '../../../shared/sharedSurface';

const mocks = vi.hoisted(() => ({
  read: vi.fn(), leave: vi.fn(), close: vi.fn(), cleanup: vi.fn(),
  surfaces: [] as SharedSurfaceContribution[],
  events: vi.fn(),
}));
vi.mock('./accessEntryService', () => ({
  bootstrapAccessEntry: vi.fn(), getAccessEntryProjection: mocks.read,
  takeAccessEntryFragmentToken: () => '', openAccessEntryEvents: mocks.events,
}));
vi.mock('./accessEntryParticipantService', () => ({ leaveAccessEntry: mocks.leave }));
vi.mock('../../../shared/productWebComposition', () => ({ useProductWebComposition: () => ({ sharedSurfaces: mocks.surfaces }) }));
import { AccessEntryPage } from './AccessEntryPage';

function Leaf() {
  useEffect(() => () => mocks.cleanup(), []);
  return <button>Scoped control</button>;
}

describe('explicit participant exit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.mockReturnValue({ close: mocks.close });
    mocks.surfaces = [{ moduleId: 'preview', viewContractVersion: 1, component: lazy(async () => ({ default: Leaf })) }];
    mocks.read.mockResolvedValue({
      contractVersion: 1, entryId: 'entry-1', name: 'Preview', expiresAt: '2027-09-20T12:00:00Z',
      moduleId: 'preview', viewContractVersion: 1, actions: ['surface.read'],
      endpoints: [{ id: 'surface.events', method: 'GET', path: '/api/access/entry/events', protocol: 'sse', action: 'surface.read' }],
      surface: { resourceId: 'resource-1' },
    });
  });

  it('unmounts local effects, ignores late stream close, and preserves pending-cleanup truth', async () => {
    let finish!: (value: unknown) => void;
    mocks.leave.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<AccessEntryPage />);
    await screen.findByRole('button', { name: 'Scoped control' });
    fireEvent.click(screen.getByRole('button', { name: '退出此访问会话' }));
    expect(screen.queryByRole('button', { name: 'Scoped control' })).toBeNull();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    await act(async () => {
      mocks.events.mock.calls[0][1].onClosed('ended');
      finish({ participantId: 'A', status: 'revoked', cleanupPending: true });
    });
    expect(await screen.findByText('此访问会话已撤销，服务端仍在释放其资源；尚未确认释放完成。')).toBeTruthy();
    expect(mocks.read).toHaveBeenCalledOnce();
  });

  it('keeps controls stopped after an unconfirmed exit and only retries the exit request', async () => {
    mocks.leave.mockRejectedValueOnce(new Error('network failure'));
    render(<AccessEntryPage />);
    await screen.findByRole('button', { name: 'Scoped control' });
    fireEvent.click(screen.getByRole('button', { name: '退出此访问会话' }));
    const retry = await screen.findByRole('button', { name: '重试退出' });
    expect(screen.queryByRole('button', { name: 'Scoped control' })).toBeNull();
    mocks.leave.mockResolvedValueOnce({ participantId: 'A', status: 'revoked', cleanupPending: false });
    fireEvent.click(retry);
    expect(await screen.findByText('此访问会话已退出，所属资源已释放。')).toBeTruthy();
    expect(mocks.leave).toHaveBeenCalledTimes(2);
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.events).toHaveBeenCalledOnce();
  });
});
