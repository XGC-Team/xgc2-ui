import { automationSchemaProperties } from './automationDefinitionEditorModel';

const fixedOnlyAutomationParameterNames = new Set([
  'definitionId',
  'definitionDigest',
  'targetCommitId',
  'targetConfigDigest',
  'targetDefinitionDigest',
  'targetVersion',
]);

export function automationParameterAllowsExpression(name: string, property: Record<string,unknown>) {
  return property['x-xgc-expression'] === true
    && property.readOnly !== true
    && property.sensitive !== true
    && !fixedOnlyAutomationParameterNames.has(name);
}

export function automationParameterValueMatchesSchema(value: unknown, property: Record<string,unknown>) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(property.enum)
    && property.enum.length > 0
    && !property.enum.some((candidate) => sameJSONValue(candidate, value))) return false;
  switch (property.type) {
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'object': return isAutomationParameterRecord(value);
    case 'array': return Array.isArray(value);
    default: return typeof value === 'string';
  }
}

export function automationFixedParameterFallback(property: Record<string,unknown>): unknown {
  if ('default' in property) return structuredClone(property.default);
  if (Array.isArray(property.enum) && property.enum.length > 0) return structuredClone(property.enum[0]);
  switch (property.type) {
    case 'boolean': return false;
    case 'integer': return boundedNumericFallback(property, true);
    case 'number': return boundedNumericFallback(property, false);
    case 'object': {
      const required = new Set(Array.isArray(property.required)
        ? property.required.filter((name): name is string => typeof name === 'string')
        : []);
      return Object.fromEntries(Object.entries(automationSchemaProperties(property))
        .filter(([name]) => required.has(name))
        .map(([name, child]) => [name,automationFixedParameterFallback(child)]));
    }
    case 'array': return [];
    default: return '';
  }
}

export function isRequiredAutomationParameter(schema: Record<string,unknown> | undefined, name: string) {
  return Array.isArray(schema?.required) && schema.required.includes(name);
}

export function isAutomationParameterRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedNumericFallback(property: Record<string,unknown>, integer: boolean) {
  const minimum = typeof property.minimum === 'number' && Number.isFinite(property.minimum)
    ? property.minimum
    : undefined;
  const maximum = typeof property.maximum === 'number' && Number.isFinite(property.maximum)
    ? property.maximum
    : undefined;
  let value = minimum ?? 0;
  if (maximum !== undefined && value > maximum) value = maximum;
  return integer
    ? (minimum !== undefined ? Math.ceil(value) : maximum !== undefined && maximum < 0 ? Math.floor(maximum) : 0)
    : value;
}

function sameJSONValue(left: unknown, right: unknown) {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}
