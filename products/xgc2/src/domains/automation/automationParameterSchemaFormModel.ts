import type { AutomationParameterField } from './automationDefinitionContracts';

/**
 * The declared parameter kinds the shared schema form knows how to render.
 *
 * A workflow's parameterSchema arrives as data, so a field can name a kind this
 * build has no control for — a newer seed, or an authoring mistake. That is the
 * one case the form must not hide: silently dropping such a field would
 * let an operator commit an Experiment binding missing a parameter the workflow
 * requires, and the failure would surface much later as a rejected Session
 * start.
 */
const RENDERABLE_KINDS = new Set(['string','boolean','integer','number','object','array']);

export function isRenderableAutomationParameterField(field: AutomationParameterField) {
  return RENDERABLE_KINDS.has(field.kind);
}

/**
 * The message an unsupported field carries, both under its read-only value and
 * in whatever error surface the host owns. It is one sentence in one place so
 * the form and the host cannot describe the same problem differently.
 */
export function unsupportedAutomationParameterMessage(field: AutomationParameterField) {
  const label = field.label || field.name;
  return `${label}: parameter kind "${field.kind}" is not editable in this build.`;
}

/** Every declared field this build cannot edit, in schema order. */
export function unsupportedAutomationParameterFields(
  fields: readonly AutomationParameterField[],
): AutomationParameterField[] {
  return fields.filter((field) => !isRenderableAutomationParameterField(field));
}
