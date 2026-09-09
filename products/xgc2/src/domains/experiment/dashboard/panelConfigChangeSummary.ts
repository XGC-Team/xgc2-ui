import { canonicalJSON } from '../../../shared/canonicalJson';

const MAX_LISTED_CHANGES = 12;
const MAX_NEST_DEPTH = 4;

/** Operator-facing labels for common panel option keys (and nested process fields). */
const OPTION_LABELS: Record<string, string> = {
  automationResourceIds: 'Automation workflows',
  defaultView: 'Default view',
  historyLimit: 'History entries',
  followLogs: 'Follow logs',
  autoStartRos: 'Autostart ROS',
  autoStartRviz: 'Autostart RViz',
  autoStartGazeboServer: 'Autostart Gazebo server',
  autoStartGazeboClient: 'Autostart Gazebo client',
  autoStartVrpn: 'Autostart VRPN',
  autoStartAdapters: 'Autostart robot adapters',
  serviceOrder: 'Service order',
  hiddenServices: 'Hidden services',
  layoutButtonsPerRow: 'Buttons per row',
  layoutServiceOrder: 'Service order',
  layoutHiddenServices: 'Hidden services',
  processParameters: 'Process parameters',
  layoutMode: 'Initial layout',
  gridVisible: 'Show grid',
  gridColor: 'Grid color',
  gridSize: 'Grid size',
  gridDivisions: 'Grid divisions',
  gridLineWidth: 'Grid line width',
  axesVisible: 'Show world axes',
  axesScale: 'World axis size',
  markerColor: 'Marker color',
  dashboard: 'Dashboard',
  // ROS Control process envelope (nested under processParameters).
  rosMasterUri: 'ROS master URI',
  gazeboWorld: 'Gazebo world',
  rvizConfigPath: 'RViz configuration',
  gazeboMaxStepSize: 'Gazebo max step size',
  gazeboRealTimeUpdateRate: 'Gazebo real-time update rate',
  gazeboVrpnAutoTrackKnownModels: 'Auto-track known models',
  gazeboVrpnTrackerPatterns: 'Tracker patterns',
  gazeboVrpnMatchMode: 'Model match mode',
  gazeboVrpnBindAddress: 'Bind address',
  gazeboVrpnPort: 'Port',
  gazeboVrpnPublishRate: 'Publish rate',
  gazeboVrpnScanInterval: 'Scan interval',
  gazeboVrpnStaleTimeout: 'Stale timeout',
  gazeboVrpnDerivativeResetTimeout: 'Derivative reset timeout',
  gazeboVrpnVelocityFilterCutoff: 'Velocity low-pass cutoff',
  gazeboVrpnAccelerationFilterCutoff: 'Acceleration low-pass cutoff',
  vrpnClientServerHost: 'VRPN client server host',
  vrpnClientServerPort: 'VRPN client server port',
  vrpnClientUpdateFrequencyHz: 'VRPN client update frequency',
  vrpnClientRefreshFrequencyHz: 'VRPN client discovery frequency',
  vrpnClientFrameId: 'VRPN client frame ID',
  vrpnClientUseServerTime: 'VRPN client uses server time',
  vrpnClientBroadcastTf: 'VRPN client broadcasts TF',
  vrpnClientUseSimTime: 'VRPN client uses simulation time',
};

const VIEW_LABELS: Record<string, string> = {
  controls: 'Compact controls',
  whiteboard: 'Workflow',
  history: 'Execution history',
  logs: 'Output and errors',
  '3d': '3D only',
  '3d-camera-ar': '3D · Augmented',
  'camera-ar-3d': 'Augmented · 3D',
  '3d-above-camera-ar': '3D / Augmented',
  'camera-ar-above-3d': 'Augmented / 3D',
  '3d-above-camera-ar-plot': '3D / AR · Plot',
};

export type PanelConfigDraftSnapshot = {
  options: Record<string, unknown>;
  portBindings: unknown;
  targetCoreId: string;
};

/** Panel-config discard list in plain language (no raw UUIDs / camelCase keys). */
export function listPanelConfigChanges(
  baseline: PanelConfigDraftSnapshot,
  draft: PanelConfigDraftSnapshot,
  options?: {
    includeExecutionTarget?: boolean;
    formatExecutionTarget?: (coreId: string) => string;
    /** Resolve resource ids (workflows, etc.) to display names. */
    resolveName?: (id: string) => string | undefined;
  },
): string[] {
  const resolveName = options?.resolveName ?? ((_id: string) => undefined);
  const changes: string[] = [];

  if (options?.includeExecutionTarget && baseline.targetCoreId !== draft.targetCoreId) {
    const format = options.formatExecutionTarget ?? ((id: string) => (id ? id : 'Local'));
    changes.push(
      `Execution target: ${format(baseline.targetCoreId)} → ${format(draft.targetCoreId)}`,
    );
  }

  changes.push(...summarizeOptions(baseline.options, draft.options, resolveName, 0));

  if (canonicalJSON(baseline.portBindings) !== canonicalJSON(draft.portBindings)) {
    changes.push('Panel connections');
  }

  if (changes.length <= MAX_LISTED_CHANGES) return changes;
  const hidden = changes.length - MAX_LISTED_CHANGES;
  return [...changes.slice(0, MAX_LISTED_CHANGES), `…and ${hidden} more`];
}

function summarizeOptions(
  baseline: Record<string, unknown>,
  draft: Record<string, unknown>,
  resolveName: (id: string) => string | undefined,
  depth: number,
): string[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
  const changes: string[] = [];

  for (const key of [...keys].sort()) {
    const before = baseline[key];
    const after = draft[key];
    if (canonicalJSON(before) === canonicalJSON(after)) continue;

    const label = optionLabel(key);

    if (key === 'defaultView' || key === 'layoutMode') {
      changes.push(`${label}: ${viewLabel(before)} → ${viewLabel(after)}`);
      continue;
    }

    if (typeof before === 'boolean' || typeof after === 'boolean') {
      changes.push(`${label}: ${boolLabel(before)} → ${boolLabel(after)}`);
      continue;
    }

    if (isStringIdList(before) || isStringIdList(after)) {
      // Service order / hidden lists are ordered ids — show a compact reorder line.
      if (key === 'layoutServiceOrder' || key === 'serviceOrder' || key === 'layoutHiddenServices' || key === 'hiddenServices') {
        changes.push(`${label} changed`);
        continue;
      }
      changes.push(...summarizeSelectionChange(
        label,
        asStringList(before),
        asStringList(after),
        resolveName,
      ));
      continue;
    }

    // Nested option bags (e.g. processParameters): expand to concrete field lines.
    if ((isPlainObject(before) || isPlainObject(after)) && depth < MAX_NEST_DEPTH) {
      const nested = summarizeOptions(
        isPlainObject(before) ? before : {},
        isPlainObject(after) ? after : {},
        resolveName,
        depth + 1,
      );
      if (nested.length === 0) {
        changes.push(`${label} changed`);
        continue;
      }
      for (const line of nested) {
        changes.push(`${label} · ${line}`);
      }
      continue;
    }

    if (typeof before === 'number' || typeof after === 'number') {
      changes.push(`${label}: ${formatScalar(before)} → ${formatScalar(after)}`);
      continue;
    }

    if (typeof before === 'string' || typeof after === 'string') {
      changes.push(`${label}: ${formatNamedScalar(before, resolveName)} → ${formatNamedScalar(after, resolveName)}`);
      continue;
    }

    changes.push(`${label} changed`);
  }

  return changes;
}

function optionLabel(key: string): string {
  return OPTION_LABELS[key] ?? humanizeKey(key);
}

function summarizeSelectionChange(
  label: string,
  before: string[],
  after: string[],
  resolveName: (id: string) => string | undefined,
): string[] {
  const beforeSet = new Set(before.filter(Boolean));
  const afterSet = new Set(after.filter(Boolean));
  const added = [...afterSet].filter((id) => !beforeSet.has(id)).map((id) => displayName(id, resolveName));
  const removed = [...beforeSet].filter((id) => !afterSet.has(id)).map((id) => displayName(id, resolveName));
  const lines: string[] = [];

  if (added.length === 0 && removed.length === 0) return lines;

  // Single select/deselect is the common automation-workflow case.
  if (added.length === 1 && removed.length === 0) {
    lines.push(`${label}: selected “${added[0]}”`);
    return lines;
  }
  if (removed.length === 1 && added.length === 0) {
    lines.push(`${label}: deselected “${removed[0]}”`);
    return lines;
  }
  if (added.length === 1 && removed.length === 1) {
    lines.push(`${label}: “${removed[0]}” → “${added[0]}”`);
    return lines;
  }

  if (removed.length) lines.push(`${label}: deselected ${joinNames(removed)}`);
  if (added.length) lines.push(`${label}: selected ${joinNames(added)}`);
  return lines;
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.map((name) => `“${name}”`).join(', ');
  return `${names.slice(0, 2).map((name) => `“${name}”`).join(', ')} and ${names.length - 2} more`;
}

function displayName(id: string, resolveName: (id: string) => string | undefined): string {
  const resolved = resolveName(id)?.trim();
  if (resolved) return resolved;
  // Never dump a full UUID to operators — fall back to a short token.
  if (looksLikeUuid(id)) return 'unknown workflow';
  return id;
}

function formatNamedScalar(value: unknown, resolveName: (id: string) => string | undefined): string {
  if (value === undefined || value === null) return '—';
  if (typeof value !== 'string') return formatScalar(value);
  if (value === '') return '—';
  if (looksLikeUuid(value)) return displayName(value, resolveName);
  return value;
}

function formatScalar(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return boolLabel(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value === '' ? '—' : value;
  return '—';
}

function boolLabel(value: unknown): string {
  return value === true ? 'On' : value === false ? 'Off' : '—';
}

function viewLabel(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  return VIEW_LABELS[value] ?? humanizeKey(value);
}

function isStringIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function asStringList(value: unknown): string[] {
  return isStringIdList(value) ? value : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
