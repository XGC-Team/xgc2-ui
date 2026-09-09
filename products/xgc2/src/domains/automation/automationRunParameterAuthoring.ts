import type { AutomationParameterField } from './automationDefinitionContracts';

/**
 * The parameter kinds the Automation editor can declare.
 *
 * It is a subset of what the shared run-parameter form renders: object and
 * array parameters are trees rather than one control, so this editor shows a
 * seed-declared one read-only instead of pretending a flat row can express it.
 */
export const AUTHORABLE_AUTOMATION_PARAMETER_KINDS = ['string','boolean','integer','number'] as const;

export type AuthorableAutomationParameterKind = typeof AUTHORABLE_AUTOMATION_PARAMETER_KINDS[number];

export function isAuthorableAutomationParameterField(field: AutomationParameterField) {
  return (AUTHORABLE_AUTOMATION_PARAMETER_KINDS as readonly string[]).includes(field.kind);
}
