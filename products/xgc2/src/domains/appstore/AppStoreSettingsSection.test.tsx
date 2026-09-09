// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { AppStoreSetting } from './appStoreModel';
import { AppStoreSettingsSection } from './AppStoreSettingsSection';
import { getAppStoreSnapshot,saveAppStoreSetting } from './appStoreService';
import type * as ExecutionPublicModule from '../execution/executionPublic';

const publishNotification = vi.fn();

vi.mock('../execution/executionPublic', async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublicModule>(),
  executionRequestId: vi.fn(() => 'request-1'),
}));

vi.mock('../groundStationInteraction/groundStationInteractionPublic', async (importOriginal) => {
  const React = await import('react');
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGroundStationNotification: (
      targetId: string,
      message: string,
      options: { title: string;severity?: string;source?: string;dedupeKey?: string },
    ) => {
      React.useEffect(() => {
        if (!message.trim()) return;
        publishNotification({
          targetId,
          message,
          title: options.title,
          severity: options.severity,
          source: options.source,
          dedupeKey: options.dedupeKey,
        });
      }, [message, options.dedupeKey, options.severity, options.source, options.title, targetId]);
    },
    useGroundStationErrorNotification: vi.fn(),
  };
});

vi.mock('./appStoreService', () => ({
  getAppStoreSnapshot: vi.fn(),
  saveAppStoreSetting: vi.fn(),
  syncCatalogAppStore: vi.fn(),
}));

describe('AppStoreSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAppStoreSnapshot).mockResolvedValue({
      apps: [],
      details: [],
      installed: [],
      setting: appStoreSetting(),
    });
    vi.mocked(saveAppStoreSetting).mockImplementation(async (_targetId, setting) => setting);
  });

  it('auto-saves registry changes without Save or Sync buttons', async () => {
    render(<AppStoreSettingsSection targetId="agent-a" title="App store" />);
    await screen.findByRole('button', { name: 'Registry' });

    expect(screen.queryByRole('button', { name: 'Save image source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync catalog' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="app-store-settings-actions"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'GitHub Container Registry' }));

    await waitFor(() => expect(saveAppStoreSetting).toHaveBeenCalledWith(
      'agent-a',
      expect.objectContaining({
        registry: 'ghcr',
        imageSource: 'default',
        mirrorPrefix: 'ghcr.io/lxk36/xgc2-app-store',
      }),
      {},
    ));
    expect(publishNotification).not.toHaveBeenCalledWith(expect.objectContaining({
      message: 'Image source saved.',
    }));
  });

  it('shows image prefix as a non-editable field that tracks the selected registry', async () => {
    render(<AppStoreSettingsSection targetId="agent-a" title="App store" />);
    const prefix = await screen.findByRole('textbox', { name: 'Image prefix' });
    expect(prefix).toBeDisabled();
    expect(prefix).toHaveAttribute('readonly');
    expect(prefix).toHaveValue('registry.cn-hangzhou.aliyuncs.com/xgc2-app-store');

    fireEvent.change(prefix, { target: { value: 'ghcr.io/xgc2' } });
    expect(saveAppStoreSetting).not.toHaveBeenCalled();
    expect(prefix).toHaveValue('registry.cn-hangzhou.aliyuncs.com/xgc2-app-store');

    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'GitHub Container Registry' }));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Image prefix' })).toHaveValue('ghcr.io/lxk36/xgc2-app-store');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'Aliyun ACR' }));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Image prefix' })).toHaveValue('registry.cn-hangzhou.aliyuncs.com/xgc2-app-store');
    });
  });

  it('collapses rapid registry edits into a trailing save of the latest draft', async () => {
    let resolveFirst!: (setting: AppStoreSetting) => void;
    vi.mocked(saveAppStoreSetting)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementation(async (_targetId, setting) => setting);

    render(<AppStoreSettingsSection targetId="agent-a" title="App store" />);
    await screen.findByRole('button', { name: 'Registry' });

    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'GitHub Container Registry' }));
    await waitFor(() => expect(saveAppStoreSetting).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'Aliyun ACR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'GitHub Container Registry' }));

    await act(async () => {
      resolveFirst(appStoreSetting({ registry: 'ghcr' }));
    });

    await waitFor(() => expect(saveAppStoreSetting).toHaveBeenCalledWith(
      'agent-a',
      expect.objectContaining({ registry: 'ghcr' }),
      {},
    ));
    expect(screen.getByRole('button', { name: 'Registry' })).toHaveTextContent('GitHub Container Registry');
  });

  it('does not overwrite a dirty settings draft when the snapshot reloads', async () => {
    render(<AppStoreSettingsSection targetId="agent-a" title="App store" />);
    await screen.findByRole('button', { name: 'Registry' });
    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'GitHub Container Registry' }));

    await act(async () => {
      vi.mocked(getAppStoreSnapshot).mockResolvedValueOnce({
        apps: [],
        details: [],
        installed: [],
        setting: appStoreSetting({ registry: 'aliyun',mirrorPrefix: 'registry.cn-hangzhou.aliyuncs.com/xgc2-app-store' }),
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Registry' })).toHaveTextContent('GitHub Container Registry');
    });
    expect(screen.getByRole('textbox', { name: 'Image prefix' })).toBeDisabled();
  });

  it('does not offer a custom registry option', async () => {
    render(<AppStoreSettingsSection targetId="agent-a" title="App store" />);
    await screen.findByRole('button', { name: 'Registry' });
    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    expect(screen.getByRole('option', { name: 'Aliyun ACR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'GitHub Container Registry' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Custom registry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '自定义仓库' })).not.toBeInTheDocument();
  });

  it('notifies when auto-save fails', async () => {
    vi.mocked(saveAppStoreSetting).mockRejectedValue(new Error('save failed'));
    render(<AppStoreSettingsSection targetId="agent-a" title="App store" />);
    await screen.findByRole('button', { name: 'Registry' });

    fireEvent.click(screen.getByRole('button', { name: 'Registry' }));
    fireEvent.click(screen.getByRole('option', { name: 'GitHub Container Registry' }));

    await waitFor(() => expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'save failed',
      severity: 'error',
      source: 'app-store-settings',
    })));
  });
});

function appStoreSetting(overrides: Partial<AppStoreSetting> = {}): AppStoreSetting {
  return {
    id: 'default',
    registry: 'aliyun',
    imageSource: 'mirror',
    mirrorPrefix: 'registry.cn-hangzhou.aliyuncs.com/xgc2-app-store',
    updatedAt: '',
    ...overrides,
  };
}
