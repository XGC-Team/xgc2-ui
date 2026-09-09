import {
  RadioTower,
  ScrollText,
  Server,
  ShieldCheck,
} from 'lucide-react';
import type { ProductOwnerContribution } from '../../shared/productWebComposition';
import { LazyAuditRoute } from './LazyAuditRoute';
import { auditRoute } from './loadAuditRoute';
import { productOperationsOwnerIdentity } from './operationsProductIdentity';

const label = (en: string, zh: string) => ({ 'en-US': en, 'zh-CN': zh } as const);

/**
 * Real Product.Operations web owner: owns the Audit page route and the generic
 * operation/access/system/login sections. TaskLogs requires this owner and
 * appends the task section route after it.
 */
export const productOperationsContribution = {
  owner: productOperationsOwnerIdentity,
  routes: [{
    page: 'audit',
    component: LazyAuditRoute,
    preload: auditRoute.preload,
    surface: {
      productFeatures: ['audit'],
      targetAction: 'audit access',
      targetCapabilities: ['audit.read', 'access.manage'],
      remoteVisibility: 'control-plane',
      remoteManagedHostAdmission: () => false,
    },
  }],
  navigation: {
    operations: [{
      id: 'audit',
      label: label('Audit logs', '审计日志'),
      icon: ScrollText,
    }],
    sections: [{
      page: 'audit',
      items: [
        { id: 'operation', label: label('Operation logs', '操作日志'), icon: ScrollText },
        { id: 'access', label: label('Access logs', '访问日志'), icon: RadioTower },
        { id: 'system', label: label('System logs', '系统日志'), icon: Server },
        { id: 'login', label: label('Login logs', '登录日志'), icon: ShieldCheck },
      ],
    }],
    sectionDefaults: [{ page: 'audit', sectionId: 'operation' }],
  },
} as const satisfies ProductOwnerContribution;
