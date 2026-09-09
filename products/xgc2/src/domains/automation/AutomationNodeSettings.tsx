import { FormSection } from '@xgc2/ui-react';
import { FormField } from '../../components/FormPrimitives';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import type { AutomationNode } from './automationDefinitionContracts';
import { AutomationNumericInput } from './AutomationNumericInput';

export function AutomationNodeSettings({ node,readOnly,onChange }: {
  node: AutomationNode;
  readOnly: boolean;
  onChange: (patch: Partial<AutomationNode>) => void;
}) {
  const t = useAutomationAuthoringText();
  const maxAttemptsId = `automation-node-retry-max-attempts-${node.id}`;
  const initialBackoffId = `automation-node-retry-initial-backoff-${node.id}`;
  const maxBackoffId = `automation-node-retry-max-backoff-${node.id}`;
  return (
    <div className="automation-node-settings" data-xgc-role="automation-node-settings" data-xgc-id={node.id}>
      <FormSection title={t('Retry policy')} dataXgcRole="automation-node-retry" dataXgcId={node.id}>
        <FormField label={t('Max attempts')} htmlFor={maxAttemptsId} dataXgcRole="automation-node-retry-max-attempts" dataXgcId={node.id}>
          <AutomationNumericInput id={maxAttemptsId} integer min={1} value={node.retry.maxAttempts} disabled={readOnly} onValueChange={(value) => onChange({ retry: { ...node.retry,maxAttempts: value } })} />
        </FormField>
        <FormField label={t('Initial backoff (s)')} htmlFor={initialBackoffId} dataXgcRole="automation-node-retry-initial-backoff" dataXgcId={node.id}>
          <AutomationNumericInput id={initialBackoffId} min={0} step={0.1} value={node.retry.initialBackoff / 1_000_000_000} disabled={readOnly} onValueChange={(value) => onChange({ retry: { ...node.retry,initialBackoff: value * 1_000_000_000 } })} />
        </FormField>
        <FormField label={t('Max backoff (s)')} htmlFor={maxBackoffId} dataXgcRole="automation-node-retry-max-backoff" dataXgcId={node.id}>
          <AutomationNumericInput id={maxBackoffId} min={0} step={0.1} value={node.retry.maxBackoff / 1_000_000_000} disabled={readOnly} onValueChange={(value) => onChange({ retry: { ...node.retry,maxBackoff: value * 1_000_000_000 } })} />
        </FormField>
      </FormSection>
    </div>
  );
}
