import { describe,expect,it } from 'vitest';
import {
  createEmptyTerminalHost,
  normalizeHostGroup,
  projectTerminalHosts,
  terminalHostGroupValidationError,
  terminalHostIDValidationError,
  upsertTerminalRecord,
} from './terminalCatalogModel';
import type { TerminalHost } from './terminalModel';

describe('terminal catalog model', () => {
  it('projects host folders from the selected group and searchable connection fields', () => {
    const hosts: TerminalHost[] = [
      hostFixture({ id: 'edge',name: 'Edge controller',group: 'Operations',address: '10.0.0.4' }),
      hostFixture({ id: 'lab',name: 'Lab machine',group: 'Development',address: '192.168.1.20' }),
    ];

    expect(projectTerminalHosts(hosts,'10.0','Operations')).toEqual({
      groups: ['all','Development','Operations'],
      folders: [{ id: 'Operations',title: 'Operations',items: [hosts[0]] }],
    });
  });

  it('replaces or appends host records by identity', () => {
    const hosts: TerminalHost[] = [
      hostFixture({ id: 'edge',name: 'Edge' }),
      hostFixture({ id: 'lab',name: 'Lab' }),
    ];
    const replacement = { ...hosts[1],name: 'Lab machine' };
    expect(upsertTerminalRecord(hosts,replacement)).toEqual([hosts[0],replacement]);
    expect(upsertTerminalRecord(hosts,hostFixture({ id: 'spare',name: 'Spare' }))).toHaveLength(3);
  });

  it('creates independent drafts with canonical defaults', () => {
    const firstHost = createEmptyTerminalHost();
    const secondHost = createEmptyTerminalHost();

    expect(firstHost).not.toBe(secondHost);
    expect(firstHost).toMatchObject({ group: 'Hosts',port: 22,user: 'root',authMode: 'password' });
  });

  it('does not translate empty or retired groups into a compatible Hosts group', () => {
    expect(normalizeHostGroup(' Hosts ')).toBe('Hosts');
    expect(normalizeHostGroup('')).toBe('');
    expect(normalizeHostGroup('Default')).toBe('Default');
  });

  it('shares stable ASCII ID and visible Unicode group admission with Core',() => {
    for (const id of ['host-a','Field.Robot:1','host_01']) expect(terminalHostIDValidationError(id)).toBe('');
    for (const id of ['主机-a','host a','-host','default-direct-shell','default-local-loopback','robot-asset:px4-1']) {
      expect(terminalHostIDValidationError(id)).not.toBe('');
    }
    for (const group of ['Hosts','Field robots','现场机器人','研发-A']) {
      expect(terminalHostGroupValidationError(group)).toBe('');
    }
    for (const group of ['', 'Default',' Hosts ','Field\u200brobots','Field\u2028robots','\u00a0','\u0301']) {
      expect(terminalHostGroupValidationError(group)).not.toBe('');
    }
  });
});

function hostFixture(overrides: Partial<TerminalHost>): TerminalHost {
  return {
    ...createEmptyTerminalHost(),
    id: 'host',
    name: 'Host',
    address: '127.0.0.1',
    ...overrides,
  };
}
