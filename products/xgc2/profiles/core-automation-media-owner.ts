/** Build metadata shared by Media=true roots and Media=false absence gates. */
export const coreAutomationMediaOwner = 'Automation.Nodes.Media';

export const coreAutomationMediaModulePrefixes = {
  [coreAutomationMediaOwner]: ['src/domains/automation/nodes/media/'],
} as const;
