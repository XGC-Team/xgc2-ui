import { FormField,SwitchControl } from '../../components/FormPrimitives';
import { InputControl } from '../../components/controls/TextControls';
import {
  groundStationFormFieldLabel as fieldLabel,
  type GroundStationDecisionFormState,
} from './groundStationDecisionFormState';
import type {
  GroundStationDecisionForm,
  GroundStationFormValue,
} from './groundStationInteractionTypes';

export function GroundStationDecisionFormFields({
  interactionId,
  form,
  state,
  disabled,
}: {
  interactionId: string;
  form: GroundStationDecisionForm;
  state: GroundStationDecisionFormState;
  disabled: boolean;
}) {
  return (
    <div
      className="xgc-ground-station-decision-form"
      data-xgc-role="ground-station-decision-form"
      data-xgc-id={interactionId}
    >
      {form.fields.map((field) => {
        const value = state.values[field.name];
        if (field.kind === 'boolean') {
          return (
            <SwitchControl
              key={field.name}
              checked={value === true}
              label={fieldLabel(field)}
              disabled={disabled}
              dataXgcRole="ground-station-decision-form-field"
              dataXgcId={`${interactionId}:${field.name}`}
              onChange={(next) => state.setValue(field, next)}
            />
          );
        }
        return (
          <FormField
            key={field.name}
            label={fieldLabel(field)}
            required={Boolean(field.required)}
            dataXgcRole="ground-station-decision-form-field"
            dataXgcId={`${interactionId}:${field.name}`}
          >
            <InputControl
              type={field.kind === 'number' ? 'number' : 'text'}
              value={value === undefined ? '' : String(value)}
              disabled={disabled}
              aria-label={fieldLabel(field)}
              onChange={(next) => state.setValue(field, field.kind === 'number' ? numberOrText(next) : next)}
            />
          </FormField>
        );
      })}
    </div>
  );
}

// A half-typed number stays visible as text so the operator can keep editing;
// collect() is what refuses to submit a value that is still not a number.
function numberOrText(raw: string): GroundStationFormValue {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : raw;
}
