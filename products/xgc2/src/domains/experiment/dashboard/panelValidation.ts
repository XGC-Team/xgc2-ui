import type { AnyPanelPluginDefinition,PanelValueSchema } from '../../../panels/types';
import type { PanelInstance,PanelPortBinding } from '../experimentModel';
import { aspectRatioRows,panelSizeConstraints } from './panelLayoutConstraints';

export type PanelValidationResult = {
  valid: boolean;
  error?: string;
};

export function validatePanelInstance(
  panel: PanelInstance,
  plugin: AnyPanelPluginDefinition | undefined,
): PanelValidationResult {
  if (!plugin) {
    return { valid: false,error: `Unknown panel plugin "${panel.pluginId}".` };
  }

  const bindingError = validatePortBindings(panel.portBindings ?? [], plugin);
  if (bindingError) return { valid: false,error: bindingError };

  const schemaError = validatePanelSchemas(panel, plugin);
  if (schemaError) return { valid: false,error: schemaError };

  const sizeError = validatePanelSize(panel, plugin);
  if (sizeError) return { valid: false,error: sizeError };

  const pluginError = plugin.validatePanel?.(panel) ?? '';
  if (pluginError) return { valid: false,error: pluginError };

  return { valid: true };
}

/**
 * A saved dashboard can carry a footprint the plugin no longer accepts — the
 * manifest tightened its bounds, or the grid was hand-edited. Saying so before
 * the commit beats rendering a panel into a frame it cannot use.
 */
function validatePanelSize(panel: PanelInstance, plugin: AnyPanelPluginDefinition) {
  const gridPos = panel.gridPos;
  if (!gridPos) return '';
  const constraints = panelSizeConstraints(plugin.layout);
  const size = `${gridPos.w}x${gridPos.h}`;
  if (gridPos.w < constraints.minW || gridPos.h < constraints.minH) {
    return `Panel "${panel.title}" is ${size} grid units; "${plugin.name}" needs at least ${constraints.minW}x${constraints.minH}.`;
  }
  // Only a declared ceiling can reject a saved footprint. A plugin that never
  // named a maximum has no opinion about how large its panel may be, and
  // inventing one here would refuse to save a layout the operator already has.
  const overWidth = constraints.maxW !== undefined && gridPos.w > constraints.maxW;
  const overHeight = constraints.maxH !== undefined && gridPos.h > constraints.maxH;
  if (overWidth || overHeight) {
    // Only the declared halves are named, so the message never implies a
    // ceiling the plugin does not have.
    const ceiling = [
      constraints.maxW === undefined ? '' : `${constraints.maxW} columns`,
      constraints.maxH === undefined ? '' : `${constraints.maxH} rows`,
    ].filter(Boolean).join(' by ');
    return `Panel "${panel.title}" is ${size} grid units; "${plugin.name}" allows at most ${ceiling}.`;
  }
  const expectedRows = aspectRatioRows(gridPos.w, constraints);
  if (expectedRows !== undefined && expectedRows !== gridPos.h) {
    return `Panel "${panel.title}" is ${size} grid units; "${plugin.name}" holds a ${constraints.aspectRatio} width-to-height ratio, so ${gridPos.w} columns need ${expectedRows} rows.`;
  }
  return '';
}

function validatePanelSchemas(panel: PanelInstance, plugin: AnyPanelPluginDefinition) {
  return validateRecordSchema('options', panel.options ?? {}, plugin.optionSchema)
    || validateRecordSchema('query', panel.query ?? {}, plugin.querySchema)
    || validateRecordSchema('fieldConfig', panel.fieldConfig ?? {}, plugin.fieldConfigSchema);
}

function validateRecordSchema(name: string, value: Record<string, unknown>, schema: PanelValueSchema | undefined) {
  if (!schema) return '';
  const unknown = Object.keys(value).find((key) => !(key in schema));
  if (unknown) return `Unknown ${name} key "${unknown}" for this panel plugin.`;
  const missing = Object.entries(schema).find(([key, spec]) => spec.required && !(key in value));
  if (missing) return `Missing required ${name} key "${missing[0]}" for this panel plugin.`;
  for (const [key, item] of Object.entries(value)) {
    const expected = schema[key]?.type;
    if (expected && !matchesSchemaType(item, expected)) {
      return `${name} key "${key}" must be ${expected}.`;
    }
  }
  return '';
}

function matchesSchemaType(value: unknown, expected: NonNullable<PanelValueSchema[string]['type']>) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  return typeof value === expected;
}

function validatePortBindings(
  bindings: PanelPortBinding[],
  plugin: AnyPanelPluginDefinition,
) {
  const panelWorkflows = bindings.filter((binding) => binding.kind === 'workflow');
  if (panelWorkflows.length !== 1) return 'Every panel must bind exactly one Panel Workflow.';
  const panelWorkflow = panelWorkflows[0]!;
  if (!panelWorkflow.workflowInstanceId.trim() || !panelWorkflow.presetId.trim()) {
    return 'The Panel Workflow must bind an existing Run preset.';
  }
  if (panelWorkflow.relation === 'detached-observed'
    && panelWorkflow.failurePolicy !== 'keep-experiment') {
    return 'A detached Panel Workflow cannot stop the Experiment.';
  }
  const declarations = [
    ...(plugin.actionPorts ?? []).map((port) => ({ ...port,kind:'action' as const })),
    ...(plugin.dataPorts ?? []).map((port) => ({ ...port,kind:'data' as const })),
    ...(plugin.authoringPorts ?? []).map((port) => ({ ...port,kind:'authoring' as const })),
    ...(plugin.interactionPorts ?? []).map((port) => ({ ...port,kind:'interaction' as const })),
  ];
  const declarationById = new Map(declarations.map((port) => [port.id,port]));
  const acceptsDynamicActions = plugin.dynamicActionPorts?.source === 'panel-action-bindings';
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.portId)) return `Port "${binding.portId}" is bound more than once.`;
    seen.add(binding.portId);
    if (binding.kind === 'workflow') continue;
    const declaration = declarationById.get(binding.portId);
    if (!declaration && !(binding.kind === 'action' && acceptsDynamicActions)) {
      return `Port "${binding.portId}" is not declared by plugin "${plugin.id}".`;
    }
    if (!declaration) continue;
    if (declaration.kind !== binding.kind) {
      return `Port "${binding.portId}" requires a ${declaration.kind} binding, not ${binding.kind}.`;
    }
  }
  const missing = declarations.find((port) => port.required && !seen.has(port.id));
  if (missing) return `Required ${missing.kind} port "${missing.id}" is not connected.`;
  return '';
}
