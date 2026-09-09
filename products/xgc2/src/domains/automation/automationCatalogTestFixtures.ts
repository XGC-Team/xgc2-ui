import type {
  AutomationNodeCatalogEntry,
  AutomationNodeTrait,
} from './automationDefinitionContracts';

// Test fixtures mirror the public traits emitted by the trusted built-in
// descriptor catalog. Keeping the mapping here prevents UI tests from making
// up execution semantics merely to satisfy AutomationNodeCatalogEntry.
const builtinNodeTraits = {
  'trigger.manual': ['trigger'],
  'trigger.schedule': ['trigger'],
  'trigger.target-startup': ['trigger'],
  'trigger.form-submission': ['trigger'],
  'trigger.chat-message': ['trigger'],
  'trigger.webhook': ['trigger'],
  'trigger.automation-call': ['call','trigger'],
  'automation.call': ['call','child-run-producer','effect','wait'],
  'automation.return': ['call','control'],
  'experiment.panel.exists': ['pure'],
  'process.run-definition': ['effect','resource','wait'],
  'ros1.wait-roscore-ready': ['wait'],
  'ros1.wait-gazebo-ready': ['wait'],
  'ros1.record-bag': ['effect','resource','wait'],
  'ros1.publish-topic': ['effect'],
  'ros1.call-service': ['effect'],
  'panel.state.get': ['pure'],
  'asset.experiment-robots': ['pure'],
  'robot.ensure-connected': ['effect','resource','wait'],
  'simulation.render-fs150-sdf': ['effect'],
  'simulation.spawn-fs150-sdf': ['effect','resource'],
  'simulation.gazebo-spawn-obstacle': ['effect','resource'],
  'simulation.gazebo-move-obstacle': ['effect','resource'],
  'simulation.gazebo-clear-obstacles': ['effect','resource'],
  'robot.operation': ['effect'],
  'mcp.tool.call': ['effect'],
  'mcp.resource.read': ['pure'],
  'mcp.prompt.get': ['pure'],
  condition: ['control','pure'],
  filter: ['control','pure'],
  merge: ['control','pure'],
  switch: ['control','pure'],
  'stop-and-error': ['control'],
  'collection.tally': ['pure'],
  delay: ['control','wait'],
  notification: ['effect'],
  'gcs.request-confirmation': ['effect'],
  'human.wait-confirmation': ['wait'],
  'gcs.status-card': ['effect'],
  'gcs.offer-context': ['effect'],
} as const satisfies Record<string, readonly AutomationNodeTrait[]>;

export type BuiltinAutomationCatalogKind = keyof typeof builtinNodeTraits;

export function automationCatalogTraits(kind: BuiltinAutomationCatalogKind): AutomationNodeTrait[] {
  return [...builtinNodeTraits[kind]];
}

type AutomationCatalogFixtureInput = Omit<AutomationNodeCatalogEntry, 'traits'> & {
  traits?: readonly AutomationNodeTrait[];
};

export function automationCatalogFixture(
  input: AutomationCatalogFixtureInput & { kind: BuiltinAutomationCatalogKind },
): AutomationNodeCatalogEntry;
export function automationCatalogFixture(
  input: AutomationCatalogFixtureInput & { traits: readonly AutomationNodeTrait[] },
): AutomationNodeCatalogEntry;
export function automationCatalogFixture(input: AutomationCatalogFixtureInput): AutomationNodeCatalogEntry {
  const declared = builtinNodeTraits[input.kind as BuiltinAutomationCatalogKind]
    ?? input.traits;
  if (!declared) {
    throw new Error(`Custom Automation catalog fixture ${JSON.stringify(input.kind)} must declare traits.`);
  }
  return { ...input,traits: [...declared] };
}
