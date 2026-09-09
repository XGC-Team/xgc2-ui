import { afterEach,describe,expect,it,vi } from 'vitest';
import { createMutationIdentity,createUserIntentId,deriveIntentKey } from './intent';

describe('intent utilities', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('sanitizes idempotency key parts', () => {
    expect(deriveIntentKey('risk install', 'app/id 1', ' ! ')).toBe('risk-install:app-id-1:unknown');
  });

  it('creates bounded ASCII mutation headers without embedding user-authored text', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => 'uuid-1' },
    });

    const identity = createMutationIdentity('asset.create');

    expect(identity).toEqual({
      requestId: 'asset.create:mutation:uuid-1',
      idempotencyKey: 'asset.create:mutation:uuid-1',
    });
    expect(identity.requestId).toMatch(/^[\x20-\x7e]+$/);
    expect(identity.requestId.length).toBeLessThanOrEqual(160);
    expect(() => new Headers({
      'X-Request-ID': identity.requestId,
      'Idempotency-Key': identity.idempotencyKey,
    })).not.toThrow();
  });

  it('falls back to time and random suffixes when crypto UUID is unavailable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });

    expect(createUserIntentId('orchestration run', 'main panel')).toBe('orchestration-run:main-panel:mpdap6o0-i');
  });
});

it('bounds long interaction identities without truncating their unique suffix',()=>{
  const one=createUserIntentId('ground-station.interaction.dismissed','a'.repeat(64));
  const two=createUserIntentId('ground-station.interaction.dismissed','a'.repeat(64));
  expect(one.length).toBeLessThanOrEqual(128);
  expect(one).not.toBe(two);
  expect(one).toMatch(/:[0-9a-f-]{36}$/);
});
