import type {
  AutomationEdge,
  AutomationNode,
} from './automationDefinitionContracts';

export function initialParameters(schema: Record<string,unknown>) {
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []);
  return Object.fromEntries(Object.entries(automationSchemaProperties(schema)).flatMap(([name, property]) => {
    if (property.readOnly === true) return [];
    if ('default' in property) return [[name,structuredClone(property.default)]];
    if (!required.has(name)) return [];
    switch (property.type) {
      case 'boolean': return [[name,false]];
      case 'integer':
      case 'number': return [[name,typeof property.minimum === 'number' ? property.minimum : 0]];
      case 'object': return [[name,{}]];
      case 'array': return [[name,[]]];
      default: return [[name,'']];
    }
  }));
}

export function uniqueNodeId(nodes: AutomationNode[], kind: string) {
  const base = kind.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node';
  let id = base;
  let suffix = 2;
  while (nodes.some((node) => node.id === id)) id = `${base}-${suffix++}`;
  return id;
}

export function uniqueEdgeId(edges: AutomationEdge[], from: string, to: string) {
  const base = `${from}-${to}`;
  let id = base;
  let suffix = 2;
  while (edges.some((edge) => edge.id === id)) id = `${base}-${suffix++}`;
  return id;
}

export function parameterBindingTarget(parameterPath: 'root' | 'parameters', name: string) {
  const property = name.replace(/~/g, '~0').replace(/\//g, '~1');
  return parameterPath === 'parameters' ? `/parameters/${property}` : `/${property}`;
}

export function automationSchemaProperties(schema?: Record<string,unknown>) {
  return isRecord(schema?.properties) ? schema.properties as Record<string,Record<string,unknown>> : {};
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
