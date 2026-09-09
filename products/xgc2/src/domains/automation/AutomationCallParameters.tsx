import { useState } from 'react';
import { InputControl } from '../../components/controls/TextControls';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import type {
  AutomationDocument,
  AutomationNode,
  AutomationParameterField,
} from './automationDefinitionContracts';
import { parameterBindingTarget } from './automationDefinitionEditorModel';
import {
  AutomationCatalogParameterField,
  type AutomationParameterOptions,
} from './AutomationParameterControls';
import { automationInputFieldExpression } from './automationInputExpression';
import {
  clearAutomationCallTargetPins,
  initialAutomationCallInputs,
} from './automationCallModel';
import { AutomationParameterSchemaForm } from './AutomationParameterSchemaForm';
import { isAutomationParameterRecord } from './automationParameterAuthoring';
import { automationActionById,automationPrimaryAction } from './automationSpecModel';

export function AutomationCallParameters({
  node,
  automationDocuments,
  parameterOptions,
  inputSourceIds,
  executionTargetId,
  readOnly,
  onChange,
  onError,
}: {
  node: AutomationNode;
  automationDocuments: readonly AutomationDocument[];
  parameterOptions?: AutomationParameterOptions;
  inputSourceIds: readonly string[];
  executionTargetId: string;
  readOnly: boolean;
  onChange: (patch: Partial<AutomationNode>) => void;
  onError: (error: string) => void;
}) {
  const automationId = typeof node.parameters.automationId === 'string'
    ? node.parameters.automationId
    : '';
  const target = automationDocuments.find((document) => document.head.resourceId === automationId);
  const actionId = typeof node.parameters.actionId === 'string' ? node.parameters.actionId : '';
  const action = target ? automationActionById(target.spec, actionId) : undefined;
  const inputs = isAutomationParameterRecord(node.parameters.parameters)
    ? node.parameters.parameters
    : {};
  const waitForCompletion = node.parameters.mode !== 'async'
    && node.parameters.criticality !== 'auxiliary';
  const [targetOpen,setTargetOpen] = useState(true);
  const [inputsOpen,setInputsOpen] = useState(true);

  function selectAutomation(value: unknown) {
    const nextAutomationId = typeof value === 'string' ? value : '';
    const nextTarget = automationDocuments.find((document) => document.head.resourceId === nextAutomationId);
    const nextAction = nextTarget ? automationPrimaryAction(nextTarget.spec) : undefined;
    const parameters = {
      ...clearAutomationCallTargetPins(node.parameters),
      automationId: nextAutomationId,
      actionId: nextAction?.id ?? '',
      branch: 'main',
      mode: 'sync',
      criticality: 'required',
      inputMode: 'configured',
      parameters: initialAutomationCallInputs(nextAction?.inputSchema.fields ?? []),
    };
    const parameterBindings = (node.parameterBindings ?? [])
      .filter((binding) => !binding.target.startsWith('/parameters/'));
    onChange({
      parameters,
      parameterBindings: parameterBindings.length > 0 ? parameterBindings : undefined,
    });
  }

  function selectAction(nextActionId: string) {
    const nextAction = target ? automationActionById(target.spec, nextActionId) : undefined;
    onChange({
      parameters: {
        ...clearAutomationCallTargetPins(node.parameters),
        actionId: nextActionId,
        parameters: initialAutomationCallInputs(nextAction?.inputSchema.fields ?? []),
      },
      parameterBindings: (node.parameterBindings ?? []).filter((binding) => !binding.target.startsWith('/parameters/')),
    });
  }

  function updateInput(field: AutomationParameterField, value: unknown) {
    onChange({
      parameters: {
        ...node.parameters,
        parameters: { ...inputs,[field.name]: value },
      },
    });
  }

  function changeInputMode(field: AutomationParameterField, mode: 'fixed' | 'expression') {
    const targetPath = parameterBindingTarget('parameters', field.name);
    const existing = node.parameterBindings ?? [];
    if (mode === 'fixed') {
      const parameterBindings = existing.filter((binding) => binding.target !== targetPath);
      onChange({ parameterBindings: parameterBindings.length > 0 ? parameterBindings : undefined });
      return;
    }
    if (existing.some((binding) => binding.target === targetPath)) return;
    const sourceId = inputSourceIds[0] ?? node.id;
    onChange({
      parameterBindings: [...existing,{
        target: targetPath,
        expression: automationInputFieldExpression({
          sourceId,
          multipleSources: inputSourceIds.length > 1,
          segments: [field.name],
        }),
        language: 'xgc-expression-v2',
      }],
    });
  }

  function changeExpression(targetPath: string, expression: string) {
    onChange({
      parameterBindings: (node.parameterBindings ?? []).map((binding) => binding.target === targetPath
        ? { ...binding,expression,language: 'xgc-expression-v2' }
        : binding),
    });
  }

  return (
    <div className="automation-call-parameters" data-xgc-role="automation-call-parameters" data-xgc-id={node.id}>
      <details className="automation-parameter-group" data-xgc-role="automation-call-target" data-xgc-id={node.id} open={targetOpen}>
        <summary
          aria-expanded={targetOpen}
          onClick={(event) => {
            event.preventDefault();
            setTargetOpen((current) => !current);
          }}
        >
          <span>Automation</span>
        </summary>
        <div className="automation-parameter-group-content">
          <AutomationCatalogParameterField
            nodeId={node.id}
            name="automationId"
            property={{ type: 'string',title: 'Automation' }}
            options={parameterOptions?.automationId}
            required
            value={automationId}
            executionTargetId={executionTargetId}
            target="/automationId"
            expressionBindingsEnabled={false}
            readOnly={readOnly}
            onChange={selectAutomation}
            onModeChange={() => undefined}
            onExpressionChange={() => undefined}
            onError={onError}
          />
          {target && <FormField className="automation-node-parameter-field" label="Action" dataXgcRole="automation-call-action" dataXgcId={node.id}>
            <SelectControl
              fill
              value={actionId}
              disabled={readOnly}
              ariaLabel="Action"
              dataXgcRole="automation-call-action-select"
              dataXgcId={node.id}
              options={target.spec.actions.map((candidate) => ({ value: candidate.id,label: candidate.label }))}
              onChange={selectAction}
            />
          </FormField>}
        </div>
      </details>

      <details className="automation-parameter-group" data-xgc-role="automation-call-inputs" data-xgc-id={node.id} open={inputsOpen}>
        <summary
          aria-expanded={inputsOpen}
          onClick={(event) => {
            event.preventDefault();
            setInputsOpen((current) => !current);
          }}
        >
          <span>Inputs</span>
          {action && <small>{action.inputSchema.fields.length} fields</small>}
        </summary>
        <div className="automation-parameter-group-content">
          {!target ? (
            <p>Select an Automation and Action to configure its declared inputs.</p>
          ) : !action ? (
            <p>Select one of {target.spec.metadata.name}&apos;s public Actions.</p>
          ) : action.inputSchema.fields.length === 0 ? (
            <p>{action.label} declares no inputs.</p>
          ) : (
            <div className="automation-call-input-fields">
              <AutomationParameterSchemaForm
                roleId={node.id}
                fields={action.inputSchema.fields}
                values={inputs}
                executionTargetId={executionTargetId}
                readOnly={readOnly}
                expressions={{
                  bindingTarget: (field) => parameterBindingTarget('parameters', field.name),
                  bindingFor: (field) => (node.parameterBindings ?? []).find((candidate) => (
                    candidate.target === parameterBindingTarget('parameters', field.name)
                  )),
                  onModeChange: changeInputMode,
                  onExpressionChange: changeExpression,
                }}
                onChange={updateInput}
                onError={onError}
              />
            </div>
          )}
        </div>
      </details>

      <section data-xgc-role="automation-call-execution" data-xgc-id={node.id}>
        <h3>Execution</h3>
        <FormField
          className="automation-node-parameter-field"
          label="Wait for completion"
          description={waitForCompletion
            ? 'Return the child result and stop this workflow if the child fails.'
            : 'Continue after the child starts, while keeping it owned by this workflow.'}
          dataXgcRole="automation-call-wait"
          dataXgcId={node.id}
        >
          <SwitchControl
            checked={waitForCompletion}
            ariaLabel="Wait for completion"
            disabled={readOnly}
            onChange={(checked) => onChange({
              parameters: {
                ...node.parameters,
                mode: 'sync',
                criticality: checked ? 'required' : 'auxiliary',
                inputMode: 'configured',
              },
            })}
          />
        </FormField>
        <details className="automation-call-advanced" data-xgc-role="automation-call-advanced" data-xgc-id={node.id}>
          <summary>Advanced</summary>
          <div>
            <FormField className="automation-node-parameter-field" label="Branch" dataXgcRole="automation-call-branch" dataXgcId={node.id}>
              <InputControl
                value={typeof node.parameters.branch === 'string' ? node.parameters.branch : 'main'}
                readOnly={readOnly}
                onChange={(branch) => onChange({
                  parameters: {
                    ...clearAutomationCallTargetPins(node.parameters),
                    branch,
                  },
                })}
              />
            </FormField>
          </div>
        </details>
      </section>
    </div>
  );
}
