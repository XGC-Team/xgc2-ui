// @vitest-environment jsdom

import { waitFor } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { consumeSSEBody,openExecutionEventStream,openExecutionLogStream,parseSSEFrame,type ReplayStream } from './executionStreamService';

describe('execution replay SSE', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses SSE ids, event names, and multiline JSON data', () => {
    expect(parseSSEFrame('id: 17\nevent: execution-event\ndata: {"offset":17,\ndata: "message":"ok"}')).toEqual({
      id: '17',
      event: 'execution-event',
      data: '{"offset":17,\n"message":"ok"}',
    });
  });

  it('consumes frames split across byte chunks', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('id: 1\ndata: {"offset":1'));
        controller.enqueue(encoder.encode(',"entityType":"job"}\n\n'));
        controller.close();
      },
    });
    const values: string[] = [];

    await consumeSSEBody(body, (message) => values.push(message.data));

    expect(values).toEqual(['{"offset":1,"entityType":"job"}']);
  });

  it('replays with both afterOffset and Last-Event-ID', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/events/cursor')) {
        return Response.json({ streamId: 'stream-1',latestOffset: 42 });
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('id: 42\ndata: {"offset":42,"entityType":"job","entityId":"job-1","seq":1,"type":"job.running","level":"info","payload":{"message":"running"},"createdAt":"now"}\n\n'));
        },
      }), { status: 200,headers: {
        'X-XGC-Execution-Stream-ID': 'stream-1',
        'X-XGC-Execution-Latest-Offset': '42',
      } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const received: number[] = [];
    const states: string[] = [];
    let stream: ReplayStream = { close: () => undefined };
    stream = openExecutionEventStream({
      targetId: 'agent/a',
      afterOffset: 41,
      streamId: 'stream-1',
      reconnectDelayMs: 60_000,
      onState: (state) => states.push(state),
      onEvent: (event) => {
        received.push(event.offset);
        stream.close();
      },
    });

    await waitFor(() => expect(received).toEqual([42]));
    const [url,init] = fetchMock.mock.calls[1];
    expect(String(url)).toContain('/api/execution-targets/agent%2Fa/events?afterOffset=41');
    expect(new Headers(init?.headers).get('Last-Event-ID')).toBe('41');
    expect(new Headers(init?.headers).get('X-XGC-Execution-Stream-ID')).toBe('stream-1');
    expect(states).toEqual(['replaying','connected']);
  });

  it('joins the live tail instead of replaying all history without a stored stream cursor', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/events/cursor')) {
        return Response.json({ streamId: 'stream-current',latestOffset: 620 });
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('id: 621\ndata: {"offset":621,"entityType":"job","entityId":"job-1","seq":1,"type":"job.running","level":"info","payload":{},"createdAt":"now"}\n\n'));
        },
      }), { status: 200,headers: {
        'X-XGC-Execution-Stream-ID': 'stream-current',
        'X-XGC-Execution-Latest-Offset': '621',
      } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const resets = vi.fn();
    const received: number[] = [];
    let stream: ReplayStream = { close: () => undefined };
    stream = openExecutionEventStream({
      targetId: 'local',afterOffset: 0,streamId: '',reconnectDelayMs: 60_000,
      onCursorReset: resets,
      onEvent: (event) => {
        received.push(event.offset);
        stream.close();
      },
    });

    await waitFor(() => expect(received).toEqual([621]));
    expect(resets).toHaveBeenCalledWith(
      { streamId: 'stream-current',latestOffset: 620 },
      620,
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain('/events?afterOffset=620');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Last-Event-ID')).toBe('620');
  });

  it('resets a cursor from another stream and accepts replayed low offsets', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/events/cursor')) {
        return Response.json({ streamId: 'stream-current',latestOffset: 620 });
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('id: 4\ndata: {"offset":4,"entityType":"orchestration-run","entityId":"run-1","seq":1,"type":"run.active","level":"info","payload":{},"createdAt":"now"}\n\n'));
        },
      }), { status: 200,headers: {
        'X-XGC-Execution-Stream-ID': 'stream-current',
        'X-XGC-Execution-Latest-Offset': '620',
      } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const resets = vi.fn();
    const received: number[] = [];
    let stream: ReplayStream = { close: () => undefined };
    stream = openExecutionEventStream({
      targetId: 'local',afterOffset: 1031,streamId: 'stream-legacy',reconnectDelayMs: 60_000,
      onCursorReset: resets,
      onEvent: (event) => {
        received.push(event.offset);
        stream.close();
      },
    });

    await waitFor(() => expect(received).toEqual([4]));
    expect(resets).toHaveBeenCalledWith(
      { streamId: 'stream-current',latestOffset: 620 },
      0,
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain('/events?afterOffset=0');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has('Last-Event-ID')).toBe(false);
  });

  it('resets and reconnects when the stream changes between cursor preflight and SSE open', async () => {
    const encoder = new TextEncoder();
    let cursorCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/events/cursor')) {
        cursorCalls += 1;
        return Response.json(cursorCalls === 1
          ? { streamId: 'stream-old',latestOffset: 10 }
          : { streamId: 'stream-new',latestOffset: 2 });
      }
      const isFirstSSE = fetchMock.mock.calls.filter(([url]) => !String(url).endsWith('/events/cursor')).length === 1;
      if (isFirstSSE) {
        return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }), {
          status: 200,
          headers: {
            'X-XGC-Execution-Stream-ID': 'stream-new',
            'X-XGC-Execution-Latest-Offset': '2',
          },
        });
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('id: 1\ndata: {"offset":1,"entityType":"job","entityId":"job-1","seq":1,"type":"job.running","level":"info","payload":{},"createdAt":"now"}\n\n'));
        },
      }), { status: 200,headers: {
        'X-XGC-Execution-Stream-ID': 'stream-new',
        'X-XGC-Execution-Latest-Offset': '2',
      } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const resets = vi.fn();
    const received: number[] = [];
    let stream: ReplayStream = { close: () => undefined };
    stream = openExecutionEventStream({
      targetId: 'local',afterOffset: 8,streamId: 'stream-old',reconnectDelayMs: 0,
      onCursorReset: resets,
      onEvent: (event) => {
        received.push(event.offset);
        stream.close();
      },
    });

    await waitFor(() => expect(received).toEqual([1]));
    expect(resets).toHaveBeenCalledWith({ streamId: 'stream-new',latestOffset: 2 }, 0);
    const sseCalls = fetchMock.mock.calls.filter(([url]) => !String(url).endsWith('/events/cursor'));
    expect(String(sseCalls[1][0])).toContain('/events?afterOffset=0');
  });

  it('resumes logs from the server byte cursor for multibyte content', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('id: 7\nevent: log.appended\ndata: {"entityType":"job","entityId":"job-1","stream":"stdout","offset":0,"content":"你🙂","nextOffset":7,"truncated":false,"occurredAt":"now"}\n\n'));
            controller.close();
          },
        }), { status: 200 });
      }
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const received: string[] = [];
    const stream = openExecutionLogStream({
      targetId: 'local', entityType: 'job', entityId: 'job-1', offset: 0,
      stream: 'stdout',
      reconnectDelayMs: 0,
      onLog: (event) => received.push(event.content),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(received).toEqual(['你🙂']);
    const secondHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(secondHeaders.get('Last-Event-ID')).toBe('7');
    stream.close();
  });

  it('accepts an explicit log cursor reset below a stale future offset', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('id: 3\nevent: log.appended\ndata: {"entityType":"job","entityId":"job-1","stream":"stdout","offset":3,"content":"","nextOffset":3,"truncated":true,"occurredAt":"now"}\n\n'));
            controller.close();
          },
        }), { status: 200 });
      }
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const received: Array<{ nextOffset: number; truncated: boolean }> = [];
    const stream = openExecutionLogStream({
      targetId: 'local', entityType: 'job', entityId: 'job-1', offset: 100,
      stream: 'stdout', reconnectDelayMs: 0,
      onLog: (event) => received.push({ nextOffset: event.nextOffset,truncated: event.truncated }),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(received).toEqual([{ nextOffset: 3,truncated: true }]);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Last-Event-ID')).toBe('3');
    stream.close();
  });
});
