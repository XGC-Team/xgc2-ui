import { Plus,Trash2 } from 'lucide-react';
import { useEffect,useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { ControlButton } from '../../../../components/controls/ControlButton';
import { SelectControl } from '../../../../components/controls/SelectControl';
import { InputControl } from '../../../../components/controls/TextControls';
import { SegmentedControl } from '../../../../components/SegmentedControl';
import './automation-condition.css';
import {
  automationConditionExpression,
  automationConditionList,
  automationConditionOperators,
  automationConditionOperatorRequiresValue,
  automationConditionValueText,
  parseAutomationConditionExpression,
  parseAutomationConditionValue,
  type AutomationCondition,
} from './automationConditionModel';
import type { AutomationNode } from '../../automationDefinitionContracts';
import { AutomationParameterModeSwitch } from '../../AutomationParameterControls';
import {
  automationInputFieldExpression,
  hasAutomationInputFieldDrag,
  readAutomationInputFieldDrag,
} from '../../automationInputExpression';

export function AutomationConditionParameters({ node,readOnly,onChange }: {
  node: AutomationNode;
  readOnly: boolean;
  onChange: (patch: Partial<AutomationNode>) => void;
}) {
  const conditions = automationConditionList(node.parameters.conditions);
  const visibleConditions = conditions.length > 0
    ? conditions
    : [{ path: '',operator: 'equals',value: true,leftMode: 'expression' as const }];
  const combinator = node.parameters.combinator === 'any' ? 'any' : 'all';

  function updateConditions(next: AutomationCondition[], parameters: Record<string,unknown> = node.parameters) {
    onChange({ parameters: { ...parameters,conditions: next } });
  }

  function updateCondition(index: number, patch: Partial<AutomationCondition>) {
    updateConditions(visibleConditions.map((condition, candidateIndex) => candidateIndex === index
      ? { ...condition,...patch }
      : condition));
  }

  function updateExpression(index: number, expression: string) {
    const parsed = parseAutomationConditionExpression(expression);
    if (!parsed) return;
    const parameters = {
      ...node.parameters,
      source: parsed.source,
      inputNode: parsed.source === 'input' ? parsed.inputNode ?? '' : undefined,
      itemsPath: '',
    };
    updateConditions(visibleConditions.map((condition, candidateIndex) => candidateIndex === index
      ? { ...condition,path: parsed.path }
      : condition), parameters);
  }

  return (
    <section className="automation-condition-editor" data-xgc-role="automation-condition-editor" data-xgc-id={node.id}>
      <header className="automation-condition-header">
        <strong>Conditions</strong>
        {visibleConditions.length > 1 && (
          <SegmentedControl
            ariaLabel="Condition matching"
            className="automation-condition-combinator"
            onChange={(option) => onChange({ parameters: { ...node.parameters, combinator: option } })}
            optionDataXgcRole="automation-condition-combinator"
            options={(['all', 'any'] as const).map((option) => ({
              dataXgcId: `${node.id}:${option}`,
              disabled: readOnly,
              label: option === 'all' ? 'AND' : 'OR',
              value: option,
            }))}
            size="compact"
            value={combinator}
          />
        )}
      </header>

      <div className="automation-condition-list">
        {visibleConditions.map((condition,index) => {
          const requiresValue = automationConditionOperatorRequiresValue(condition.operator);
          const leftMode = condition.leftMode === 'fixed' ? 'fixed' : 'expression';
          const label = `Condition ${index + 1}`;
          return (
            <div className="automation-condition-row" data-xgc-role="automation-condition-row" data-xgc-id={`${node.id}:${index}`} key={index}>
              <header className="automation-condition-row-header">
                <strong>{label}</strong>
                <AutomationParameterModeSwitch
                  nodeId={node.id}
                  target={`/conditions/${index}/leftValue`}
                  label={label}
                  mode={leftMode}
                  readOnly={readOnly}
                  onChange={(mode) => updateCondition(index, {
                    leftMode: mode,
                    ...(mode === 'fixed' && condition.leftValue === undefined ? { leftValue: '' } : {}),
                  })}
                />
              </header>
              <div className="automation-condition-controls">
                {leftMode === 'expression' ? (
                  <ConditionExpressionField
                    nodeId={node.id}
                    index={index}
                    expression={automationConditionExpression(node.parameters, condition.path)}
                    readOnly={readOnly}
                    onChange={(expression) => updateExpression(index, expression)}
                  />
                ) : (
                  <InputControl
                    aria-label={`${label} fixed left value`}
                    value={automationConditionValueText(condition.leftValue)}
                    readOnly={readOnly}
                    spellCheck={false}
                    dataXgcRole="automation-condition-left-fixed"
                    dataXgcId={`${node.id}:${index}`}
                    onChange={(value) => updateCondition(index, { leftValue: parseAutomationConditionValue(value) })}
                  />
                )}
                <SelectControl
                  fill
                  value={condition.operator}
                  options={automationConditionOperators.map((operator) => ({ value: operator.value,label: operator.label }))}
                  disabled={readOnly}
                  ariaLabel={`Condition ${index + 1} operator`}
                  dataXgcRole="automation-condition-operator-select"
                  dataXgcId={`${node.id}:${index}`}
                  onChange={(operator) => updateCondition(index, {
                    operator,
                    ...(automationConditionOperatorRequiresValue(operator)
                      ? { value: condition.value ?? true }
                      : { value: undefined }),
                  })}
                />
                {requiresValue ? (
                  <InputControl
                    aria-label={`Condition ${index + 1} value`}
                    value={automationConditionValueText(condition.value)}
                    readOnly={readOnly}
                    spellCheck={false}
                    dataXgcRole="automation-condition-value"
                    dataXgcId={`${node.id}:${index}`}
                    onChange={(value) => updateCondition(index, { value: parseAutomationConditionValue(value) })}
                  />
                ) : (
                  <InputControl
                    aria-label={`Condition ${index + 1} value not required`}
                    value="Not required"
                    disabled
                    readOnly
                    dataXgcRole="automation-condition-value"
                    dataXgcId={`${node.id}:${index}`}
                  />
                )}
                <ControlButton
                  className="automation-condition-remove"
                  iconOnly
                  appearance="ghost"
                  type="button"
                  aria-label={`Remove condition ${index + 1}`}
                  disabled={readOnly || visibleConditions.length === 1}
                  data-xgc-role="automation-condition-remove"
                  data-xgc-id={`${node.id}:${index}`}
                  onClick={() => updateConditions(visibleConditions.filter((_,candidateIndex) => candidateIndex !== index))}
                ><Trash2 size={14} aria-hidden="true" /></ControlButton>
              </div>
            </div>
          );
        })}
      </div>

      <ControlButton
        className="automation-condition-add"
        appearance="ghost"
        type="button"
        disabled={readOnly || visibleConditions.length >= 32}
        data-xgc-role="automation-condition-add"
        data-xgc-id={node.id}
        onClick={() => updateConditions([...visibleConditions,{ path: '',operator: 'equals',value: true,leftMode: 'expression' }])}
      ><Plus size={14} aria-hidden="true" />Add condition</ControlButton>
    </section>
  );
}

function ConditionExpressionField({ nodeId,index,expression,readOnly,onChange }: {
  nodeId: string;
  index: number;
  expression: string;
  readOnly: boolean;
  onChange: (expression: string) => void;
}) {
  const [draft,setDraft] = useState(expression);
  const [dragActive,setDragActive] = useState(false);
  const valid = Boolean(parseAutomationConditionExpression(draft));
  const controlId = `automation-condition-expression-${nodeId}-${index}`;

  useEffect(() => setDraft(expression), [expression]);

  function acceptInputField(event: ReactDragEvent<HTMLInputElement>) {
    if (readOnly || !hasAutomationInputFieldDrag(event.dataTransfer)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    return true;
  }

  return (
      <InputControl
        id={controlId}
        aria-label={`Condition ${index + 1} expression`}
        className="automation-condition-expression"
        dataXgcRole="automation-condition-expression"
        dataXgcId={`${nodeId}:${index}`}
        value={draft}
        readOnly={readOnly}
        maxLength={4_096}
        spellCheck={false}
        aria-invalid={!valid}
        data-drag-active={dragActive ? 'true' : undefined}
        placeholder="{{ $input.field }}"
        onChange={(value) => {
          setDraft(value);
          if (parseAutomationConditionExpression(value)) onChange(value);
        }}
        onDragEnter={(event) => {
          if (acceptInputField(event)) setDragActive(true);
        }}
        onDragOver={acceptInputField}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={(event) => {
          setDragActive(false);
          if (!acceptInputField(event)) return;
          const reference = readAutomationInputFieldDrag(event.dataTransfer);
          if (!reference) return;
          const next = automationInputFieldExpression(reference);
          setDraft(next);
          onChange(next);
        }}
      />
  );
}
