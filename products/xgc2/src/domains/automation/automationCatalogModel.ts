import {
  AUTOMATION_NODE_TRAITS,
  type AutomationJSONSchema,
  type AutomationNodeCatalogEntry,
  type AutomationNodeOutputPort,
  type AutomationNodeTrait,
} from './automationDefinitionContracts';

const nodeTraits = new Set<string>(AUTOMATION_NODE_TRAITS);
const catalogEntryKeys = new Set([
  'kind','typeVersion','label','category','traits','parameterSchema','outputSchema','outputPorts',
  'canCompensate',
]);

export function parseAutomationNodeCatalog(value: unknown, path: string): AutomationNodeCatalogEntry[] {
  if (!Array.isArray(value)) throw new Error(`Expected an array response from ${path}`);
  return value.map((entry, index) => parseAutomationNodeCatalogEntry(entry, `${path}[${index}]`));
}

export function parseAutomationNodeCatalogEntry(value: unknown, path = 'Automation node catalog entry'): AutomationNodeCatalogEntry {
  if (!isObject(value)) throw invalidCatalogEntry(path, 'must be an object');
  for (const key of Object.keys(value)) {
    if (!catalogEntryKeys.has(key)) throw invalidCatalogEntry(path, `contains unknown property "${key}"`);
  }
  if (typeof value.kind !== 'string') throw invalidCatalogEntry(path, 'kind must be a string');
  if (!Number.isInteger(value.typeVersion) || (value.typeVersion as number) < 1) {
    throw invalidCatalogEntry(path, 'typeVersion must be a positive integer');
  }
  if (typeof value.label !== 'string') throw invalidCatalogEntry(path, 'label must be a string');
  if (typeof value.category !== 'string') throw invalidCatalogEntry(path, 'category must be a string');
  const traits = parseNodeTraits(value.traits, path);
  if (!isObject(value.parameterSchema)) throw invalidCatalogEntry(path, 'parameterSchema must be an object');
  if (value.outputSchema !== undefined && !isObject(value.outputSchema)) {
    throw invalidCatalogEntry(path, 'outputSchema must be an object when present');
  }
  const outputPorts = parseOutputPorts(value.outputPorts, path);
  validateOptionalBoolean(value, 'canCompensate', path);

  return {
    kind: value.kind,
    typeVersion: value.typeVersion as number,
    label: value.label,
    category: value.category,
    traits,
    parameterSchema: value.parameterSchema as AutomationJSONSchema,
    ...(value.outputSchema === undefined ? {} : { outputSchema: value.outputSchema as AutomationJSONSchema }),
    ...(value.outputPorts === undefined ? {} : { outputPorts }),
    ...(value.canCompensate === undefined ? {} : { canCompensate: value.canCompensate as boolean }),
  };
}

function parseNodeTraits(value: unknown, path: string): AutomationNodeTrait[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidCatalogEntry(path, 'traits must be a non-empty array');
  }
  const seen = new Set<string>();
  return value.map((trait, index) => {
    if (typeof trait !== 'string' || !nodeTraits.has(trait)) {
      throw invalidCatalogEntry(path, `traits contains invalid value ${JSON.stringify(trait)}`);
    }
    if (seen.has(trait)) throw invalidCatalogEntry(path, `traits contains duplicate value "${trait}"`);
    if (index > 0 && (value[index - 1] as string) > trait) {
      throw invalidCatalogEntry(path, 'traits must be sorted lexicographically');
    }
    seen.add(trait);
    return trait as AutomationNodeTrait;
  });
}

function parseOutputPorts(value: unknown, path: string): AutomationNodeOutputPort[] | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value)) throw invalidCatalogEntry(path, 'outputPorts must be an array or null');
  return value.map((port, index) => {
    if (!isObject(port) || Object.keys(port).some((key) => key !== 'id' && key !== 'label')) {
      throw invalidCatalogEntry(`${path}.outputPorts[${index}]`, 'must contain only id and label');
    }
    if (typeof port.id !== 'string' || typeof port.label !== 'string') {
      throw invalidCatalogEntry(`${path}.outputPorts[${index}]`, 'id and label must be strings');
    }
    return { id: port.id,label: port.label };
  });
}

function validateOptionalBoolean(value: Record<string,unknown>, key: string, path: string) {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') {
    throw invalidCatalogEntry(path, `${key} must be a boolean when present`);
  }
}

function isObject(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidCatalogEntry(path: string, reason: string) {
  return new Error(`Invalid Automation node catalog response at ${path}: ${reason}.`);
}
