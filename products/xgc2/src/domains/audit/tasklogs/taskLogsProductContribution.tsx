import { CirclePlay } from 'lucide-react';
import type { ProductOwnerContribution } from '../../../shared/productWebComposition';
import { productOperationsOwnerIdentity } from '../../execution/executionPublic';
import { LazyTaskLogsRoute } from './LazyTaskLogsRoute';
import { taskLogsRoute } from './loadTaskLogsRoute';
import { auditTaskLogsOwnerIdentity } from './taskLogsProductIdentity';

const label = (en: string, zh: string) => ({ 'en-US': en, 'zh-CN': zh } as const);

/**
 * Audit.TaskLogs web leaf: independent task tab + section route requiring
 * Product.Operations and exact audit.task.read surface.
 */
export const auditTaskLogsContribution = {
  owner: auditTaskLogsOwnerIdentity,
  requires: [productOperationsOwnerIdentity],
  navigation: {
    sections: [{
      page: 'audit',
      items: [
        { id: 'task', label: label('Task logs', '任务日志'), icon: CirclePlay },
      ],
    }],
  },
  routeSections: [{
    page: 'audit',
    sectionId: 'task',
    route: {
      component: LazyTaskLogsRoute,
      preload: taskLogsRoute.preload,
      surface: {
        productFeatures: ['audit'],
        targetAction: 'task audit access',
        targetCapabilities: ['audit.task.read'],
        remoteVisibility: 'control-plane',
        remoteManagedHostAdmission: () => false,
      },
    },
  }],
} as const satisfies ProductOwnerContribution;
