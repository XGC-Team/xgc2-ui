import { describe,expect,it } from 'vitest';
import { automationSelectOptions } from './automationAuthoringProjection';
import type { AutomationDocument } from './automationDefinitionContracts';

describe('automationSelectOptions', () => {
  it('keeps inherited call closures portable and excludes mixed target policies', () => {
    const inheritedParent = automationDocument('parent', { mode: 'inherit',executionTargetId: '' });
    const inheritedChild = automationDocument('portable-child', { mode: 'inherit',executionTargetId: '' });
    const fixedLocal = automationDocument('local-child', { mode: 'fixed',executionTargetId: 'local' });
    const fixedRemote = automationDocument('remote-child', { mode: 'fixed',executionTargetId: 'agent-a' });

    expect(automationSelectOptions(
      [inheritedParent,inheritedChild,fixedLocal,fixedRemote],
      inheritedParent.head.resourceId,
      '',
    ).map((option) => option.value)).toEqual(['portable-child']);
    expect(automationSelectOptions(
      [fixedLocal,inheritedChild,fixedRemote],
      fixedLocal.head.resourceId,
      'local',
    )).toEqual([]);
  });
});

function automationDocument(
  resourceId: string,
  targetPolicy: AutomationDocument['spec']['targetPolicy'],
): AutomationDocument {
  return {
    head: { domain: 'automation',resourceId,name: resourceId,tags: [],mainCommitId: 'c1',currentVersion: 1,digest: 'd',revision: 1,createdAt: '',updatedAt: '' },
    branch: { domain: 'automation',resourceId,name: 'main',headCommitId: 'c1',headVersion: 1,revision: 1,createdAt: '',updatedAt: '' },
    spec: {
      schemaVersion: 4,metadata: { name: resourceId,description: '',tags: [] },targetPolicy,
      actions: [],nodes: [],edges: [],stickyNotes: [],
    },
  };
}
