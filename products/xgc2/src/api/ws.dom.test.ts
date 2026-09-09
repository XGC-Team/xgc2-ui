// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';

const defaultWebSocket = globalThis.WebSocket;

describe('api websocket transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.WebSocket = defaultWebSocket;
  });

  it('builds websocket URLs from the API URL', async () => {
    vi.stubEnv('VITE_API_BASE', 'http://api.example.test/api/');
    let mod = await import('./ws');
    expect(mod.webSocketUrl('/terminal/ws')).toBe('ws://api.example.test/api/terminal/ws');

    vi.resetModules();
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test/api/');
    mod = await import('./ws');
    expect(mod.webSocketUrl('/terminal/ws', { targetCoreId: 'core 1' })).toBe(
      'wss://api.example.test/api/cores/core%201/proxy/terminal/ws',
    );
  });

  it('preserves query parameters when proxy routing websocket URLs', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test/api/');
    const { webSocketUrl } = await import('./ws');

    expect(webSocketUrl('/terminal/ws?ticket=t1&cols=80', { targetCoreId: 'core-a' })).toBe(
      'wss://api.example.test/api/cores/core-a/proxy/terminal/ws?ticket=t1&cols=80',
    );
  });

  it('appends structured query parameters and skips empty values', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test/api/');
    const { webSocketUrl } = await import('./ws');

    expect(webSocketUrl('/terminal/ws?ticket=old', {
      query: {
        ticket: 'new ticket',
        cols: 80,
        rows: 24,
        active: true,
        skipped: undefined,
        alsoSkipped: null,
      },
    })).toBe(
      'wss://api.example.test/api/terminal/ws?ticket=new+ticket&cols=80&rows=24&active=true',
    );
  });

  it('opens native websocket with generated URL and protocols', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test/api/');
    const websocketMock = vi.fn();
    globalThis.WebSocket = websocketMock as unknown as typeof WebSocket;
    const { openWebSocket } = await import('./ws');

    openWebSocket('/terminal/ws', {
      targetCoreId: 'core 1',
      query: { sessionId: 'ssh/a b' },
      protocols: ['terminal.v1'],
    });

    expect(websocketMock).toHaveBeenCalledWith(
      'wss://api.example.test/api/cores/core%201/proxy/terminal/ws?sessionId=ssh%2Fa+b',
      ['terminal.v1'],
    );
  });

  it('opens websocket without protocols and checks open state', async () => {
    vi.stubEnv('VITE_API_BASE', 'http://api.example.test/api/');
    const websocketMock = vi.fn();
    Object.assign(websocketMock, { OPEN: 1, CLOSED: 3 });
    globalThis.WebSocket = websocketMock as unknown as typeof WebSocket;
    const { isWebSocketOpen, openWebSocket } = await import('./ws');

    openWebSocket('/terminal/ws');

    expect(websocketMock).toHaveBeenCalledWith('ws://api.example.test/api/terminal/ws');
    expect(isWebSocketOpen({ readyState: 1 } as WebSocket)).toBe(true);
    expect(isWebSocketOpen({ readyState: 3 } as WebSocket)).toBe(false);
  });
});
