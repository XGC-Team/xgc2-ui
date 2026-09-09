export type DesktopWindowApi = {
  close: () => Promise<unknown>;
  isMaximized: () => Promise<boolean>;
  minimize: () => Promise<unknown>;
  toggleMaximize: () => Promise<boolean>;
};

declare global {
  interface Window {
    xgcDesktopWindow?: DesktopWindowApi;
  }
}

export function readDesktopWindowApi(): DesktopWindowApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = window.xgcDesktopWindow;
  if (!api) return undefined;
  if (typeof api.minimize !== 'function' || typeof api.toggleMaximize !== 'function'
    || typeof api.close !== 'function' || typeof api.isMaximized !== 'function') {
    return undefined;
  }
  return api;
}
