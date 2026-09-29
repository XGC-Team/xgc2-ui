import { getThemeToken } from '../theme';

/**
 * The historical server default terminal stack. It never listed the bundled
 * JetBrains Mono, so Linux stations rendered terminals in DejaVu/Liberation
 * Mono while every other code surface used the shared code face.
 */
export const LEGACY_TERMINAL_FONT_FAMILY = "Monaco, Menlo, Consolas, 'Courier New', monospace";

/**
 * Terminals are the code role: they render the shared `--font-mono` stack.
 * A family the operator chose in terminal settings is kept verbatim; a blank
 * value or the untouched legacy default follows the shared token.
 */
export function resolveTerminalFontFamily(fontFamily?: string | null): string {
  const selected = fontFamily?.trim() ?? '';
  if (selected && selected !== LEGACY_TERMINAL_FONT_FAMILY) return selected;
  return getThemeToken('--font-mono', LEGACY_TERMINAL_FONT_FAMILY);
}

type MeasuredTerminal = { options: { fontFamily?: string } };

/**
 * xterm measures its cell once per font change. The bundled face loads
 * lazily, so re-measure once it is ready and let the caller refit; otherwise
 * the grid keeps fallback-face metrics. Resolves without effect when the
 * Font Loading API is unavailable or the terminal was replaced meanwhile.
 */
export function remeasureTerminalFontWhenReady(
  term: MeasuredTerminal,
  fontFamily: string,
  fontSize: number,
  isCurrent: () => boolean,
  refit: () => void,
): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  const primary = fontFamily.split(',')[0]?.trim();
  if (!fonts || typeof fonts.load !== 'function' || !primary) return Promise.resolve();
  return fonts.load(`${fontSize}px ${primary}`).then((faces) => {
    if (faces.length === 0 || !isCurrent()) return;
    // The option setter ignores an unchanged value; step through a distinct
    // string so xterm re-measures the now-loaded face.
    term.options.fontFamily = `${fontFamily} `;
    term.options.fontFamily = fontFamily;
    refit();
  }, () => undefined);
}
