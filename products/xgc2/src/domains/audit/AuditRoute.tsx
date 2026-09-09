import { useNavigation } from '../../app/navigationContext';
import type { AuditTab } from '../../shared/productWebComposition';
import { AuditPage } from './AuditPage';

const genericAuditTabs = new Set<string>(['operation', 'access', 'system', 'login']);

export function AuditRoute() {
  const nav = useNavigation();
  const section = nav.pageSection('audit') || 'operation';
  // Task logs are a typed leaf with their own section route. Never project
  // section=task onto /audit/logs?category=task (400 unsupported category).
  const activeTab = (genericAuditTabs.has(section) ? section : 'operation') as AuditTab;
  return <AuditPage activeTab={activeTab} language={nav.language} />;
}
