import { FormField } from '../../components/FormPrimitives';
import { TextareaControl } from '../../components/controls/TextControls';
import type {
  AutomationParameterBinding,
  AutomationParameterField,
} from './automationDefinitionContracts';
import { AutomationCatalogParameterField } from './AutomationParameterControls';
import { automationCallInputProperty } from './automationCallModel';
import {
  isRenderableAutomationParameterField,
  unsupportedAutomationParameterMessage,
} from './automationParameterSchemaFormModel';

/**
 * Optional expression wiring. The Automation editor lets an author bind a
 * parameter to an upstream expression instead of a fixed value; every other
 * consumer (panel option drawers) edits fixed values only, and omitting this
 * prop is what turns the expression affordance off.
 */
export type AutomationParameterExpressionWiring = {
  bindingTarget: (field: AutomationParameterField) => string;
  bindingFor: (field: AutomationParameterField) => AutomationParameterBinding | undefined;
  onModeChange: (field: AutomationParameterField, mode: 'fixed' | 'expression') => void;
  onExpressionChange: (target: string, expression: string) => void;
};

/**
 * One workflow parameterSchema rendered as a form.
 *
 * This is the single schema-to-form path in the app: the Automation editor's
 * `automation.call` inputs and the panel option drawers which edit an
 * Experiment workflow binding's parameters both come through here, so a field
 * kind is presented one way everywhere and gains support in one place.
 */
export function AutomationParameterSchemaForm({
  roleId,
  fields,
  values,
  executionTargetId,
  readOnly = false,
  expressions,
  onChange,
  onError,
}: {
  /** Stable identity prefix for control ids and data-xgc-id attributes. */
  roleId: string;
  fields: readonly AutomationParameterField[];
  values: Record<string,unknown>;
  executionTargetId: string;
  readOnly?: boolean;
  expressions?: AutomationParameterExpressionWiring;
  onChange: (field: AutomationParameterField, value: unknown) => void;
  onError: (error: string) => void;
}) {
  return (
    <div
      className="automation-parameter-schema-form"
      data-xgc-role="automation-parameter-schema-form"
      data-xgc-id={roleId}
    >
      {fields.map((field) => {
        if (!isRenderableAutomationParameterField(field)) {
          return (
            <UnsupportedParameterField
              key={field.name}
              roleId={roleId}
              field={field}
              value={values[field.name]}
            />
          );
        }
        const target = expressions?.bindingTarget(field) ?? `/${field.name}`;
        return (
          <AutomationCatalogParameterField
            key={field.name}
            nodeId={roleId}
            name={field.name}
            property={automationCallInputProperty(field)}
            required={Boolean(field.required)}
            value={values[field.name]}
            executionTargetId={executionTargetId}
            target={target}
            binding={expressions?.bindingFor(field)}
            expressionBindingsEnabled={Boolean(expressions)}
            readOnly={readOnly}
            onChange={(value) => onChange(field, value)}
            onModeChange={(mode) => expressions?.onModeChange(field, mode)}
            onExpressionChange={(bindingTarget, expression) => (
              expressions?.onExpressionChange(bindingTarget, expression)
            )}
            onError={onError}
          />
        );
      })}
    </div>
  );
}

/**
 * A field whose declared kind this build cannot edit. It is shown, named, and
 * reported as an error with its current value as read-only JSON: the operator
 * can see what is configured and knows the form is not the place to change it,
 * instead of the field vanishing from the drawer.
 */
function UnsupportedParameterField({ roleId,field,value }: {
  roleId: string;
  field: AutomationParameterField;
  value: unknown;
}) {
  const label = field.label || field.name;
  const message = unsupportedAutomationParameterMessage(field);
  const controlId = `automation-unsupported-parameter-${roleId}-${field.name}`;
  return (
    <FormField
      className="automation-node-parameter-field"
      label={label}
      description={message}
      htmlFor={controlId}
      dataXgcRole="automation-parameter-unsupported"
      dataXgcId={`${roleId}:${field.name}`}
    >
      <TextareaControl
        id={controlId}
        key={JSON.stringify(value ?? null)}
        defaultValue={JSON.stringify(value ?? null, null, 2)}
        readOnly
        spellCheck={false}
      />
    </FormField>
  );
}
