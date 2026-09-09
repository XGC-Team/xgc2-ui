import {
  AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH,
  AUTOMATION_SCHEMA_VERSION,
  AUTOMATION_STICKY_NOTE_DEFAULT_HEIGHT,
  AUTOMATION_STICKY_NOTE_DEFAULT_WIDTH,
} from './automationDefinitionContracts';
import type {
  AutomationAdmission,
  AutomationAction,
  AutomationConcurrencyAppliesTo,
  AutomationConcurrencyConflict,
  AutomationConcurrencyScope,
  AutomationDocument,
  AutomationEdge,
  AutomationNode,
  AutomationParameterBinding,
  AutomationParameterField,
  AutomationParameterSchema,
  AutomationParameterValueSchema,
  AutomationSpec,
  AutomationStickyNote,
  AutomationTargetPolicy,
} from './automationDefinitionContracts';

/**
 * A new workflow starts with one visible manual entry and one public Action.
 * Inputs belong to that Action, never to the Automation root.
 */
export function newAutomationSpec(
  name = '',
  executionTargetId = 'local',
  actionInputSchema: AutomationParameterSchema = { fields: [] },
): AutomationSpec {
  const entry = { ...newAutomationNode('trigger.manual', {}, 'Manual start', 2),id: 'manual',position: { x: 0,y: 100 } };
  return {
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    metadata: { name,description: '',tags: [] },
    targetPolicy: { mode: 'fixed',executionTargetId },
    actions: [{
      id: 'run',version: 1,label: 'Run',entryNodeId: entry.id,kind: 'command',
      inputSchema: { ...actionInputSchema,fields: [...actionInputSchema.fields] },
      resultSchema: { fields: [] },controls: ['cancel'],admission: {},
      requiredCapabilities: [],projectionContracts: [],
    }],
    nodes: [entry],edges: [],stickyNotes: [],
  };
}

export function newAutomationStickyNote(id = 'sticky-note', position = { x: 0,y: 0 }): AutomationStickyNote {
  return {
    id,content: "## I'm a note\n\n**Double-click** to edit me.",position: { ...position },
    width: AUTOMATION_STICKY_NOTE_DEFAULT_WIDTH,height: AUTOMATION_STICKY_NOTE_DEFAULT_HEIGHT,
  };
}

export function newAutomationNode(kind: string, parameters: Record<string,unknown> = {}, label = kind, typeVersion = 1): AutomationNode {
  return {
    id: kind.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node',
    displayName: limitAutomationNodeDisplayName(label),kind,typeVersion,parameters: structuredClone(parameters),
    retry: { maxAttempts: 1,initialBackoff: 1_000_000_000,maxBackoff: 60_000_000_000 },
  };
}

export function limitAutomationNodeDisplayName(value: string) {
  return [...value].slice(0, AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH).join('');
}

export function cloneAutomationSpec(spec: AutomationSpec): AutomationSpec {
  return structuredClone(hydrateAutomationSpec(spec));
}

export function automationActionById(spec: AutomationSpec, actionId: string) {
  return spec.actions.find((action) => action.id === actionId.trim());
}

export function automationActionForEntry(spec: AutomationSpec, entryNodeId?: string) {
  const entry = entryNodeId?.trim();
  return (entry ? spec.actions.find((action) => action.entryNodeId === entry) : undefined)
    ?? (spec.actions.length === 1 ? spec.actions[0] : undefined);
}

export function automationPrimaryAction(spec: AutomationSpec) {
  return spec.actions[0];
}

export function automationManualAction(spec: AutomationSpec) {
  const manualEntries = new Set(spec.nodes
    .filter((node) => node.kind === 'trigger.manual')
    .map((node) => node.id));
  const candidates = spec.actions.filter((action) => manualEntries.has(action.entryNodeId));
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function normalizeAutomationSpec(spec: AutomationSpec): AutomationSpec {
  const hydrated = hydrateAutomationSpec(spec);
  return {
    schemaVersion: hydrated.schemaVersion,
    metadata: {
      name: hydrated.metadata.name.trim(),description: hydrated.metadata.description.trim(),
      tags: uniqueStrings(hydrated.metadata.tags),
    },
    targetPolicy: normalizeAutomationTargetPolicy(hydrated.targetPolicy),
    actions: [...hydrated.actions].map(normalizeAutomationAction).sort((left, right) => left.id.localeCompare(right.id)),
    nodes: [...hydrated.nodes].map((node) => {
      const parameterBindings = normalizeParameterBindings(node.parameterBindings);
      return {
        id: node.id.trim(),displayName: node.displayName.trim(),kind: node.kind.trim(),typeVersion: node.typeVersion,
        parameters: structuredClone(node.parameters),retry: { ...node.retry },
        ...(node.effectRole ? { effectRole: node.effectRole } : {}),
        position: node.position ? { ...node.position } : undefined,
        ...(parameterBindings.length > 0 ? { parameterBindings } : {}),
      };
    }).sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...hydrated.edges].map((edge) => ({
      id: edge.id.trim(),from: edge.from.trim(),to: edge.to.trim(),condition: edge.condition,
      sourcePort: edge.sourcePort?.trim() || undefined,route: edge.route?.trim() || undefined,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    stickyNotes: [...hydrated.stickyNotes].map((note) => ({
      ...note,id: note.id.trim(),content: note.content,position: { ...note.position },
    })).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function normalizeAutomationDocument(document: AutomationDocument): AutomationDocument {
  if (!document?.head || !document.branch || !document.spec) throw new Error('Invalid Automation document response.');
  const spec = hydrateAutomationSpec(document.spec);
  if (spec.schemaVersion !== AUTOMATION_SCHEMA_VERSION) throw new Error(`Unsupported Automation schema version ${spec.schemaVersion}.`);
  return { ...document,head: { ...document.head,tags: stringArray(document.head.tags) },spec };
}

export function hydrateAutomationSpec(spec: AutomationSpec | null | undefined): AutomationSpec {
  const source = spec ?? undefined;
  const metadata = source?.metadata;
  return {
    schemaVersion: typeof source?.schemaVersion === 'number' ? source.schemaVersion : 0,
    metadata: {
      name: typeof metadata?.name === 'string' ? metadata.name : '',
      description: typeof metadata?.description === 'string' ? metadata.description : '',
      tags: stringArray(metadata?.tags),
    },
    targetPolicy: hydrateAutomationTargetPolicy(source?.targetPolicy),
    actions: arrayOf<AutomationAction>(source?.actions).map(hydrateAutomationAction),
    nodes: arrayOf<AutomationNode>(source?.nodes).map((node) => {
      const parameterBindings = arrayOf<AutomationParameterBinding>(node.parameterBindings).map((binding) => ({
        target: typeof binding?.target === 'string' ? binding.target : '',
        expression: typeof binding?.expression === 'string' ? binding.expression : '',
        language: (binding?.language === 'xgc-expression-v2' ? binding.language : '') as AutomationParameterBinding['language'],
      }));
      return {
        id: typeof node.id === 'string' ? node.id : '',
        displayName: typeof node.displayName === 'string' ? node.displayName : '',
        kind: typeof node.kind === 'string' ? node.kind : '',
        typeVersion: typeof node.typeVersion === 'number' ? node.typeVersion : 0,
        ...(node.effectRole === 'session-sensitive' || node.effectRole === 'bootstrap-provider'
          ? { effectRole: node.effectRole }
          : {}),
        parameters: node.parameters && typeof node.parameters === 'object' && !Array.isArray(node.parameters)
          ? structuredClone(node.parameters)
          : {},
        ...(parameterBindings.length > 0 ? { parameterBindings } : {}),
        retry: {
          maxAttempts: Number(node.retry?.maxAttempts),
          initialBackoff: Number(node.retry?.initialBackoff),
          maxBackoff: Number(node.retry?.maxBackoff),
        },
        ...(node.position ? { position: { x: Number(node.position.x),y: Number(node.position.y) } } : {}),
      };
    }),
    edges: arrayOf<AutomationEdge>(source?.edges).map((edge) => ({
      id: typeof edge.id === 'string' ? edge.id : '',
      from: typeof edge.from === 'string' ? edge.from : '',
      to: typeof edge.to === 'string' ? edge.to : '',
      ...(typeof edge.sourcePort === 'string' ? { sourcePort: edge.sourcePort } : {}),
      condition: edge.condition,
      ...(typeof edge.route === 'string' ? { route: edge.route } : {}),
    })),
    stickyNotes: arrayOf<AutomationStickyNote>(source?.stickyNotes).map((note) => ({
      id: typeof note.id === 'string' ? note.id : '',content: typeof note.content === 'string' ? note.content : '',
      position: { x: Number.isFinite(note.position?.x) ? note.position.x : 0,y: Number.isFinite(note.position?.y) ? note.position.y : 0 },
      width: Number.isFinite(note.width) ? note.width : AUTOMATION_STICKY_NOTE_DEFAULT_WIDTH,
      height: Number.isFinite(note.height) ? note.height : AUTOMATION_STICKY_NOTE_DEFAULT_HEIGHT,
    })),
  };
}

function hydrateAutomationAction(action: AutomationAction): AutomationAction {
  const inputSchema = action?.inputSchema;
  const resultSchema = action?.resultSchema;
  return {
    id: typeof action?.id === 'string' ? action.id : '',
    version: typeof action?.version === 'number' ? action.version : 0,
    label: typeof action?.label === 'string' ? action.label : '',
    ...(typeof action?.description === 'string' ? { description: action.description } : {}),
    entryNodeId: typeof action?.entryNodeId === 'string' ? action.entryNodeId : '',
    kind: action?.kind as AutomationAction['kind'],
    inputSchema: { ...inputSchema,fields: arrayOf<AutomationParameterField>(inputSchema?.fields) },
    resultSchema: { ...resultSchema,fields: arrayOf<AutomationParameterField>(resultSchema?.fields) },
    controls: stringArray(action?.controls) as AutomationAction['controls'],
    admission: hydrateAutomationAdmission(action?.admission),
    requiredCapabilities: stringArray(action?.requiredCapabilities),
    projectionContracts: stringArray(action?.projectionContracts),
  };
}

function normalizeAutomationAction(action: AutomationAction): AutomationAction {
  return {
    id: action.id.trim(),version: action.version,label: action.label.trim(),
    ...(action.description?.trim() ? { description: action.description.trim() } : {}),
    entryNodeId: action.entryNodeId.trim(),kind: action.kind,
    inputSchema: normalizeParameterSchema(action.inputSchema),
    resultSchema: normalizeParameterSchema(action.resultSchema),
    controls: uniqueStrings(action.controls) as AutomationAction['controls'],
    admission: normalizeAutomationAdmission(action.admission),
    requiredCapabilities: uniqueStrings(action.requiredCapabilities),
    projectionContracts: uniqueStrings(action.projectionContracts),
  };
}

function normalizeParameterSchema(schema: AutomationParameterSchema): AutomationParameterSchema {
  return {
    ...(schema.title?.trim() ? { title: schema.title.trim() } : {}),
    ...(schema.description?.trim() ? { description: schema.description.trim() } : {}),
    fields: [...schema.fields].map(normalizeParameterField).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function hydrateAutomationTargetPolicy(value: unknown): AutomationTargetPolicy {
  if (!isRecord(value)) return { mode: 'fixed',executionTargetId: '' };
  const executionTargetId = typeof value.executionTargetId === 'string' ? value.executionTargetId : '';
  if (value.mode === 'inherit') {
    return { mode: 'inherit',executionTargetId: executionTargetId as '' };
  }
  return {
    mode: (typeof value.mode === 'string' ? value.mode : 'fixed') as 'fixed',
    executionTargetId,
  };
}

function normalizeAutomationTargetPolicy(policy: AutomationTargetPolicy): AutomationTargetPolicy {
  const executionTargetId = policy.executionTargetId.trim();
  if (policy.mode === 'inherit') return { mode: 'inherit',executionTargetId: executionTargetId as '' };
  return { mode: policy.mode,executionTargetId };
}

export function normalizeAutomationAdmission(admission: AutomationAdmission): AutomationAdmission {
  const policy = admission.concurrency;
  if (!policy) return {};
  const keyExpression = policy.keyExpression?.trim() ?? '';
  return {
    concurrency: {
      scope: policy.scope,
      limit: policy.limit,
      onConflict: policy.onConflict,
      appliesTo: policy.appliesTo,
      ...((policy.scope === 'family' || policy.scope === 'key')
        ? { keyExpression: canonicalJSONPointer(keyExpression) ?? keyExpression }
        : {}),
    },
  };
}

function hydrateAutomationAdmission(value: unknown): AutomationAdmission {
  if (!isRecord(value) || value.concurrency === undefined) return {};
  if (!isRecord(value.concurrency)) {
    return { concurrency: invalidConcurrencyPolicy() };
  }
  const policy = value.concurrency;
  return {
    concurrency: {
      scope: (typeof policy.scope === 'string' ? policy.scope : '') as AutomationConcurrencyScope,
      limit: typeof policy.limit === 'number' ? policy.limit : 0,
      ...(typeof policy.keyExpression === 'string' ? { keyExpression: policy.keyExpression } : {}),
      onConflict: (typeof policy.onConflict === 'string' ? policy.onConflict : '') as AutomationConcurrencyConflict,
      appliesTo: (typeof policy.appliesTo === 'string' ? policy.appliesTo : '') as AutomationConcurrencyAppliesTo,
    },
  };
}

function invalidConcurrencyPolicy() {
  return {
    scope: '' as AutomationConcurrencyScope,
    limit: 0,
    onConflict: '' as AutomationConcurrencyConflict,
    appliesTo: '' as AutomationConcurrencyAppliesTo,
  };
}

function canonicalJSONPointer(value: string) {
  if (!value.startsWith('/')) return undefined;
  const tokens: string[] = [];
  for (const raw of value.slice(1).split('/')) {
    let decoded = '';
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] !== '~') {
        decoded += raw[index];
        continue;
      }
      const escaped = raw[index + 1];
      if (escaped !== '0' && escaped !== '1') return undefined;
      decoded += escaped === '0' ? '~' : '/';
      index += 1;
    }
    if (!decoded) return undefined;
    tokens.push(decoded.replaceAll('~', '~0').replaceAll('/', '~1'));
  }
  return `/${tokens.join('/')}`;
}

function normalizeParameterField(field: AutomationParameterField): AutomationParameterField {
  return {
    name: field.name.trim(),label: field.label?.trim() || undefined,description: field.description?.trim() || undefined,
    ...normalizeParameterValue(field),required: Boolean(field.required) || undefined,
  };
}

function normalizeParameterValue(value: AutomationParameterValueSchema): AutomationParameterValueSchema {
  const normalized: AutomationParameterValueSchema = {
    kind: value.kind,sensitive: Boolean(value.sensitive) || undefined,
  };
  if (value.kind === 'string' && value.string) {
    const pathKind = value.string.pathKind === 'file' || value.string.pathKind === 'directory'
      ? value.string.pathKind
      : undefined;
    const fileExtensions = uniqueStrings(value.string.fileExtensions ?? [])
      .filter((extension) => /^\.[a-z0-9]+$/i.test(extension))
      .map((extension) => extension.toLowerCase());
    normalized.string = {
      ...(value.string.default === undefined ? {} : { default: value.string.default }),
      enum: uniqueStrings(value.string.enum ?? []),
      ...(pathKind ? { pathKind } : {}),
      ...(pathKind === 'file' && fileExtensions.length > 0 ? { fileExtensions } : {}),
    };
  }
  if (value.kind === 'boolean' && value.boolean) normalized.boolean = { ...value.boolean };
  if (value.kind === 'integer' && value.integer) normalized.integer = { ...value.integer };
  if (value.kind === 'number' && value.number) normalized.number = { ...value.number };
  if (value.kind === 'object' && value.object) normalized.object = {
    fields: value.object.fields.map(normalizeParameterField).sort((left, right) => left.name.localeCompare(right.name)),
  };
  if (value.kind === 'array' && value.array) normalized.array = {
    items: normalizeParameterValue(value.array.items),
    ...(value.array.minItems === undefined ? {} : { minItems: value.array.minItems }),
    ...(value.array.maxItems === undefined ? {} : { maxItems: value.array.maxItems }),
    ...(value.array.default === undefined ? {} : { default: structuredClone(value.array.default) }),
  };
  return normalized;
}

function normalizeParameterBindings(bindings: AutomationParameterBinding[] | undefined) {
  return (bindings ?? []).map((binding) => ({
    target: binding.target.trim(),expression: binding.expression,language: binding.language,
  })).sort((left, right) => left.target.localeCompare(right.target));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
