import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button,Popover,SegmentedControl } from '@xgc2/ui-react';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField } from '../../components/FormPrimitives';
import '../../styles/automation-run-policy.css';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import type {
  AutomationAdmission,
  AutomationConcurrencyPolicy,
} from './automationDefinitionContracts';
import { AutomationNumericInput } from './AutomationNumericInput';

export function AutomationAdmissionEditor({ resourceId,admission,readOnly,disabled,onChange }: {
  resourceId: string;
  admission: AutomationAdmission;
  readOnly: boolean;
  disabled: boolean;
  onChange: (admission: AutomationAdmission) => void;
}) {
  const t = useAutomationAuthoringText();
  const [open,setOpen] = useState(false);
  const concurrency = admission.concurrency;
  const singleton = concurrency?.scope === 'workflow'
    && concurrency.limit === 1
    && concurrency.appliesTo === 'all';
  const limited = Boolean(concurrency) && !singleton;
  const mode = singleton ? 'singleton' : limited ? 'limited' : 'parallel';
  const summary = singleton ? t('Singleton') : concurrency ? `${t('Limited')} · ${concurrency.limit}` : t('Parallel');
  const singletonConflict = concurrency?.onConflict === 'queue' ? 'additional runs wait in queue'
    : concurrency?.onConflict === 'reject' ? 'additional runs are rejected'
      : 'a new run replaces the oldest run';
  const summaryLabel = singleton
    ? `Run admission: Singleton. One workflow run at a time; ${singletonConflict}.`
    : `Run admission: ${summary}`;
  const setPolicy = (patch: Partial<AutomationConcurrencyPolicy>) => {
    if (!concurrency) return;
    const next = { ...concurrency,...patch };
    if (next.scope === 'target' || next.scope === 'workflow') delete next.keyExpression;
    onChange({ concurrency: next });
  };
  const selectMode = (nextMode: string) => {
    if (nextMode === 'parallel') {
      onChange({});
      return;
    }
    if (nextMode === 'singleton') {
      onChange({ concurrency: {
        scope: 'workflow',
        limit: 1,
        onConflict: concurrency?.onConflict ?? 'queue',
        appliesTo: 'all',
      } });
      return;
    }
    onChange({ concurrency: limited && concurrency
      ? concurrency
      : {
        scope: 'workflow',
        limit: 2,
        onConflict: concurrency?.onConflict ?? 'queue',
        appliesTo: concurrency?.appliesTo ?? 'all',
      } });
  };
  if (readOnly) return (
    <div
      className="automation-run-policy-setting"
      data-xgc-role="automation-admission-editor"
      data-xgc-id={resourceId}
      data-xgc-readonly="true"
    >
      <span
        className="automation-run-policy-static-summary"
        data-xgc-role="automation-admission-summary"
        data-xgc-id={resourceId}
        aria-disabled="true"
        aria-label={summaryLabel}
        title={summaryLabel}
      >
        <span className="automation-run-policy-summary-label">{summary}</span>
      </span>
    </div>
  );
  return (
    <div
      className="automation-run-policy-setting"
      data-xgc-role="automation-admission-editor"
      data-xgc-id={resourceId}
      data-xgc-readonly="false"
    >
      <Popover
        align="end"
        ariaLabel={summaryLabel}
        className="automation-run-policy-popover"
        dataXgcId={resourceId}
        dataXgcRole="automation-admission-popover"
        onOpenChange={setOpen}
        open={open}
        trigger={(
          <Button
            appearance="ghost"
            aria-label={summaryLabel}
            className="automation-run-policy-summary"
            data-xgc-role="automation-admission-summary"
            data-xgc-id={resourceId}
            title={summaryLabel}
            type="button"
          >
            <span className="automation-run-policy-summary-label">{summary}</span>
            <ChevronDown
              aria-hidden="true"
              className="automation-run-policy-chevron"
              data-xgc-open={open ? 'true' : 'false'}
            />
          </Button>
        )}
        width="wide"
      >
      <div className="automation-run-policy-fields" data-xgc-role="automation-admission-fields" data-xgc-id={resourceId}>
        <div
          className="automation-run-policy-admission-mode-options"
        >
          <span>{t('Mode')}</span>
          <SegmentedControl
            ariaLabel={t('Run admission mode')}
            className="automation-run-policy-admission-mode-control"
            dataXgcRole="automation-admission-mode"
            dataXgcId={resourceId}
            onValueChange={selectMode}
            optionClassName="automation-run-policy-admission-mode-option"
            optionDataXgcRole="automation-admission-mode-option"
            options={[
              { value: 'parallel',label: t('Parallel'),disabled,dataXgcId: 'parallel' },
              { value: 'singleton',label: t('Singleton'),disabled,dataXgcId: 'singleton' },
              { value: 'limited',label: t('Limited'),disabled,dataXgcId: 'limited' },
            ]}
            size="compact"
            value={mode}
          />
        </div>
        {concurrency && <>
          {!singleton && <>
            <FormField label={t('Capacity scope')} dataXgcRole="automation-admission-scope-field" dataXgcId={resourceId}>
              <SelectControl
                className="automation-run-policy-control"
                value={concurrency.scope}
                options={[
                  { value: 'target',label: t('Target') },
                  { value: 'workflow',label: t('Workflow') },
                  { value: 'family',label: t('Family parameter') },
                  { value: 'key',label: t('Key parameter') },
                ]}
                disabled={disabled}
                onChange={(value) => setPolicy({ scope: value as AutomationConcurrencyPolicy['scope'] })}
                ariaLabel={t('Run admission scope')}
                dataXgcRole="automation-admission-scope"
                dataXgcId={resourceId}
                fill
              />
            </FormField>
            <FormField label={t('Concurrent runs')} dataXgcRole="automation-admission-limit-field" dataXgcId={resourceId}>
              <AutomationNumericInput
                integer
                min={1}
                max={1024}
                value={concurrency.limit}
                disabled={disabled}
                ariaLabel={t('Run admission limit')}
                dataXgcRole="automation-admission-limit"
                dataXgcId={resourceId}
                onValueChange={(value) => setPolicy({ limit: value })}
              />
            </FormField>
          </>}
          <FormField label={t('When full')} dataXgcRole="automation-admission-conflict-field" dataXgcId={resourceId}>
            <SelectControl
              className="automation-run-policy-control"
              value={concurrency.onConflict}
              options={[
                { value: 'queue',label: t('Queue') },
                { value: 'reject',label: t('Reject') },
                { value: 'replace',label: t('Replace oldest') },
              ]}
              disabled={disabled}
              onChange={(value) => setPolicy({ onConflict: value as AutomationConcurrencyPolicy['onConflict'] })}
              ariaLabel={t('Run admission conflict behavior')}
              dataXgcRole="automation-admission-conflict"
              dataXgcId={resourceId}
              fill
            />
          </FormField>
          <FormField label={t('Applies to')} dataXgcRole="automation-admission-applies-to-field" dataXgcId={resourceId}>
            <SelectControl
              className="automation-run-policy-control"
              value={concurrency.appliesTo}
              options={[{ value: 'all',label: t('All runs') },{ value: 'root',label: t('Root runs only') }]}
              disabled={disabled}
              onChange={(value) => setPolicy({ appliesTo: value as AutomationConcurrencyPolicy['appliesTo'] })}
              ariaLabel={t('Run admission applies to')}
              dataXgcRole="automation-admission-applies-to"
              dataXgcId={resourceId}
              fill
            />
          </FormField>
          {!singleton && (concurrency.scope === 'family' || concurrency.scope === 'key') && (
            <FormField label={t('Run parameter JSON pointer')} dataXgcRole="automation-admission-key-expression-field" dataXgcId={resourceId}>
              <InputControl
                className="automation-run-policy-control"
                value={concurrency.keyExpression ?? ''}
                placeholder="/robotId"
                disabled={disabled}
                aria-label={t('Run admission key expression')}
                dataXgcRole="automation-admission-key-expression"
                dataXgcId={resourceId}
                onChange={(value) => setPolicy({ keyExpression: value })}
              />
            </FormField>
          )}
        </>}
      </div>
      </Popover>
    </div>
  );
}
