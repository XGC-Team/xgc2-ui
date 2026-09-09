import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef,useCallback,useEffect,useImperativeHandle,useRef } from 'react';
import { connectTerminalTransport,type TerminalConnection } from '../../features/terminal/terminalTransport';
import { writeClipboardText } from '../../shared/utils/clipboard';
import { getTerminalWebSocketTicket } from './terminalSessionActions';
import type { TerminalSetting } from './terminalModel';
import type { TerminalHandle,TerminalSession } from './terminalSessionModel';

export const XtermSession = forwardRef<TerminalHandle, {
  session: TerminalSession;
  setting: TerminalSetting;
  targetCoreId?: string;
  /** When set, session is dialed as this Agent identity (not Core). */
  managedHostId?: string;
  /** One-time password for this connect; never persisted with the session. */
  connectPassword?: string;
  active: boolean;
  onStatus: (patch: Partial<TerminalSession>) => void;
  onError: (message: string) => void;
}>(({ session,setting,targetCoreId,managedHostId,connectPassword = '',active,onStatus,onError }, ref) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const connectionRef = useRef<TerminalConnection | null>(null);
  const connectAbortRef = useRef<AbortController | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const connectSeqRef = useRef(0);
  const disposedRef = useRef(false);
  const settingRef = useRef(setting);
  const statusRef = useRef(onStatus);
  const errorRef = useRef(onError);
  const titleRef = useRef(session.title);

  useEffect(() => {
    settingRef.current = setting;
  }, [setting]);

  useEffect(() => {
    statusRef.current = onStatus;
    errorRef.current = onError;
    titleRef.current = session.title;
  }, [onError,onStatus,session.title]);

  const sendTerminalData = useCallback((value: string) => {
    connectionRef.current?.sendCommand(value);
  }, []);

  const fitAndSendResize = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    const host = elementRef.current;
    // Both axes matter: a zero-height box (collapsed tab stack) makes FitAddon
    // report 1 row and leaves the session looking like a single prompt line.
    if (!fit || !term || !host || host.clientWidth <= 0 || host.clientHeight <= 0) return;
    fit.fit();
    connectionRef.current?.sendResize(term.cols,term.rows);
  }, []);

  const closeTerminalSession = useCallback(() => {
    connectionRef.current?.sendClose();
    connectionRef.current?.close();
  }, []);

  const connect = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const connectSeq = connectSeqRef.current + 1;
    connectSeqRef.current = connectSeq;
    connectAbortRef.current?.abort();
    const connectAbort = new AbortController();
    connectAbortRef.current = connectAbort;
    connectionRef.current?.close();
    connectionRef.current = null;
    statusRef.current({ status: 'connecting' });
    if (disposedRef.current || connectSeqRef.current !== connectSeq || !termRef.current) return;
    const cols = Math.max(term.cols || 100,40);
    const rows = Math.max(term.rows || 32,12);
    try {
      const connection = await connectTerminalTransport({
        hostId: session.hostId,
        sessionId: session.id,
        cols,
        rows,
        targetCoreId,
        managedHostId,
        resumeOnly: Boolean(session.resumeOnly),
        connectPassword,
        getTicket: getTerminalWebSocketTicket,
        onOpen: () => {
          if (disposedRef.current || connectionRef.current !== connection) return;
          statusRef.current({ status: 'online' });
          // Two frames: first applies CSS height after the session cell is shown,
          // second lets FitAddon measure a non-collapsed host box.
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => fitAndSendResize());
          });
        },
        onData: (value) => {
          if (!disposedRef.current && connectionRef.current === connection) term.write(value);
        },
        onError: () => {
          if (!disposedRef.current && connectionRef.current === connection) errorRef.current(`${titleRef.current} connection error`);
        },
        onClose: () => {
          if (connectionRef.current === connection && !disposedRef.current) statusRef.current({ status: 'closed',resumeOnly: false });
        },
        signal: connectAbort.signal,
      });
      if (disposedRef.current || connectSeqRef.current !== connectSeq) {
        connection.close();
        return;
      }
      connectAbortRef.current = null;
      connectionRef.current = connection;
    } catch (error) {
      if (disposedRef.current || connectSeqRef.current !== connectSeq) return;
      statusRef.current({ status: 'closed',resumeOnly: false });
      errorRef.current(error instanceof Error ? error.message : String(error));
    } finally {
      if (connectAbortRef.current === connectAbort) connectAbortRef.current = null;
    }
  }, [connectPassword,fitAndSendResize,managedHostId,session.hostId,session.id,session.resumeOnly,targetCoreId]);

  useImperativeHandle(ref, () => ({
    send(value: string) {
      sendTerminalData(value);
    },
    focus() {
      termRef.current?.focus?.();
    },
    clear() {
      termRef.current?.clear();
    },
    reconnect() {
      void connect();
    },
    close() {
      closeTerminalSession();
    },
  }), [closeTerminalSession,connect,sendTerminalData]);

  useEffect(() => {
    const currentSetting = settingRef.current;
    const host = elementRef.current;
    const term = new XTerm({
      fontFamily: currentSetting.fontFamily,
      fontSize: currentSetting.fontSize,
      lineHeight: currentSetting.lineHeight,
      letterSpacing: currentSetting.letterSpacing,
      cursorStyle: currentSetting.cursorStyle === 'underline' || currentSetting.cursorStyle === 'bar' ? currentSetting.cursorStyle : 'block',
      cursorBlink: currentSetting.cursorBlink,
      scrollback: currentSetting.scrollback,
      scrollSensitivity: currentSetting.scrollSensitivity,
      theme: { background: currentSetting.backgroundColor,foreground: currentSetting.foregroundColor },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;
    if (host) {
      term.open(host);
      fit.fit();
    }
    const copySelection = () => {
      const selection = term.getSelection();
      if (!selection) return;
      void writeClipboardText(selection).then(() => {
        if (disposedRef.current || term.getSelection() !== selection) return;
        term.clearSelection();
      }).catch(() => {
        errorRef.current('Clipboard copy failed; the terminal selection was kept');
      });
    };
    let selectionPointerId: number | null = null;
    let copyFrame: number | null = null;
    const scheduleCopy = () => {
      if (copyFrame !== null) window.cancelAnimationFrame(copyFrame);
      // xterm finalizes drag / double-click selection after pointerup.
      copyFrame = window.requestAnimationFrame(() => {
        copyFrame = window.requestAnimationFrame(() => {
          copyFrame = null;
          copySelection();
        });
      });
    };
    const beginSelection = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!(event.target instanceof Node) || !host?.contains(event.target)) return;
      selectionPointerId = event.pointerId;
    };
    const finishSelection = (event: PointerEvent) => {
      if (selectionPointerId === null || event.pointerId !== selectionPointerId) return;
      selectionPointerId = null;
      scheduleCopy();
    };
    const cancelSelection = (event: PointerEvent) => {
      if (event.pointerId === selectionPointerId) selectionPointerId = null;
    };
    const selectionChange = term.onSelectionChange(() => {
      if (selectionPointerId !== null) return;
      scheduleCopy();
    });
    host?.addEventListener('pointerdown', beginSelection, true);
    document.addEventListener('pointerup', finishSelection, true);
    document.addEventListener('pointercancel', cancelSelection, true);
    term.onData(sendTerminalData);
    disposedRef.current = false;
    void connect();
    const resizeObserver = new ResizeObserver(() => fitAndSendResize());
    if (host) resizeObserver.observe(host);
    return () => {
      disposedRef.current = true;
      connectSeqRef.current += 1;
      connectAbortRef.current?.abort();
      connectAbortRef.current = null;
      resizeObserver.disconnect();
      host?.removeEventListener('pointerdown', beginSelection, true);
      document.removeEventListener('pointerup', finishSelection, true);
      document.removeEventListener('pointercancel', cancelSelection, true);
      selectionChange.dispose();
      if (copyFrame !== null) window.cancelAnimationFrame(copyFrame);
      connectionRef.current?.close();
      connectionRef.current = null;
      term.dispose();
    };
  }, [connect,fitAndSendResize,sendTerminalData,session.id,session.refresh,targetCoreId]);

  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.fontFamily = setting.fontFamily;
    termRef.current.options.fontSize = setting.fontSize;
    termRef.current.options.lineHeight = setting.lineHeight;
    termRef.current.options.letterSpacing = setting.letterSpacing;
    termRef.current.options.cursorBlink = setting.cursorBlink;
    termRef.current.options.cursorStyle = setting.cursorStyle === 'underline' || setting.cursorStyle === 'bar' ? setting.cursorStyle : 'block';
    termRef.current.options.scrollback = setting.scrollback;
    termRef.current.options.scrollSensitivity = setting.scrollSensitivity;
    termRef.current.options.theme = { background: setting.backgroundColor,foreground: setting.foregroundColor };
    fitAndSendResize();
  }, [fitAndSendResize,setting]);

  useEffect(() => {
    if (!active) return;
    window.requestAnimationFrame(() => fitAndSendResize());
  }, [active,fitAndSendResize]);

  return (
    <div
      className="xterm-session"
      data-xgc-active={active ? 'true' : undefined}
      data-xgc-id={session.id}
      data-xgc-role="terminal-xterm"
      data-xgc-selectable
      ref={elementRef}
    />
  );
});

XtermSession.displayName = 'XtermSession';
