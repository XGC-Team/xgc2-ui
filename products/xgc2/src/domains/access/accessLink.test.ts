import { describe,expect,it } from 'vitest';
import { accessEntryLinkCandidates, buildAccessEntryLink } from './accessLink';

describe('accessEntryLinkCandidates', () => {
  it('keeps backend order, drops wildcards and duplicates, and classifies hosts', () => {
    const candidates = accessEntryLinkCandidates({
      advertisedHosts: [
        '192.168.51.251',
        '0.0.0.0',
        '::',
        ' 192.168.51.251 ',
        '10.0.0.8',
        'fe80::1',
        '127.0.0.1',
      ],
    });
    expect(candidates.map((candidate) => candidate.host)).toEqual([
      '192.168.51.251',
      '10.0.0.8',
      'fe80::1',
      '127.0.0.1',
    ]);
    expect(candidates[0]).toMatchObject({ authority: '192.168.51.251', isPrivateIPv4: true, isLoopback: false });
    expect(candidates[2]).toMatchObject({ authority: '[fe80::1]', isPrivateIPv4: false, isLoopback: false });
    expect(candidates[3]).toMatchObject({ isLoopback: true });
  });

  it('reports an empty candidate list when the backend has no LAN address', () => {
    expect(accessEntryLinkCandidates({ advertisedHosts: [] })).toEqual([]);
    expect(accessEntryLinkCandidates({ advertisedHosts: ['0.0.0.0', '::'] })).toEqual([]);
  });
});

describe('buildAccessEntryLink', () => {
  it('builds a fragment-carried link from an advertised host and the bound port', () => {
    expect(buildAccessEntryLink({ authority: '192.168.51.251' }, 49152, 'tok en/1'))
      .toBe('http://192.168.51.251:49152/access-entry#token=tok%20en%2F1');
    expect(buildAccessEntryLink({ authority: '[fe80::1]' }, 8080, 'abc'))
      .toBe('http://[fe80::1]:8080/access-entry#token=abc');
  });

  it('refuses wildcard authorities, invalid ports, and empty tokens', () => {
    expect(() => buildAccessEntryLink({ authority: '0.0.0.0' }, 49152, 'abc')).toThrow(/host/);
    expect(() => buildAccessEntryLink({ authority: '' }, 49152, 'abc')).toThrow(/host/);
    expect(() => buildAccessEntryLink({ authority: '192.168.51.251' }, 0, 'abc')).toThrow(/port/);
    expect(() => buildAccessEntryLink({ authority: '192.168.51.251' }, 49152, '  ')).toThrow(/token/);
  });
});
