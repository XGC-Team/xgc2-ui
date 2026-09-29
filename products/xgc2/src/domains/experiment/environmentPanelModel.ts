export type ExperimentEnvironmentIdentity = {
  resourceId: string;
  name: string;
};

/** Display names registered by an instance Agent: `<experiment>/<robot>`. */
export function managedHostBelongsToExperiment(
  displayName: string,
  identity: ExperimentEnvironmentIdentity,
): boolean {
  const label = displayName.trim();
  if (!label.includes('/')) return false;
  const name = identity.name.trim();
  const resourceId = identity.resourceId.trim();
  return (name !== '' && label.startsWith(`${name}/`))
    || (resourceId !== '' && resourceId !== name && label.startsWith(`${resourceId}/`));
}

export type EnvironmentProfileChoice = {
  id: string;
  os: string;
  version: string;
  ros: string;
  installed: boolean;
};

/** OS and ROS from the options payload. An id alone is not a display name. */
export function environmentProfileLabel(profile: { os?: string; version?: string; ros?: string }) {
  const system = [profile.os?.trim(), profile.version?.trim()].filter((part) => part).join(' ');
  const ros = profile.ros?.trim();
  return [system, ros ? `ROS ${ros}` : ''].filter((part) => part).join(' · ');
}

export function environmentInstanceWithLiveHost<T extends {
  agentId: string;
  managedHost: { id: string;displayName: string;enrollment: string;connectivity: string;managementConnection: string } | null;
}>(
  instance: T,
  hosts: readonly { id: string;displayName: string;enrollment: string;connectivity: string;managementConnection: string }[],
): T {
  const live = hosts.find((host) => host.id === instance.agentId);
  if (!live) return instance;
  return {
    ...instance,
    managedHost: {
      id: live.id,
      displayName: live.displayName,
      enrollment: live.enrollment,
      connectivity: live.connectivity,
      managementConnection: live.managementConnection,
    },
  };
}

/** Options already decided availability. A non-empty worldImage is usable. */
export function availableWorldImage(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function experimentEnvironmentIdentity(value: unknown): ExperimentEnvironmentIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as { head?: { resourceId?: unknown };spec?: { name?: unknown } };
  const resourceId = candidate.head?.resourceId;
  const name = candidate.spec?.name;
  if (typeof resourceId !== 'string' || typeof name !== 'string') return undefined;
  if (!resourceId.trim() && !name.trim()) return undefined;
  return { resourceId,name };
}
