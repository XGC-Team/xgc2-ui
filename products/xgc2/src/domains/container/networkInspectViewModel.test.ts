import { describe,expect,it } from 'vitest';
import { summarizeNetworkInspect } from './networkInspectViewModel';

describe('networkInspectViewModel', () => {
  it('summarizes inspect JSON with endpoints', () => {
    const summary = summarizeNetworkInspect(JSON.stringify([{
      Name: 'mission-net',
      Id: '0123456789abcdef',
      Driver: 'bridge',
      Scope: 'local',
      Created: '2026-01-02T03:04:05Z',
      EnableIPv4: true,
      EnableIPv6: false,
      Options: { parent: 'eth0' },
      IPAM: {
        Driver: 'default',
        Config: [{ Subnet: '172.28.0.0/16', Gateway: '172.28.0.1', IPRange: '172.28.5.0/24' }],
      },
      Labels: { env: 'lab' },
      Containers: {
        abcdef: {
          Name: 'api',
          IPv4Address: '172.28.0.2/16',
          IPv6Address: '',
          MacAddress: '02:42:ac:1c:00:02',
          EndpointID: 'endpoint-1234567890',
        },
      },
    }]));

    expect(summary.structured).toBe(true);
    expect(summary.facts.some((fact) => fact.label === 'Name' && fact.value === 'mission-net')).toBe(true);
    expect(summary.facts.some((fact) => fact.label === 'Parent NIC' && fact.value === 'eth0')).toBe(true);
    expect(summary.facts.some((fact) => fact.label === 'IPAM' && fact.value.includes('172.28.0.0/16'))).toBe(true);
    expect(summary.endpoints).toEqual([
      {
        id: 'abcdef',
        name: 'api',
        ipv4: '172.28.0.2/16',
        ipv6: '',
        mac: '02:42:ac:1c:00:02',
        endpointId: 'endpoint-123',
      },
    ]);
  });

  it('returns unstructured for invalid payloads', () => {
    expect(summarizeNetworkInspect('not-json').structured).toBe(false);
  });
});
