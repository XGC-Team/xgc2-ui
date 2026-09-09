/* global process */

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const RUN_MODES = new Set(['simulation','physical','hybrid']);
const ACTIVE_RUN_STATUSES = new Set(['accepted','queued','running','waiting','stopping']);
const TERMINAL_RUN_STATUSES = new Set(['succeeded','failed','canceled','stopped','rejected']);

export const CAMERA_PANEL_KINDS = Object.freeze({
  world:'gazebo-world-camera',
  intrinsic:'camera-intrinsic-calibration',
});

const CAMERA_WORKSPACE_CONTRACTS = Object.freeze({
  [CAMERA_PANEL_KINDS.world]:Object.freeze({
    workspaceRole:'gazebo-world-camera-workspace',
    branchRole:'gazebo-world-camera-image-view',
    liveViewRole:'gazebo-world-camera-image-view',
    runtimeRole:'',
    emptyStateSelector:'[data-xgc-role="gazebo-world-camera-empty-state"]',
    lifecycleAttribute:'data-xgc-camera-lifecycle',
  }),
  [CAMERA_PANEL_KINDS.intrinsic]:Object.freeze({
    // This is the mounted intrinsic Panel root in the current product DOM.
    // camera-intrinsic-workspace belongs to an unused layout helper and is not
    // live browser evidence.
    workspaceRole:'camera-calibration-panel',
    branchRole:'',
    liveViewRole:'camera-intrinsic-image',
    runtimeRole:'camera-intrinsic-runtime',
    emptyStateSelector:':scope > .xgc-empty-state',
    lifecycleAttribute:'',
  }),
});

export const WORLD_CAMERA_VIDEO_CONTRACT = Object.freeze({
  lifecycle:'ready',
  state:'playing',
  readyState:4,
  videoWidth:3840,
  videoHeight:2160,
  minimumTimeDelta:0.2,
});

export const INTRINSIC_SIMULATION_VIDEO_CONTRACT = Object.freeze({
  lifecycle:'ready',
  state:'playing',
  readyState:4,
  videoWidth:3840,
  videoHeight:2160,
  minimumTimeDelta:0.2,
});

export const INTRINSIC_PHYSICAL_VIDEO_CONTRACT = Object.freeze({
  lifecycle:'ready',
  state:'playing',
  readyState:4,
  videoWidth:3840,
  videoHeight:2160,
  minimumTimeDelta:0.2,
});

export function readCameraTargets(env = process.env) {
  const rawCases = String(env.XGC_CAMERA_CASES ?? '').trim();
  const rawTargets = rawCases
    ? parseCases(rawCases)
    : [{
      caseId:env.XGC_CAMERA_CASE_ID,
      experimentId:env.XGC_CAMERA_EXPERIMENT_ID,
      panelId:env.XGC_CAMERA_PANEL_ID,
      dashboardId:env.XGC_CAMERA_DASHBOARD_ID,
      panelKind:env.XGC_CAMERA_PANEL_KIND,
      runMode:env.XGC_CAMERA_RUN_MODE,
    }];
  if (!rawTargets.length) throw new Error('XGC_CAMERA_CASES must contain at least one target');

  const targets = rawTargets.map((target,index) => normalizeTarget(target,`XGC_CAMERA_CASES[${index}]`));
  const seen = new Set();
  const seenCaseIds = new Set();
  for (const target of targets) {
    const key = `${target.experimentId}:${target.panelId}:${target.runMode}`;
    if (seen.has(key)) throw new Error(`duplicate Camera target ${key}`);
    if (seenCaseIds.has(target.caseId)) throw new Error(`duplicate Camera caseId ${target.caseId}`);
    seen.add(key);
    seenCaseIds.add(target.caseId);
  }
  return targets;
}

export function cameraWorkspaceContract(panelKind) {
  if (!Object.hasOwn(CAMERA_WORKSPACE_CONTRACTS,panelKind)) {
    throw new Error(
      `unknown Camera panel/workspace kind ${JSON.stringify(panelKind)}; expected ${Object.keys(CAMERA_WORKSPACE_CONTRACTS).join(' or ')}`,
    );
  }
  return CAMERA_WORKSPACE_CONTRACTS[panelKind];
}

export function cameraVideoContract(target) {
  object(target,'Camera target');
  const panelKind = identifier(target.panelKind,'Camera target.panelKind');
  const runMode = String(target.runMode ?? '').trim();
  cameraWorkspaceContract(panelKind);
  if (!RUN_MODES.has(runMode)) throw new Error('Camera target.runMode must be simulation, physical, or hybrid');
  if (panelKind === CAMERA_PANEL_KINDS.world) return WORLD_CAMERA_VIDEO_CONTRACT;
  if (runMode === 'simulation') return INTRINSIC_SIMULATION_VIDEO_CONTRACT;
  if (runMode === 'physical') return INTRINSIC_PHYSICAL_VIDEO_CONTRACT;
  throw new Error('Camera intrinsic live evidence supports simulation or physical runMode');
}

export function assertCameraInitialEvidence(evidence,target,label = 'camera') {
  const videoContract = cameraVideoContract(target);
  object(evidence,label);
  equal(evidence.lifecycle,videoContract.lifecycle,`${label} lifecycle`);
  equal(evidence.state,videoContract.state,`${label} playback state`);
  equal(evidence.readyState,videoContract.readyState,`${label} readyState`);
  equal(evidence.videoWidth,videoContract.videoWidth,`${label} videoWidth`);
  equal(evidence.videoHeight,videoContract.videoHeight,`${label} videoHeight`);
  finite(evidence.currentTime,`${label} currentTime`);
  equal(evidence.paused,false,`${label} paused`);
  equal(evidence.ended,false,`${label} ended`);
  if ('trackReadyState' in evidence) equal(evidence.trackReadyState,'live',`${label} track readyState`);
  return evidence;
}

export function assertWorldCameraInitialEvidence(evidence,label = 'world camera') {
  return assertCameraInitialEvidence(evidence,{
    panelKind:CAMERA_PANEL_KINDS.world,
    runMode:'simulation',
  },label);
}

export function assertCameraContinuity({ sameVideoElement,before,after },label = 'world camera continuity') {
  equal(sameVideoElement,true,`${label} DOM identity`);
  finite(before?.currentTime,`${label} before currentTime`);
  finite(after?.currentTime,`${label} after currentTime`);
  if (!(after.currentTime > before.currentTime + WORLD_CAMERA_VIDEO_CONTRACT.minimumTimeDelta)) {
    throw new Error(`${label} currentTime did not advance: ${before.currentTime} -> ${after.currentTime}`);
  }
  return after;
}

export function assertExclusiveCameraImageBranch(snapshot,label = 'world camera image branch') {
  object(snapshot,label);
  integer(snapshot.totalWorkspaceCount,`${label} total workspace count`);
  integer(snapshot.visibleWorkspaceCount,`${label} visible workspace count`);
  integer(snapshot.imageViewCount,`${label} image view count`);
  integer(snapshot.emptyStateCount,`${label} EmptyState count`);
  integer(snapshot.cameraPanelCount,`${label} CameraVideoPanel count`);
  if (snapshot.visibleWorkspaceCount > 1) {
    throw new Error(`${label} has more than one visible workspace`);
  }
  if (snapshot.visibleWorkspaceCount !== 1) {
    throw new Error(`${label} must have exactly one visible workspace`);
  }
  equal(snapshot.imageViewCount,1,`${label} image view count`);
  const emptyBranch = snapshot.emptyStateCount === 1 && snapshot.cameraPanelCount === 0;
  const videoBranch = snapshot.emptyStateCount === 0 && snapshot.cameraPanelCount === 1;
  if (!emptyBranch && !videoBranch) {
    throw new Error(`${label} must be EmptyState XOR CameraVideoPanel: ${JSON.stringify(snapshot)}`);
  }
  return snapshot;
}

export function assertRunStopMutualExclusion(snapshot,label = 'Experiment Run/Stop controls') {
  object(snapshot,label);
  const runVisible = Boolean(snapshot.runVisible);
  const stopVisible = Boolean(snapshot.stopVisible);
  if (runVisible && stopVisible) throw new Error(`${label} exposes Run and Stop together`);
  if (!snapshot.loadingVisible && runVisible === stopVisible) {
    throw new Error(`${label} must expose exactly one settled control`);
  }
  return snapshot;
}

export function assertNoCameraPromptOverlap(snapshot,label = 'world camera layout') {
  object(snapshot,label);
  integer(snapshot.visibleVideoCount,`${label} visible video count`);
  integer(snapshot.visiblePromptCount,`${label} visible prompt count`);
  finite(snapshot.overlapArea,`${label} overlap area`);
  if (snapshot.visibleVideoCount + snapshot.visiblePromptCount !== 1) {
    throw new Error(`${label} must expose exactly one visible image or prompt branch`);
  }
  if (snapshot.overlapArea !== 0) throw new Error(`${label} image overlaps prompt text by ${snapshot.overlapArea}px²`);
  return snapshot;
}

export function assertStopOwnershipClosure(snapshot,label = 'Experiment Stop ownership') {
  object(snapshot,label);
  if (!Array.isArray(snapshot.runs) || snapshot.runs.length === 0) throw new Error(`${label} has no owned Run closure`);
  const activeRuns = snapshot.runs.filter((run) => ACTIVE_RUN_STATUSES.has(run?.status));
  if (activeRuns.length) throw new Error(`${label} retained active Runs: ${activeRuns.map((run) => run?.id).join(', ')}`);
  const nonTerminalRuns = snapshot.runs.filter((run) => !TERMINAL_RUN_STATUSES.has(run?.status));
  if (nonTerminalRuns.length) throw new Error(`${label} retained Runs without terminal truth`);
  if (!Array.isArray(snapshot.sessions) || snapshot.sessions.length !== 0) throw new Error(`${label} retained Experiment Sessions`);
  if (!Array.isArray(snapshot.processes)) throw new Error(`${label} processes must be an array`);
  const activeProcesses = snapshot.processes.filter((process) => (
    process?.desiredState !== 'stopped' || process?.observedState !== 'stopped'
    || (process?.handle !== null && process?.handle !== undefined && process?.handle !== '')
  ));
  if (activeProcesses.length) throw new Error(`${label} retained Run-owned Processes`);
  return snapshot;
}

export function assertNoPageFaults(faults,label = 'browser') {
  if (!Array.isArray(faults) || faults.length) {
    throw new Error(`${label} reported console/page errors: ${JSON.stringify(faults)}`);
  }
}

function parseCases(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `XGC_CAMERA_CASES is invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (!Array.isArray(parsed)) throw new Error('XGC_CAMERA_CASES must be a JSON array');
  return parsed;
}

function normalizeTarget(target,label) {
  object(target,label);
  rejectTransientIdentity(target,label);
  const fixture = typeof target.fixture === 'string' ? { experimentId:target.fixture }
    : target.fixture === undefined ? undefined : object(target.fixture,`${label}.fixture`);
  const panel = typeof target.panel === 'string' ? { panelId:target.panel }
    : target.panel === undefined ? undefined : object(target.panel,`${label}.panel`);
  if (fixture) rejectTransientIdentity(fixture,`${label}.fixture`);
  if (panel) rejectTransientIdentity(panel,`${label}.panel`);
  const experimentId = identifier(fixture?.experimentId ?? target.experimentId,`${label}.fixture.experimentId`);
  const panelId = identifier(panel?.panelId ?? panel?.id ?? target.panelId,`${label}.panel.panelId`);
  const dashboardId = identifier(panel?.dashboardId ?? target.dashboardId ?? 'gcs',`${label}.panel.dashboardId`);
  const declaredPanelKinds = [target.panelKind,target.workspaceKind,panel?.kind,panel?.pluginId]
    .filter((value) => value !== undefined)
    .map((value,index) => identifier(value,`${label}.panelKind[${index}]`));
  const uniquePanelKinds = [...new Set(declaredPanelKinds)];
  if (uniquePanelKinds.length > 1) throw new Error(`${label} Camera panel/workspace kind declarations disagree`);
  const panelKind = uniquePanelKinds[0] ?? CAMERA_PANEL_KINDS.world;
  cameraWorkspaceContract(panelKind);
  const runMode = String(target.runMode ?? 'simulation').trim();
  if (!RUN_MODES.has(runMode)) throw new Error(`${label}.runMode must be simulation, physical, or hybrid`);
  const normalized = {
    caseId:identifier(target.caseId ?? `${experimentId}:${dashboardId}:${panelId}:${runMode}`,`${label}.caseId`),
    experimentId,panelId,dashboardId,panelKind,runMode,
  };
  cameraVideoContract(normalized);
  return normalized;
}

function rejectTransientIdentity(value,label) {
  for (const forbidden of ['runId','runIds','sessionId','mediaRunId']) {
    if (Object.prototype.hasOwnProperty.call(value,forbidden)) throw new Error(`${label} must not contain ${forbidden}`);
  }
}

function identifier(value,label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value.trim())) {
    throw new Error(`${label} must be a safe non-empty identifier`);
  }
  return value.trim();
}

function object(value,label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function integer(value,label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function finite(value,label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function equal(actual,expected,label) {
  if (actual !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  return actual;
}
