// @vitest-environment jsdom

import { fireEvent,render,waitFor } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { AppWindowControls } from './AppWindowControls';
import type { DesktopWindowApi } from './desktopWindow';

function stubDesktopWindow(overrides: Partial<DesktopWindowApi> = {}) {
  const api = {
    close: vi.fn(async () => true),
    isMaximized: vi.fn(async () => false),
    minimize: vi.fn(async () => true),
    toggleMaximize: vi.fn(async () => true),
    ...overrides,
  };
  window.xgcDesktopWindow = api;
  return api;
}

describe('AppWindowControls', () => {
  afterEach(() => {
    window.xgcDesktopWindow = undefined;
  });

  it('does not render caption buttons in the browser host', () => {
    window.xgcDesktopWindow = undefined;
    const { container } = render(<AppWindowControls language="zh-CN" />);
    expect(container.querySelector('[data-xgc-role="app-window-controls"]')).toBeNull();
  });

  it('renders square caption buttons and drives the thin-shell window API', async () => {
    const api = stubDesktopWindow();
    const { container } = render(<AppWindowControls language="zh-CN" />);
    const cluster = container.querySelector('[data-xgc-role="app-window-controls"][data-xgc-id="app-window-controls"]');
    const minimize = container.querySelector('[data-xgc-role="app-window-minimize"][data-xgc-id="app-window-minimize"]');
    const maximize = container.querySelector('[data-xgc-role="app-window-maximize"][data-xgc-id="app-window-maximize"]');
    const close = container.querySelector('[data-xgc-role="app-window-close"][data-xgc-id="app-window-close"]');
    expect(cluster).not.toBeNull();
    expect(minimize).toHaveAttribute('aria-label', '最小化');
    expect(maximize).toHaveAttribute('aria-label', '最大化');
    expect(close).toHaveAttribute('aria-label', '关闭');
    fireEvent.pointerDown(minimize!);
    fireEvent.pointerDown(maximize!);
    fireEvent.pointerDown(close!);
    expect(api.minimize).toHaveBeenCalledOnce();
    expect(api.toggleMaximize).toHaveBeenCalledOnce();
    expect(api.close).toHaveBeenCalledOnce();
    await waitFor(() => expect(maximize).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(maximize).toHaveAttribute('aria-label', '还原'));
  });
});
