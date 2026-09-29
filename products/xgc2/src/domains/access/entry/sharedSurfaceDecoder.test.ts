import { describe, expect, it } from 'vitest';
import { decodeSharedSurfaceProjection, sharedSurfaceIdentity, sharedSurfacePathParameters } from './sharedSurfaceDecoder';

const projection = {
  contractVersion: 1, entryId: 'entry-1', name: 'Shared preview', expiresAt: '2027-09-20T12:00:00Z',
  moduleId: 'preview', viewContractVersion: 1, actions: ['surface.read', 'preview.read'],
  endpoints: [
    { id: 'surface.events', method: 'GET', path: '/api/access/entry/events', protocol: 'sse', action: 'surface.read' },
    { id: 'preview.read', method: 'GET', path: '/api/access/entry/previews/:sessionId/image.jpg', protocol: 'http', action: 'preview.read' },
  ],
  scope: { experimentId: 'experiment-1', resourceIds: ['resource-1'] },
};

describe('shared surface envelope', () => {
  it('keeps owner fields opaque while freezing the complete projected capability', () => {
    const decoded = decodeSharedSurfaceProjection(projection);
    expect(decoded).toEqual(projection);
    expect(decoded).not.toBe(projection);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.endpoints[0])).toBe(true);
    expect(Object.isFrozen(decoded.scope)).toBe(true);
    expect(sharedSurfacePathParameters(decoded.endpoints[1]!.path)).toEqual(['sessionId']);
  });

  it.each([
    { contractVersion: undefined }, { contractVersion: 2 }, { entryId: '' }, { name: ' ' },
    { moduleId: '' }, { viewContractVersion: 0 }, { viewContractVersion: 1.5 }, { expiresAt: 'tomorrow' },
    { expiresAt: '2027-02-30T12:00:00Z' }, { expiresAt: '2027-09-20T24:00:00Z' },
    { actions: ['preview.read'] }, { actions: ['surface.read', 'surface.read'] }, { actions: [] },
    { endpoints: [] }, { endpoints: [projection.endpoints[0], projection.endpoints[0]] },
  ])('rejects malformed or unsupported envelope %j', (change) => {
    expect(() => decodeSharedSurfaceProjection({ ...projection, ...change })).toThrow();
  });

  it.each([
    { method: 'PATCH' }, { method: ['GET'] }, { protocol: 'ws' }, { action: 'not.granted' },
    { id: '' }, { path: 'https://another-station/api/access/entry/events' },
    { path: '/api/cores/local/proxy/api/access/entry/events' }, { path: '/api/access/entry/events?upstream=x' },
  ])('rejects invalid endpoint contract %j', (change) => {
    expect(() => decodeSharedSurfaceProjection({
      ...projection, endpoints: [projection.endpoints[0], { ...projection.endpoints[1], ...change }],
    })).toThrow();
  });

  it.each([
    '//example.com/api/access/entry/events', '/api/access/entry/../admin',
    '/api/access/entry/%2e%2e/admin', '/api/access/entry/events#other', '/api/access/entry/a\\b',
    '/api/access/entry//a', '/api/access/entry/:id/:id', '/api/access/entry/:id.jpg',
  ])('rejects URL/path ambiguity %s', (path) => {
    expect(() => sharedSurfacePathParameters(path)).toThrow();
  });

  it('requires a usable projected surface.events stream', () => {
    for (const change of [{ protocol: 'http' }, { method: 'POST' }, { path: '/api/access/entry/:sessionId' }]) {
      expect(() => decodeSharedSurfaceProjection({
        ...projection, endpoints: [{ ...projection.endpoints[0], ...change }, projection.endpoints[1]],
      })).toThrow();
    }
  });

  it('compares opaque scope exactly, without depending on JSON object key order', () => {
    const original = decodeSharedSurfaceProjection(projection);
    const reordered = decodeSharedSurfaceProjection({ ...projection, scope: { resourceIds: ['resource-1'], experimentId: 'experiment-1' } });
    expect(sharedSurfaceIdentity(original)).toBe(sharedSurfaceIdentity(reordered));
    expect(sharedSurfaceIdentity(decodeSharedSurfaceProjection({ ...projection, scope: { experimentId: 'other' } })))
      .not.toBe(sharedSurfaceIdentity(original));
  });
});
