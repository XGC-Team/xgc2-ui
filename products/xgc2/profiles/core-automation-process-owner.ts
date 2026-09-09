/** Build metadata shared by Process=true roots and absence gates. */
export const coreAutomationProcessOwner = 'Automation.Nodes.Process';

export const coreAutomationProcessModulePrefixes = {
  [coreAutomationProcessOwner]: ['src/domains/automation/nodes/process/'],
} as const;
