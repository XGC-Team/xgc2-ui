// @vitest-environment jsdom

import { createRef } from 'react';
import { fireEvent,render,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { TerminalHandle } from './terminalSessionModel';
import { XtermSession } from './XtermSession';

const terminalMock = vi.hoisted(() => ({
  focus: vi.fn(),
  clearSelection: vi.fn(),
  selection: '',
  selectionChange: null as null | (() => void),
}));

const connectTerminalTransport = vi.hoisted(() => vi.fn());

vi.mock('../../features/terminal/terminalTransport', () => ({
  connectTerminalTransport,
}));

vi.mock('./terminalSessionActions', () => ({
  getTerminalWebSocketTicket: vi.fn(),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};

    clear() {}
    clearSelection() {
      terminalMock.clearSelection();
      terminalMock.selection = '';
    }
    dispose() {}
    focus() { terminalMock.focus(); }
    getSelection() { return terminalMock.selection; }
    loadAddon() {}
    onData() {}
    onSelectionChange(listener: () => void) {
      terminalMock.selectionChange = listener;
      return { dispose() { terminalMock.selectionChange = null; } };
    }
    open(element: HTMLElement) {
      const helper = document.createElement('textarea');
      helper.className = 'xterm-helper-textarea';
      const screen = document.createElement('div');
      screen.className = 'xterm-screen';
      element.appendChild(helper);
      element.appendChild(screen);
    }
    write() {}
  },
}));

describe('XtermSession', () => {
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    terminalMock.focus.mockClear();
    terminalMock.clearSelection.mockClear();
    terminalMock.selection = '';
    terminalMock.selectionChange = null;
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    connectTerminalTransport.mockResolvedValue({
      sendCommand: vi.fn(),
      sendClose: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
    });
  });

  it('copies its exact selection on pointer release and remains selectable in packaged builds', async () => {
    const { container } = render(
      <XtermSession
        active
        onError={vi.fn()}
        onStatus={vi.fn()}
        session={{
          id: 'ssh-default-direct-shell-1786363356178',
          title: 'Direct shell',
          hostId: 'default-direct-shell',
          status: 'online',
          refresh: 0,
        }}
        setting={{
          id: 'default',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          backgroundColor: '#000000',
          foregroundColor: '#ffffff',
          cursorStyle: 'block',
          cursorBlink: true,
          scrollback: 1000,
          scrollSensitivity: 1,
          defaultHostId: '',
        }}
      />,
    );
    const terminal = container.querySelector(
      '[data-xgc-role="terminal-xterm"][data-xgc-id="ssh-default-direct-shell-1786363356178"]',
    );

    expect(terminal).toHaveAttribute('data-xgc-selectable');
    terminalMock.selection = 'first line\nsecond line  ';
    fireEvent.pointerDown(terminal!.querySelector('.xterm-screen')!, { button: 0,pointerId: 7 });
    fireEvent.pointerUp(document.body, { pointerId: 7 });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('first line\nsecond line  '));
    await waitFor(() => expect(terminalMock.clearSelection).toHaveBeenCalledTimes(1));
    expect(terminalMock.selection).toBe('');

    terminalMock.selection = '';
    fireEvent.pointerDown(terminal!.querySelector('.xterm-screen')!, { button: 0,pointerId: 8 });
    fireEvent.pointerUp(document.body, { pointerId: 8 });
    expect(writeText).toHaveBeenCalledTimes(1);

    terminalMock.selection = 'stale selection';
    fireEvent.pointerUp(document.body, { pointerId: 9 });
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('copies after release when the drag started on the xterm helper textarea', async () => {
    const { container } = render(
      <XtermSession
        active
        onError={vi.fn()}
        onStatus={vi.fn()}
        session={{
          id: 'ssh-robot-asset:3b84b046-9e3f-5b03-8f12-e5fe70be452a-1788182653528',
          title: 'FS150',
          hostId: 'robot-asset',
          status: 'online',
          refresh: 0,
        }}
        setting={{
          id: 'default',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          backgroundColor: '#000000',
          foregroundColor: '#ffffff',
          cursorStyle: 'block',
          cursorBlink: true,
          scrollback: 1000,
          scrollSensitivity: 1,
          defaultHostId: '',
        }}
      />,
    );
    const terminal = container.querySelector(
      '[data-xgc-role="terminal-xterm"][data-xgc-id="ssh-robot-asset:3b84b046-9e3f-5b03-8f12-e5fe70be452a-1788182653528"]',
    );
    terminalMock.selection = 'startMavRoute.service';
    fireEvent.pointerDown(terminal!.querySelector('.xterm-helper-textarea')!, { button: 0,pointerId: 11 });
    fireEvent.pointerUp(document.body, { pointerId: 11 });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('startMavRoute.service'));
    await waitFor(() => expect(terminalMock.clearSelection).toHaveBeenCalledTimes(1));
    expect(terminalMock.selection).toBe('');
  });

  it('copies a selection that xterm finalizes after pointer release', async () => {
    const { container } = render(
      <XtermSession
        active
        onError={vi.fn()}
        onStatus={vi.fn()}
        session={{
          id: 'ssh-selection-change',
          title: 'Direct shell',
          hostId: 'default-direct-shell',
          status: 'online',
          refresh: 0,
        }}
        setting={{
          id: 'default',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          backgroundColor: '#000000',
          foregroundColor: '#ffffff',
          cursorStyle: 'block',
          cursorBlink: true,
          scrollback: 1000,
          scrollSensitivity: 1,
          defaultHostId: '',
        }}
      />,
    );
    const terminal = container.querySelector('[data-xgc-role="terminal-xterm"]')!;
    fireEvent.pointerDown(terminal.querySelector('.xterm-screen')!, { button: 0,pointerId: 12 });
    fireEvent.pointerUp(document.body, { pointerId: 12 });
    expect(writeText).not.toHaveBeenCalled();
    terminalMock.selection = 'double-click word';
    terminalMock.selectionChange?.();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('double-click word'));
    await waitFor(() => expect(terminalMock.clearSelection).toHaveBeenCalledTimes(1));
  });

  it('reports a clipboard failure and keeps the terminal selection available', async () => {
    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const onError = vi.fn();
    const { container } = render(
      <XtermSession
        active
        onError={onError}
        onStatus={vi.fn()}
        session={{
          id: 'ssh-copy-failure',
          title: 'Direct shell',
          hostId: 'default-direct-shell',
          status: 'online',
          refresh: 0,
        }}
        setting={{
          id: 'default',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          backgroundColor: '#000000',
          foregroundColor: '#ffffff',
          cursorStyle: 'block',
          cursorBlink: true,
          scrollback: 1000,
          scrollSensitivity: 1,
          defaultHostId: '',
        }}
      />,
    );
    terminalMock.selection = 'still selected';
    const terminal = container.querySelector('[data-xgc-role="terminal-xterm"]')!;
    fireEvent.pointerDown(terminal.querySelector('.xterm-screen')!, { button: 0,pointerId: 10 });
    fireEvent.pointerUp(document.body, { pointerId: 10 });

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Clipboard copy failed; the terminal selection was kept'));
    expect(terminalMock.clearSelection).not.toHaveBeenCalled();
    expect(terminalMock.selection).toBe('still selected');
  });

  it('exposes focus so insert can return the keyboard to the PTY', async () => {
    const handle = createRef<TerminalHandle>();
    render(
      <XtermSession
        ref={handle}
        active
        onError={vi.fn()}
        onStatus={vi.fn()}
        session={{
          id: 'ssh-focus',
          title: 'Direct shell',
          hostId: 'default-direct-shell',
          status: 'online',
          refresh: 0,
        }}
        setting={{
          id: 'default',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          backgroundColor: '#000000',
          foregroundColor: '#ffffff',
          cursorStyle: 'block',
          cursorBlink: true,
          scrollback: 1000,
          scrollSensitivity: 1,
          defaultHostId: '',
        }}
      />,
    );
    await waitFor(() => expect(handle.current).not.toBeNull());
    handle.current?.focus();
    expect(terminalMock.focus).toHaveBeenCalledTimes(1);
  });
});
