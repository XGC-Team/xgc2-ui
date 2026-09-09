import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import {
  INGRESS_STATUSES,
  RUN_STATUSES,
  type AutomationExecutionIngressStatus,
  type AutomationRunStatus,
} from '../../shared/executionStatusVocabulary';
import { useAutomationExecutionText } from './automationExecutionMessages';
import { ingressStatusLabel } from './automationExecutionFilterModel';
import { automationRunPhase } from './automationRunModel';

export type ExecutionStatusFilter = 'all' | 'in-progress' | 'terminal' | AutomationRunStatus | `ingress:${AutomationExecutionIngressStatus}`;
export type ExecutionRelationshipFilter = 'all' | 'root' | 'child';

export function AutomationExecutionFilters({
  resourceId,statusFilter,relationshipFilter,selectedRunHidden,selectedEntryId,
  onStatusFilterChange,onRelationshipFilterChange,
}: {
  resourceId: string;
  statusFilter: ExecutionStatusFilter;
  relationshipFilter: ExecutionRelationshipFilter;
  selectedRunHidden: boolean;
  selectedEntryId?: string;
  onStatusFilterChange: (value: ExecutionStatusFilter) => void;
  onRelationshipFilterChange: (value: ExecutionRelationshipFilter) => void;
}) {
  const t = useAutomationExecutionText();
  return (
    <div className="automation-execution-filters" data-xgc-role="automation-execution-filters" data-xgc-id={resourceId}>
      <FormField className="automation-execution-filter-field" label={t('Status')}>
        <SelectControl
          fill
          value={statusFilter}
          options={[
            { value: 'all',label: t('All statuses') },
            { value: 'in-progress',label: t('In progress') },
            { value: 'terminal',label: t('Terminal') },
            ...RUN_STATUSES.map((status) => ({ value: status,label: automationRunPhase(status).shortLabel })),
            ...INGRESS_STATUSES.map((status) => ({ value: `ingress:${status}`,label: `Ingress · ${ingressStatusLabel(status)}` })),
          ]}
          onChange={(value) => onStatusFilterChange(value as ExecutionStatusFilter)}
          ariaLabel={t('Filter executions by status')}
          dataXgcRole="automation-execution-status-filter"
          dataXgcId={resourceId}
        />
      </FormField>
      <FormField className="automation-execution-filter-field" label={t('Relationship')}>
        <SelectControl
          fill
          value={relationshipFilter}
          options={[
            { value: 'all',label: t('All runs') },
            { value: 'root',label: t('Root runs') },
            { value: 'child',label: t('Child runs') },
          ]}
          onChange={(value) => onRelationshipFilterChange(value as ExecutionRelationshipFilter)}
          ariaLabel={t('Filter executions by relationship')}
          dataXgcRole="automation-execution-relationship-filter"
          dataXgcId={resourceId}
        />
      </FormField>
      {selectedRunHidden && (
        <span className="automation-execution-filter-note" role="status" data-xgc-role="automation-execution-selected-filtered" data-xgc-id={selectedEntryId ?? resourceId}>
          {t('Selected execution remains open')}
        </span>
      )}
    </div>
  );
}
