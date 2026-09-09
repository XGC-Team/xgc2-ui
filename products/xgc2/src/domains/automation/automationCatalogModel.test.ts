import { describe,expect,it } from 'vitest';
import { parseAutomationNodeCatalog,parseAutomationNodeCatalogEntry } from './automationCatalogModel';

describe('Automation node catalog contract', () => {
  it('requires the current catalog endpoint to return an array', () => {
    expect(() => parseAutomationNodeCatalog(null, '/catalog')).toThrow('Expected an array response from /catalog');
  });

  it('preserves composable descriptor traits and nullable output ports', () => {
    const source = catalogEntry({ traits: ['call','child-run-producer','effect','wait'],outputPorts: null });

    expect(parseAutomationNodeCatalog([source], '/catalog')).toEqual([source]);
  });

  it.each([
    ['missing', undefined, 'traits must be a non-empty array'],
    ['empty', [], 'traits must be a non-empty array'],
    ['unknown', ['effect','daemon'], 'traits contains invalid value "daemon"'],
    ['duplicate', ['effect','effect'], 'traits contains duplicate value "effect"'],
    ['unsorted', ['wait','effect'], 'traits must be sorted lexicographically'],
  ])('rejects %s traits', (_case, traits, message) => {
    expect(() => parseAutomationNodeCatalogEntry(catalogEntry({ traits }), 'catalog[0]')).toThrow(message);
  });

  it('rejects fields outside the public catalog contract', () => {
    expect(() => parseAutomationNodeCatalogEntry({ ...catalogEntry(),handler: 'private' }, 'catalog[0]'))
      .toThrow('contains unknown property "handler"');
    expect(() => parseAutomationNodeCatalogEntry({ ...catalogEntry(),canWatch: true }, 'catalog[0]'))
      .toThrow('contains unknown property "canWatch"');
  });
});

function catalogEntry(overrides: Record<string,unknown> = {}) {
  return {
    kind: 'process.run-definition',
    typeVersion: 1,
    label: 'Run process',
    category: 'process',
    traits: ['effect','resource','wait'],
    parameterSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    outputPorts: [{ id: 'ready',label: 'Ready' }],
    canCompensate: true,
    ...overrides,
  };
}
