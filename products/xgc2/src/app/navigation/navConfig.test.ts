import { describe,expect,it } from 'vitest';
import { productWebComposition } from '../../../profiles/core-dev';
import { navSectionsForPage,validPagesFor } from './navConfig';

const { operations,sections } = productWebComposition.navigation;
const systemSections = sections.system ?? [];
const auditSections = sections.audit ?? [];

describe('product navigation composition contract', () => {
  it('validPagesFor(default composition) excludes appStore/containers and keeps existing pages', () => {
    const validPages = validPagesFor(productWebComposition);

    expect(validPages.has('appStore')).toBe(false);
    expect(validPages.has('containers')).toBe(false);

    for (const page of [
      'home',
      'experiment',
      'robotAssets',
      'automations',
      'operations',
      'system',
      'terminal',
      'audit',
      'settings',
    ] as const) {
      expect(validPages.has(page)).toBe(true);
    }
  });

  it('operations excludes appStore and containers and keeps Settings last', () => {
    const operationIds = operations.map((item) => item.id);
    expect(operationIds).not.toContain('appStore');
    expect(operationIds).not.toContain('containers');
    expect(operationIds).toEqual(['system', 'terminal', 'operations', 'audit', 'settings']);
    expect(sections.settings ?? []).toEqual([]);
  });

  it('keeps system sections without host sshd/firewall management', () => {
    expect(systemSections.map((section) => section.id)).toEqual([
      'overview',
      'files',
      'processes',
      'host',
      'maintenance',
    ]);
    expect(systemSections.map((section) => section.label['en-US'])).toEqual([
      'Overview',
      'Files',
      'Runtime',
      'Host',
      'Maintenance',
    ]);
    expect(systemSections.map((section) => section.id)).not.toContain('ssh');
  });

  it('keeps User scripts off primary nav and only on the Terminal usernode tab', () => {
    expect(productWebComposition.navigation.primary.map((item) => item.id)).not.toContain('usernodeAssets');
    expect(validPagesFor(productWebComposition).has('usernodeAssets' as never)).toBe(false);
  });

  it('replaces the Terminal Quick commands section with User scripts', () => {
    const terminalSections = sections.terminal ?? [];
    expect(terminalSections.map((section) => section.id)).toEqual(['terminal', 'hosts', 'usernode']);
    expect(terminalSections.map((section) => section.label['en-US'])).toEqual([
      'Terminal',
      'Hosts',
      'User scripts',
    ]);
    expect(terminalSections.map((section) => section.id)).not.toContain('commands');
    expect(terminalSections.map((section) => section.label['en-US'])).not.toContain('Quick commands');
  });

  it('navSectionsForPage reads sections from composition', () => {
    expect(navSectionsForPage(productWebComposition, 'audit')).toEqual(auditSections);
    expect(navSectionsForPage(productWebComposition, 'terminal')).toEqual(sections.terminal);
    expect(navSectionsForPage(productWebComposition, 'system')).toEqual(systemSections);

    const hostOverride = systemSections.filter((section) => section.id !== 'maintenance');
    expect(navSectionsForPage(productWebComposition, 'system', hostOverride)).toBe(hostOverride);
    const terminalWithoutHosts = (sections.terminal ?? []).filter((section) => section.id !== 'hosts');
    expect(navSectionsForPage(productWebComposition, 'terminal', undefined, terminalWithoutHosts))
      .toBe(terminalWithoutHosts);
    expect(navSectionsForPage(productWebComposition, 'home')).toEqual([]);
  });
});
