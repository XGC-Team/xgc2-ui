/** Creation template only; independent of Session runMode and graph target. */
export type DeploymentPlacement = 'centralized' | 'per-robot';

/** Durable identity, never an IP, container ID or connection-state snapshot. */
export type ExecutionHostRef =
  | { kind: 'station'; slotId?: never; agentId?: never }
  | { kind: 'environment'; slotId: string; agentId?: never }
  | { kind: 'agent'; agentId: string; slotId?: never };

export type ExperimentDeployment = {
  placement: DeploymentPlacement;
  worldHost: ExecutionHostRef;
};

/** Called only for an explicitly chosen creation template, never on read. */
export function newExecutionHostRef(placement: DeploymentPlacement, slotId: string): ExecutionHostRef {
  if (placement === 'centralized') return { kind: 'station' };
  if (placement !== 'per-robot' || !slotId) {
    throw new Error('Select a valid deployment template and environment slot.');
  }
  return { kind: 'environment', slotId };
}

export function newExperimentDeployment(placement: DeploymentPlacement): ExperimentDeployment {
  return { placement, worldHost: newExecutionHostRef(placement, 'world') };
}

/** Clone, do not normalize identities or discard invalid fields before validation. */
export function cloneExecutionHostRef(host: ExecutionHostRef): ExecutionHostRef {
  return structuredClone(host);
}

export function cloneExperimentDeployment(deployment: ExperimentDeployment): ExperimentDeployment {
  return structuredClone(deployment);
}

export function validateExecutionHostRef(value: unknown): string {
  if (!isObject(value)) return 'Execution host must be an identity reference object.';
  switch (value.kind) {
    case 'station':
      return exactKeys(value, ['kind']) ? '' : 'Station host contains only kind.';
    case 'environment':
      return exactKeys(value, ['kind', 'slotId'])
        && typeof value.slotId === 'string'
        && value.slotId.length > 0
        ? '' : 'Environment host requires only a canonical slotId.';
    case 'agent':
      return exactKeys(value, ['kind', 'agentId'])
        && typeof value.agentId === 'string'
        && value.agentId.length > 0
        ? '' : 'Agent host requires only a nonempty agentId.';
    default:
      return 'Execution host kind must be station, environment or agent.';
  }
}

export function validateExperimentDeployment(value: unknown): string {
  if (!isObject(value) || !exactKeys(value, ['placement', 'worldHost'])) {
    return 'Deployment requires only placement and worldHost.';
  }
  if (value.placement !== 'centralized' && value.placement !== 'per-robot') {
    return 'Deployment placement must be centralized or per-robot.';
  }
  const issue = validateExecutionHostRef(value.worldHost);
  return issue ? `World host: ${issue}` : '';
}

/** Plan integrity only. No Agent lookup or environment creation while saving. */
export function validateExperimentDeploymentBindings(
  deployment: ExperimentDeployment | undefined,
  robots: readonly { id: string; executionHost?: ExecutionHostRef }[],
): string {
  if (deployment === undefined) {
    return robots.some((robot) => robot.executionHost !== undefined)
      ? 'Execution hosts require an explicit Experiment deployment plan.' : '';
  }
  const issue = validateExperimentDeployment(deployment);
  if (issue) return issue;
  const slots = new Set(['world', ...robots.map((robot) => robot.id)]);
  const references: { label: string; host: ExecutionHostRef | undefined }[] = [
    { label: 'World', host: deployment.worldHost },
    ...robots.map((robot) => ({ label: `Robot "${robot.id}"`, host: robot.executionHost })),
  ];
  for (const { label, host } of references) {
    const hostIssue = validateExecutionHostRef(host);
    if (hostIssue) return `${label}: ${hostIssue}`;
    if (host?.kind === 'environment' && !slots.has(host.slotId)) {
      return `${label}: environment slot "${host.slotId}" is not declared in this Experiment.`;
    }
  }
  return '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
