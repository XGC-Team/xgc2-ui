// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from 'vitest';
import { videoRandomId } from './videoRandomId';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => { vi.unstubAllGlobals(); });

describe('videoRandomId',() => {
  it('prefers crypto.randomUUID when the secure-context API exists',() => {
    vi.stubGlobal('crypto',{ randomUUID: () => 'uuid-from-native' });
    expect(videoRandomId()).toBe('uuid-from-native');
  });
  it('mints RFC 4122 v4 UUIDs from getRandomValues on plain HTTP LAN',() => {
    let counter = 0;
    vi.stubGlobal('crypto',{
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) { bytes[index] = (counter += 1) % 256; }
        return bytes;
      },
    });
    const first = videoRandomId();
    expect(first).toMatch(UUID);
    expect(videoRandomId()).not.toBe(first);
  });
  it('fails closed when neither random source exists',() => {
    vi.stubGlobal('crypto',undefined);
    expect(() => videoRandomId()).toThrow(/random ID/);
  });
});
