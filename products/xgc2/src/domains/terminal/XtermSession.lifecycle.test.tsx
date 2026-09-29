// @vitest-environment jsdom
import { createRef,useState } from 'react';
import { act,cleanup,render,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { TerminalSetting } from './terminalModel';
import type { TerminalHandle,TerminalSession } from './terminalSessionModel';
import { XtermSession } from './XtermSession';

const transport = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../../features/terminal/terminalTransport',() => ({ connectTerminalTransport: transport.connect }));
vi.mock('./terminalSessionActions',() => ({ getTerminalWebSocketTicket: vi.fn() }));
vi.mock('@xterm/addon-fit',() => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm',() => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = {};
    open() {}
    loadAddon() {}
    onData() {}
    onSelectionChange() { return { dispose() {} }; }
    getSelection() { return ''; }
    write() {}
    focus() {}
    clear() {}
    dispose() {}
  },
}));
const setting: TerminalSetting = {
  id: 'default',fontFamily: 'monospace',fontSize: 14,lineHeight: 1.2,
  letterSpacing: 0,backgroundColor: '#000000',foregroundColor: '#ffffff',
  cursorStyle: 'block',cursorBlink: true,scrollback: 1000,scrollSensitivity: 1,defaultHostId: '',
};
const session: TerminalSession = {
  id: 'session-A',title: 'A',hostId: 'default-direct-shell',status: 'connecting',refresh: 0,
};
function connection() {
  return { sendCommand: vi.fn(),sendResize: vi.fn(),sendClose: vi.fn(),close: vi.fn() };
}

beforeEach(() => {
  transport.connect.mockReset().mockImplementation(async () => connection());
  vi.stubGlobal('ResizeObserver',class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame',vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('terminal session identity and restore lifecycle',() => {
  it('does not automatically turn a failed resume into a new shell',async () => {
    transport.connect.mockRejectedValueOnce(new Error('session is no longer active; reconnect explicitly'));
    const onError = vi.fn();
    function Feedback() {
      const [current,setCurrent] = useState({ ...session,resumeOnly: true });
      return <XtermSession active session={current} setting={setting} onError={onError}
        onStatus={(patch) => setCurrent((old) => ({ ...old,...patch }))} />;
    }
    render(<Feedback />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(transport.connect.mock.calls[0][0].resumeOnly).toBe(true);
  });

  it('keeps a disconnect closed until explicit reconnect, even with status feedback',async () => {
    const ref = createRef<TerminalHandle>();
    function Feedback() {
      const [current,setCurrent] = useState(session);
      return <XtermSession ref={ref} active session={current} setting={setting} onError={vi.fn()}
        onStatus={(patch) => setCurrent((old) => ({ ...old,...patch }))} />;
    }
    render(<Feedback />);
    await act(async () => {});
    await act(async () => { transport.connect.mock.calls[0][0].onClose(); });
    expect(transport.connect).toHaveBeenCalledTimes(1);
    await act(async () => { ref.current!.reconnect(); });
    expect(transport.connect).toHaveBeenCalledTimes(2);
    expect(transport.connect.mock.calls[1][0].resumeOnly).toBe(false);
  });

  it('pins Core, Agent, host and password across rerenders and explicit reconnect',async () => {
    const ref = createRef<TerminalHandle>();
    const props = { active: true,session: { ...session,initialDirectory: '/workspace/A' },setting,onError: vi.fn(),onStatus: vi.fn() };
    const view = render(<XtermSession {...props} ref={ref} targetCoreId="core-A" managedHostId="agent-A" connectPassword="transient-A" />);
    await act(async () => {});
    view.rerender(<XtermSession {...props} ref={ref} active={false}
      session={{ ...session,hostId: 'host-B',resumeOnly: true,initialDirectory: '/workspace/B' }} targetCoreId="core-B" managedHostId="agent-B" connectPassword="transient-B" />);
    expect(transport.connect).toHaveBeenCalledTimes(1);
    await act(async () => { ref.current!.reconnect(); });
    expect(transport.connect.mock.calls[1][0]).toMatchObject({
      hostId: 'default-direct-shell',sessionId: 'session-A',targetCoreId: 'core-A',
      managedHostId: 'agent-A',connectPassword: 'transient-A',resumeOnly: false,initialDirectory: '/workspace/A',
    });
  });

  it('only a different session ID permits a new target binding',async () => {
    const props = { active: true,setting,onError: vi.fn(),onStatus: vi.fn() };
    const view = render(<XtermSession {...props} session={session} managedHostId="agent-A" />);
    await act(async () => {});
    view.rerender(<XtermSession {...props} session={{ ...session,id: 'session-B' }} managedHostId="agent-B" />);
    await act(async () => {});
    expect(transport.connect).toHaveBeenCalledTimes(2);
    expect(transport.connect.mock.calls[1][0]).toMatchObject({ sessionId: 'session-B',managedHostId: 'agent-B' });
  });

  it('detaches on unmount without sending the explicit shell-close command',async () => {
    const conn = connection();
    transport.connect.mockResolvedValueOnce(conn);
    const view = render(<XtermSession active session={session} setting={setting} onError={vi.fn()} onStatus={vi.fn()} />);
    await act(async () => {});
    view.unmount();
    expect(conn.close).toHaveBeenCalledTimes(1);
    expect(conn.sendClose).not.toHaveBeenCalled();
  });
});
