/** Build metadata shared by ManualTriggers=true roots and absence gates. */
export const coreAutomationManualTriggersOwner = 'Automation.Nodes.ManualTriggers';

export const coreAutomationManualTriggersModulePrefixes = {
  [coreAutomationManualTriggersOwner]: ['src/domains/automation/nodes/manualTriggers/'],
} as const;
