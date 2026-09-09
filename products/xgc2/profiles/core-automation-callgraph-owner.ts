/** Build metadata shared by CallGraph=true roots and absence gates. */
export const coreAutomationCallGraphOwner = 'Automation.Nodes.CallGraph';

export const coreAutomationCallGraphModulePrefixes = {
  [coreAutomationCallGraphOwner]: ['src/domains/automation/nodes/callGraph/'],
} as const;
