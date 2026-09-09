import { describe,expect,it } from 'vitest';
import { configurationCollection,configurationMutationInit } from './configurationTransport';

describe('configuration transport contract', () => {
  it('accepts only canonical array collections', async () => {
    await expect(configurationCollection(Promise.resolve([{ id: 'one' }]), '/resources'))
      .resolves.toEqual([{ id: 'one' }]);
    await expect(configurationCollection(Promise.resolve(null), '/resources'))
      .rejects.toThrow('Expected an array from /resources');
    await expect(configurationCollection(Promise.resolve({ items: [] }), '/resources'))
      .rejects.toThrow('Expected an array from /resources');
  });

  it('owns configuration mutation identity headers and the exact request body', () => {
    const input = { name: 'Mission',requestId: ' request-1 ',idempotencyKey: ' intent-1 ' };
    expect(configurationMutationInit(input)).toEqual({
      headers: { 'X-Request-ID': 'request-1','Idempotency-Key': 'intent-1' },
      body: JSON.stringify(input),
    });
  });
});
