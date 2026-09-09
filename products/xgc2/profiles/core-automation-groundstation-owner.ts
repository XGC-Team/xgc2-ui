/** Build metadata shared by GroundStation=true roots and absence gates. */
export const coreAutomationGroundStationOwner = 'Automation.Nodes.GroundStation';

export const coreAutomationGroundStationModulePrefixes = {
  [coreAutomationGroundStationOwner]: ['src/domains/automation/nodes/groundStation/'],
} as const;
