// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listUsernodeAssets,
  listUsernodeNamespaces,
  useUsernodeAssetsStore,
  type UsernodeAssetDocument,
} from '../../usernode/usernodePublic';
import { TerminalUserScriptsLeaf } from './userScripts';

vi.mock('../../usernode/usernodePublic', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    listUsernodeAssets: vi.fn(),
    listUsernodeNamespaces: vi.fn(),
  };
});

vi.mock('../../usernode/usernodeStore', async (loadOriginal) => {
  const original = await loadOriginal() as Record<string, unknown>;
  return { ...original, useUsernodeAssetsStore: vi.fn() };
});

describe('TerminalUserScriptsLeaf', () => {
  beforeEach(() => {
    vi.mocked(listUsernodeAssets).mockReset();
    vi.mocked(listUsernodeNamespaces).mockReset().mockResolvedValue([]);
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      assets: [],
      namespaces: [],
      selected: null,
      loading: false,
      error: '',
      refresh: vi.fn(),
      open: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      commit: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      archive: vi.fn(),
      addNamespace: vi.fn(),
      renameNamespace: vi.fn(),
      archiveNamespace: vi.fn(),
      close: vi.fn(),
    });
  });

  it('renders a compact empty rail without System or Template groups', async () => {
    vi.mocked(listUsernodeAssets).mockResolvedValue([]);
    const { container } = render(<TerminalUserScriptsLeaf onSendCommand={vi.fn()} />);
    const empty = await waitFor(() => {
      const element = container.querySelector('[data-xgc-role="terminal-usernode-script-empty"][data-xgc-id="usernode"]');
      if (!element) throw new Error('empty rail missing');
      return element;
    });
    expect(empty).toHaveAttribute('data-density', 'compact');
    expect(empty).toHaveTextContent('No user scripts');
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script-group"]')).toBeNull();
    expect(container.textContent).not.toContain('System scripts');
    expect(container.textContent).not.toContain('Templates');
  });

  it('lists every catalog script by resource id and inserts through sendCommand', async () => {
    const onSendCommand = vi.fn();
    vi.mocked(listUsernodeAssets).mockResolvedValue([
      documentFixture('warm-up', 'Warm up', {
        interpreter: 'bash',
        source: 'echo ready',
      }),
    ]);
    const { container } = render(<TerminalUserScriptsLeaf onSendCommand={onSendCommand} />);

    const item = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        '[data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]',
      );
      if (!element) throw new Error('user script row missing');
      return element;
    });
    expect(item.querySelector('.terminal-usernode-script-name')).toHaveTextContent('Warm up');
    expect(item.querySelector('[data-xgc-role="terminal-script-command"]')).toHaveTextContent('echo ready');
    expect(item).toHaveAttribute('title', 'Warm up · echo ready');
    expect(item.querySelector('.terminal-usernode-script-summary')?.textContent).not.toMatch(/\d+\s+inputs?/i);
    expect(container.querySelectorAll('[data-xgc-role="terminal-usernode-script-group"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-xgc-role="terminal-usernode-script-group"][data-xgc-id="user"]')
        ?.querySelector('[data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script"][data-xgc-id="default-system-ls"]'))
      .toBeNull();
    expect(item).toHaveAttribute(
      'aria-label',
      'Insert Warm up into the current terminal: echo ready',
    );
    fireEvent.click(item);
    expect(onSendCommand).toHaveBeenCalledWith('echo ready');
    expect(onSendCommand).toHaveBeenCalledTimes(1);
  });

  it('hosts usernode authoring on the User scripts subpage', async () => {
    const { container } = render(
      <TerminalUserScriptsLeaf onSendCommand={vi.fn()} surface="page" />,
    );
    const page = container.querySelector(
      '[data-xgc-role="terminal-usernode-scripts-page"][data-xgc-id="usernode"]',
    );
    expect(page).not.toBeNull();
    expect(page?.querySelector('[data-xgc-role="usernode-assets-page"][data-xgc-id="usernode"]')).not.toBeNull();
    expect(page?.querySelector('[data-xgc-role="usernode-asset-create"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-commands-page"]')).toBeNull();
  });

  it('hosts usernode authoring on the User scripts subpage without an insert/play action', async () => {
    const onInserted = vi.fn();
    const onSendCommand = vi.fn();
    const open = vi.fn().mockResolvedValue(undefined);
    const asset = documentFixture('warm-up', 'Warm up', { interpreter: 'bash', source: 'echo ready' });
    vi.mocked(useUsernodeAssetsStore).mockReturnValue({
      assets: [asset],
      namespaces: [],
      selected: null,
      loading: false,
      error: '',
      refresh: vi.fn(),
      open,
      create: vi.fn(),
      commit: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      archive: vi.fn(),
      addNamespace: vi.fn(),
      renameNamespace: vi.fn(),
      archiveNamespace: vi.fn(),
      close: vi.fn(),
    });
    const { container } = render(
      <TerminalUserScriptsLeaf
        onInserted={onInserted}
        onSendCommand={onSendCommand}
        surface="page"
      />,
    );
    expect(container.querySelector('[data-xgc-role="usernode-asset-use"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="usernode-asset-row"][data-xgc-id="warm-up"]')!);
    expect(open).toHaveBeenCalledWith('warm-up');
    expect(onSendCommand).not.toHaveBeenCalled();
    expect(onInserted).not.toHaveBeenCalled();
  });

  it('collapses a functional folder without unmounting its stable role', async () => {
    vi.mocked(listUsernodeAssets).mockResolvedValue([
      documentFixture('warm-up', 'Warm up', { interpreter: 'bash', source: 'echo ready' }),
    ]);
    const { container } = render(<TerminalUserScriptsLeaf onSendCommand={vi.fn()} />);
    const toggle = await screen.findByRole('button', { name: 'Ungrouped' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script-group"][data-xgc-id="user"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="terminal-usernode-script"][data-xgc-id="warm-up"]')).toBeNull();
  });
});

function documentFixture(
  resourceId: string,
  name: string,
  extras: Partial<UsernodeAssetDocument['spec']> & { system?: boolean } = {},
): UsernodeAssetDocument {
  const timestamp = '2026-08-22T00:00:00Z';
  const { system, ...specOverrides } = extras;
  const spec: UsernodeAssetDocument['spec'] = {
    schemaVersion: 1,
    name,
    description: '',
    tags: [],
    interpreter: 'bash',
    source: 'echo ready',
    package: '',
    executable: '',
    launchFile: '',
    defaultArgs: [],
    setupScripts: [],
    env: {},
    timeoutSeconds: 600,
    inputs: [],
    ...specOverrides,
  };
  return {
    head: {
      domain: 'usernode', resourceId, name, description: spec.description, tags: spec.tags,
      mainCommitId: 'commit-1', currentVersion: 1, digest: 'a'.repeat(64), revision: 1,
      createdAt: timestamp, updatedAt: timestamp, system,
    },
    branch: {
      domain: 'usernode', resourceId, name: 'main', headCommitId: 'commit-1', headVersion: 1, revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    spec,
  };
}
