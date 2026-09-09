import {
  AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH,
  AUTOMATION_RETURN_KIND,
  AUTOMATION_SCHEMA_VERSION,
  AUTOMATION_STICKY_NOTE_MAX_CONTENT_BYTES,
  AUTOMATION_STICKY_NOTE_MAX_SIZE,
  AUTOMATION_STICKY_NOTE_MIN_HEIGHT,
  AUTOMATION_STICKY_NOTE_MIN_WIDTH,
} from './automationDefinitionContracts';
import {
  AUTOMATION_CALL_TRIGGER_KIND,
  isAutomationTriggerKind,
} from './automationTriggerContracts';
import type {
  AutomationAction,
  AutomationAdmission,
  AutomationNodeCatalogEntry,
  AutomationParameterField,
  AutomationParameterSchema,
  AutomationParameterValueSchema,
  AutomationSpec,
} from './automationDefinitionContracts';
import { validateParameterBindings } from './automationBindingValidation';
import { validateCalledAutomationReturnPaths } from './automationCalledFlowValidation';
import { graphHasCycle } from './automationGraphModel';
import {
  automationNodeEditorFromComposition,
  automationNodeGraphSemanticsFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

export function validateAutomationSpec(
  spec: AutomationSpec,
  catalog?: AutomationNodeCatalogEntry[],
  nodeComposition?: AutomationNodeWebComposition,
): string {
  if (spec.schemaVersion !== AUTOMATION_SCHEMA_VERSION) return `Unsupported Automation schema version ${spec.schemaVersion}.`;
  if (!spec.metadata.name.trim()) return 'Automation name is required.';
  if (spec.targetPolicy.mode === 'fixed') {
    if (!spec.targetPolicy.executionTargetId.trim()) return 'Execution target is required.';
  } else if (spec.targetPolicy.mode === 'inherit') {
    if (spec.targetPolicy.executionTargetId.trim()) return 'Inherited target policy cannot contain an execution target.';
  } else {
    return `Unsupported Automation target policy ${JSON.stringify((spec.targetPolicy as { mode?: unknown }).mode)}.`;
  }
  if (spec.nodes.length === 0) return 'Add at least one trusted node.';
  const nodeIDs = new Set<string>();
  const trustedKinds = catalog ? new Set(catalog.map((entry) => entry.kind)) : undefined;
  const catalogByKind = new Map((catalog ?? []).map((entry) => [entry.kind,entry]));
  const catalogByKindAndVersion = new Map((catalog ?? []).map((entry) => [`${entry.kind}@${entry.typeVersion}`,entry]));
  for (const node of spec.nodes) {
    if (!validIdentifier(node.id)) return `Node ID "${node.id}" is invalid.`;
    if (nodeIDs.has(node.id)) return `Node ID "${node.id}" must be unique.`;
    nodeIDs.add(node.id);
    const displayName = node.displayName.trim();
    if (!displayName) return `Node ${node.id} requires a display name.`;
    if ([...displayName].length > AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH) {
      return `Node ${node.id} display name exceeds ${AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH} characters.`;
    }
    if (!node.kind.trim()) return `Node ${node.id} requires a kind.`;
    if (!Number.isInteger(node.typeVersion) || node.typeVersion < 1) return `Node ${node.id} requires a positive type version.`;
    // The catalog advertises the version used for newly created nodes. Older
    // pinned versions remain editable while Core retains their handler.
    if (trustedKinds && !trustedKinds.has(node.kind)) return `Node ${node.id} uses untrusted kind "${node.kind}".`;
    if (!Number.isInteger(node.retry.maxAttempts) || node.retry.maxAttempts < 1) return `Node ${node.id} retry attempts must be positive.`;
    if (!finiteNonNegative(node.retry.initialBackoff) || !finiteNonNegative(node.retry.maxBackoff)) return `Node ${node.id} retry backoff is invalid.`;
    if (node.retry.maxBackoff < node.retry.initialBackoff) return `Node ${node.id} maximum backoff is below its initial backoff.`;
    const bindingError = validateParameterBindings(node);
    if (bindingError) return bindingError;
    const catalogParameterError = validateCatalogNodeParameters(
      node,catalogByKindAndVersion.get(`${node.kind}@${node.typeVersion}`),
    );
    if (catalogParameterError) return catalogParameterError;
    const staticParameterError = automationNodeEditorFromComposition(
      nodeComposition,node.kind,node.typeVersion,
    )?.validateParameters?.(node);
    if (staticParameterError) return staticParameterError;
  }
  const edgeIDs = new Set<string>();
  const nodesByID = new Map(spec.nodes.map((node) => [node.id,node]));
  if (spec.actions.length === 0) return 'Publish at least one workflow Action.';
  const actionIDs = new Set<string>();
  const actionEntryIDs = new Set<string>();
  for (const action of spec.actions) {
    const actionError = validateAutomationAction(action, nodeIDs);
    if (actionError) return actionError;
    if (actionIDs.has(action.id)) return `Action ID "${action.id}" must be unique.`;
    actionIDs.add(action.id);
    if (actionEntryIDs.has(action.entryNodeId)) return `Action entry node "${action.entryNodeId}" must be unique.`;
    actionEntryIDs.add(action.entryNodeId);
  }
  for (const edge of spec.edges) {
    if (!validIdentifier(edge.id)) return `Edge ID "${edge.id}" is invalid.`;
    if (edgeIDs.has(edge.id)) return `Edge ID "${edge.id}" must be unique.`;
    edgeIDs.add(edge.id);
    if (!nodeIDs.has(edge.from) || !nodeIDs.has(edge.to)) return `Edge ${edge.id} references a missing node.`;
    if (edge.from === edge.to) return `Edge ${edge.id} cannot connect a node to itself.`;
    if (!['success','failure','always'].includes(edge.condition)) return `Edge ${edge.id} has an invalid condition.`;
    const sourceNode = nodesByID.get(edge.from)!;
    const catalogPorts = (
      catalogByKindAndVersion.get(`${sourceNode.kind}@${sourceNode.typeVersion}`)
      ?? catalogByKind.get(sourceNode.kind)
    )?.outputPorts;
    const declaredPorts = Array.isArray(catalogPorts) ? catalogPorts : undefined;
    const sourcePort = edge.sourcePort?.trim();
    const route = edge.route?.trim();
    if (sourcePort && !['main','ready','stopped','error'].includes(sourcePort)) {
      return `Edge ${edge.id} uses unsupported output port "${sourcePort}".`;
    }
    if (sourcePort && sourcePort !== 'main') {
      if (declaredPorts && !declaredPorts.some((port) => port.id === sourcePort)) {
        return `Edge ${edge.id} uses output port "${sourcePort}" which is not declared by node ${edge.from}.`;
      }
      if (!declaredPorts) {
        return `Edge ${edge.id} uses lifecycle output "${sourcePort}" on node ${edge.from} without declared output ports.`;
      }
    }
    if (route && (!declaredPorts || !declaredPorts.some((port) => port.id === route))) {
      return `Edge ${edge.id} uses route "${route}" which is not declared by node ${edge.from}.`;
    }
    if (route && edge.condition !== 'success') {
      return `Routed edge ${edge.id} must use a success connection.`;
    }
    const terminalLabel = sourceNode.kind === AUTOMATION_RETURN_KIND
      ? 'Return'
      : automationNodeGraphSemanticsFromComposition(
        nodeComposition,sourceNode.kind,sourceNode.typeVersion,
      )?.terminalLabel;
    if (terminalLabel) {
      const label = terminalLabel;
      return `${label} node ${sourceNode.id} cannot have outgoing connections.`;
    }
  }
  if (graphHasCycle(spec.nodes, spec.edges)) return 'The Automation graph contains a cycle.';
  const triggers = spec.nodes.filter((node) => isAutomationTriggerKind(node.kind));
  if (triggers.length === 0) return 'The Automation graph requires at least one trigger.';
  if (spec.targetPolicy.mode === 'inherit') {
    const autonomousTrigger = triggers.find((node) => (
      node.kind !== 'trigger.manual' && node.kind !== AUTOMATION_CALL_TRIGGER_KIND
    ));
    if (autonomousTrigger) {
      return `Inherited target policy cannot use autonomous trigger "${autonomousTrigger.kind}".`;
    }
  }
  const callTriggers = triggers.filter((node) => node.kind === AUTOMATION_CALL_TRIGGER_KIND);
  if (callTriggers.length > 1) return 'An Automation can contain only one When called trigger.';
  const callTrigger = callTriggers[0];
  const returnNodes = spec.nodes.filter((node) => node.kind === AUTOMATION_RETURN_KIND);
  if (callTrigger && returnNodes.length !== 1) {
    return 'A called Automation requires exactly one Return node.';
  }
  if (!callTrigger && returnNodes.length !== 0) {
    return 'Only an Automation started by When called can contain a Return node.';
  }
  const triggerIDs = new Set(triggers.map((trigger) => trigger.id));
  if (spec.edges.some((edge) => triggerIDs.has(edge.to))) return 'Trigger nodes cannot have incoming connections.';
  const outgoing = new Map<string,string[]>();
  for (const edge of spec.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []),edge.to]);
  const reachable = new Set(triggerIDs);
  const pending = [...triggerIDs];
  while (pending.length) {
    for (const target of outgoing.get(pending.shift()!) ?? []) {
      if (!reachable.has(target)) {
        reachable.add(target);
        pending.push(target);
      }
    }
  }
  if (reachable.size !== spec.nodes.length) return 'Every node must be reachable from at least one trigger.';
  if (callTrigger) {
    const returnPathError = validateCalledAutomationReturnPaths(
      callTrigger,returnNodes[0],spec,nodeComposition,
    );
    if (returnPathError) return returnPathError;
  }
  const stickyNoteIDs = new Set<string>();
  for (const note of spec.stickyNotes) {
    if (!validIdentifier(note.id)) return `Sticky note ID "${note.id}" is invalid.`;
    if (stickyNoteIDs.has(note.id)) return `Sticky note ID "${note.id}" must be unique.`;
    stickyNoteIDs.add(note.id);
    if (new TextEncoder().encode(note.content).byteLength > AUTOMATION_STICKY_NOTE_MAX_CONTENT_BYTES) return `Sticky note ${note.id} content is too long.`;
    if (!Number.isFinite(note.position.x) || !Number.isFinite(note.position.y)) return `Sticky note ${note.id} position must be finite.`;
    if (!Number.isFinite(note.width) || note.width < AUTOMATION_STICKY_NOTE_MIN_WIDTH || note.width > AUTOMATION_STICKY_NOTE_MAX_SIZE) return `Sticky note ${note.id} width is invalid.`;
    if (!Number.isFinite(note.height) || note.height < AUTOMATION_STICKY_NOTE_MIN_HEIGHT || note.height > AUTOMATION_STICKY_NOTE_MAX_SIZE) return `Sticky note ${note.id} height is invalid.`;
  }
  return '';
}

function validateAutomationAction(action: AutomationAction, nodeIDs: ReadonlySet<string>) {
  if (!validIdentifier(action.id)) return `Action ID "${action.id}" is invalid.`;
  if (!Number.isInteger(action.version) || action.version < 1) return `Action ${action.id} requires a positive version.`;
  if (!action.label.trim()) return `Action ${action.id} requires a label.`;
  if (!nodeIDs.has(action.entryNodeId)) return `Action ${action.id} references missing entry node "${action.entryNodeId}".`;
  if (!['command','service','interaction','control-stream'].includes(action.kind)) return `Action ${action.id} has an unsupported kind.`;
  const inputError = automationParameterSchemaError(action.inputSchema);
  if (inputError) return `Action ${action.id} input: ${inputError}`;
  const resultError = automationParameterSchemaError(action.resultSchema);
  if (resultError) return `Action ${action.id} result: ${resultError}`;
  const controls = new Set(action.controls);
  if (controls.size !== action.controls.length || action.controls.some((control) => !['cancel','restart','signal','stop'].includes(control))) {
    return `Action ${action.id} controls are invalid.`;
  }
  return validateAutomationAdmission(action.admission, action.inputSchema, `Action ${action.id}`);
}

/**
 * The run-parameter half of spec validation, mirrored from Core so the editor
 * can refuse a declaration before a commit round trip. Core remains the
 * authority: this only says what the backend would say sooner.
 */
export function automationParameterSchemaError(schema: AutomationParameterSchema): string {
  if (new TextEncoder().encode(JSON.stringify(schema)).byteLength > 64 * 1024) return 'Run parameter schema exceeds 65536 bytes.';
  return validateParameterFields(schema.fields, 2, { nodes: 1 });
}

function validateAutomationAdmission(admission: AutomationAdmission, inputSchema: AutomationParameterSchema, label: string) {
  const policy = admission.concurrency;
  if (!policy) return '';
  if (!['target','workflow','family','key'].includes(policy.scope)) return `${label} admission scope is invalid.`;
  if (!Number.isInteger(policy.limit) || policy.limit < 1 || policy.limit > 1024) {
    return 'Run admission limit must be an integer between 1 and 1024.';
  }
  if (!['queue','reject','replace'].includes(policy.onConflict)) return 'Run admission conflict behavior is invalid.';
  if (!['root','all'].includes(policy.appliesTo)) return 'Run admission applies-to scope is invalid.';
  const expression = policy.keyExpression?.trim() ?? '';
  if (policy.scope === 'target' || policy.scope === 'workflow') {
    return expression ? `${policy.scope} run admission cannot define a key expression.` : '';
  }
  if (!expression) return `${policy.scope} run admission requires a key expression.`;
  if (new TextEncoder().encode(expression).byteLength > 512) return 'Run admission key expression exceeds 512 bytes.';
  const pointer = parseJSONPointer(expression);
  if (typeof pointer === 'string') return `Run admission key expression ${pointer}.`;
  let fields = inputSchema.fields;
  let field: AutomationParameterField | undefined;
  for (const [index, segment] of pointer.entries()) {
    field = fields.find((candidate) => candidate.name === segment);
    if (!field) return `Run admission key expression references unknown parameter ${pointer.slice(0, index + 1).join('/')}.`;
    if (field.sensitive) return 'Run admission key expression cannot reference a sensitive parameter.';
    if (index < pointer.length - 1) {
      if (field.kind !== 'object' || !field.object) return `Run admission key expression parameter ${field.name} is not an object.`;
      fields = field.object.fields;
    }
  }
  if (!field || !['string','boolean','integer','number'].includes(field.kind)) {
    return 'Run admission key expression must reference a scalar parameter.';
  }
  return '';
}

function parseJSONPointer(value: string): string[] | string {
  if (!value.startsWith('/')) return "must be an RFC 6901 JSON Pointer beginning with '/'.";
  const result: string[] = [];
  for (const raw of value.slice(1).split('/')) {
    let decoded = '';
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] !== '~') {
        decoded += raw[index];
        continue;
      }
      const escaped = raw[index + 1];
      if (escaped !== '0' && escaped !== '1') return 'contains an invalid RFC 6901 escape.';
      decoded += escaped === '0' ? '~' : '/';
      index += 1;
    }
    if (!decoded) return 'must not contain an empty path segment.';
    result.push(decoded);
  }
  return result;
}

function validateParameterFields(fields: AutomationParameterField[], depth: number, state: { nodes: number }): string {
  const parameterNames = new Set<string>();
  for (const field of fields) {
    if (!validIdentifier(field.name)) return `Run parameter name "${field.name}" is invalid.`;
    if (parameterNames.has(field.name)) return `Run parameter "${field.name}" must be unique.`;
    parameterNames.add(field.name);
    const error = validateParameterValue(field, `Run parameter ${field.name}`, depth, state);
    if (error) return error;
  }
  return '';
}

function validateParameterValue(value: AutomationParameterValueSchema, label: string, depth: number, state: { nodes: number }): string {
  if (depth > 8) return 'Run parameter schema exceeds maximum depth 8.';
  state.nodes += 1;
  if (state.nodes > 256) return 'Run parameter schema exceeds maximum node count 256.';
  if (!['string','boolean','integer','number','object','array'].includes(value.kind)) return `${label} has an unsupported kind.`;
  if (value.sensitive && value.kind !== 'string') return `${label} must be a string to be sensitive.`;
  const constraints = [value.string,value.boolean,value.integer,value.number,value.object,value.array];
  const configured = constraints.filter(Boolean).length;
  const expected = value.kind === 'string' ? value.string : value.kind === 'boolean' ? value.boolean
    : value.kind === 'integer' ? value.integer : value.kind === 'number' ? value.number
      : value.kind === 'object' ? value.object : value.array;
  if (configured > 1 || (configured === 1 && !expected)) return `${label} has constraints for the wrong kind.`;
  if (value.sensitive && (value.string?.default !== undefined || value.string?.enum?.length)) {
    return `${label} cannot define a default or enum when sensitive.`;
  }
  if (value.string?.enum && new Set(value.string.enum).size !== value.string.enum.length) return `${label} enum values must be unique.`;
  const bounds = value.kind === 'integer' ? value.integer : value.kind === 'number' ? value.number : undefined;
  if (value.kind === 'integer' && [bounds?.default,bounds?.minimum,bounds?.maximum].some((candidate) => candidate !== undefined && !Number.isInteger(candidate))) {
    return `${label} integer constraints must be integers.`;
  }
  if ([bounds?.default,bounds?.minimum,bounds?.maximum].some((candidate) => candidate !== undefined && !Number.isFinite(candidate))) {
    return `${label} numeric constraints must be finite.`;
  }
  if (bounds?.minimum !== undefined && bounds.maximum !== undefined && bounds.minimum > bounds.maximum) {
    return `${label} minimum exceeds maximum.`;
  }
  if (bounds?.default !== undefined && bounds.minimum !== undefined && bounds.default < bounds.minimum) {
    return `${label} default is below minimum.`;
  }
  if (bounds?.default !== undefined && bounds.maximum !== undefined && bounds.default > bounds.maximum) {
    return `${label} default exceeds maximum.`;
  }
  if (value.kind === 'object') {
    if (!value.object) return `${label} requires an object schema.`;
    return validateParameterFields(value.object.fields, depth + 1, state);
  }
  if (value.kind === 'array') {
    if (!value.array?.items) return `${label} requires an array item schema.`;
    const minimum = value.array.minItems ?? 0;
    const maximum = value.array.maxItems ?? 1000;
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < minimum || maximum > 10_000) {
      return `${label} has invalid array bounds.`;
    }
    const itemsError = validateParameterValue(value.array.items, `${label} items`, depth + 1, state);
    if (itemsError) return itemsError;
    if (value.array.default !== undefined) {
      return validateParameterInstance(value, value.array.default, `${label} default`);
    }
    return '';
  }
  return '';
}

function validateParameterInstance(
  schema: AutomationParameterValueSchema,
  instance: unknown,
  label: string,
): string {
  switch (schema.kind) {
    case 'string':
      if (typeof instance !== 'string') return `${label} must be a string.`;
      if (schema.string?.enum?.length && !schema.string.enum.includes(instance)) {
        return `${label} is not an allowed enum value.`;
      }
      return '';
    case 'boolean':
      return typeof instance === 'boolean' ? '' : `${label} must be a boolean.`;
    case 'integer':
    case 'number': {
      if (typeof instance !== 'number' || !Number.isFinite(instance)) {
        return `${label} must be a ${schema.kind}.`;
      }
      if (schema.kind === 'integer' && !Number.isInteger(instance)) {
        return `${label} must be an integer.`;
      }
      const bounds = schema.kind === 'integer' ? schema.integer : schema.number;
      if (bounds?.minimum !== undefined && instance < bounds.minimum) {
        return `${label} is below ${bounds.minimum}.`;
      }
      if (bounds?.maximum !== undefined && instance > bounds.maximum) {
        return `${label} exceeds ${bounds.maximum}.`;
      }
      return '';
    }
    case 'object': {
      if (!isRecord(instance)) return `${label} must be an object.`;
      const fields = schema.object?.fields ?? [];
      const allowed = new Set(fields.map((field) => field.name));
      for (const key of Object.keys(instance)) {
        if (!allowed.has(key)) return `${label} contains unknown property "${key}".`;
      }
      for (const field of fields) {
        if (!(field.name in instance)) {
          if (field.required) return `${label}.${field.name} is required.`;
          continue;
        }
        const nested = validateParameterInstance(field, instance[field.name], `${label}.${field.name}`);
        if (nested) return nested;
      }
      return '';
    }
    case 'array': {
      if (!Array.isArray(instance)) return `${label} must be an array.`;
      const minimum = schema.array?.minItems ?? 0;
      const maximum = schema.array?.maxItems ?? 1000;
      if (instance.length < minimum || instance.length > maximum) {
        return `${label} must contain between ${minimum} and ${maximum} items.`;
      }
      const itemSchema = schema.array?.items;
      if (!itemSchema) return `${label} requires an array item schema.`;
      for (let index = 0; index < instance.length; index += 1) {
        const nested = validateParameterInstance(itemSchema, instance[index], `${label}[${index}]`);
        if (nested) return nested;
      }
      return '';
    }
    default:
      return `${label} has an unsupported kind.`;
  }
}


function validIdentifier(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value.trim());
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function validateCatalogNodeParameters(
  node: AutomationSpec['nodes'][number],
  entry: AutomationNodeCatalogEntry | undefined,
) {
  if (!entry) return '';
  const schema = entry.parameterSchema;
  if (schema.type !== 'object' || !isRecord(schema.properties)) return '';
  const required = new Set(Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === 'string')
    : []);
  for (const [name,candidate] of Object.entries(schema.properties)) {
    if (!isRecord(candidate)) continue;
    const value = node.parameters[name];
    const label = typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim()
      : name;
    if (value === undefined || value === null) {
      if (required.has(name)) return `Node ${node.id}: ${label} is required.`;
      continue;
    }
    if (candidate.type === 'string') {
      if (typeof value !== 'string') return `Node ${node.id}: ${label} must be a string.`;
      const minimum = typeof candidate.minLength === 'number' ? candidate.minLength : undefined;
      if (minimum !== undefined && value.length < minimum) return `Node ${node.id}: ${label} is required.`;
      if (typeof candidate.pattern === 'string') {
        let pattern: RegExp;
        try {
          pattern = new RegExp(candidate.pattern);
        } catch {
          return `Node ${node.id}: ${label} has an invalid catalog pattern.`;
        }
        if (!pattern.test(value)) {
          if (candidate.pattern.startsWith('^/')) {
            return `Node ${node.id}: ${label} must start with / and be an absolute ROS graph name, for example /chatter.`;
          }
          return `Node ${node.id}: ${label} has an invalid value.`;
        }
      }
    }
  }
  return '';
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
