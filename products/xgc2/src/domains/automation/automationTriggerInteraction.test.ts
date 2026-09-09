import { describe,expect,it } from 'vitest';
import {
  AUTOMATION_TRIGGER_KINDS,
  type AutomationTriggerKind,
} from './automationTriggerContracts';
import {
  automationTriggerInteraction,
  type AutomationTriggerInteraction,
} from './automationTriggerInteraction';

const cases = [
  ['trigger.manual', { primaryAction: 'run-now',primaryActionLabel: 'Run now',activatable: false }],
  ['trigger.schedule', { primaryAction: 'run-once',primaryActionLabel: 'Run once',activatable: true }],
  ['trigger.target-startup', { primaryAction: 'none',primaryActionLabel: '',activatable: true }],
  ['trigger.form-submission', { primaryAction: 'start-listening',primaryActionLabel: 'Start listening',activatable: true }],
  ['trigger.chat-message', { primaryAction: 'start-listening',primaryActionLabel: 'Start listening',activatable: true }],
  ['trigger.webhook', { primaryAction: 'start-listening',primaryActionLabel: 'Start listening',activatable: true }],
  ['trigger.automation-call', { primaryAction: 'none',primaryActionLabel: '',activatable: false }],
] satisfies Array<[AutomationTriggerKind,AutomationTriggerInteraction]>;

describe('automationTriggerInteraction', () => {
  it('covers every registered Automation trigger exactly once', () => {
    expect(cases.map(([kind]) => kind).sort()).toEqual([...AUTOMATION_TRIGGER_KINDS].sort());
  });

  it.each(cases)('maps %s to its trigger-aware interaction', (kind, expected) => {
    expect(automationTriggerInteraction(kind)).toEqual(expected);
  });
});
