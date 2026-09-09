import { describe,expect,it } from 'vitest';
import {
  automationDocumentVisibleForExecutionTarget,
  filterAutomationDocumentsForExecutionTarget,
  isCoreProductCatalogAutomation,
  isManagedAgentExecutionTarget,
  sameAutomationExecutionTarget,
} from './automationTargetCatalogModel';

function doc(opts: {
  resourceId: string;
  system?: boolean | null;
  tags?: string[];
  mode: 'fixed' | 'inherit';
  executionTargetId?: string;
}) {
  return {
    head: {
      domain: 'automation' as const,
      resourceId: opts.resourceId,
      system: opts.system ?? false,
      namespaceId: '',
    },
    spec: {
      metadata: { name: opts.resourceId,description: '',tags: opts.tags ?? [] },
      targetPolicy: opts.mode === 'inherit'
        ? { mode: 'inherit' as const,executionTargetId: '' as const }
        : { mode: 'fixed' as const,executionTargetId: opts.executionTargetId ?? 'local' },
    },
  };
}

describe('automationTargetCatalogModel', () => {
  it('treats empty and local as the same ground-station target', () => {
    expect(sameAutomationExecutionTarget('', 'local')).toBe(true);
    expect(isManagedAgentExecutionTarget('local')).toBe(false);
    expect(isManagedAgentExecutionTarget('xgc2-dev-lab-agent-b2')).toBe(true);
    expect(isManagedAgentExecutionTarget('core:edge')).toBe(false);
  });

  it('shows fixed workflows only on their declared host', () => {
    const localOnly = doc({ resourceId: 'local-wf',mode: 'fixed',executionTargetId: 'local' });
    const agentOnly = doc({ resourceId: 'agent-wf',mode: 'fixed',executionTargetId: 'agent-b2' });

    expect(automationDocumentVisibleForExecutionTarget(localOnly, 'local')).toBe(true);
    expect(automationDocumentVisibleForExecutionTarget(localOnly, 'agent-b2')).toBe(false);
    expect(automationDocumentVisibleForExecutionTarget(agentOnly, 'local')).toBe(false);
    expect(automationDocumentVisibleForExecutionTarget(agentOnly, 'agent-b2')).toBe(true);
  });

  it('keeps portable inherit user workflows on Agent but drops Core system/template seeds', () => {
    const userPortable = doc({ resourceId: 'user',mode: 'inherit' });
    const systemSeed = doc({
      resourceId: 'session-run',
      mode: 'inherit',
      system: true,
      tags: ['experiment','session'],
    });
    const templateSeed = doc({
      resourceId: 'template',
      mode: 'inherit',
      system: true,
      tags: ['template'],
    });

    expect(automationDocumentVisibleForExecutionTarget(userPortable, 'agent-b2')).toBe(true);
    expect(automationDocumentVisibleForExecutionTarget(systemSeed, 'agent-b2')).toBe(false);
    expect(automationDocumentVisibleForExecutionTarget(templateSeed, 'agent-b2')).toBe(false);

    expect(automationDocumentVisibleForExecutionTarget(userPortable, 'local')).toBe(true);
    expect(automationDocumentVisibleForExecutionTarget(systemSeed, 'local')).toBe(true);
    expect(automationDocumentVisibleForExecutionTarget(templateSeed, 'local')).toBe(true);
  });

  it('does not infer product ownership from user-facing tags', () => {
    const leakedRos = doc({
      resourceId: 'ros-core',
      mode: 'inherit',
      system: null,
      tags: ['ros', 'service', 'xgc.seed.ros-basic-services.roscore'],
    });
    const leakedSession = doc({
      resourceId: 'run-exp',
      mode: 'inherit',
      system: false,
      tags: ['built-in', 'experiment', 'system'],
    });
    const leakedPx4Panel = doc({
      resourceId: 'px4-arm',
      mode: 'inherit',
      system: false,
      tags: ['ground-station', 'panel-control', 'px4', 'xgc.seed.px4-panel-control.v7.arm'],
    });
    const leakedRobotRuntime = doc({
      resourceId: 'run-robots',
      mode: 'inherit',
      system: false,
      tags: ['bounded-fan-out', 'mixed-fleet', 'robot', 'runtime'],
    });

    for (const document of [leakedRos,leakedSession,leakedPx4Panel,leakedRobotRuntime]) {
      expect(isCoreProductCatalogAutomation(document)).toBe(false);
      expect(automationDocumentVisibleForExecutionTarget(document, 'agent-b2')).toBe(true);
      expect(automationDocumentVisibleForExecutionTarget(document, 'local')).toBe(true);
    }
  });

  it('filters a mixed catalog when switching host', () => {
    const documents = [
      doc({ resourceId: 'core-system',mode: 'inherit',system: true }),
      doc({ resourceId: 'local-fixed',mode: 'fixed',executionTargetId: 'local' }),
      doc({ resourceId: 'agent-fixed',mode: 'fixed',executionTargetId: 'agent-b2' }),
      doc({ resourceId: 'user-portable',mode: 'inherit' }),
      doc({
        resourceId: 'leaked-seed',
        mode: 'inherit',
        system: false,
        tags: ['xgc.seed.ros-basic-services.control', 'ros', 'control'],
      }),
    ];

    expect(filterAutomationDocumentsForExecutionTarget(documents, 'local').map((d) => d.head.resourceId))
      .toEqual(['core-system', 'local-fixed', 'user-portable', 'leaked-seed']);
    expect(filterAutomationDocumentsForExecutionTarget(documents, 'agent-b2').map((d) => d.head.resourceId))
      .toEqual(['agent-fixed', 'user-portable', 'leaked-seed']);
  });
});
