import type { AutomationParameterField } from './automationDefinitionContracts';

export function automationParameterLabel(name: string, property: Record<string,unknown>) {
  if (typeof property.title === 'string' && property.title.trim()) return property.title.trim();
  const knownLabels: Record<string,string> = { automationId: 'Automation',inputMode: 'Input mode' };
  if (knownLabels[name]) return knownLabels[name];
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : name;
}

export function serializeParameters(fields: AutomationParameterField[], values: Record<string,unknown>) {
  const result: Record<string,unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if ((value === '' || value === undefined || value === null) && field.kind !== 'boolean') {
      if (field.required) throw new Error(`${field.label || field.name} is required.`);
      continue;
    }
    if (field.kind === 'boolean') {
      result[field.name] = Boolean(value);
      continue;
    }
    if (field.kind === 'integer' || field.kind === 'number') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || (field.kind === 'integer' && !Number.isInteger(parsed))) {
        throw new Error(`${field.label || field.name} must be a valid ${field.kind}.`);
      }
      const bounds = field.kind === 'integer' ? field.integer : field.number;
      if (bounds?.minimum !== undefined && parsed < bounds.minimum) throw new Error(`${field.label || field.name} is below ${bounds.minimum}.`);
      if (bounds?.maximum !== undefined && parsed > bounds.maximum) throw new Error(`${field.label || field.name} exceeds ${bounds.maximum}.`);
      result[field.name] = parsed;
      continue;
    }
    if (field.kind === 'object' || field.kind === 'array') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(value));
      } catch {
        throw new Error(`${field.label || field.name} must be valid JSON.`);
      }
      if (field.kind === 'object' ? parsed === null || Array.isArray(parsed) || typeof parsed !== 'object' : !Array.isArray(parsed)) {
        throw new Error(`${field.label || field.name} must be a JSON ${field.kind}.`);
      }
      result[field.name] = parsed;
      continue;
    }
    const text = String(value);
    if (field.string?.enum?.length && !field.string.enum.includes(text)) {
      throw new Error(`${field.label || field.name} must be one of the registered values.`);
    }
    result[field.name] = text;
  }
  return result;
}
