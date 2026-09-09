/**
 * Operator-facing summary extracted from Docker `inspect` JSON.
 * Full inspect dumps are huge; these fields answer day-to-day ops questions.
 */
import {
  dockerInspectRecord as asRecord,
  dockerInspectString as asString,
  dockerInspectTime as formatTime,
  parseDockerInspectDocument,
  pushDockerInspectFact as push,
  shortDockerInspectId as shortId,
  type DockerInspectFact,
  type DockerInspectRecord,
} from './dockerInspectPrimitives';

export type ContainerInspectFact = DockerInspectFact;

export type ContainerInspectSummary = {
  facts: ContainerInspectFact[];
  /** True when content parsed as Docker inspect JSON. */
  structured: boolean;
};

type UnknownRecord = DockerInspectRecord;

export function summarizeContainerInspect(content: string): ContainerInspectSummary {
  const trimmed = content.trim();
  if (!trimmed || trimmed === 'Loading inspect...' || /^Inspect failed/i.test(trimmed)) {
    return { facts: [], structured: false };
  }
  const doc = parseDockerInspectDocument(trimmed);
  if (!doc) return { facts: [], structured: false };

  const state = asRecord(doc.State);
  const config = asRecord(doc.Config);
  const hostConfig = asRecord(doc.HostConfig);
  const networkSettings = asRecord(doc.NetworkSettings);
  const restartPolicy = asRecord(hostConfig?.RestartPolicy);

  const facts: ContainerInspectFact[] = [];
  push(facts, 'Name', formatName(doc.Name));
  push(facts, 'ID', shortId(asString(doc.Id)));
  push(facts, 'Status', formatStatus(state));
  push(facts, 'Exit code', state && state.ExitCode !== undefined ? String(state.ExitCode) : '');
  push(facts, 'Started', formatTime(asString(state?.StartedAt)));
  push(facts, 'Finished', formatTime(asString(state?.FinishedAt)));
  push(facts, 'Error', asString(state?.Error));
  push(facts, 'OOM killed', state?.OOMKilled === true ? 'yes' : state?.OOMKilled === false ? 'no' : '');
  push(facts, 'Image', asString(config?.Image) || asString(doc.Image));
  push(facts, 'Command', formatCommand(config));
  push(facts, 'Working dir', asString(config?.WorkingDir));
  push(facts, 'User', asString(config?.User));
  push(facts, 'Restart policy', formatRestartPolicy(restartPolicy));
  push(facts, 'Privileged', hostConfig?.Privileged === true ? 'yes' : hostConfig?.Privileged === false ? 'no' : '');
  push(facts, 'Network mode', asString(hostConfig?.NetworkMode));
  push(facts, 'Ports', formatPorts(hostConfig, networkSettings));
  push(facts, 'Mounts', formatMounts(doc.Mounts, hostConfig?.Binds));
  push(facts, 'Networks', formatNetworks(networkSettings));
  push(facts, 'Env', formatEnv(config?.Env));
  push(facts, 'Created', formatTime(asString(doc.Created)));

  return { facts: facts.filter((fact) => fact.value.trim() !== ''), structured: true };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function formatName(name: unknown): string {
  const raw = asString(name);
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

function formatStatus(state: UnknownRecord | null): string {
  if (!state) return '';
  const status = asString(state.Status);
  const running = state.Running === true;
  const paused = state.Paused === true;
  const restarting = state.Restarting === true;
  if (restarting) return status || 'restarting';
  if (paused) return status || 'paused';
  if (running) return status || 'running';
  return status || (state.Running === false ? 'exited' : '');
}

function formatCommand(config: UnknownRecord | null): string {
  if (!config) return '';
  const entrypoint = asStringArray(config.Entrypoint);
  const cmd = asStringArray(config.Cmd);
  const parts = [...entrypoint, ...cmd];
  return parts.join(' ').trim();
}

function formatRestartPolicy(policy: UnknownRecord | null): string {
  if (!policy) return '';
  const name = asString(policy.Name);
  if (!name || name === 'no') return name || '';
  const max = policy.MaximumRetryCount;
  if (name === 'on-failure' && typeof max === 'number' && max > 0) return `${name} (max ${max})`;
  return name;
}

function formatPorts(hostConfig: UnknownRecord | null, networkSettings: UnknownRecord | null): string {
  const fromNetwork = formatPortMap(networkSettings?.Ports);
  if (fromNetwork) return fromNetwork;
  return formatPortMap(hostConfig?.PortBindings);
}

function formatPortMap(value: unknown): string {
  const ports = asRecord(value);
  if (!ports) return '';
  const lines: string[] = [];
  for (const [containerPort, bindings] of Object.entries(ports)) {
    if (!Array.isArray(bindings) || bindings.length === 0) {
      lines.push(containerPort);
      continue;
    }
    for (const binding of bindings) {
      const row = asRecord(binding);
      const hostIp = asString(row?.HostIp);
      const hostPort = asString(row?.HostPort);
      if (hostPort) {
        lines.push(`${hostIp && hostIp !== '0.0.0.0' ? `${hostIp}:` : ''}${hostPort} → ${containerPort}`);
      } else {
        lines.push(containerPort);
      }
    }
  }
  return lines.join('\n');
}

function formatMounts(mounts: unknown, binds: unknown): string {
  if (Array.isArray(mounts) && mounts.length > 0) {
    return mounts.map((mount) => {
      const row = asRecord(mount);
      const source = asString(row?.Source) || asString(row?.Name);
      const destination = asString(row?.Destination);
      const mode = asString(row?.Mode) || (row?.RW === false ? 'ro' : row?.RW === true ? 'rw' : '');
      if (!source && !destination) return '';
      return `${source || '?'} → ${destination || '?'}${mode ? ` (${mode})` : ''}`;
    }).filter(Boolean).join('\n');
  }
  return asStringArray(binds).join('\n');
}

function formatNetworks(networkSettings: UnknownRecord | null): string {
  const networks = asRecord(networkSettings?.Networks);
  if (!networks) {
    const ip = asString(networkSettings?.IPAddress);
    return ip ? `default ${ip}` : '';
  }
  return Object.entries(networks).map(([name, value]) => {
    const row = asRecord(value);
    const ip = asString(row?.IPAddress);
    return ip ? `${name} ${ip}` : name;
  }).join('\n');
}

function formatEnv(value: unknown): string {
  const env = asStringArray(value);
  if (env.length === 0) return '';
  // Show a short preview; full list remains in raw JSON.
  const preview = env.slice(0, 8).map((item) => {
    const eq = item.indexOf('=');
    if (eq <= 0) return item;
    const key = item.slice(0, eq);
    const val = item.slice(eq + 1);
    if (/token|password|secret|key|credential/i.test(key) && val) return `${key}=••••`;
    return item;
  });
  if (env.length > preview.length) preview.push(`… +${env.length - preview.length} more`);
  return preview.join('\n');
}
