import { useState } from 'react';
import { useGroundStationText } from './groundStationMessages';
import type {
  GroundStationDecisionForm,
  GroundStationFormField,
  GroundStationFormValue,
  GroundStationFormValues,
} from './groundStationInteractionTypes';

export type GroundStationDecisionFormState = {
  values: GroundStationFormValues;
  setValue: (field: GroundStationFormField, value: GroundStationFormValue) => void;
  /** Submittable values, or an error message when a required answer is missing. */
  collect: () => { values: GroundStationFormValues } | { error: string };
};

/**
 * Holds the operator's in-progress answers for one decision form. The state is
 * keyed by the interaction revision so a superseded prompt never carries stale
 * answers into the next one.
 */
export function useGroundStationDecisionForm(
  form: GroundStationDecisionForm | undefined,
  identity: string,
): GroundStationDecisionFormState {
  const t = useGroundStationText();
  const defaults = initialFormValues(form);
  const [values, setValues] = useState<GroundStationFormValues>(defaults);
  const [appliedIdentity, setAppliedIdentity] = useState(identity);
  if (appliedIdentity !== identity) {
    setAppliedIdentity(identity);
    setValues(defaults);
  }
  return {
    values,
    setValue: (field, value) => setValues((current) => ({ ...current,[field.name]: value })),
    collect: () => {
      if (!form) return { values: {} };
      const submitted: GroundStationFormValues = {};
      for (const field of form.fields) {
        const value = values[field.name];
        const blank = value === undefined || (typeof value === 'string' && value.trim() === '');
        if (blank) {
          if (field.required) return { error: t('{field} is required.', { field: groundStationFormFieldLabel(field) }) };
          continue;
        }
        if (field.kind === 'string') {
          submitted[field.name] = String(value).trim();
          continue;
        }
        if (field.kind === 'number') {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return { error: t('{field} must be a number.', { field: groundStationFormFieldLabel(field) }) };
          }
          submitted[field.name] = value;
          continue;
        }
        submitted[field.name] = value === true;
      }
      return { values: submitted };
    },
  };
}

function initialFormValues(form: GroundStationDecisionForm | undefined): GroundStationFormValues {
  if (!form) return {};
  const values: GroundStationFormValues = {};
  for (const field of form.fields) {
    if (field.default !== undefined) values[field.name] = field.default;
    else if (field.kind === 'boolean') values[field.name] = false;
  }
  return values;
}

export function groundStationFormFieldLabel(field: GroundStationFormField) {
  return field.label || field.name;
}
