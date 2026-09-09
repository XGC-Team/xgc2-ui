// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { UsernodeAssetsPage } from './UsernodeAssetsPage';
import { UsernodeAssetDetailPage } from './UsernodeAssetDetailPage';
import { newUsernodeAssetSpec } from './usernodeAuthoring';
import type { UsernodeAssetDocument, UsernodeNamespace } from './usernodeContractsPublic';
import { UsernodeAssetCommitConflict,useUsernodeAssetsStore } from './usernodeStore';
import type * as UsernodeStoreModule from './usernodeStore';
import * as UsernodeService from './usernodeService';

const notificationMocks = vi.hoisted(() => ({ useError: vi.fn() }));

vi.mock('./usernodeStore', async (loadOriginal) => {
  const original = await loadOriginal<typeof UsernodeStoreModule>();
  return { ...original,useUsernodeAssetsStore: vi.fn() };
});

vi.mock('../groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: notificationMocks.useError,
}));

vi.mock('./usernodeService', async (loadOriginal) => {
  const original = await loadOriginal<typeof UsernodeService>();
  return {
    ...original,
    readUsernodeCommandFile: vi.fn(),
    writeUsernodeCommandFile: vi.fn(),
  };
});

const create = vi.fn();
const update = vi.fn();
let storeMock: ReturnType<typeof useUsernodeAssetsStore>;

describe('UsernodeAssetsPage error notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockReset().mockResolvedValue(assetFixture('usernode-created', 'Created script'));
    update.mockReset().mockResolvedValue(assetFixture('usernode-a', 'Updated script'));
    storeMock = {
      assets: [assetFixture('usernode-a', 'Warm up')],
      namespaces: [],
      selected: null,
      loading: false,
      error: '',
      refresh: vi.fn(),
      open: vi.fn(),
      create,
      commit: vi.fn(),
      update,
      move: vi.fn(),
      archive: vi.fn(),
      addNamespace: vi.fn(),
      renameNamespace: vi.fn(),
      archiveNamespace: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(useUsernodeAssetsStore).mockReturnValue(storeMock);
  });

  it('publishes a routed store failure without invalidating the stable resource ID', () => {
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [],selected: null,error: 'Core unavailable',
    });
    const onInvalidResource = vi.fn();

    render(<UsernodeAssetsPage resourceId="usernode-a" onInvalidResource={onInvalidResource} />);

    expect(onInvalidResource).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(notificationMocks.useError).toHaveBeenCalledWith(
      'local','Core unavailable',expect.objectContaining({ source: 'usernode-assets' }),
    );
  });

  it('publishes a create drawer rejection through the page error channel', async () => {
    create.mockRejectedValueOnce(new Error('Create denied'));
    const { container } = render(<UsernodeAssetsPage />);

    fireEvent.click(container.querySelector('[data-xgc-role="usernode-asset-create"]')!);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-role', 'usernode-create-drawer');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rejected script' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notificationMocks.useError).toHaveBeenCalledWith(
      'local','Create denied',expect.objectContaining({ source: 'usernode-assets' }),
    ));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('closes stale settings and publishes the authoritative 409 guidance', async () => {
    const latest = assetFixture('usernode-a', 'Concurrent script');
    latest.head.revision = 2;
    latest.branch.revision = 2;
    update.mockRejectedValueOnce(new UsernodeAssetCommitConflict('409 Conflict', latest));
    const { container } = render(<UsernodeAssetsPage />);

    fireEvent.click(container.querySelector('[data-xgc-role="usernode-asset-settings"][data-xgc-id="usernode-a"]')!);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Stale draft name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(notificationMocks.useError).toHaveBeenCalledWith(
      'local',expect.stringContaining('Reopen settings to review the latest metadata'),
      expect.objectContaining({ source: 'usernode-assets' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('labels script folders System scripts, Templates, and Ungrouped', () => {
    const system = assetFixture('usernode-sys', 'Built-in ping');
    system.head.system = true;
    system.spec.tags = ['built-in'];
    const template = assetFixture('usernode-tpl', 'FS150 companion config');
    template.head.system = true;
    template.spec.tags = ['template'];
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [system, template, assetFixture('usernode-a', 'Warm up')],
    });
    const { container } = render(<UsernodeAssetsPage />);
    fireEvent.click(container.querySelector('[data-xgc-role="usernode-protected-visibility-toggle"][data-xgc-id="system"]')!);
    const folders = [...container.querySelectorAll('[data-xgc-role="usernode-folder"]')];
    expect(folders.map((folder) => folder.getAttribute('data-xgc-id'))).toEqual([
      'system','templates','user',
    ]);
    expect(folders[0]).toHaveTextContent('System scripts');
    expect(folders[1]).toHaveTextContent('Templates');
    expect(folders[2]).toHaveTextContent('Ungrouped');
    expect(container.textContent).not.toContain('System assets');
    expect(container.textContent).not.toContain('User assets');
    expect(container.textContent).not.toContain('User scripts /');
  });

  it('keeps the create action available in the empty flat catalog', () => {
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({ ...storeMock,assets: [],namespaces: [] });
    const { container } = render(<UsernodeAssetsPage />);

    fireEvent.click(container.querySelector('[data-xgc-role="usernode-list-view"]')!);
    const empty = container.querySelector<HTMLElement>('.xgc-list-empty')!;
    expect(empty).toHaveTextContent('No user scripts');
    expect(empty.querySelector('button')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="usernode-asset-create"]')!);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-role', 'usernode-create-drawer');
  });

  it('matches Automations list toolbar size and hide-system/template toggles', () => {
    const system = assetFixture('usernode-system', 'System script', { system: true,tags: ['system-only'] });
    const template = assetFixture('usernode-template', 'Template script', { system: true,tags: ['template','template-only'] });
    const user = assetFixture('usernode-user', 'User script', { tags: ['user-only'] });
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [system,template,user],
    });

    const { container } = render(<UsernodeAssetsPage />);
    const controls = container.querySelector('[data-xgc-role="list-page-controls"] .xgc-list-controls')!;
    const viewControls = controls.querySelector('.config-asset-catalog-view-controls')!;
    const systemToggle = controls.querySelector<HTMLButtonElement>('[data-xgc-role="usernode-protected-visibility-toggle"][data-xgc-id="system"]')!;
    const templateToggle = controls.querySelector<HTMLButtonElement>('[data-xgc-role="usernode-protected-visibility-toggle"][data-xgc-id="templates"]')!;
    const folderView = controls.querySelector('[data-xgc-role="usernode-folder-view"]')!;
    const listView = controls.querySelector('[data-xgc-role="usernode-list-view"]')!;

    expect(viewControls.firstElementChild).toBe(systemToggle);
    expect(systemToggle.nextElementSibling).toBe(templateToggle);
    expect(templateToggle.nextElementSibling).toBe(folderView);
    expect(folderView.nextElementSibling).toBe(listView);
    for (const control of [systemToggle, templateToggle, folderView, listView]) {
      expect(control).toHaveAttribute('data-xgc-size', 'default');
      expect(control).not.toHaveAttribute('data-xgc-size', 'compact');
    }
    expect(systemToggle).toHaveAccessibleName('Show system items');
    expect(systemToggle).toHaveAttribute('aria-pressed', 'true');
    expect(templateToggle).toHaveAccessibleName('Hide templates');
    expect(templateToggle).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('[data-xgc-role="usernode-folder"][data-xgc-id="system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-folder"][data-xgc-id="templates"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="usernode-system"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="usernode-template"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="usernode-user"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-asset-use"]')).toBeNull();

    fireEvent.click(systemToggle);
    expect(systemToggle).toHaveAccessibleName('Hide system items');
    expect(container.querySelector('[data-xgc-role="usernode-folder"][data-xgc-id="system"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="usernode-system"]')).not.toBeNull();

    fireEvent.click(templateToggle);
    expect(templateToggle).toHaveAccessibleName('Show templates');
    expect(container.querySelector('[data-xgc-role="usernode-folder"][data-xgc-id="templates"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="usernode-template"]')).toBeNull();
  });

  it('opens a script detail with name, public file, invoke, and body — not interpreter chrome', () => {
    const template = assetFixture('usernode-tpl', 'Wheeltec Mecanum companion config', {
      system: true,tags: ['template'],
    });
    template.spec.source = '#!/usr/bin/env bash\nset -euo pipefail\necho ready\n';
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [template],selected: template,
    });

    const { container } = render(<UsernodeAssetsPage resourceId="usernode-tpl" />);
    const detail = container.querySelector('[data-xgc-role="usernode-asset-detail"]')!;
    expect(detail).not.toBeNull();
    expect(detail.querySelector('[aria-label="Asset summary"]')).toBeNull();
    expect(detail.querySelector('.xgc-asset-detail-summary')).toBeNull();
    expect(detail.querySelector('.xgc-form-section')).toBeNull();
    expect(detail.querySelector('.xgc-form-section-title')).toBeNull();
    expect(detail.querySelector('.xgc-form-field-hint')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-interpreter"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-timeout"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-setup-scripts"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-default-args"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-env"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-input-table"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-source"]')).not.toBeNull();
    expect(screen.getByLabelText('Script name')).toHaveValue('Wheeltec Mecanum companion config');
    expect(screen.getByLabelText('Public file')).toHaveValue('');
    expect(screen.getByLabelText('Input command')).toHaveValue('');
    expect(detail.textContent).not.toMatch(/Payload|Environment|Inputs|Interpreter|Timeout|Setup scripts|Default arguments|Environment values/);
    expect(detail.querySelector('.xgc-form-field-hint')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-asset-error"]')).toBeNull();
    expect(detail.querySelector('[data-xgc-role="usernode-asset-validation"]')).toBeNull();
    const textarea = detail.querySelector<HTMLTextAreaElement>('textarea.usernode-source-input');
    expect(detail.textContent).toMatch(/Script body/);
    const labels = [...detail.querySelectorAll('.xgc-form-field-label')].map((node) => node.textContent?.trim());
    expect(labels).toEqual(['Script name', 'Public file', 'Input command', 'Script body']);
    expect(textarea).toHaveValue('#!/usr/bin/env bash\nset -euo pipefail\necho ready\n');
    expect(textarea).not.toHaveAttribute('rows');
    expect(detail.querySelector('.xgc-syntax-comment')).toHaveTextContent('#!/usr/bin/env bash');
    expect([...detail.querySelectorAll('.xgc-syntax-keyword')].map((node) => node.textContent)).toContain('echo');
    const search = detail.querySelector('[data-xgc-role="usernode-source-search"]');
    const save = detail.querySelector<HTMLButtonElement>('[data-xgc-role="usernode-asset-save"]');
    expect(search).not.toBeNull();
    expect(save).toHaveTextContent('Save');
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('title', 'Templates and system scripts are read-only.');
    fireEvent.change(search!.querySelector('input')!, { target: { value: 'echo' } });
    expect(detail.querySelector('[data-xgc-role="usernode-source-search-status"]')).toHaveTextContent('1/1');
    expect(detail.querySelector('.usernode-source-match-active')).toHaveTextContent('echo');
  });

  it('loads a catalog command file into Script body instead of showing the invoke line', async () => {
    const invoke = 'sudo bash "$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh" --yes';
    const fileBody = '#!/usr/bin/env bash\nAPT_BASE_URL="${APT_BASE_URL:-http://xgc2.apt.xiaokang.ink}"\n';
    const linux = assetFixture('linux', 'configure linux', { tags: ['fs150', 'order-1'] });
    linux.spec.source = invoke;
    vi.mocked(UsernodeService.readUsernodeCommandFile).mockResolvedValue(fileBody);
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [linux],selected: linux,
    });

    const { container } = render(<UsernodeAssetsPage resourceId="linux" />);
    expect(container.querySelector('[data-xgc-role="usernode-asset-detail"]')).not.toBeNull();
    expect(screen.getByLabelText('Input command')).toHaveValue(invoke);
    expect(screen.getByLabelText('Public file')).toHaveValue(
      '$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh',
    );
    await waitFor(() => {
      expect(container.querySelector('textarea.usernode-source-input')).toHaveValue(fileBody);
    });
    expect(container.querySelector('textarea.usernode-source-input')).not.toHaveValue(invoke);
    expect(UsernodeService.readUsernodeCommandFile).toHaveBeenCalledWith(
      '$HOME/Documents/XGC/UserScripts/FS150/configure-linux.sh',
    );
  });

  it('keeps a late command-file read from replacing the next selected script', async () => {
    let resolveFirst!: (body: string) => void;
    const firstRead = new Promise<string>((resolve) => { resolveFirst = resolve; });
    const first = assetFixture('first', 'First script');
    const next = assetFixture('next', 'Next script');
    first.spec.source = 'bash "/XGC/UserScripts/first.sh"';
    next.spec.source = 'bash "/XGC/UserScripts/next.sh"';
    vi.mocked(UsernodeService.readUsernodeCommandFile)
      .mockReset().mockReturnValueOnce(firstRead).mockResolvedValueOnce('echo next');
    const onCommit = vi.fn();
    const onBack = vi.fn();
    const view = render(<UsernodeAssetDetailPage document={first} onCommit={onCommit} onBack={onBack} />);

    view.rerender(<UsernodeAssetDetailPage document={next} onCommit={onCommit} onBack={onBack} />);
    await waitFor(() => expect(view.container.querySelector('textarea.usernode-source-input')).toHaveValue('echo next'));
    await act(async () => { resolveFirst('echo stale'); await firstRead; });

    expect(view.container.querySelector('textarea.usernode-source-input')).toHaveValue('echo next');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('retains an editable draft and refuses its commit when the command-file write fails', async () => {
    const document = assetFixture('script', 'Script');
    document.spec.source = 'bash "/XGC/UserScripts/script.sh"';
    vi.mocked(UsernodeService.readUsernodeCommandFile).mockReset().mockResolvedValue('echo before');
    vi.mocked(UsernodeService.writeUsernodeCommandFile).mockReset().mockRejectedValue(new Error('Write denied'));
    const onCommit = vi.fn();
    const { container } = render(<UsernodeAssetDetailPage document={document} onCommit={onCommit} onBack={vi.fn()} />);
    const body = container.querySelector('textarea.usernode-source-input')!;
    await waitFor(() => expect(body).toHaveValue('echo before'));
    fireEvent.change(screen.getByLabelText('Script name'), { target: { value: 'Changed script' } });
    fireEvent.change(body, { target: { value: 'echo after' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notificationMocks.useError).toHaveBeenCalledWith(
      'local','Write denied',expect.objectContaining({ source: 'usernode-asset-detail' }),
    ));
    expect(UsernodeService.writeUsernodeCommandFile).toHaveBeenCalledWith('/XGC/UserScripts/script.sh', 'echo after');
    expect(onCommit).not.toHaveBeenCalled();
    expect(body).toHaveValue('echo after');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('titles FS150 as a functional folder and keeps catalog configuration order', () => {
    const folderId = '5ab57eb0-4f4c-4ffd-831c-a275b97fe407';
    const linux = assetFixture('linux', 'configure linux', {
      tags: ['fs150', 'order-1'], namespaceId: folderId, updatedAt: '2026-08-31T14:00:00Z',
    });
    const aptBoot = assetFixture('apt-boot', 'check apt boot', {
      tags: ['fs150', 'order-2'], namespaceId: folderId, updatedAt: '2026-08-31T15:00:00Z',
    });
    const applyPx4 = assetFixture('apply-px4', 'apply PX4 params', {
      tags: ['fs150', 'order-6'], namespaceId: folderId, updatedAt: '2026-08-31T14:30:00Z',
    });
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,
      assets: [applyPx4, aptBoot, linux],
      namespaces: [namespaceFixture(folderId, 'FS150')],
    });

    const { container } = render(<UsernodeAssetsPage />);
    const folder = container.querySelector(
      `[data-xgc-role="usernode-folder"][data-xgc-id="${folderId}"]`,
    )!;
    expect(folder).not.toBeNull();
    expect(folder.querySelector('.xgc-list-folder-title strong')).toHaveTextContent('FS150');
    expect(folder.querySelector('.xgc-list-folder-title')?.textContent).not.toContain('User scripts');
    expect([...folder.querySelectorAll('[data-xgc-role="usernode-asset-row"]')].map(
      (row) => row.getAttribute('data-xgc-id'),
    )).toEqual(['linux', 'apt-boot', 'apply-px4']);
    expect(container.querySelector('[data-xgc-role="usernode-folder"][data-xgc-id="user"]')).toBeNull();
  });

  it('paints operator catalog tags with the shared chip skin and hides provision plumbing', async () => {
    const folderId = '5ab57eb0-4f4c-4ffd-831c-a275b97fe407';
    const checkPx4 = assetFixture('2209b1c6-b273-4d46-9f6e-e11e231a8cf5', 'check PX4 params', {
      tags: ['fs150', 'order-5', 'lab'], namespaceId: folderId,
    });
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,
      assets: [checkPx4],
      namespaces: [namespaceFixture(folderId, 'FS150')],
    });

    const { container } = render(<UsernodeAssetsPage />);
    const cluster = container.querySelector(
      '[data-xgc-role="usernode-asset-tags"][data-xgc-id="2209b1c6-b273-4d46-9f6e-e11e231a8cf5"]',
    )!;
    expect(cluster).not.toBeNull();
    expect(cluster.querySelector('span.xgc-list-tag')).toBeNull();
    expect(cluster.textContent).not.toContain('fs150');
    expect(cluster.textContent).not.toContain('order-5');
    expect(cluster.querySelector('[data-xgc-role="usernode-asset-row-tag"][data-xgc-id="2209b1c6-b273-4d46-9f6e-e11e231a8cf5:lab"]')).toHaveAccessibleName('Remove lab');
    expect(cluster.querySelector('[data-xgc-role="usernode-asset-edit-tags"][data-xgc-id="2209b1c6-b273-4d46-9f6e-e11e231a8cf5"]')).not.toBeNull();

    fireEvent.click(cluster.querySelector('[data-xgc-role="usernode-asset-row-tag"][data-xgc-id="2209b1c6-b273-4d46-9f6e-e11e231a8cf5:lab"]')!);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({
      tags: ['fs150', 'order-5'],
    }));
  });

  it('keeps an add-tag control on plumbing-only rows and merges new tags without dropping order', async () => {
    const checkPx4 = assetFixture('2209b1c6-b273-4d46-9f6e-e11e231a8cf5', 'check PX4 params', {
      tags: ['fs150', 'order-5'],
    });
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [checkPx4],
    });

    const { container } = render(<UsernodeAssetsPage />);
    const cluster = container.querySelector(
      '[data-xgc-role="usernode-asset-tags"][data-xgc-id="2209b1c6-b273-4d46-9f6e-e11e231a8cf5"]',
    )!;
    expect(cluster.querySelector('[data-xgc-role="usernode-asset-row-tag"]')).toBeNull();
    fireEvent.click(cluster.querySelector('[data-xgc-role="usernode-asset-edit-tags"]')!);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-xgc-role', 'usernode-asset-tag-dialog');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'night' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({
      tags: ['fs150', 'order-5', 'night'],
    }));
  });

  it('does not show catalog plumbing in Settings tags', async () => {
    const checkPx4 = assetFixture('2209b1c6-b273-4d46-9f6e-e11e231a8cf5', 'check PX4 params', {
      tags: ['fs150', 'order-5', 'lab'],
    });
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      ...storeMock,assets: [checkPx4],
    });

    const { container } = render(<UsernodeAssetsPage />);
    fireEvent.click(container.querySelector(
      '[data-xgc-role="usernode-asset-settings"][data-xgc-id="2209b1c6-b273-4d46-9f6e-e11e231a8cf5"]',
    )!);
    expect(screen.getByLabelText('Tags')).toHaveValue('lab');
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'lab, field' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({
      tags: ['fs150', 'order-5', 'field', 'lab'],
    }));
  });
});

function assetFixture(
  resourceId: string,
  name: string,
  extras: { system?: boolean; tags?: string[]; namespaceId?: string; updatedAt?: string } = {},
): UsernodeAssetDocument {
  const timestamp = extras.updatedAt ?? '2026-08-10T00:00:00Z';
  const spec = { ...newUsernodeAssetSpec(name),description: `${name} description`,tags: extras.tags ?? [] };
  return {
    head: {
      domain: 'usernode',resourceId,name,description: spec.description,tags: spec.tags,
      mainCommitId: 'commit-1',currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,system: extras.system,
      namespaceId: extras.namespaceId,
    },
    branch: {
      domain: 'usernode',resourceId,name: 'main',headCommitId: 'commit-1',headVersion: 1,revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}

function namespaceFixture(namespaceId: string, name: string): UsernodeNamespace {
  return {
    domain: 'usernode',
    namespaceId,
    name,
    revision: 1,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-22T00:00:00Z',
  };
}
