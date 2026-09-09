// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { AppStoreSettingsAdapter } from './AppStoreSettingsAdapterRoute';

const targetState = vi.hoisted(() => ({
  managedHostId: 'local',
  useTargetCore: vi.fn(),
}));

vi.mock('../../app/navigationContext', () => ({
  useNavigation: () => ({ managedHostId: targetState.managedHostId }),
}));

vi.mock('../../app/useTargetCore', () => ({
  useTargetCore: (surface: string) => targetState.useTargetCore(surface),
}));

vi.mock('./AppStoreSettingsSection', () => ({
  AppStoreSettingsSection: ({
    labels,
    targetCoreId,
    targetId,
    title,
  }: {
    labels: { registry?: string };
    targetCoreId?: string;
    targetId?: string;
    title: string;
  }) => (
    <div
      data-testid="app-store-settings-section"
      data-target-core-id={targetCoreId}
      data-target-id={targetId}
      data-registry-label={labels.registry}
    >
      {title}
    </div>
  ),
}));

describe('AppStoreSettingsAdapter', () => {
  beforeEach(() => {
    targetState.managedHostId = 'local';
    targetState.useTargetCore.mockReset();
    targetState.useTargetCore.mockReturnValue({
      routedTargetCoreId: 'remote-core',
      selectedTargetCore: {
        id: 'remote-core',
        name: 'Remote Core',
        profile: 'core',
        baseUrl: 'http://remote:8787',
        status: 'online',
        capabilities: [],
        registeredAt: '',
        lastSeenAt: '',
        updatedAt: '',
      },
    });
  });

  it('derives targetId and targetCoreId inside the AppStore leaf', () => {
    render(
      <AppStoreSettingsAdapter
        skin="light"
        language="en-US"
        onLanguageChange={vi.fn()}
        onSkinChange={vi.fn()}
      />,
    );

    expect(targetState.useTargetCore).toHaveBeenCalledWith('appStore');
    expect(screen.getByTestId('app-store-settings-section'))
      .toHaveAttribute('data-target-id','core:remote-core');
    expect(screen.getByTestId('app-store-settings-section'))
      .toHaveAttribute('data-target-core-id','remote-core');
    expect(screen.getByTestId('app-store-settings-section'))
      .toHaveAttribute('data-registry-label','Registry');
    expect(screen.getByTestId('app-store-settings-section')).toHaveTextContent('App store');
  });

  it('uses the selected Agent as the execution target without leaking fields into Settings', () => {
    targetState.managedHostId = 'agent-b';

    render(
      <AppStoreSettingsAdapter
        skin="dark"
        language="zh-CN"
        onLanguageChange={vi.fn()}
        onSkinChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('app-store-settings-section'))
      .toHaveAttribute('data-target-id','agent-b');
    expect(screen.getByTestId('app-store-settings-section'))
      .toHaveAttribute('data-registry-label','镜像仓库');
    expect(screen.getByTestId('app-store-settings-section')).toHaveTextContent('应用商店');
  });
});
