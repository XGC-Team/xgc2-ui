import { describe,expect,it } from 'vitest';

import { consumeSSEBody,type SSEMessage } from './http';

function bodyFromChunks(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collect(chunks: Uint8Array[]) {
  const messages: SSEMessage[] = [];
  const body = bodyFromChunks(chunks);
  await consumeSSEBody(body, (message) => messages.push(message));
  expect(body.locked).toBe(false);
  return messages;
}

const encoder = new TextEncoder();
const expected: SSEMessage[] = [
  { id: '1',event: 'update',data: '{"text":"你好"}' },
  { id: '2',event: 'update',data: '{"ok":true}' },
];

function fixture(separator: string) {
  return encoder.encode([
    ': keepalive','',
    'id: 1','event: update','data: {"text":"你好"}','',
    'id: 2','event: update','data: {"ok":true}','','',
  ].join(separator));
}

describe('SSE chunk boundaries and cancellation', () => {
  it.each(['\n','\r\n','\r'])('preserves messages at every byte split with %j line endings', async (separator) => {
    const bytes = fixture(separator);
    for (let split = 0; split <= bytes.length; split += 1) {
      expect(await collect([bytes.slice(0, split),bytes.slice(split)])).toEqual(expected);
    }
  });

  it('preserves CRLF and multibyte UTF-8 with one-byte and empty chunks', async () => {
    const chunks = Array.from(fixture('\r\n'), (byte) => [Uint8Array.of(byte),new Uint8Array()]).flat();
    expect(await collect(chunks)).toEqual(expected);
  });

  it('supports mixed line endings and multiline data', async () => {
    const bytes = encoder.encode('id: 3\revent: update\r\ndata: first\ndata: second\r\n\r\n');
    expect(await collect(Array.from(bytes, (byte) => Uint8Array.of(byte)))).toEqual([
      { id: '3',event: 'update',data: 'first\nsecond' },
    ]);
  });

  it('retains the existing final-frame-at-EOF contract', async () => {
    expect(await collect([encoder.encode(': keepalive\n\nevent: final\ndata: done')])).toEqual([
      { id: '',event: 'final',data: 'done' },
    ]);
  });

  it('stops buffered and final-frame delivery when a callback aborts', async () => {
    const controller = new AbortController();
    const messages: SSEMessage[] = [];
    const body = bodyFromChunks([encoder.encode('data: 1\n\ndata: 2\n\ndata: 3')]);
    await consumeSSEBody(body, (message) => {
      messages.push(message);
      controller.abort();
    }, controller.signal);
    expect(messages.map((message) => message.data)).toEqual(['1']);
    expect(body.locked).toBe(false);
  });

  it('does not deliver data returned by an in-flight read after abort', async () => {
    const abort = new AbortController();
    let enqueue: (chunk: Uint8Array) => void = () => { throw new Error('stream not initialized'); };
    let finish: () => void = () => { throw new Error('stream not initialized'); };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        enqueue = (chunk) => controller.enqueue(chunk);
        finish = () => controller.close();
      },
    });
    const messages: SSEMessage[] = [];
    const consuming = consumeSSEBody(body, (message) => messages.push(message), abort.signal);
    abort.abort();
    enqueue(encoder.encode('data: stale\n\n'));
    finish();
    await consuming;
    expect(messages).toEqual([]);
    expect(body.locked).toBe(false);
  });

  it('does not consume an already aborted stream', async () => {
    const controller = new AbortController();
    controller.abort();
    const messages: SSEMessage[] = [];
    const body = bodyFromChunks([encoder.encode('data: stale\n\n')]);
    await consumeSSEBody(body, (message) => messages.push(message), controller.signal);
    expect(messages).toEqual([]);
    expect(body.locked).toBe(false);
  });

  it('releases the reader lock when the consumer throws', async () => {
    const body = bodyFromChunks([encoder.encode('data: 1\n\n')]);
    await expect(consumeSSEBody(body, () => { throw new Error('consumer failed'); })).rejects.toThrow('consumer failed');
    expect(body.locked).toBe(false);
  });
});
