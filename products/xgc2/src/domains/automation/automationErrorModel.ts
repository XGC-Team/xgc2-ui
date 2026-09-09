import type { AutomationDocument } from './automationDefinitionContracts';

export class AutomationCommitConflict extends Error {
  readonly latest?: AutomationDocument;

  constructor(message: string, latest?: AutomationDocument) {
    super(message);
    this.name = 'AutomationCommitConflict';
    this.latest = latest;
  }
}

export function isAutomationRunRevisionConflict(error: unknown) {
  return error instanceof Error && /\b409\b.*revision conflict/i.test(error.message);
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
