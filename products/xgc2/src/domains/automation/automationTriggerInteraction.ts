import type { AutomationTriggerKind } from './automationTriggerContracts';

export type AutomationTriggerPrimaryAction =
  | 'run-now'
  | 'run-once'
  | 'start-listening'
  | 'none';

export type AutomationTriggerInteraction = Readonly<{
  primaryAction: AutomationTriggerPrimaryAction;
  primaryActionLabel: string;
  activatable: boolean;
}>;

const triggerInteractions = {
  'trigger.manual': {
    primaryAction: 'run-now',
    primaryActionLabel: 'Run now',
    activatable: false,
  },
  'trigger.schedule': {
    primaryAction: 'run-once',
    primaryActionLabel: 'Run once',
    activatable: true,
  },
  'trigger.target-startup': {
    primaryAction: 'none',
    primaryActionLabel: '',
    activatable: true,
  },
  'trigger.form-submission': {
    primaryAction: 'start-listening',
    primaryActionLabel: 'Start listening',
    activatable: true,
  },
  'trigger.chat-message': {
    primaryAction: 'start-listening',
    primaryActionLabel: 'Start listening',
    activatable: true,
  },
  'trigger.webhook': {
    primaryAction: 'start-listening',
    primaryActionLabel: 'Start listening',
    activatable: true,
  },
  'trigger.automation-call': {
    primaryAction: 'none',
    primaryActionLabel: '',
    activatable: false,
  },
} as const satisfies Record<AutomationTriggerKind, AutomationTriggerInteraction>;

export function automationTriggerInteraction(kind: AutomationTriggerKind): AutomationTriggerInteraction {
  return triggerInteractions[kind];
}
