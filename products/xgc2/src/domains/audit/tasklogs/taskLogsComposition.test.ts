import { describe, expect, it } from 'vitest';
import { productWebComposition as coreRelease } from '../../../../profiles/core-release';
import { productWebComposition as falseTaskLogs } from '../../../../test-fixtures/core-operations-without-tasklogs';
import { productOperationsContribution } from '../../execution/executionPublic';
import { assembleProductWebComposition } from '../../../shared/productWebComposition';
import { createCoreUserFeatureComposition } from '../../../../profiles/core-user-features';
import { auditTaskLogsContribution } from './taskLogsProductContribution';

describe('Audit.TaskLogs web composition', () => {
  it('positive core-release includes task section and exact task surface', () => {
    const audit = coreRelease.routes.find((route) => route.page === 'audit');
    expect(audit).toBeDefined();
    expect(coreRelease.navigation.sections.audit?.map((section) => section.id)).toEqual([
      'operation', 'access', 'system', 'login', 'task',
    ]);
    expect(audit?.sectionRoutes?.task?.surface?.targetCapabilities).toEqual(['audit.task.read']);
  });

  it('false fixture keeps audit without task module', () => {
    expect(falseTaskLogs.navigation.sections.audit?.map((section) => section.id)).toEqual([
      'operation', 'access', 'system', 'login',
    ]);
    const audit = falseTaskLogs.routes.find((route) => route.page === 'audit');
    expect(audit?.sectionRoutes?.task).toBeUndefined();
  });

  it('requires Product.Operations owner before TaskLogs', () => {
    const base = createCoreUserFeatureComposition({
      id: 'tasklogs-order',
      agentLinkComputeTargets: true,
    });
    expect(() => assembleProductWebComposition(base, auditTaskLogsContribution))
      .toThrow(/requires earlier owner "Product.Operations"/);
    expect(() => assembleProductWebComposition(
      base,
      auditTaskLogsContribution,
      productOperationsContribution,
    )).toThrow(/requires earlier owner "Product.Operations"/);
    expect(() => assembleProductWebComposition(
      base,
      productOperationsContribution,
      auditTaskLogsContribution,
    )).not.toThrow();
  });
});
