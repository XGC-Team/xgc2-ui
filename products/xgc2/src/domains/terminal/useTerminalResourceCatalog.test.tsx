// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { createEmptyTerminalHost } from './terminalCatalogModel';
import type { TerminalHost } from './terminalModel';
import {
  deleteTerminalHost,
  listTerminalHosts,
  saveTerminalHost,
} from './terminalService';
import { useTerminalHostCatalog } from './useTerminalHostCatalog';

vi.mock('./terminalService', () => ({
  deleteTerminalHost: vi.fn(),
  listTerminalHosts: vi.fn(),
  saveTerminalHost: vi.fn(),
}));

describe('terminal host catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(listTerminalHosts).mockResolvedValue([hostFixture()]);
    vi.mocked(saveTerminalHost).mockImplementation(async (host) => ({
      ...host,
      id: host.id || 'host-created',
    }));
    vi.mocked(deleteTerminalHost).mockResolvedValue({ deleted: 'host' });
  });

  it('reloads Host catalog when the target Core changes', async () => {
    vi.mocked(listTerminalHosts).mockImplementation(async (target) => [hostFixture({
      id: target?.targetCoreId || 'local',
      name: target?.targetCoreId || 'Local',
    })]);
    const onLoaded = vi.fn();
    const view = renderHook(
      ({ target }) => useTerminalHostCatalog({
        persistenceScope: target,
        targetCoreId: target,
        onLoaded,
      }),
      { initialProps: { target: 'edge-a' } },
    );
    await waitFor(() => expect(view.result.current.items[0]?.name).toBe('edge-a'));

    view.rerender({ target: 'edge-b' });
    await waitFor(() => expect(view.result.current.items[0]?.name).toBe('edge-b'));
    view.rerender({ target: 'edge-a' });
    await waitFor(() => expect(view.result.current.items[0]?.name).toBe('edge-a'));
    expect(onLoaded).toHaveBeenCalled();
  });

  it('runs Host create, update, move and delete behavior through its adapter', async () => {
    const onLoaded = vi.fn();
    const view = renderHook(() => useTerminalHostCatalog({
      persistenceScope: 'edge-a',
      targetCoreId: 'edge-a',
      onLoaded,
    }));
    await waitFor(() => expect(view.result.current.items).toEqual([hostFixture()]));
    expect(onLoaded).toHaveBeenCalledWith([hostFixture()]);

    act(() => view.result.current.createDraft());
    const createDraft = hostFixture({
      id: '',
      name: 'Created host',
      address: '10.0.0.8',
    });
    act(() => view.result.current.setDraft(createDraft));
    await act(async () => { await view.result.current.saveDraft(); });

    expect(saveTerminalHost).toHaveBeenCalledWith(createDraft,{ targetCoreId: 'edge-a' });
    expect(view.result.current.items.map((host) => host.id)).toEqual(['host-existing','host-created']);
    expect(view.result.current.drawerOpen).toBe(false);
    expect(view.result.current.draft).toEqual(createEmptyTerminalHost());

    const created = view.result.current.items[1];
    act(() => view.result.current.editDraft(created));
    act(() => view.result.current.setDraft({ ...view.result.current.draft,name: 'Updated host' }));
    await act(async () => { await view.result.current.saveDraft(); });
    expect(view.result.current.items[1].name).toBe('Updated host');

    await act(async () => { await view.result.current.move(view.result.current.items[1],'Operations'); });
    expect(view.result.current.items[1].group).toBe('Operations');

    await act(async () => { await view.result.current.remove('host-created'); });
    expect(deleteTerminalHost).toHaveBeenCalledWith('host-created',{ targetCoreId: 'edge-a' });
    expect(view.result.current.items.map((host) => host.id)).toEqual(['host-existing']);
  });

  it('keeps a failed Host save draft open and unchanged', async () => {
    vi.mocked(saveTerminalHost).mockRejectedValueOnce(new Error('Host save failed'));
    const view = renderHook(() => useTerminalHostCatalog({
      persistenceScope: 'local',
      onLoaded: vi.fn(),
    }));
    await waitFor(() => expect(view.result.current.items).toHaveLength(1));
    const unsaved = hostFixture({ id: '',name: 'Unsaved host' });
    act(() => {
      view.result.current.createDraft();
      view.result.current.setDraft(unsaved);
    });

    let saved = true;
    await act(async () => { saved = await view.result.current.saveDraft(); });

    expect(saved).toBe(false);
    expect(view.result.current.drawerOpen).toBe(true);
    expect(view.result.current.draft).toEqual(unsaved);
    expect(view.result.current.items).toEqual([hostFixture()]);
    expect(view.result.current.mutationError).toBe('Host save failed');
    expect(view.result.current.busy.save).toBe(false);
  });
});

function hostFixture(overrides: Partial<TerminalHost> = {}): TerminalHost {
  return {
    ...createEmptyTerminalHost(),
    id: 'host-existing',
    name: 'Existing host',
    address: '127.0.0.1',
    ...overrides,
  };
}
