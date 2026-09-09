// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { connectTerminalTransport,parseTerminalMessage } from './terminalTransport';
import { isWebSocketOpen,openWebSocket } from '../../api/ws';

vi.mock('../../api/ws', () => ({
  isWebSocketOpen: vi.fn(() => true),
  openWebSocket: vi.fn(),
}));

describe('parseTerminalMessage', () => {
  it('ignores malformed websocket messages', () => {
    expect(parseTerminalMessage(null)).toBeNull();
    expect(parseTerminalMessage('{bad')).toBeNull();
    expect(parseTerminalMessage(JSON.stringify([]))).toBeNull();
    expect(parseTerminalMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
    expect(parseTerminalMessage(JSON.stringify({ type: 'cmd', data: '' }))).toBeNull();
    expect(parseTerminalMessage(JSON.stringify({ type: 'cmd', data: 1 }))).toBeNull();
    expect(parseTerminalMessage(JSON.stringify({ type: 'cmd', data: 'not base64' }))).toBeNull();
    expect(parseTerminalMessage(JSON.stringify({ type: 'unsupported', value: 123 }))).toBeNull();
  });

  it('parses command messages', () => {
    expect(parseTerminalMessage(JSON.stringify({ type: 'cmd', data: 'bHMK' }))).toEqual({
      type: 'cmd',
      data: 'ls\n',
    });
  });
});

describe('connectTerminalTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects, sends framed messages, and closes cleanly', async () => {
    const socket = fakeSocket();
    vi.mocked(openWebSocket).mockReturnValue(socket);
    const callbacks = {
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    };
    const controller = new AbortController();

    const connection = await connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      targetCoreId: 'core-a',
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      signal: controller.signal,
      ...callbacks,
    });

    expect(openWebSocket).toHaveBeenCalledWith('/terminal/ws', {
      targetCoreId: 'core-a',
      query: { hostId: 'host-a', sessionId: 'session-a', cols: 80, rows: 24, ticket: 'ticket-a' },
    });

    socket.onopen?.(new Event('open'));
    expect(callbacks.onOpen).toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(socket.send).not.toHaveBeenCalled();

    socket.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'cmd', data: 'b2s=' }) }));
    socket.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'unsupported' }) }));
    expect(callbacks.onData).toHaveBeenCalledWith('ok');

    connection.sendCommand('命令');
    connection.sendClose();
    connection.sendResize(100, 30);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"cmd"'));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'close' }));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));

    socket.onerror?.(new Event('error'));
    socket.onclose?.(new CloseEvent('close'));
    expect(callbacks.onError).toHaveBeenCalled();
    expect(callbacks.onClose).toHaveBeenCalled();
    connection.close();
    controller.abort();
    expect(socket.close).toHaveBeenCalled();
  });

  it('does not send after the client closes the connection', async () => {
    const socket = fakeSocket();
    vi.mocked(openWebSocket).mockReturnValue(socket);

    const connection = await connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    socket.onopen?.(new Event('open'));
    connection.close();
    vi.advanceTimersByTime(10000);

    expect(socket.close).toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('marks restored browser sessions as resume-only so the backend will not create a new SSH login', async () => {
    const socket = fakeSocket();
    vi.mocked(openWebSocket).mockReturnValue(socket);

    await connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      resumeOnly: true,
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    expect(openWebSocket).toHaveBeenCalledWith('/terminal/ws', {
      query: { hostId: 'host-a', sessionId: 'session-a', cols: 80, rows: 24, ticket: 'ticket-a', resume: '1' },
    });
  });

  it('handles socket close before open', async () => {
    const socket = fakeSocket();
    vi.mocked(openWebSocket).mockReturnValue(socket);
    const onClose = vi.fn();

    await connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose,
    });

    socket.onclose?.(new CloseEvent('close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes the socket when an active signal aborts', async () => {
    const socket = fakeSocket();
    vi.mocked(openWebSocket).mockReturnValue(socket);
    const controller = new AbortController();

    await connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      signal: controller.signal,
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });

    controller.abort();
    expect(socket.close).toHaveBeenCalled();
  });

  it('rejects aborted ticket requests and skips sends on closed sockets', async () => {
    const socket = fakeSocket();
    vi.mocked(openWebSocket).mockReturnValue(socket);
    vi.mocked(isWebSocketOpen).mockReturnValue(false);
    const aborted = new AbortController();
    aborted.abort();

    await expect(connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
      signal: aborted.signal,
    })).rejects.toThrow('terminal connection aborted');

    const connection = await connectTerminalTransport({
      hostId: 'host-a',
      sessionId: 'session-a',
      cols: 80,
      rows: 24,
      getTicket: vi.fn(async () => ({ ticket: 'ticket-a', expiresAt: 123 })),
      onOpen: vi.fn(),
      onData: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    connection.sendCommand('skip');
    connection.sendClose();
    connection.sendResize(10, 5);
    socket.onopen?.(new Event('open'));
    vi.advanceTimersByTime(10000);
    expect(socket.send).not.toHaveBeenCalled();
  });
});

function fakeSocket() {
  const socket = {
    send: vi.fn(),
    close: vi.fn(),
    onopen: null as ((event: Event) => void) | null,
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onclose: null as ((event: CloseEvent) => void) | null,
  };
  return socket as typeof socket & ReturnType<typeof openWebSocket>;
}
