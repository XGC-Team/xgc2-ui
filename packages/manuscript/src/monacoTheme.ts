type MonacoLike = {
  editor: {
    defineTheme: (name: string, theme: {
      base: 'vs' | 'vs-dark';
      inherit: boolean;
      rules: Array<{ token: string; foreground?: string }>;
      colors: Record<string, string>;
    }) => void;
  };
};

function cssVar(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.startsWith('#') ? value : fallback;
}

export function ensureMonacoThemes(monaco: MonacoLike | { editor: MonacoLike['editor'] }) {
  const lightSurface = cssVar('--color-bg-surface', '#ffffff');
  const lightText = cssVar('--color-text', '#243149');
  const darkSurface = cssVar('--color-bg-surface', '#1c1a18');
  const darkText = cssVar('--color-text', '#d5d0c8');
  monaco.editor.defineTheme('xgc-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280' },
      { token: 'keyword', foreground: '1d4f91' },
    ],
    colors: {
      'editor.background': lightSurface,
      'editor.foreground': lightText,
      'editorLineNumber.foreground': '#7b8494',
      'editor.lineHighlightBackground': '#f3f6fb',
    },
  });
  monaco.editor.defineTheme('xgc-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b8378' },
      { token: 'keyword', foreground: '8cb4e8' },
    ],
    colors: {
      'editor.background': darkSurface,
      'editor.foreground': darkText,
      'editorLineNumber.foreground': '#8a837a',
      'editor.lineHighlightBackground': '#25221f',
    },
  });
}

export function monacoThemeName() {
  return typeof document !== 'undefined' && document.documentElement.dataset.skin === 'dark'
    ? 'xgc-dark'
    : 'xgc-light';
}
