/* global console,document,getComputedStyle,HTMLIFrameElement,HTMLVideoElement,MediaStream,process,URL */
// Real-browser acceptance for the public System Experiment Runner lifecycle.
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';
import {
  SYSTEM_EXPERIMENT_RUNNER,
  activeSystemRunnerForExperiment,
  assertNoActiveSystemRunner,
  experimentOwnedProcesses,
  experimentSessions,
  getJSON,
  managedWorkflowBindingIds,
  orchestrationRun,
  orchestrationRelations,
  resolveManagedFixture,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';
import {
  captureLichtblickFrameDiagnostics,
  installBrowserDiagnostics,
  observeDynamicCanvas,
} from './lichtblick-browser-evidence-support.mjs';

export const ROS_AUTOSTART_SERVICE_IDS = Object.freeze(['roscore','gzserver','vrpn']);
export const ROS_MANUAL_VIEWER_SERVICE_IDS = Object.freeze(['rviz','gzclient']);
export const ROS_PROJECTED_SERVICE_IDS = Object.freeze([
  ...ROS_AUTOSTART_SERVICE_IDS,...ROS_MANUAL_VIEWER_SERVICE_IDS,
]);
export const ROS_SERVICE_CALL_NODE_ID = Object.freeze({
  roscore:'call-ros',
  gzserver:'call-gzserver',
  gzclient:'call-gzclient',
  rviz:'call-rviz',
  vrpn:'call-vrpn',
});
export const ROS_WORKFLOW_UNAVAILABLE = 'Experiment workflow runtime is unavailable.';
export const SCOUT_LIST_METRIC_CONTRACT = Object.freeze([
  Object.freeze({ role:'robot-ground-vrpn-position',title:'VRPN pos',valueCount:3,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-vrpn-velocity',title:'VRPN vel',valueCount:3,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-vrpn-speed',title:'VRPN spd',valueCount:1,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-vrpn-acceleration',title:'VRPN acc',valueCount:3,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-command-velocity',title:'CMD vel',valueCount:1,truth:'remote-command' }),
  Object.freeze({ role:'robot-ground-command-twist',title:'CMD twist',valueCount:1,truth:'remote-command' }),
  Object.freeze({ role:'robot-ground-battery-voltage',title:'Battery vol',valueCount:1,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-yaw',title:'Yaw',valueCount:1,truth:'required-telemetry' }),
]);
export const SCOUT_LIST_STATUS_ROLES = Object.freeze([
  'robot-network-indicator',
  'robot-position-indicator',
  'robot-power-indicator',
  'robot-control-indicator',
]);
export const STANDALONE_PANEL_ID = 'ros-control';
export const STANDALONE_PANEL_BINDING_ID = 'panel-ros-control';
export const RECONNECT_PANEL_ID = 'robot-instruments';
export const RECONNECT_PANEL_BINDING_ID = 'panel-robot-instruments';
export const STANDALONE_PROCESS_DEFINITION_IDS = Object.freeze([
  'gazebo-server','roscore','vrpn-client-ros1',
]);

export function assertScoutRunningReadoutSnapshot(snapshot,expectedRobotIds) {
  assertScoutSnapshotShape(snapshot,expectedRobotIds,'Run');
  for (const card of snapshot.cards) {
    if (card.health!=='healthy' || card.status!=='online') {
      throw new Error(`Run Scout ${card.id} is not operational`);
    }
    for (let index=0; index<SCOUT_LIST_METRIC_CONTRACT.length; index+=1) {
      const contract=SCOUT_LIST_METRIC_CONTRACT[index];
      const metric=card.metrics[index];
      const commandIsUnpublished=contract.truth==='remote-command'
        && metric.rate==='-- Hz'
        && metric.values.length===contract.valueCount
        && metric.values.every((value) => value==='--');
      if (commandIsUnpublished) continue;
      const rateHz=metricRateHz(metric.rate);
      if (rateHz==null || rateHz<=0 || rateHz>1_000) {
        throw new Error(`Run Scout ${card.id} ${contract.title} rate ${metric.rate || '(empty)'} is not live or explicitly unpublished`);
      }
      if (metric.values.length!==contract.valueCount || metric.values.some((value) => !isFiniteReadout(value))) {
        throw new Error(`Run Scout ${card.id} ${contract.title} readout is incomplete or partially published: ${metric.values.join(' ')}`);
      }
      const numbers=metric.values.map(Number);
      if (numbers.some((value) => Math.abs(value)>1_000_000)) {
        throw new Error(`Run Scout ${card.id} ${contract.title} readout is outside the evidence bound`);
      }
      if (contract.title==='VRPN spd' && numbers[0]<0) {
        throw new Error(`Run Scout ${card.id} VRPN spd is negative`);
      }
      if (contract.title==='Battery vol' && (numbers[0]<=0 || numbers[0]>100)) {
        throw new Error(`Run Scout ${card.id} Battery vol is outside the vehicle voltage bound`);
      }
    }
  }
  return snapshot;
}

export function assertScoutRunningReadoutSamples(samples,expectedRobotIds) {
  if (!Array.isArray(samples) || samples.length<2) {
    throw new Error('Scout Run readout evidence needs at least two stable-window samples');
  }
  let lastCapturedAt=0;
  for (const snapshot of samples) {
    assertScoutRunningReadoutSnapshot(snapshot,expectedRobotIds);
    if (!Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs<=lastCapturedAt) {
      throw new Error('Scout Run readout samples are not ordered in time');
    }
    lastCapturedAt=snapshot.capturedAtMs;
  }
  return summarizeScoutReadoutWindow(samples);
}

export function assertScoutStoppedReadouts(snapshot,expectedRobotIds) {
  assertScoutSnapshotShape(snapshot,expectedRobotIds,'Stop');
  for (const card of snapshot.cards) {
    for (let index=0; index<SCOUT_LIST_METRIC_CONTRACT.length; index+=1) {
      const contract=SCOUT_LIST_METRIC_CONTRACT[index];
      const metric=card.metrics[index];
      if (metric.rate!=='-- Hz' || metric.values.length!==contract.valueCount
        || metric.values.some((value) => value!=='--')) {
        throw new Error(`Stop Scout ${card.id} retained ${contract.title}: ${metric.rate} ${metric.values.join(' ')}`);
      }
    }
  }
  return snapshot;
}

export function assertScoutStoppedReadoutSamples(
  samples,expectedRobotIds,{ minimumSamples=3,minimumDurationMs=1_000 }={},
) {
  if (!Array.isArray(samples) || samples.length<minimumSamples) {
    throw new Error(`Scout Stop needs at least ${minimumSamples} stable samples`);
  }
  let lastCapturedAt=0;
  for (const snapshot of samples) {
    assertScoutStoppedReadouts(snapshot,expectedRobotIds);
    if (!Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs<=lastCapturedAt) {
      throw new Error('Scout Stop readout samples are not ordered in time');
    }
    lastCapturedAt=snapshot.capturedAtMs;
  }
  const duration=samples.at(-1).capturedAtMs-samples[0].capturedAtMs;
  if (duration<minimumDurationMs) {
    throw new Error(`Scout Stop stable window was ${duration} ms; expected at least ${minimumDurationMs} ms`);
  }
  return samples;
}

export function assertStandalonePanelSession(view,{
  experimentId,runMode,rootRunId,bindingId,managedBindingIds,
}) {
  if (view?.session?.experimentResourceId!==experimentId
    || view.session.mode!=='partial' || view.session.runMode!==runMode
    || !sessionMemberIsActive(view.members,'workflow_command','',rootRunId)) {
    throw new Error(`Panel Run did not create the expected partial Session: ${JSON.stringify(view)}`);
  }
  const activeBindings=activeWorkflowBindingOwners(view.members);
  if (activeBindings.get(bindingId)?.length!==1) {
    throw new Error(`partial Session did not own exactly ${bindingId}: ${JSON.stringify([...activeBindings])}`);
  }
  for (const candidate of managedBindingIds) {
    if (candidate!==bindingId && activeBindings.has(candidate)) {
      throw new Error(`unstarted managed binding ${candidate} became active in the partial Session`);
    }
  }
  if (activeBindings.size!==1) {
    throw new Error(`partial Session invented active bindings: ${JSON.stringify([...activeBindings])}`);
  }
  return { sessionId:view.session.id,bindingOwnerId:activeBindings.get(bindingId)[0] };
}

export function assertFullPanelSession(view,{
  sessionId,experimentId,runMode,fullRootRunId,managedBindingIds,requiredBindingIds=[],
}) {
  if (view?.session?.id!==sessionId || view.session.experimentResourceId!==experimentId
    || view.session.mode!=='full' || view.session.runMode!==runMode
    || !sessionMemberIsActive(view.members,'workflow_command','',fullRootRunId)) {
    throw new Error(`full Run did not promote the exact partial Session: ${JSON.stringify(view)}`);
  }
  const owners=activeWorkflowBindingOwners(view.members);
  for (const bindingId of managedBindingIds) {
    const bindingOwners=owners.get(bindingId) ?? [];
    if (bindingOwners.length>1) {
      throw new Error(`full Session has ${bindingOwners.length} active owners for ${bindingId}`);
    }
  }
  for (const bindingId of requiredBindingIds) {
    if ((owners.get(bindingId) ?? []).length!==1) {
      throw new Error(`full Session has no active owner for required binding ${bindingId}`);
    }
  }
  const unexpected=[...owners.keys()].filter((bindingId) => !managedBindingIds.includes(bindingId));
  if (unexpected.length>0) {
    throw new Error(`full Session invented managed bindings: ${unexpected.join(', ')}`);
  }
  return owners;
}

export function assertPanelReconnectPreservesBindingOwner(view,{
  bindingId,fullOwnerId,reconnectRootRunId,reconnectChildRunId,
}) {
  if (!sessionMemberIsActive(view?.members,'workflow_command','',reconnectRootRunId)) {
    throw new Error(`Panel reconnect root ${reconnectRootRunId} is not Session-owned`);
  }
  const owners=activeWorkflowBindingOwners(view.members).get(bindingId) ?? [];
  if (owners.length!==1 || owners[0]!==fullOwnerId || owners.includes(reconnectChildRunId)) {
    throw new Error(`Panel reconnect changed ${bindingId} owner: ${owners.join(', ') || '(none)'}`);
  }
  return owners[0];
}

export function assertStandaloneProcessDefinitions(processes) {
  const actual=[...new Set(processes.filter(evidenceProcessReady).map((process) => process.definitionId))].sort();
  const expected=[...STANDALONE_PROCESS_DEFINITION_IDS].sort();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) {
    throw new Error(`standalone ROS Panel Process closure is ${actual.join(', ') || '(empty)'}; expected ${expected.join(', ')}`);
  }
  return actual;
}

export function assertStandalonePanelControls(snapshot,{ panelId,otherPanelIds }) {
  const runs=new Set(snapshot?.runIds ?? []);
  const stops=new Set(snapshot?.stopIds ?? []);
  if (!stops.has(panelId) || runs.has(panelId)) {
    throw new Error(`standalone Panel ${panelId} is not projected as Stop`);
  }
  for (const otherPanelId of otherPanelIds) {
    if (!runs.has(otherPanelId) || stops.has(otherPanelId)) {
      throw new Error(`unstarted Panel ${otherPanelId} did not remain idle`);
    }
  }
  return snapshot;
}

export function assertFullDispatchExcludesOwnedBinding(relations,ownedBindingId,expectedBindingIds) {
  const groups=(relations?.childRunGroups ?? []).filter((group) => group.producerNodeId==='run-panels');
  if (groups.length!==1 || !['sealed','resolved'].includes(groups[0].state)) {
    throw new Error('full Run did not seal one run-panels dispatch group');
  }
  const members=(relations.childRunGroupMembers ?? []).filter((member) => member.groupId===groups[0].id);
  const actual=members.map((member) => member.itemKey).sort();
  const expected=expectedBindingIds.filter((bindingId) => bindingId!==ownedBindingId).sort();
  if (members.some((member) => !member.childRunId)
    || JSON.stringify(actual)!==JSON.stringify(expected)) {
    throw new Error(`full Run dispatched ${actual.join(', ') || '(none)'}; expected ${expected.join(', ') || '(none)'}`);
  }
  return members;
}

function activeWorkflowBindingOwners(members=[]) {
  const result=new Map();
  for (const member of members) {
    if (member.kind!=='workflow_run' || !sessionStatusIsActive(member.status)) continue;
    const owners=result.get(member.bindingId) ?? [];
    owners.push(member.ownerId);
    result.set(member.bindingId,owners);
  }
  return result;
}

function sessionMemberIsActive(members=[],kind,bindingId,ownerId) {
  return members.some((member) => member.kind===kind && member.ownerId===ownerId
    && (!bindingId || member.bindingId===bindingId) && sessionStatusIsActive(member.status));
}

function sessionStatusIsActive(status) {
  return status==='attached' || status==='running' || status==='stopping';
}

function evidenceProcessReady(process) {
  return process?.desiredState==='running' && process.observedState==='running'
    && process.handle!=null && process.readiness?.status==='passing' && process.liveness?.status==='passing';
}

export function summarizeScoutReadoutWindow(samples) {
  const first=samples[0];
  const last=samples.at(-1);
  return first.cards.map((firstCard) => {
    const lastCard=last.cards.find((card) => card.id===firstCard.id);
    return {
      id:firstCard.id,
      metrics:firstCard.metrics.map((metric,index) => ({
        role:metric.role,
        behavior:JSON.stringify(metric.values)===JSON.stringify(lastCard?.metrics[index]?.values)
          ? 'held' : 'advanced',
      })),
    };
  });
}

function assertScoutSnapshotShape(snapshot,expectedRobotIds,phase) {
  if (!snapshot || !Array.isArray(snapshot.cards)) throw new Error(`${phase} Scout DOM snapshot is absent`);
  const expected=[...expectedRobotIds].sort();
  const actual=snapshot.cards.map((card) => card.id).sort();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) {
    throw new Error(`${phase} Scout cards ${actual.join(',') || '(none)'} do not match ${expected.join(',')}`);
  }
  for (const card of snapshot.cards) {
    if (card.presentation!=='list' || card.platform!=='ground') {
      throw new Error(`${phase} Scout ${card.id} is not the ground list projection`);
    }
    const roles=card.metrics.map((metric) => metric.role);
    const titles=card.metrics.map((metric) => metric.title);
    if (JSON.stringify(roles)!==JSON.stringify(SCOUT_LIST_METRIC_CONTRACT.map((metric) => metric.role))
      || JSON.stringify(titles)!==JSON.stringify(SCOUT_LIST_METRIC_CONTRACT.map((metric) => metric.title))) {
      throw new Error(`${phase} Scout ${card.id} metric order drifted: ${titles.join(', ')}`);
    }
    const iconRoles=card.icons.map((icon) => icon.role).sort();
    if (JSON.stringify(iconRoles)!==JSON.stringify([...SCOUT_LIST_STATUS_ROLES].sort())) {
      throw new Error(`${phase} Scout ${card.id} header status icons are incomplete`);
    }
    for (const icon of card.icons) {
      if (icon.id!==card.id || !icon.hasGraphic || !icon.label) {
        throw new Error(`${phase} Scout ${card.id} header status icon ${icon.role} is not identifiable`);
      }
    }
    if (card.layout?.metricCount!==SCOUT_LIST_METRIC_CONTRACT.length
      || card.layout.rowCount!==2 || card.layout.columnCount!==4) {
      throw new Error(`${phase} Scout ${card.id} metric layout is not the authored 4x2 grid: ${JSON.stringify(card.layout)}`);
    }
    if (!Array.isArray(card.layout.clipped) || card.layout.clipped.length>0) {
      throw new Error(`${phase} Scout ${card.id} metric layout overflowed: ${JSON.stringify(card.layout?.clipped)}`);
    }
    if (!Array.isArray(card.layout.overlapped) || card.layout.overlapped.length>0) {
      throw new Error(`${phase} Scout ${card.id} metric layout overlapped: ${JSON.stringify(card.layout?.overlapped)}`);
    }
  }
}

function metricRateHz(value) {
  const match=/^(\d+(?:\.\d+)?) Hz$/.exec(String(value).trim());
  return match ? Number(match[1]) : null;
}

function isFiniteReadout(value) {
  return value!=='--' && value!=='' && Number.isFinite(Number(value));
}

/** RViz process ready is not a display oracle. Config must show TF+markers, not a pinned roster. */
export function assertRvizConfigDisplays(configText='') {
  const text=String(configText);
  for (const required of ['Class: rviz/Grid','Class: rviz/TF','Class: rviz/MarkerArray','Fixed Frame: world']) {
    if (!text.includes(required)) {
      throw new Error(`RViz config is missing ${required}`);
    }
  }
  const lowered=text.toLowerCase();
  for (const pinned of ['scout-01','scout-02','scout-03','scout-04','ugv1_body','uav1_actual_path']) {
    if (lowered.includes(pinned)) {
      throw new Error(`RViz config pins robot instance ${pinned}`);
    }
  }
}

/** Topic advancing: world must exist on /tf. Markers may be empty while waiting. Process ready is insufficient. */
export function assertRvizTopicsAdvancing(sample={}) {
  if (sample.processReady && !sample.tfHasWorld) {
    throw new Error('RViz process ready is not display evidence: /tf has no world parent');
  }
  if (!sample.tfHasWorld) {
    throw new Error('RViz data plane is waiting: /tf has no world parent');
  }
  if (Number(sample.tfTransforms) < 1) {
    throw new Error('RViz data plane /tf is not advancing');
  }
}
const ROS_CONTROL_WORKFLOW_INSTANCE = 'panel-ros-control';
const ROS_CONTROL_PANEL_ID = 'ros-control';
const ROS_RUN_STATUS_RANK = Object.freeze({
  accepted:1,queued:1,waiting:1,starting:1,running:2,ready:3,
});
const ROS_STOP_PHASE_STATUSES = new Set(['stopping','stopped','canceled']);

export function isRosStopPhaseStatus(status) {
  return ROS_STOP_PHASE_STATUSES.has(status);
}

export function rosControlPanelRunId(dispatchMembers,rootRunId='') {
  const member=(dispatchMembers || []).find((item) => item.itemKey === ROS_CONTROL_WORKFLOW_INSTANCE);
  if (!member?.childRunId) {
    throw new Error('managed Panel Workflow panel-ros-control was not dispatched');
  }
  if (rootRunId && member.childRunId === rootRunId) {
    throw new Error('ROS Control Panel Workflow Run must not be the System Runner root');
  }
  return member.childRunId;
}

export function rosGrandchildRunIds(
  relations,forbiddenRunIds=[],serviceIds=ROS_AUTOSTART_SERVICE_IDS,
) {
  const forbidden=new Set((forbiddenRunIds || []).filter(Boolean));
  const result={};
  for (const serviceId of serviceIds) {
    const callNodeId=ROS_SERVICE_CALL_NODE_ID[serviceId];
    const children=(relations?.childRuns || []).filter((child) => (
      child.callNodeId === callNodeId && !child.launchAbandonedAt
    ));
    if (children.length !== 1 || !children[0].childRunId) {
      throw new Error(`ROS ${serviceId} does not have exactly one ${callNodeId} grandchild`);
    }
    const childRunId=children[0].childRunId;
    if (forbidden.has(childRunId)) {
      throw new Error(`ROS ${serviceId} grandchild reused a parent or System root identity`);
    }
    result[serviceId]=childRunId;
  }
  return result;
}

export function rosConnectedTiles(snapshot,serviceIds=ROS_PROJECTED_SERVICE_IDS) {
  const byId=new Map((snapshot || []).map((tile) => [tile.id,tile]));
  return serviceIds.map((id) => {
    const tile=byId.get(id);
    if (!tile) throw new Error(`connected ROS tile ${id} is not rendered`);
    return tile;
  });
}

export function rosTilesAreReady(snapshot,grandchildRunIds) {
  try {
    return rosConnectedTiles(snapshot,Object.keys(grandchildRunIds)).every((tile) => (
      tile.status === 'ready'
      && tile.percent === 100
      && tile.running === 'true'
      && tile.runId === grandchildRunIds[tile.id]
    ));
  } catch {
    return false;
  }
}

export function assertRosTilesDuringRun(snapshot,grandchildRunIds) {
  for (const tile of rosConnectedTiles(snapshot,Object.keys(grandchildRunIds))) {
    const expected=grandchildRunIds[tile.id];
    if (!tile.status || tile.status === 'idle') {
      throw new Error(`ROS ${tile.id} UI stayed idle`);
    }
    if (tile.status !== 'running' && tile.status !== 'ready') {
      throw new Error(`ROS ${tile.id} status ${tile.status} is not running/ready`);
    }
    if (tile.running !== 'true') {
      throw new Error(`ROS ${tile.id} data-xgc-running is not true`);
    }
    if (!tile.runId || tile.runId !== expected) {
      throw new Error(`ROS ${tile.id} runId ${tile.runId || '(empty)'} is not grandchild ${expected}`);
    }
    if (tile.status === 'ready' && tile.percent !== 100) {
      throw new Error(`ROS ${tile.id} ready without data-xgc-progress=100`);
    }
  }
}

export function assertRosStartupSamples(samples,grandchildRunIds) {
  const serviceIds=Object.keys(grandchildRunIds);
  if (!samples?.length) throw new Error('ROS Control never sampled tile runtime attributes');
  const runSamples=samples.filter((sample) => !(sample.tiles || []).some((tile) => (
    serviceIds.includes(tile.id) && isRosStopPhaseStatus(tile.status)
  )));
  if (!runSamples.length) throw new Error('ROS Control Run samples were empty after excluding Stop-phase statuses');
  for (const serviceId of serviceIds) {
    const series=runSamples.map((sample) => (sample.tiles || []).find((tile) => tile.id === serviceId));
    let attached=false;
    let lastRank=0;
    let lastPercent=0;
    for (const tile of series) {
      if (!tile) continue;
      const unprojected=!tile.runId && (!tile.status || tile.status === 'idle') && tile.percent === 0;
      if (!attached) {
        if (unprojected) continue;
        attached=true;
      }
      if (!tile.status || tile.status === 'idle') {
        throw new Error(`ROS ${serviceId} returned to idle after projecting runtime`);
      }
      const rank=ROS_RUN_STATUS_RANK[tile.status];
      if (!rank) throw new Error(`ROS ${serviceId} has non-monotonic status ${tile.status}`);
      if (rank < lastRank) {
        throw new Error(`ROS ${serviceId} status receded to ${tile.status}`);
      }
      if (tile.percent < lastPercent) {
        throw new Error(`ROS ${serviceId} data-xgc-progress receded from ${lastPercent} to ${tile.percent}`);
      }
      if (tile.runId && tile.runId !== grandchildRunIds[serviceId]) {
        throw new Error(`ROS ${serviceId} runId ${tile.runId} is not grandchild ${grandchildRunIds[serviceId]}`);
      }
      lastRank=rank;
      lastPercent=tile.percent;
    }
    if (!attached) throw new Error(`ROS ${serviceId} never projected grandchild runtime`);
  }
  assertRosTilesDuringRun(runSamples.at(-1).tiles,grandchildRunIds);
}

export function assertManualViewersNotAutoStarted(snapshot,relations) {
  const byId=new Map(rosConnectedTiles(snapshot,ROS_MANUAL_VIEWER_SERVICE_IDS).map((tile) => [tile.id,tile]));
  for (const serviceId of ROS_MANUAL_VIEWER_SERVICE_IDS) {
    const callNodeId=ROS_SERVICE_CALL_NODE_ID[serviceId];
    const automaticChildren=(relations?.childRuns || []).filter((child) => (
      child.callNodeId === callNodeId && !child.launchAbandonedAt
    ));
    if (automaticChildren.length !== 0) {
      throw new Error(`ROS ${serviceId} unexpectedly auto-started through ${callNodeId}`);
    }
    const tile=byId.get(serviceId);
    if (tile.runId || (tile.status && tile.status !== 'idle') || tile.percent !== 0 || tile.running === 'true') {
      throw new Error(`ROS ${serviceId} viewer tile was not idle before its manual Action`);
    }
  }
}

export function manualViewerRunIds(snapshot,forbiddenRunIds=[]) {
  const forbidden=new Set((forbiddenRunIds || []).filter(Boolean));
  const result={};
  for (const tile of rosConnectedTiles(snapshot,ROS_MANUAL_VIEWER_SERVICE_IDS)) {
    if (tile.status !== 'ready' || tile.percent !== 100 || tile.running !== 'true' || !tile.runId) {
      throw new Error(`ROS ${tile.id} manual viewer Action did not reach ready`);
    }
    if (forbidden.has(tile.runId) || Object.values(result).includes(tile.runId)) {
      throw new Error(`ROS ${tile.id} manual viewer Action reused another Run identity`);
    }
    result[tile.id]=tile.runId;
  }
  return result;
}

export function assertRosTilesAfterStop(snapshot) {
  for (const tile of rosConnectedTiles(snapshot)) {
    if (tile.status && tile.status !== 'idle') {
      throw new Error(`ROS ${tile.id} status ${tile.status} after Stop`);
    }
    if (tile.runId) throw new Error(`ROS ${tile.id} retained runId ${tile.runId} after Stop`);
    if (tile.percent !== 0) throw new Error(`ROS ${tile.id} progress ${tile.percent} after Stop`);
    if (tile.running === 'true') throw new Error(`ROS ${tile.id} still running after Stop`);
  }
}

export function rosTilesAreStopped(snapshot) {
  try {
    assertRosTilesAfterStop(snapshot);
    return true;
  } catch {
    return false;
  }
}

export function assertRosWhiteboardAvailable(state,{
  requiredRunIds=[],forbiddenRunIds=[],minimumDepth=0,
}={}) {
  const text=(state?.text || '').trim();
  if (text.includes(ROS_WORKFLOW_UNAVAILABLE)) {
    throw new Error('ROS Whiteboard still shows Experiment workflow runtime is unavailable');
  }
  if (state?.graphState === 'empty') {
    throw new Error('ROS Whiteboard graph stayed empty during Run');
  }
  const tree=state?.tree;
  if (!tree || tree.rootCount!==1 || !Array.isArray(tree.runIds)) {
    throw new Error(`ROS Whiteboard recursive Run tree is absent: ${JSON.stringify(tree)}`);
  }
  const actual=new Set(tree.runIds);
  const missing=requiredRunIds.filter((runId) => !actual.has(runId));
  if (missing.length>0) {
    throw new Error(`ROS Whiteboard Run tree is missing ${missing.join(', ')}`);
  }
  const leaked=forbiddenRunIds.filter((runId) => actual.has(runId));
  if (leaked.length>0) {
    throw new Error(`ROS Whiteboard Run tree leaked ${leaked.join(', ')}`);
  }
  if (!Number.isSafeInteger(tree.maxDepth) || tree.maxDepth<minimumDepth) {
    throw new Error(`ROS Whiteboard Run tree depth ${tree.maxDepth} is below ${minimumDepth}`);
  }
  return state;
}

function isExecutedDirectly() {
  const entry=process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isExecutedDirectly()) {
  await main();
}

async function main() {
const configuration = {
  webUrl:requiredURL('XGC_LOCAL_FLEET_WEB_URL','http://127.0.0.1:5174'),
  experimentId:optionalID('XGC_LOCAL_FLEET_EXPERIMENT_ID'),
  expectedMediaWidth:requiredPositiveInteger('XGC_LOCAL_FLEET_EXPECTED_MEDIA_WIDTH',3840),
  expectedMediaHeight:requiredPositiveInteger('XGC_LOCAL_FLEET_EXPECTED_MEDIA_HEIGHT',2160),
  expectedMediaFPS:requiredPositiveNumber('XGC_LOCAL_FLEET_EXPECTED_MEDIA_FPS',30),
  expectedMediaCodec:required('XGC_LOCAL_FLEET_EXPECTED_MEDIA_CODEC','H264'),
  evidencePath:required('XGC_LOCAL_FLEET_BROWSER_EVIDENCE'),
  preserveRunOnFailure:process.env.XGC_LOCAL_FLEET_PRESERVE_RUN_ON_FAILURE === '1',
};
const providerTimeoutMs=180_000;

mkdirSync(dirname(configuration.evidencePath),{ recursive:true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1600,height:1000 } });
const page = await context.newPage();
const diagnostics = installBrowserDiagnostics(page);
const pageErrors = [];
const lifecycleResponses = [];
const executionStreams = [];
const mediaSessionAnswers = [];
let experiment;
let expectedRobotCount=0;
let expectedRobotIds=[];
let runId='';
let standalonePanelLifecycle;
let canvasMotion=[];
let cameraContinuitySamples=[];
let lastScoutReadoutSnapshot;
page.on('pageerror',(error) => pageErrors.push(error.message));
page.on('request',(request) => {
  if (new URL(request.url()).pathname === '/api/execution-targets/local/events') {
    executionStreams.push(request.url());
  }
});
page.on('response',(response) => {
  const path=new URL(response.url()).pathname;
  if (response.request().method()==='POST'
    && /\/api\/v1\/sources\/[^/]+\/sessions$/.test(path) && response.ok()) {
    void response.json().then((answer) => mediaSessionAnswers.push(answer)).catch(() => undefined);
  }
  if (path === '/api/execution-targets/local/orchestration-runs'
    || /\/api\/execution-targets\/local\/orchestration-runs\/[^/]+\/stop-set$/.test(path)) {
    if (lifecycleResponses.length >= 50) lifecycleResponses.shift();
    lifecycleResponses.push({ method:response.request().method(),status:response.status(),url:response.url() });
  }
});

try {
  experiment=await resolveManagedFixture(context,configuration.webUrl,{
    key:'four-scout',name:'4 Scout Mini vehicles experiment',resourceId:configuration.experimentId,
  });
  configuration.experimentId=experiment.head.resourceId;
  expectedRobotIds=experiment.spec.robots
    .filter((robot) => Object.hasOwn(robot,'scout'))
    .map((robot) => robot.id);
  expectedRobotCount=expectedRobotIds.length;
  if (expectedRobotCount < 1) throw new Error('Scout fixture has no authored Scout Robot assets');
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  await openExperiment(page);
  await selectSimulation(page);

  standalonePanelLifecycle=await runStandalonePanelLifecycleRound();
  const primary=await runRound('primary',{ refreshDuringRun:true,continuitySamples:6 });
  canvasMotion=primary.lichtblick.canvases;
  cameraContinuitySamples=primary.camera.continuitySamples;
  await page.screenshot({ path:`${configuration.evidencePath}.running.png`,fullPage:true });
  const immediate=await runRound('same-page-immediate-rerun',{ refreshDuringRun:false,continuitySamples:1 });
  await page.reload({ waitUntil:'domcontentloaded',timeout:30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]').waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
  const idleRefresh=await runRound('idle-refresh-rerun',{ refreshDuringRun:true,continuitySamples:1 });

  if (executionStreams.length===0) throw new Error('browser never opened target execution SSE');
  if (pageErrors.length>0) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
  const evidence={
    experimentId:configuration.experimentId,runMode:'simulation',expectedRobotCount,
    lifecycle:{ systemRunner:SYSTEM_EXPERIMENT_RUNNER,lifecycleResponses,executionStreams },
    standalonePanelLifecycle,primary,hardeningRounds:[immediate,idleRefresh],pageErrors,diagnostics,
  };
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  writeFileSync(configuration.evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
} catch (cause) {
  const failurePath=`${configuration.evidencePath}.failure`;
  await page.screenshot({ path:`${failurePath}.png`,fullPage:true }).catch(() => undefined);
  const failureState=await page.evaluate((panelId) => ({
    robots:[...document.querySelectorAll('[data-xgc-role="run-robot-card"]')].map((element) => ({
      id:element.getAttribute('data-xgc-id'),health:element.getAttribute('data-xgc-health'),
      status:element.getAttribute('data-xgc-status'),text:(element.textContent||'').trim().replace(/\s+/g,' ').slice(0,500),
    })),
    ros:[...document.querySelectorAll(
      `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${panelId}"] [data-xgc-role="ros-basic-service-control"]`,
    )].map((element) => ({
      id:element.getAttribute('data-xgc-id'),status:element.getAttribute('data-xgc-status'),
      runId:element.getAttribute('data-xgc-run-id'),progress:element.getAttribute('data-xgc-progress'),
      running:element.getAttribute('data-xgc-running'),
    })),
    camera:[...document.querySelectorAll('[data-xgc-role="camera-video-panel"]')].map((element) => ({
      state:element.getAttribute('data-state'),text:(element.textContent||'').trim().replace(/\s+/g,' ').slice(0,500),
    })),
  }),ROS_CONTROL_PANEL_ID).catch((error) => ({ captureError:error.message }));
  const failureLichtblick=await captureLichtblickFrameDiagnostics(page);
  writeFileSync(`${failurePath}.json`,`${JSON.stringify({
    error:cause instanceof Error ? cause.message : String(cause),url:page.url(),runId,pageErrors,
    lifecycleResponses,executionStreams,mediaSessionAnswers,diagnostics,cameraContinuitySamples,
    canvasMotion,standalonePanelLifecycle,state:failureState,
    scoutReadoutSnapshot:lastScoutReadoutSnapshot,lichtblick:failureLichtblick,
  },null,2)}\n`);
  if (configuration.preserveRunOnFailure) {
    console.error(`E2E_PRESERVED_FAILURE runId=${runId} error=${cause instanceof Error ? cause.message : String(cause)}`);
    await new Promise(() => undefined);
  }
  await stopThroughUI(page).catch(() => undefined);
  throw cause;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function runStandalonePanelLifecycleRound() {
  await selectGCS(page);
  await selectSimulation(page);
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  await page.locator(`[data-xgc-role="experiment-run"][data-xgc-id="${configuration.experimentId}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
  const managedBindingIds=managedWorkflowBindingIds(experiment);
  const initialControls=await panelWorkflowControlSnapshot(page);
  const otherPanelIds=initialControls.runIds.filter((panelId) => panelId!==STANDALONE_PANEL_ID);
  if (!initialControls.runIds.includes(STANDALONE_PANEL_ID)
    || !initialControls.runIds.includes(RECONNECT_PANEL_ID) || otherPanelIds.length===0) {
    throw new Error(`idle Experiment did not expose the managed Panel Run controls: ${JSON.stringify(initialControls)}`);
  }

  const standalone=await clickPanelWorkflowRun(page,STANDALONE_PANEL_ID,{});
  runId=standalone.run.id;
  const partial=await waitFor(async () => {
    const sessions=await experimentSessions(context,configuration.webUrl,configuration.experimentId);
    if (sessions.length!==1) return undefined;
    try {
      const identity=assertStandalonePanelSession(sessions[0],{
        experimentId:configuration.experimentId,runMode:'simulation',rootRunId:standalone.run.id,
        bindingId:STANDALONE_PANEL_BINDING_ID,managedBindingIds,
      });
      return { view:sessions[0],...identity };
    } catch { return undefined; }
  },30_000,'standalone ROS Panel did not open one partial Session');
  await page.locator(`[data-xgc-role="experiment-stop"][data-xgc-id="${configuration.experimentId}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
  const standaloneChild=await panelRunChildRef(standalone.run.id,STANDALONE_PANEL_BINDING_ID);
  const rosChildren=await waitFor(async () => {
    try {
      return rosGrandchildRunIds(
        await orchestrationRelations(context,configuration.webUrl,standaloneChild.runId),
        [standalone.run.id,standaloneChild.runId],
      );
    } catch { return undefined; }
  },providerTimeoutMs,'standalone ROS Panel did not seal its necessary service children',100);
  const standaloneProcesses=await waitFor(async () => {
    const processes=await experimentOwnedProcesses(context,configuration.webUrl,standalone.run.id);
    const ready=new Set(processes.filter(processReady).map((process) => process.definitionId));
    if (!STANDALONE_PROCESS_DEFINITION_IDS.every((definitionId) => ready.has(definitionId))) return undefined;
    assertStandaloneProcessDefinitions(processes);
    return processes;
  },providerTimeoutMs,'standalone ROS Panel necessary Processes did not become ready',100);
  const standaloneTiles=await waitFor(async () => {
    const tiles=await rosTileSnapshot(page);
    return rosTilesAreReady(tiles,rosChildren) ? tiles : undefined;
  },providerTimeoutMs,'standalone ROS Panel service tiles did not become ready',100);
  assertManualViewersNotAutoStarted(
    standaloneTiles,await orchestrationRelations(context,configuration.webUrl,standaloneChild.runId),
  );
  const partialControls=await waitFor(async () => {
    const snapshot=await panelWorkflowControlSnapshot(page);
    try {
      return assertStandalonePanelControls(snapshot,{ panelId:STANDALONE_PANEL_ID,otherPanelIds });
    } catch { return undefined; }
  },30_000,'unstarted Panels did not remain idle after standalone Panel Run',100);

  const full=await startFullExperimentThroughPublicAPI();
  runId=full.run.id;
  const fullBoundary=await waitFor(async () => {
    const sessions=await experimentSessions(context,configuration.webUrl,configuration.experimentId);
    if (sessions.length!==1) return undefined;
    try {
      const owners=assertFullPanelSession(sessions[0],{
        sessionId:partial.sessionId,experimentId:configuration.experimentId,runMode:'simulation',
        fullRootRunId:full.run.id,managedBindingIds,
        requiredBindingIds:[STANDALONE_PANEL_BINDING_ID,RECONNECT_PANEL_BINDING_ID],
      });
      const relations=await orchestrationRelations(context,configuration.webUrl,full.run.id);
      const dispatchMembers=assertFullDispatchExcludesOwnedBinding(
        relations,STANDALONE_PANEL_BINDING_ID,managedBindingIds,
      );
      if (owners.get(STANDALONE_PANEL_BINDING_ID)?.[0]!==partial.bindingOwnerId) {
        throw new Error('full Run replaced the standalone ROS Panel binding owner');
      }
      return { view:sessions[0],relations,dispatchMembers,owners };
    } catch { return undefined; }
  },providerTimeoutMs,'partial Session did not promote to one non-duplicating full Run',100);

  const selectedRobotId=await selectOneRobotCard(page,expectedRobotIds[0]);
  const reconnectOverrides={
    robotId:selectedRobotId,robotIds:[selectedRobotId],
    selectionKey:`selected:${JSON.stringify([selectedRobotId])}`,
  };
  const reconnect=await clickPanelWorkflowRun(page,RECONNECT_PANEL_ID,reconnectOverrides);
  const reconnectChild=await panelRunChildRef(reconnect.run.id,RECONNECT_PANEL_BINDING_ID);
  const fullOwnerId=fullBoundary.owners.get(RECONNECT_PANEL_BINDING_ID)[0];
  const reconnectSession=await waitFor(async () => {
    const sessions=await experimentSessions(context,configuration.webUrl,configuration.experimentId);
    if (sessions.length!==1) return undefined;
    try {
      assertPanelReconnectPreservesBindingOwner(sessions[0],{
        bindingId:RECONNECT_PANEL_BINDING_ID,fullOwnerId,
        reconnectRootRunId:reconnect.run.id,reconnectChildRunId:reconnectChild.runId,
      });
      return sessions[0];
    } catch { return undefined; }
  },30_000,'selection-scoped Panel reconnect replaced the full binding owner',100);

  const stopped=await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId:full.run.id,timeoutMs:providerTimeoutMs,
  });
  const ownedRootIds=[standalone.run.id,full.run.id,reconnect.run.id];
  const terminalRoots=await waitFor(async () => {
    const roots=await Promise.all(ownedRootIds.map((rootRunId) => orchestrationRun(
      context,configuration.webUrl,rootRunId,
    )));
    if (roots.some((root) => !['succeeded','failed','canceled','stopped','rejected'].includes(root.status))) {
      return undefined;
    }
    for (const rootRunId of ownedRootIds) {
      const processes=await experimentOwnedProcesses(context,configuration.webUrl,rootRunId);
      if (processes.some((process) => !processInactive(process))) return undefined;
    }
    return roots;
  },providerTimeoutMs,'Total Stop left one standalone/full/reconnect root or Process active',100);
  runId='';
  return {
    partial:{
      root:standalone.run,sessionId:partial.sessionId,bindingOwnerId:partial.bindingOwnerId,
      child:standaloneChild,rosChildren,processes:standaloneProcesses.map(processEvidence),
      tiles:standaloneTiles,controls:partialControls,
    },
    full:{ root:full.run,dispatchMembers:fullBoundary.dispatchMembers,
      bindingOwners:Object.fromEntries(fullBoundary.owners) },
    reconnect:{ root:reconnect.run,child:reconnectChild,selectedRobotId,
      retainedFullOwnerId:fullOwnerId,sessionRevision:reconnectSession.session.revision },
    stop:{ action:stopped.run,roots:terminalRoots.map((root) => ({ id:root.id,status:root.status })) },
  };
}

async function clickPanelWorkflowRun(page,panelId,inputOverrides) {
  const control=page.locator(`[data-xgc-role="panel-workflow-run"][data-xgc-id="${panelId}"]`);
  await control.waitFor({ state:'visible',timeout:30_000 });
  if (await control.isDisabled()) {
    throw new Error(`Panel Run ${panelId} is disabled: ${await control.getAttribute('title') || 'no reason'}`);
  }
  const serialized=JSON.stringify(inputOverrides);
  const attemptedRequests=[];
  const captureRequest=(request) => {
    if (request.method()!=='POST'
      || new URL(request.url()).pathname!=='/api/execution-targets/local/orchestration-runs') return;
    try { attemptedRequests.push(request.postDataJSON()); } catch { attemptedRequests.push(request.postData()); }
  };
  page.on('request',captureRequest);
  const responsePromise=page.waitForResponse((candidate) => {
    if (candidate.request().method()!=='POST'
      || new URL(candidate.url()).pathname!=='/api/execution-targets/local/orchestration-runs') return false;
    try {
      const request=candidate.request().postDataJSON();
      return request?.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
        && request?.experimentRef?.resourceId===configuration.experimentId
        && request?.parameters?.panelId===panelId
        && request.parameters.runMode==='simulation'
        && sameJSONText(request.parameters.inputOverridesJson,serialized);
    } catch { return false; }
  },{ timeout:30_000 });
  await control.click();
  let response;
  try {
    response=await responsePromise;
  } catch (cause) {
    const state=await page.evaluate(({ panelId }) => {
      const control=document.querySelector(
        `[data-xgc-role="panel-workflow-run"][data-xgc-id="${panelId}"],`
        +`[data-xgc-role="panel-workflow-stop"][data-xgc-id="${panelId}"]`,
      );
      return {
        control:control ? {
          role:control.getAttribute('data-xgc-role'),disabled:(control).disabled,
          title:control.getAttribute('title'),html:control.outerHTML,
        } : null,
        toasts:[...document.querySelectorAll('[data-xgc-role="ground-station-interaction-toast"]')]
          .map((toast) => (toast.textContent||'').trim().replace(/\s+/g,' ')),
      };
    },{ panelId });
    throw new Error(
      `Panel Run ${panelId} produced no matching response: ${cause instanceof Error ? cause.message : String(cause)}; `
      +`attempted requests: ${JSON.stringify(attemptedRequests)}; UI: ${JSON.stringify(state)}`,
      { cause },
    );
  } finally {
    page.off('request',captureRequest);
  }
  const body=await responseJSON(response);
  if (response.status()!==202 || body?.run?.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
    || body.run.parameters?.panelId!==panelId
    || !sameJSONText(body.run.parameters?.inputOverridesJson,serialized)) {
    throw new Error(`Panel Run ${panelId} returned an invalid root: ${response.status()} ${JSON.stringify(body)}`);
  }
  return { status:response.status(),request:response.request().postDataJSON(),...body };
}

async function startFullExperimentThroughPublicAPI() {
  const requestId=`local-fleet-panel-promote:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const request={
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,
    automationRef:{
      domain:SYSTEM_EXPERIMENT_RUNNER.domain,resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
      branch:SYSTEM_EXPERIMENT_RUNNER.branch,
    },
    experimentRef:{ domain:'experiment',resourceId:configuration.experimentId,branch:'main' },
    parameters:{ runMode:'simulation' },requestId,idempotencyKey:requestId,
    reason:`Promote partial Experiment ${configuration.experimentId} to full Run`,
  };
  const response=await context.request.post(
    `${configuration.webUrl}/api/execution-targets/local/orchestration-runs`,{
      data:request,headers:{ 'X-Request-ID':requestId,'Idempotency-Key':requestId },
    },
  );
  const body=await response.json().catch(async () => ({ error:await response.text() }));
  if (response.status()!==202 || body?.run?.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.run
    || body.run.sourceRef?.resourceId!==configuration.experimentId) {
    throw new Error(`full Run promotion HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  return { status:response.status(),request,...body };
}

async function panelRunChildRef(rootRunId,bindingId) {
  return waitFor(async () => {
    const relations=await orchestrationRelations(context,configuration.webUrl,rootRunId);
    const groups=(relations.childRunGroups ?? []).filter((group) => group.producerNodeId==='run-selected-panel');
    if (groups.length!==1 || !['sealed','resolved'].includes(groups[0].state)) return undefined;
    const members=(relations.childRunGroupMembers ?? []).filter((member) => member.groupId===groups[0].id);
    if (members.length!==1 || members[0].itemKey!==bindingId || !members[0].childRunId) return undefined;
    const children=(relations.childRuns ?? []).filter((child) => child.childRunId===members[0].childRunId);
    if (children.length!==1) return undefined;
    return { targetId:children[0].targetId || members[0].targetId || 'local',runId:members[0].childRunId };
  },providerTimeoutMs,`Panel Run ${rootRunId} did not dispatch exact binding ${bindingId}`,100);
}

async function panelWorkflowControlSnapshot(page) {
  return page.evaluate(() => ({
    runIds:[...document.querySelectorAll('[data-xgc-role="panel-workflow-run"]')]
      .filter((element) => element.getClientRects().length>0)
      .map((element) => element.getAttribute('data-xgc-id')).filter(Boolean).sort(),
    stopIds:[...document.querySelectorAll('[data-xgc-role="panel-workflow-stop"]')]
      .filter((element) => element.getClientRects().length>0)
      .map((element) => element.getAttribute('data-xgc-id')).filter(Boolean).sort(),
  }));
}

async function selectOneRobotCard(page,robotId) {
  const cards=page.locator('[data-xgc-role="run-robot-card"]');
  await cards.first().waitFor({ state:'visible',timeout:30_000 });
  for (let index=0;index<await cards.count();index+=1) {
    const card=cards.nth(index);
    if (await card.getAttribute('aria-pressed')==='true') await card.click();
  }
  const card=page.locator(`[data-xgc-role="run-robot-card"][data-xgc-id="${robotId}"]`);
  await card.click();
  await waitFor(async () => await card.getAttribute('aria-pressed')==='true' ? true : undefined,
    10_000,`${robotId} did not become the reconnect selection`);
  return robotId;
}

async function responseJSON(response) {
  try { return await response.json(); } catch { return { error:await response.text().catch(() => '') }; }
}

function sameJSONText(left,right) {
  try { return isDeepStrictEqual(JSON.parse(left),JSON.parse(right)); } catch { return false; }
}

async function runRound(label,{ refreshDuringRun,continuitySamples }) {
  await selectGCS(page);
  await selectSimulation(page);
  await page.locator(
    `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${ROS_CONTROL_PANEL_ID}"] [data-xgc-role="ros-basic-service-control"]`,
  ).first().waitFor({ state:'visible',timeout:30_000 });
  const initialProgress=await rosTileSnapshot(page);
  const sessionStart=mediaSessionAnswers.length;
  const started=await startExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runMode:'simulation',
  });
  runId=started.run.id;
  const rosPanelRunId=rosControlPanelRunId(started.dispatchMembers,started.run.id);
  const grandchildRunIds=await waitFor(async () => {
    try {
      return rosGrandchildRunIds(
        await orchestrationRelations(context,configuration.webUrl,rosPanelRunId),
        [started.run.id,rosPanelRunId],
      );
    } catch {
      return undefined;
    }
  },providerTimeoutMs,`${label} ROS Control call-node grandchildren were not sealed`,100);

  const startupSamples=[];
  const sampleKeys=new Set();
  const providers=await waitFor(async () => {
    const tiles=await rosTileSnapshot(page);
    const key=JSON.stringify(tiles.map(({ id,status,percent,runId:tileRunId,running }) => (
      { id,status,percent,runId:tileRunId,running }
    )));
    if (!sampleKeys.has(key)) {
      sampleKeys.add(key);
      startupSamples.push({ elapsedMs:Date.now()-Date.parse(started.run.acceptedAt),tiles });
    }
    const owned=await experimentOwnedProcesses(context,configuration.webUrl,runId);
    const scouts=owned.filter((process) => process.definitionId==='scout-gazebo-robot');
    const media=owned.filter((process) => process.definitionId==='xgc-media-edge');
    const cameras=owned.filter((process) => process.definitionId==='gazebo-static-camera');
    const web=owned.filter((process) => process.definitionId==='lichtblick-web');
    const scene=owned.filter((process) => process.definitionId==='lichtblick-robot-scene');
    if (scouts.length!==expectedRobotCount || media.length!==1 || cameras.length!==1 || web.length!==1 || scene.length!==1
      || !owned.every(processReady)) return undefined;
    return { owned,scouts,media:media[0],camera:cameras[0],web:web[0],scene:scene[0] };
  },providerTimeoutMs,`${label} authored Panel providers did not become ready`,100);
  const rosTiles=await waitFor(async () => {
    const tiles=await rosTileSnapshot(page);
    const key=JSON.stringify(tiles.map(({ id,status,percent,runId:tileRunId,running }) => (
      { id,status,percent,runId:tileRunId,running }
    )));
    if (!sampleKeys.has(key)) {
      sampleKeys.add(key);
      startupSamples.push({ elapsedMs:Date.now()-Date.parse(started.run.acceptedAt),tiles });
    }
    return rosTilesAreReady(tiles,grandchildRunIds) ? tiles : undefined;
  },providerTimeoutMs,`${label} ROS Control tiles did not project grandchild runtime`,100);
  assertRosStartupSamples(startupSamples,grandchildRunIds);
  assertRosTilesDuringRun(rosTiles,grandchildRunIds);
  const rosPanelRelations=await orchestrationRelations(context,configuration.webUrl,rosPanelRunId);
  assertManualViewersNotAutoStarted(rosTiles,rosPanelRelations);
  const manualViewers=await startManualRosViewers(page,[
    started.run.id,rosPanelRunId,...Object.values(grandchildRunIds),
  ],label);
  const projectedRunIds={ ...grandchildRunIds,...manualViewers.runIds };
  const rosTreeExpectations={
    requiredRunIds:[rosPanelRunId,...Object.values(grandchildRunIds)],
    forbiddenRunIds:[started.run.id],minimumDepth:1,
  };
  await rosWhiteboardState(page,rosTreeExpectations,`${label} initial`);

  await ensureScoutListView(page);
  await waitForOperationalRobots(page);
  const robotReadoutSamples=await captureRunningScoutReadoutWindow(page,expectedRobotIds,label);
  const robotReadoutBehavior=assertScoutRunningReadoutSamples(robotReadoutSamples,expectedRobotIds);
  const robotEvidence=await page.locator('[data-xgc-role="run-robot-card"]').evaluateAll((elements) => elements.map((element) => ({
    id:element.getAttribute('data-xgc-id'),health:element.getAttribute('data-xgc-health'),
    status:element.getAttribute('data-xgc-status'),text:(element.textContent||'').trim().replace(/\s+/g,' ').slice(0,500),
  })));

  const sourceId=String(providers.camera.parameters?.mediaSourceId || '').trim();
  if (!sourceId) throw new Error(`${label} gazebo camera has no authored mediaSourceId`);
  const camera=page.locator('[data-xgc-role="camera-video-panel"]');
  await camera.scrollIntoViewIfNeeded();
  await waitForExpectedCamera(page);
  const mediaAnswer=await waitFor(async () => mediaSessionAnswers.slice(sessionStart)
    .find((answer) => answer?.source?.id===sourceId),30_000,`${label} WebRTC session answer is absent`,50);
  assertMediaSource(mediaAnswer.source,sourceId,label);
  const continuity=[];
  let previous=await cameraSnapshot(page);
  continuity.push({ elapsedMs:0,...previous });
  for (let index=1; index<=continuitySamples; index+=1) {
    await page.waitForTimeout(continuitySamples>1 ? 5_000 : 2_000);
    const sample=await cameraSnapshot(page);
    continuity.push({ elapsedMs:index*(continuitySamples>1 ? 5_000 : 2_000),...sample });
    if (sample.state!=='playing' || sample.readyState<2 || sample.currentTime<=previous.currentTime
      || sample.totalVideoFrames<=previous.totalVideoFrames) {
      throw new Error(`${label} camera first-session continuity failed: ${JSON.stringify(continuity)}`);
    }
    previous=sample;
  }
  const roundAnswers=mediaSessionAnswers.slice(sessionStart).filter((answer) => answer?.source?.id===sourceId);
  if (roundAnswers.length!==1) throw new Error(`${label} camera renegotiated instead of keeping one WebRTC session`);

  const frame=page.locator('[data-xgc-role="lichtblick-frame"]');
  await frame.scrollIntoViewIfNeeded();
  await frame.waitFor({ state:'visible',timeout:90_000 });
  await waitForTwoLichtblickCanvases(page);
  const canvases=frame.contentFrame().locator('canvas');
  const canvasEvidence=[];
  for (let index=0; index<2; index+=1) {
    const locator=canvases.nth(index);
    const bounds=await locator.boundingBox();
    const pixels=await locator.evaluate((element) => ({ width:element.width,height:element.height }));
    const sample=await observeDynamicCanvas(page,locator,{ timeoutMs:0 });
    canvasEvidence.push({ index,bounds,pixels,...sample });
  }
  if (canvasEvidence.some(({ samples }) => samples[0]?.bytes<3_000)
    || new Set(canvasEvidence.map(({ beforeHash }) => beforeHash)).size!==2) {
    throw new Error(`${label} embedded Lichtblick canvases are empty or identical`);
  }
  const layout=await getJSON(context,configuration.webUrl,
    `/api/visualization/targets/local/lichtblick/${encodeURIComponent(providers.web.id)}/layout.json`);
  assertTwoPaneLayout(layout);
  const frameDiagnostics=await captureLichtblickFrameDiagnostics(page);

  let refreshedRunId='';
  let refreshedProgress=[];
  let refreshedRobotReadouts;
  if (refreshDuringRun) {
    await page.reload({ waitUntil:'domcontentloaded',timeout:30_000 });
    await page.locator('[data-xgc-role="experiment-state-loading"]').waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
    await selectGCS(page);
    const restored=await activeSystemRunnerForExperiment(context,configuration.webUrl,configuration.experimentId);
    refreshedRunId=restored?.id || '';
    if (refreshedRunId!==runId) throw new Error(`${label} refresh did not restore System Runner ${runId}`);
    await page.locator(`[data-xgc-role="experiment-stop"][data-xgc-id="${configuration.experimentId}"]`)
      .waitFor({ state:'visible',timeout:30_000 });
    refreshedProgress=await waitFor(async () => {
      const tiles=await rosTileSnapshot(page);
      return rosTilesAreReady(tiles,projectedRunIds) ? tiles : undefined;
    },30_000,`${label} refresh lost ROS grandchild tile runtime`);
    assertRosTilesDuringRun(refreshedProgress,projectedRunIds);
    await rosWhiteboardState(page,rosTreeExpectations,`${label} refresh`);
    await ensureScoutListView(page);
    await waitForOperationalRobots(page);
    refreshedRobotReadouts=await waitFor(async () => {
      const snapshot=await scoutReadoutSnapshot(page);
      try {
        return assertScoutRunningReadoutSnapshot(snapshot,expectedRobotIds);
      } catch {
        return undefined;
      }
    },30_000,`${label} refresh did not restore live Scout readouts`,100);
    await waitForExpectedCamera(page);
    await waitForTwoLichtblickCanvases(page);
  }

  const stopped=await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId,timeoutMs:providerTimeoutMs,
  });
  await waitFor(async () => {
    const owned=await experimentOwnedProcesses(context,configuration.webUrl,runId);
    return owned.every(processInactive) ? owned : undefined;
  },providerTimeoutMs,`${label} left attached/supervised Processes active after Stop`);
  const stoppedTiles=await waitFor(async () => {
    const tiles=await rosTileSnapshot(page);
    return rosTilesAreStopped(tiles) ? tiles : undefined;
  },providerTimeoutMs,`${label} ROS Control tiles did not return to idle after Stop`);
  const firstStoppedRobotReadout=await waitFor(async () => {
    const snapshot=await scoutReadoutSnapshot(page);
    try {
      return assertScoutStoppedReadouts(snapshot,expectedRobotIds);
    } catch {
      return undefined;
    }
  },30_000,`${label} Scout readouts retained live telemetry after Stop`,100);
  const stoppedRobotReadoutSamples=[firstStoppedRobotReadout];
  for (let index=0;index<2;index+=1) {
    await page.waitForTimeout(750);
    stoppedRobotReadoutSamples.push(assertScoutStoppedReadouts(
      await scoutReadoutSnapshot(page),expectedRobotIds,
    ));
  }
  assertScoutStoppedReadoutSamples(stoppedRobotReadoutSamples,expectedRobotIds,{
    minimumSamples:3,minimumDurationMs:1_400,
  });
  const roundRunId=runId;
  runId='';
  return {
    label,runId:roundRunId,runMode:'simulation',startupLatencyMs:started.latencyMs,
    dispatch:{ groupId:started.dispatchGroup.id,managedBindingIds:started.managedBindingIds },
    refreshDuringRun,refreshedRunId,stop:{ status:stopped.run.status,request:stopped.request },
    providers:providers.owned.map(processEvidence),
    rosControl:{
      initialProgress,startupSamples,grandchildRunIds,
      manualViewers,finalProgress:manualViewers.tiles,refreshedProgress,stoppedTiles,
    },
    robots:robotEvidence,
    robotInstruments:{
      runningSamples:robotReadoutSamples,
      behavior:robotReadoutBehavior,
      refreshedSnapshot:refreshedRobotReadouts,
      stoppedSnapshot:stoppedRobotReadoutSamples.at(-1),
      stoppedSamples:stoppedRobotReadoutSamples,
    },
    camera:{ continuitySamples:continuity,sessionId:mediaAnswer.sessionId,source:mediaAnswer.source },
    lichtblick:{ layout,frame:frameDiagnostics,canvases:canvasEvidence },
  };
}

async function startManualRosViewers(page,forbiddenRunIds,label) {
  for (const serviceId of ROS_MANUAL_VIEWER_SERVICE_IDS) {
    const control=page.locator(
      `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${ROS_CONTROL_PANEL_ID}"] `
      + `[data-xgc-role="ros-basic-service-control"][data-xgc-id="${serviceId}"]`,
    );
    await control.waitFor({ state:'visible',timeout:30_000 });
    await control.click();
    await waitFor(async () => {
      const tile=(await rosTileSnapshot(page)).find((candidate) => candidate.id===serviceId);
      return tile?.status==='ready' && tile.percent===100 && tile.running==='true' && tile.runId
        ? tile : undefined;
    },providerTimeoutMs,`${label} manual ${serviceId} Panel Action did not become ready`,100);
  }
  const tiles=await rosTileSnapshot(page);
  return { runIds:manualViewerRunIds(tiles,forbiddenRunIds),tiles };
}

async function openExperiment(page) {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`,{ waitUntil:'domcontentloaded',timeout:30_000 });
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state:'visible',timeout:30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]').waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
}

async function selectSimulation(page) {
  const root=page.locator(`[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${configuration.experimentId}"]`);
  await root.waitFor({ state:'visible',timeout:30_000 });
  const value=await page.locator(`[data-xgc-role="experiment-run-mode"][data-xgc-id="${configuration.experimentId}"]`)
    .getAttribute('data-xgc-value');
  if (value==='simulation') return;
  await root.getByRole('button').click();
  await page.getByRole('option',{ name:'simulation',exact:true }).click();
}

async function selectGCS(page) {
  const tab=page.getByRole('tab',{ name:'GCS',exact:true });
  await tab.waitFor({ state:'visible',timeout:30_000 });
  if (await tab.getAttribute('aria-selected')!=='true') await tab.click();
}

async function stopThroughUI(page) {
  const stop=page.locator('[data-xgc-role="experiment-stop"]');
  if (await stop.count() && !await stop.isDisabled()) {
    await stop.click();
    await page.locator('[data-xgc-role="experiment-run"]').waitFor({ state:'visible',timeout:providerTimeoutMs });
  }
}

async function rosTileSnapshot(page) {
  return page.locator(
    `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${ROS_CONTROL_PANEL_ID}"] [data-xgc-role="ros-basic-service-control"]`,
  ).evaluateAll((elements) => elements.map((element) => ({
    id:element.getAttribute('data-xgc-id')||'',
    runId:element.getAttribute('data-xgc-run-id')||'',
    status:element.getAttribute('data-xgc-status')||'',
    percent:Number(element.getAttribute('data-xgc-progress')||0),
    running:element.getAttribute('data-xgc-running')||'',
  })));
}

async function rosWhiteboardState(page,expectations,label) {
  await page.locator(`[data-xgc-role="ros-basic-services-view"][data-xgc-id="whiteboard"]`).click();
  const panel=page.locator(
    `[data-xgc-role="ros-basic-services-whiteboard-view"][data-xgc-id="${ROS_CONTROL_PANEL_ID}"]`,
  );
  await panel.waitFor({ state:'visible',timeout:30_000 });
  const state=await waitFor(async () => {
    const snapshot=await panel.evaluate((element,panelId) => {
      const graph=element.querySelector('[data-xgc-role="experiment-startup-graph"]');
      const message=element.querySelector('[data-xgc-role="experiment-startup-graph-state"]');
      const tree=element.querySelector(
        `[data-xgc-role="panel-workflow-run-tree"][data-xgc-id="${panelId}"]`,
      );
      const nodes=[...(tree?.querySelectorAll('[data-xgc-role="panel-workflow-run-tree-node"]')||[])];
      const depth=(node) => {
        let value=0;
        let parent=node.parentElement?.closest('[data-xgc-role="panel-workflow-run-tree-node"]');
        while (parent) {
          value+=1;
          parent=parent.parentElement?.closest('[data-xgc-role="panel-workflow-run-tree-node"]');
        }
        return value;
      };
      return {
        graphState:graph?.getAttribute('data-state')||'',
        text:(message?.textContent||'').trim(),
        tree:{
          rootCount:tree ? 1 : 0,
          runIds:nodes.map((node) => node.getAttribute('data-xgc-id')||'').filter(Boolean),
          maxDepth:nodes.length>0 ? Math.max(...nodes.map(depth)) : -1,
        },
      };
    },ROS_CONTROL_PANEL_ID);
    try { return assertRosWhiteboardAvailable(snapshot,expectations); } catch { return undefined; }
  },30_000,`${label} ROS Whiteboard recursive Run tree did not hydrate`,100);
  await page.locator(`[data-xgc-role="ros-basic-services-view"][data-xgc-id="controls"]`).click();
  await page.locator(
    `[data-xgc-role="ros-basic-services-controls-view"][data-xgc-id="${ROS_CONTROL_PANEL_ID}"]`,
  ).waitFor({ state:'visible',timeout:30_000 });
  return state;
}

async function waitForOperationalRobots(page) {
  await page.waitForFunction((expected) => {
    const robots=[...document.querySelectorAll('[data-xgc-role="run-robot-card"]')];
    return robots.length===expected && robots.every((robot) => (
      robot.getAttribute('data-xgc-health')==='healthy' && robot.getAttribute('data-xgc-status')==='online'
    ));
  },expectedRobotCount,{ timeout:providerTimeoutMs });
}

async function ensureScoutListView(page) {
  const button=page.locator('[data-xgc-role="robot-instrument-view"][data-xgc-id="list"]');
  await button.waitFor({ state:'visible',timeout:30_000 });
  if (await button.getAttribute('aria-pressed')!=='true') await button.click();
  await page.waitForFunction((robotIds) => {
    const cards=[...document.querySelectorAll('[data-xgc-role="run-robot-card"]')];
    return cards.length===robotIds.length && cards.every((card) => (
      robotIds.includes(card.getAttribute('data-xgc-id'))
      && card.getAttribute('data-xgc-presentation')==='list'
    ));
  },expectedRobotIds,{ timeout:30_000 });
}

async function captureRunningScoutReadoutWindow(page,robotIds,label) {
  const samples=[];
  const first=await waitFor(async () => {
    const snapshot=await scoutReadoutSnapshot(page);
    return assertScoutRunningReadoutSnapshot(snapshot,robotIds);
  },providerTimeoutMs,`${label} Scout list readouts did not become live`,100);
  samples.push(first);
  for (let index=0; index<2; index+=1) {
    await page.waitForTimeout(750);
    const snapshot=await scoutReadoutSnapshot(page);
    assertScoutRunningReadoutSnapshot(snapshot,robotIds);
    samples.push(snapshot);
  }
  return samples;
}

async function scoutReadoutSnapshot(page) {
  const snapshot=await page.locator('[data-xgc-role="run-robot-card"]').evaluateAll((elements,contract) => ({
    capturedAtMs:Date.now(),
    cards:elements.map((card) => {
      const metrics=[...card.querySelectorAll(':scope > dl > [data-xgc-role]')]
        .filter((metric) => contract.metrics.some(({ role }) => role===metric.getAttribute('data-xgc-role')));
      const boxes=metrics.map((metric) => metric.getBoundingClientRect());
      const clipped=[['card',card],['metrics',card.querySelector(':scope > dl')],
        ...metrics.flatMap((metric,index) => [
          [`metric-${index}`,metric],
          [`metric-${index}-title`,metric.querySelector('[data-xgc-role="robot-list-metric-title"]')],
          [`metric-${index}-readout`,metric.querySelector('[data-xgc-role="robot-list-metric-readout"]')],
          [`metric-${index}-rate`,metric.querySelector('[data-xgc-role="robot-list-metric-rate"]')],
        ]),
      ].filter((entry) => entry[1] && entry[1].scrollWidth>entry[1].clientWidth+1)
        .map((entry) => entry[0]);
      const requiredAxisGap=Number.parseFloat(
        getComputedStyle(card).getPropertyValue('--space-2xs'),
      ) || 0;
      const rectanglesOverlap=(first,second) => Boolean(first && second
        && first.left<second.right-1 && first.right>second.left+1
        && first.top<second.bottom-1 && first.bottom>second.top+1);
      const overlapped=metrics.flatMap((metric,index) => {
        const metricBounds=metric.getBoundingClientRect();
        const title=metric.querySelector('[data-xgc-role="robot-list-metric-title"]');
        const rate=metric.querySelector('[data-xgc-role="robot-list-metric-rate"]');
        const readout=metric.querySelector('[data-xgc-role="robot-list-metric-readout"]');
        const titleBounds=title?.getBoundingClientRect();
        const rateBounds=rate?.getBoundingClientRect();
        const readoutBounds=readout?.getBoundingClientRect();
        const result=[];
        if (rectanglesOverlap(titleBounds,rateBounds)) {
          result.push(`metric-${index}-title-rate`);
        }
        if (rectanglesOverlap(readoutBounds,rateBounds)) {
          result.push(`metric-${index}-readout-rate`);
        }
        if (rateBounds && (rateBounds.left<metricBounds.left-1 || rateBounds.right>metricBounds.right+1)) {
          result.push(`metric-${index}-rate`);
        }
        if (readoutBounds
          && (readoutBounds.left<metricBounds.left-1 || readoutBounds.right>metricBounds.right+1)) {
          result.push(`metric-${index}-readout`);
        }
        const axisBounds=[...metric.querySelectorAll('.robot-metric-vector-axis')]
          .map((axis) => axis.getBoundingClientRect());
        for (let axisIndex=1; axisIndex<axisBounds.length; axisIndex+=1) {
          if (axisBounds[axisIndex].left-axisBounds[axisIndex-1].right<requiredAxisGap-0.5) {
            result.push(`metric-${index}-axis-${axisIndex-1}-${axisIndex}`);
          }
        }
        return result;
      });
      return {
        id:card.getAttribute('data-xgc-id')||'',
        health:card.getAttribute('data-xgc-health')||'',
        status:card.getAttribute('data-xgc-status')||'',
        presentation:card.getAttribute('data-xgc-presentation')||'',
        platform:card.getAttribute('data-xgc-platform')||'',
        layout:{
          metricCount:metrics.length,
          rowCount:new Set(boxes.map((box) => Math.round(box.top))).size,
          columnCount:new Set(boxes.map((box) => Math.round(box.left))).size,
          clipped,
          overlapped,
        },
        metrics:metrics.map((metric) => {
          const role=metric.getAttribute('data-xgc-role')||'';
          const readout=metric.querySelector('[data-xgc-role="robot-list-metric-readout"]');
          return {
            role,
            title:(metric.querySelector('[data-xgc-role="robot-list-metric-title"]')?.textContent||'').trim(),
            rate:(metric.querySelector('[data-xgc-role="robot-list-metric-rate"]')?.textContent||'').trim(),
            values:[...(readout?.querySelectorAll('.robot-list-metric-digits')||[])].map((digits) => {
              const sign=digits.previousElementSibling?.classList.contains('robot-list-metric-sign')
                ? digits.previousElementSibling.textContent||'' : '';
              return `${sign}${digits.textContent||''}`.trim();
            }),
          };
        }),
        icons:contract.icons.map((role) => {
          const icon=card.querySelector(`header [data-xgc-role="${role}"]`);
          return {
            role,
            id:icon?.getAttribute('data-xgc-id')||'',
            label:icon?.getAttribute('aria-label')||'',
            hasGraphic:Boolean(icon?.querySelector('svg')),
          };
        }).filter((icon) => icon.id || icon.label || icon.hasGraphic),
      };
    }),
  }),{ metrics:SCOUT_LIST_METRIC_CONTRACT,icons:SCOUT_LIST_STATUS_ROLES });
  lastScoutReadoutSnapshot=snapshot;
  return snapshot;
}

async function waitForExpectedCamera(page) {
  await page.waitForFunction((expected) => {
    const video=document.querySelector('[data-xgc-role="camera-video-stream"]');
    return video instanceof HTMLVideoElement && video.readyState>=HTMLVideoElement.HAVE_CURRENT_DATA
      && video.videoWidth===expected.width && video.videoHeight===expected.height;
  },{ width:configuration.expectedMediaWidth,height:configuration.expectedMediaHeight },{ timeout:90_000 });
}

async function waitForTwoLichtblickCanvases(page) {
  await page.waitForFunction(() => {
    const element=document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement
      && [...(element.contentDocument?.querySelectorAll('canvas')||[])].filter((canvas) => {
        const bounds=canvas.getBoundingClientRect();
        return bounds.width>=200 && bounds.height>=120;
      }).length>=2;
  },undefined,{ timeout:90_000 });
}

function processReady(process) {
  return process.desiredState==='running' && process.observedState==='running'
    && process.handle!=null && process.readiness?.status==='passing' && process.liveness?.status==='passing';
}

function processInactive(process) {
  return process.desiredState==='stopped' && process.observedState==='stopped' && process.handle==null;
}

function processEvidence(process) {
  return { id:process.id,targetId:process.targetId,ownerId:process.ownerId,definitionId:process.definitionId,
    desiredState:process.desiredState,observedState:process.observedState,
    readiness:process.readiness?.status,liveness:process.liveness?.status };
}

function assertMediaSource(source,sourceId,label) {
  if (source?.id!==sourceId || source.width!==configuration.expectedMediaWidth
    || source.height!==configuration.expectedMediaHeight
    || Math.abs(source.fps-configuration.expectedMediaFPS)>0.01
    || source.codec!==configuration.expectedMediaCodec) {
    throw new Error(`${label} world camera session contract drifted: ${JSON.stringify(source)}`);
  }
}

async function cameraSnapshot(page) {
  return page.locator('[data-xgc-role="camera-video-panel"]').evaluate((panel) => {
    const video=panel.querySelector('[data-xgc-role="camera-video-stream"]');
    if (!(video instanceof HTMLVideoElement)) throw new Error('world camera video element is missing');
    const track=video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const playback=video.getVideoPlaybackQuality();
    return {
      state:panel.getAttribute('data-state'),sourceId:video.getAttribute('data-xgc-id'),readyState:video.readyState,
      videoWidth:video.videoWidth,videoHeight:video.videoHeight,currentTime:video.currentTime,
      paused:video.paused,ended:video.ended,totalVideoFrames:playback.totalVideoFrames,
      droppedVideoFrames:playback.droppedVideoFrames,corruptedVideoFrames:playback.corruptedVideoFrames,
      trackReadyState:track?.readyState??'',trackMuted:track?.muted??false,
      liveText:(panel.querySelector('[data-xgc-role="camera-video-live"]')?.textContent||'').trim().replace(/\s+/g,' '),
    };
  });
}

function assertTwoPaneLayout(layout) {
  const panelLayout=layout?.layout;
  const config=layout?.configById;
  if (!panelLayout || typeof panelLayout!=='object' || panelLayout.first!=='3D!xgc2'
    || panelLayout.second!=='Image!xgc2-camera-ar' || panelLayout.direction!=='column'
    || !config?.['3D!xgc2'] || !config?.['Image!xgc2-camera-ar']) {
    throw new Error(`Lichtblick did not receive the authored two-pane layout: ${JSON.stringify(layout)}`);
  }
}

function required(name,fallback) {
  const value=process.env[name]?.trim()||fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredURL(name,fallback) {
  const parsed=new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname!=='/' || parsed.search || parsed.hash) throw new Error(`${name} must be an HTTP origin`);
  return parsed.origin;
}

function optionalID(name) {
  const value=process.env[name]?.trim()||'';
  if (value && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function requiredPositiveInteger(name,fallback) {
  const value=Number.parseInt(required(name,String(fallback)),10);
  if (!Number.isSafeInteger(value) || value<1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requiredPositiveNumber(name,fallback) {
  const value=Number(required(name,String(fallback)));
  if (!Number.isFinite(value) || value<=0) throw new Error(`${name} must be a positive number`);
  return value;
}
}
