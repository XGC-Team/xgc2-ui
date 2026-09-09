import type { AutomationTriggerKind } from './automationTriggerContracts';

const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerKind,string> = {
  'trigger.manual': 'Manual',
  'trigger.schedule': 'Schedule',
  'trigger.target-startup': 'Target startup',
  'trigger.form-submission': 'Form submission',
  'trigger.chat-message': 'Chat message',
  'trigger.webhook': 'Webhook',
  'trigger.automation-call': 'When called',
};

export function automationTriggerLabel(kind: AutomationTriggerKind) {
  return AUTOMATION_TRIGGER_LABELS[kind];
}
