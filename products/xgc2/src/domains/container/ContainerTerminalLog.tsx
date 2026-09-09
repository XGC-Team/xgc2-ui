import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import { useEffect,useRef } from 'react';
import { getThemeToken } from '../../theme';

/**
 * Read-only xterm surface for container logs / command output.
 * Renders as an inset terminal window (not edge-flush plain text).
 * Presentation only — parent owns fetch + drawer chrome.
 */
export function ContainerTerminalLog({ content }: { content: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 20_000,
      allowTransparency: false,
      theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    const writeContent = () => {
      term.reset();
      term.write(normalizeTerminalText(contentRef.current));
      term.scrollToBottom();
    };

    const resize = () => {
      if (!hostRef.current || hostRef.current.clientWidth <= 0) return;
      fit.fit();
    };

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(host);

    const skinObserver = new MutationObserver(() => {
      term.options.theme = readTerminalTheme();
    });
    skinObserver.observe(document.documentElement, { attributeFilter: ['data-skin'],attributes: true });

    // Drawer animates open — fit after layout settles, then paint content.
    window.requestAnimationFrame(() => {
      resize();
      writeContent();
      window.requestAnimationFrame(resize);
    });

    return () => {
      observer.disconnect();
      skinObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.reset();
    term.write(normalizeTerminalText(content));
    term.scrollToBottom();
    // Re-fit after content change in case scrollbar appears.
    window.requestAnimationFrame(() => fitRef.current?.fit());
  }, [content]);

  return (
    <div className="container-terminal-shell" data-xgc-role="container-detail-content" data-xgc-id="container-detail-content">
      <div className="container-terminal-window" data-xgc-role="container-terminal-window" data-xgc-id="container-terminal-window">
        <div
          className="container-terminal-log"
          ref={hostRef}
          role="log"
          aria-label="Terminal log output"
          aria-readonly="true"
        />
      </div>
    </div>
  );
}

function readTerminalTheme() {
  const background = getThemeToken('--color-terminal-bg', '#100f0e');
  const foreground = getThemeToken('--color-terminal-fg', '#ddd7cf');
  const muted = getThemeToken('--color-terminal-muted', '#968e85');
  const mutedHover = getThemeToken('--color-terminal-muted-hover', '#b1aaa1');
  const mutedActive = getThemeToken('--color-terminal-muted-active', '#d2ccc4');
  const danger = getThemeToken('--color-danger', '#d58b83');
  const dangerStrong = getThemeToken('--color-danger-strong', '#e2a29b');
  const success = getThemeToken('--color-success', '#9ab58b');
  const warning = getThemeToken('--color-warning', '#d8b66e');
  const keyword = getThemeToken('--color-terminal-syntax-keyword', '#e4a56e');
  const string = getThemeToken('--color-terminal-syntax-string', '#a8bf91');
  const variable = getThemeToken('--color-terminal-syntax-variable', '#d9bd78');
  const number = getThemeToken('--color-terminal-syntax-number', '#c4a2c8');
  const strong = getThemeToken('--color-text-strong', '#f7f3ec');

  return {
    background,
    foreground,
    cursor: foreground,
    selectionBackground: getThemeToken('--color-accent-soft', '#2b2119'),
    scrollbarSliderBackground: muted,
    scrollbarSliderHoverBackground: mutedHover,
    scrollbarSliderActiveBackground: mutedActive,
    black: background,
    red: danger,
    green: success,
    yellow: warning,
    blue: keyword,
    magenta: number,
    cyan: variable,
    white: foreground,
    brightBlack: muted,
    brightRed: dangerStrong,
    brightGreen: string,
    brightYellow: variable,
    brightBlue: keyword,
    brightMagenta: number,
    brightCyan: variable,
    brightWhite: strong,
  };
}

function normalizeTerminalText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
}
