import type {
  AutomationNode,
  AutomationParameterField,
  AutomationParameterValueSchema,
} from './automationDefinitionContracts';

export const AUTOMATION_CALL_TYPE_VERSION = 4;

const automationCallPinNames = new Set([
  'targetCommitId',
  'targetConfigDigest',
  'targetExecutionPlanDigest',
  'targetRegistryDigest',
  'targetDefinitionDigest',
  'targetVersion',
]);

export function usesAutomationCallInputs(node: Pick<AutomationNode,'kind' | 'typeVersion'>) {
  return node.kind === 'automation.call' && node.typeVersion === AUTOMATION_CALL_TYPE_VERSION;
}

export function automationCallInputProperty(field: AutomationParameterField): Record<string,unknown> {
  return {
    ...automationCallValueProperty(field),
    title: field.label || field.name,
    ...(field.description ? { description: field.description } : {}),
  };
}

export function initialAutomationCallInputs(fields: readonly AutomationParameterField[]) {
  return Object.fromEntries(fields.map((field) => [field.name,automationCallValueFallback(field)]));
}

export function clearAutomationCallTargetPins(parameters: Record<string,unknown>) {
  return Object.fromEntries(Object.entries(parameters)
    .filter(([name]) => !automationCallPinNames.has(name)));
}

function automationCallValueProperty(value: AutomationParameterValueSchema): Record<string,unknown> {
  const common = value.sensitive ? { sensitive: true } : {};
  switch (value.kind) {
    case 'boolean':
      return {
        type: 'boolean',
        ...common,
        ...(value.boolean?.default === undefined ? {} : { default: value.boolean.default }),
      };
    case 'integer':
      return {
        type: 'integer',
        ...common,
        ...(value.integer?.default === undefined ? {} : { default: value.integer.default }),
        ...(value.integer?.minimum === undefined ? {} : { minimum: value.integer.minimum }),
        ...(value.integer?.maximum === undefined ? {} : { maximum: value.integer.maximum }),
      };
    case 'number':
      return {
        type: 'number',
        ...common,
        ...(value.number?.default === undefined ? {} : { default: value.number.default }),
        ...(value.number?.minimum === undefined ? {} : { minimum: value.number.minimum }),
        ...(value.number?.maximum === undefined ? {} : { maximum: value.number.maximum }),
      };
    case 'object': {
      const fields = value.object?.fields ?? [];
      return {
        type: 'object',
        ...common,
        properties: Object.fromEntries(fields.map((field) => [field.name,automationCallInputProperty(field)])),
        required: fields.filter((field) => field.required).map((field) => field.name),
        additionalProperties: false,
      };
    }
    case 'array':
      return {
        type: 'array',
        ...common,
        items: automationCallValueProperty(value.array?.items ?? { kind: 'string' }),
        ...(value.array?.minItems === undefined ? {} : { minItems: value.array.minItems }),
        ...(value.array?.maxItems === undefined ? {} : { maxItems: value.array.maxItems }),
        ...(Array.isArray(value.array?.default) ? { default: structuredClone(value.array.default) } : {}),
      };
    default:
      return {
        type: 'string',
        ...common,
        ...(value.string?.default === undefined ? {} : { default: value.string.default }),
        ...(value.string?.enum?.length ? { enum: value.string.enum } : {}),
        ...(value.string?.pathKind === 'file' || value.string?.pathKind === 'directory'
          ? { 'x-xgc-path-kind': value.string.pathKind }
          : {}),
        ...(value.string?.fileExtensions?.length
          ? { 'x-xgc-file-extensions': [...value.string.fileExtensions] }
          : {}),
      };
  }
}

function automationCallValueFallback(value: AutomationParameterValueSchema): unknown {
  switch (value.kind) {
    case 'boolean':
      return value.boolean?.default ?? false;
    case 'integer':
      return value.integer?.default ?? boundedNumber(value.integer?.minimum, value.integer?.maximum, true);
    case 'number':
      return value.number?.default ?? boundedNumber(value.number?.minimum, value.number?.maximum, false);
    case 'object':
      return Object.fromEntries((value.object?.fields ?? [])
        .map((field) => [field.name,automationCallValueFallback(field)]));
    case 'array':
      return Array.isArray(value.array?.default) ? structuredClone(value.array.default) : [];
    default:
      return value.string?.default ?? value.string?.enum?.[0] ?? '';
  }
}

function boundedNumber(minimum: number | undefined, maximum: number | undefined, integer: boolean) {
  let value = minimum ?? 0;
  if (maximum !== undefined && value > maximum) value = maximum;
  if (!integer) return value;
  if (minimum !== undefined) return Math.ceil(value);
  if (maximum !== undefined && maximum < 0) return Math.floor(maximum);
  return 0;
}
