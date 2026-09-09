export function getThemeToken(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const themeTokenFallbacks = {
  '--color-bg-code': '#181613',
  '--color-bg-primary': '#875329',
  '--color-chart-axis': '#716960',
  '--color-chart-grid': '#302c28',
  '--color-chart-label': '#aaa299',
  '--color-chart-line': '#d59a64',
  '--color-danger': '#d58b83',
  '--color-success': '#9ab58b',
  '--color-text-strong': '#f7f3ec',
  '--color-warning': '#d8b66e',
} as const;

export const externalVisualizationThemeDefaults = {
  gridColor: '#9e9e9e',
  markerColor: '#ffbf00',
} as const;

export type AppThemeToken = keyof typeof themeTokenFallbacks;

export function getAppThemeToken(name: AppThemeToken) {
  return getThemeToken(name, themeTokenFallbacks[name]);
}
