import type { AutomationJSONSchema } from './automationDefinitionContracts';

export type AutomationRuntimeRow = {
  path: string;
  segments: Array<string | number>;
  type: string;
  value: string;
};

export const automationRuntimeRowLimit = 1_000;

export function flattenRuntimeValue(value: unknown) {
  const rows: AutomationRuntimeRow[] = [];
  const pending: Array<{ path: string;segments: Array<string | number>;value: unknown }> = [{ path: '$',segments: [],value }];
  while (pending.length > 0 && rows.length < automationRuntimeRowLimit) {
    const current = pending.pop();
    if (!current) break;
    rows.push({ path: current.path,segments: current.segments,type: runtimeType(current.value),value: runtimePreview(current.value) });
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ path: `${current.path}[${index}]`,segments: [...current.segments,index],value: current.value[index] });
      }
    } else if (current.value && typeof current.value === 'object') {
      const entries = Object.entries(current.value as Record<string,unknown>);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, item] = entries[index];
        pending.push({ path: runtimeChildPath(current.path, key),segments: [...current.segments,key],value: item });
      }
    }
  }
  return { rows,truncated: pending.length > 0 };
}
export function flattenRuntimeSchema(schema: AutomationJSONSchema) {
  const rows: AutomationRuntimeRow[] = [];
  const pending: Array<{ path: string;segments: Array<string | number>;schema: AutomationJSONSchema }> = [
    { path: '$',segments: [],schema },
  ];
  while (pending.length > 0 && rows.length < automationRuntimeRowLimit) {
    const current = pending.pop();
    if (!current) break;
    const type = schemaType(current.schema);
    rows.push({ path: current.path,segments: current.segments,type,value: schemaPreview(current.schema) });
    if (type === 'array' && isRecord(current.schema.items)) {
      pending.push({ path: `${current.path}[0]`,segments: [...current.segments,0],schema: current.schema.items });
    }
    if (isRecord(current.schema.properties)) {
      const entries = Object.entries(current.schema.properties)
        .filter((entry): entry is [string,AutomationJSONSchema] => isRecord(entry[1]));
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, child] = entries[index];
        pending.push({ path: runtimeChildPath(current.path, key),segments: [...current.segments,key],schema: child });
      }
    }
  }
  return { rows,truncated: pending.length > 0 };
}

function schemaType(schema: AutomationJSONSchema) {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) {
    return schema.type.filter((entry): entry is string => typeof entry === 'string').join(' | ') || 'unknown';
  }
  if (isRecord(schema.properties)) return 'object';
  if (isRecord(schema.items)) return 'array';
  return 'unknown';
}

function schemaPreview(schema: AutomationJSONSchema) {
  if ('default' in schema) return runtimePreview(schema.default);
  if (typeof schema.description === 'string') return schema.description;
  if (typeof schema.title === 'string') return schema.title;
  return '';
}

function runtimeChildPath(parent: string, key: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function runtimeType(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function runtimePreview(value: unknown) {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (value && typeof value === 'object') {
    const count = Object.keys(value as Record<string,unknown>).length;
    return `${count} field${count === 1 ? '' : 's'}`;
  }
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  return String(value);
}

export function runtimeJSON(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
