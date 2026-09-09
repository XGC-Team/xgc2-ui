export type AutomationEntrypointFact = { resourceId: string;entrypointNodeId: string };
export type AutomationEntrypointFacts<T extends AutomationEntrypointFact> = Record<string,T>;

export function automationTriggerStateKey(resourceId: string, entrypointNodeId: string) {
  return JSON.stringify([resourceId.trim(),entrypointNodeId.trim()]);
}

export function automationEntrypointFact<T extends AutomationEntrypointFact>(
  facts: AutomationEntrypointFacts<T>,
  resourceId: string,
  entrypointNodeId: string,
) {
  return facts[automationTriggerStateKey(resourceId, entrypointNodeId)];
}

export function automationEntrypointFactsForResource<T extends AutomationEntrypointFact>(
  facts: AutomationEntrypointFacts<T>,
  resourceId: string,
) {
  return Object.values(facts)
    .filter((fact) => fact.resourceId === resourceId)
    .sort((left, right) => left.entrypointNodeId.localeCompare(right.entrypointNodeId));
}

export function indexAutomationEntrypointFacts<T extends AutomationEntrypointFact>(facts: readonly T[]) {
  return Object.fromEntries(facts.map((fact) => [
    automationTriggerStateKey(fact.resourceId, fact.entrypointNodeId),
    fact,
  ])) as AutomationEntrypointFacts<T>;
}

export function withoutAutomationResourceFacts<T extends AutomationEntrypointFact>(
  facts: AutomationEntrypointFacts<T>,
  resourceId: string,
) {
  return Object.fromEntries(
    Object.entries(facts).filter(([,fact]) => fact.resourceId !== resourceId),
  ) as AutomationEntrypointFacts<T>;
}
