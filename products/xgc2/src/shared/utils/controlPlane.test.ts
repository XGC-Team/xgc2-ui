import { describe,expect,it } from 'vitest';
import { isLocalCore,parseJsonArray,parseJsonRecord,routedCoreIdForPanel } from './controlPlane';

describe('control plane utilities', () => {
  it('parses JSON records and arrays with explicit error messages', () => {
    expect(parseJsonRecord('{"a":1}', 'Options')).toEqual({ value: { a: 1 } });
    expect(parseJsonRecord('[]', 'Options').error).toBe('Options must be a JSON object.');
    expect(parseJsonArray('[{"name":"cmd"}]', 'Bindings').value).toEqual([{ name: 'cmd' }]);
    expect(parseJsonArray('{"name":"cmd"}', 'Bindings').error).toBe('Bindings must be a JSON array.');
  });

  it('routes panels only to explicit remote cores', () => {
    const cores = [
      { id: 'local',profile: 'ground',baseUrl: 'https://ground.example.test' },
      { id: 'remote',profile: 'agent',baseUrl: 'https://agent.example.test' },
    ];

    expect(isLocalCore(cores[0])).toBe(true);
    expect(isLocalCore(cores[1])).toBe(false);
    expect(routedCoreIdForPanel({}, cores, 'fallback')).toBe('fallback');
    expect(routedCoreIdForPanel({ targetCoreId: 'local' }, cores, 'fallback')).toBeUndefined();
    expect(routedCoreIdForPanel({ targetCoreId: 'remote' }, cores, 'fallback')).toBe('remote');
    expect(routedCoreIdForPanel({ targetCoreId: 'missing' }, cores, 'fallback')).toBeUndefined();
  });
});
