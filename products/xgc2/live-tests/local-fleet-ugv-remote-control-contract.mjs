const activeRunStatuses = new Set(['accepted','queued','running','waiting','stopping']);
const terminalRunStatuses = new Set(['succeeded','failed','canceled','stopped','rejected']);
const systemExperimentRunner=Object.freeze({
  domain:'automation',resourceId:'069f036b-9638-4827-9524-73ff03fe99c9',branch:'main',
});
export const MECANUM_LIST_METRIC_CONTRACT=Object.freeze([
  Object.freeze({ role:'robot-ground-vrpn-position',title:'VRPN pos',valueCount:3,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-vrpn-velocity',title:'VRPN vel',valueCount:3,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-vrpn-speed',title:'VRPN spd',valueCount:1,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-vrpn-acceleration',title:'VRPN acc',valueCount:3,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-command-velocity',title:'CMD vel',valueCount:1,truth:'remote-command' }),
  Object.freeze({ role:'robot-ground-command-twist',title:'CMD twist',valueCount:1,truth:'remote-command' }),
  Object.freeze({ role:'robot-ground-battery-voltage',title:'Battery vol',valueCount:1,truth:'required-telemetry' }),
  Object.freeze({ role:'robot-ground-yaw',title:'Yaw',valueCount:1,truth:'required-telemetry' }),
]);

export function assertMecanumRunningReadouts(snapshot,expectedRobotIDs) {
  assertMecanumSnapshotShape(snapshot,expectedRobotIDs,'Run');
  for (const card of snapshot.cards) {
    for (let index=0;index<MECANUM_LIST_METRIC_CONTRACT.length;index+=1) {
      const contract=MECANUM_LIST_METRIC_CONTRACT[index];
      const metric=card.metrics[index];
      const commandIsUnpublished=contract.truth==='remote-command'
        && metric.rate==='-- Hz'
        && metric.values.length===contract.valueCount
        && metric.values.every((value) => value==='--');
      if (commandIsUnpublished) continue;
      const rateHz=metricRateHz(metric.rate);
      if (rateHz==null || rateHz<=0 || rateHz>1_000) {
        throw new Error(`Run Mecanum ${card.id} ${contract.title} rate ${metric.rate || '(empty)'} is not live or explicitly unpublished`);
      }
      if (metric.values.length!==contract.valueCount || metric.values.some((value) => !isFiniteReadout(value))) {
        throw new Error(`Run Mecanum ${card.id} ${contract.title} readout is incomplete or partially published: ${metric.values.join(' ')}`);
      }
      const values=metric.values.map(Number);
      if (values.some((value) => Math.abs(value)>1_000_000)) {
        throw new Error(`Run Mecanum ${card.id} ${contract.title} readout is outside the evidence bound`);
      }
      if (contract.title==='VRPN spd' && values[0]<0) {
        throw new Error(`Run Mecanum ${card.id} VRPN spd is negative`);
      }
      if (contract.title==='Battery vol' && (values[0]<=0 || values[0]>100)) {
        throw new Error(`Run Mecanum ${card.id} Battery vol is outside the vehicle voltage bound`);
      }
    }
    const acceleration=card.metrics.find((metric) => metric.role==='robot-ground-vrpn-acceleration');
    const accelerationRateHz=metricRateHz(acceleration?.rate);
    if (accelerationRateHz==null || accelerationRateHz<=0
      || acceleration?.values.length!==3
      || acceleration.values.some((value) => !isFiniteReadout(value))) {
      throw new Error(`Run Mecanum ${card.id} VRPN acc is not a positive-rate finite 3-vector`);
    }
  }
  return snapshot;
}

export function assertMecanumStoppedReadoutSamples(samples,expectedRobotIDs,stopCompletedAtMs) {
  if (!Array.isArray(samples) || samples.length<3) {
    throw new Error('Mecanum Stop evidence needs at least three readout samples');
  }
  if (!Number.isFinite(stopCompletedAtMs) || stopCompletedAtMs<=0) {
    throw new Error('Mecanum Stop evidence needs the completed Stop timestamp');
  }
  let previousCapturedAtMs=0;
  for (const snapshot of samples) {
    assertMecanumSnapshotShape(snapshot,expectedRobotIDs,'Stop');
    if (!Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs<=previousCapturedAtMs) {
      throw new Error('Mecanum Stop readout samples are not ordered in time');
    }
    const elapsedMs=snapshot.capturedAtMs-stopCompletedAtMs;
    if (elapsedMs<900 || elapsedMs>3_000) {
      throw new Error(`Mecanum Stop sample at ${elapsedMs} ms is outside the 1-2 second settling window`);
    }
    previousCapturedAtMs=snapshot.capturedAtMs;
    for (const card of snapshot.cards) {
      for (const metric of card.metrics) {
        if (metric.rate!=='-- Hz' || metric.values.length===0
          || metric.values.some((value) => value!=='--')) {
          throw new Error(`Stop Mecanum ${card.id} retained ${metric.title}: ${metric.rate} ${metric.values.join(' ')}`);
        }
      }
    }
  }
  if (samples.at(-1).capturedAtMs-stopCompletedAtMs<1_700) {
    throw new Error('Mecanum Stop readout samples did not span the 1-2 second settling window');
  }
  return samples;
}

export function selectForwardClearRobotID(authoredRobots,laneHalfWidthMeters=0.8) {
  if (!Array.isArray(authoredRobots) || authoredRobots.length===0) {
    throw new Error('forward-clear selection requires authored Robots');
  }
  if (!Number.isFinite(laneHalfWidthMeters) || laneHalfWidthMeters<=0) {
    throw new Error('forward-clear selection lane width must be positive');
  }
  const robots=authoredRobots.map((robot) => {
    const id=String(robot?.id ?? '').trim();
    const x=Number(robot?.initialPose?.x);
    const y=Number(robot?.initialPose?.y);
    const yaw=Number(robot?.initialPose?.yaw);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(yaw)) {
      throw new Error('forward-clear selection requires Robot ID and finite initial x, y, yaw');
    }
    return { id,x,y,yaw };
  });
  uniqueIDs(robots.map((robot) => robot.id),'forward-clear Robot IDs');
  const scored=robots.map((robot) => {
    const cosine=Math.cos(robot.yaw);
    const sine=Math.sin(robot.yaw);
    let clearance=Number.POSITIVE_INFINITY;
    for (const other of robots) {
      if (other.id===robot.id) continue;
      const dx=other.x-robot.x;
      const dy=other.y-robot.y;
      const forward=dx*cosine+dy*sine;
      const lateral=-dx*sine+dy*cosine;
      if (forward>0 && Math.abs(lateral)<=laneHalfWidthMeters) {
        clearance=Math.min(clearance,forward);
      }
    }
    return {
      ...robot,clearance,
      forwardOrigin:robot.x*cosine+robot.y*sine,
      lateralOrigin:-robot.x*sine+robot.y*cosine,
    };
  });
  scored.sort((left,right) => {
    const leftClear=left.clearance===Number.POSITIVE_INFINITY;
    const rightClear=right.clearance===Number.POSITIVE_INFINITY;
    if (leftClear!==rightClear) return leftClear ? -1 : 1;
    if (!leftClear && left.clearance!==right.clearance) return right.clearance-left.clearance;
    if (left.forwardOrigin!==right.forwardOrigin) return right.forwardOrigin-left.forwardOrigin;
    if (left.lateralOrigin!==right.lateralOrigin) return right.lateralOrigin-left.lateralOrigin;
    return left.id.localeCompare(right.id);
  });
  return scored[0].id;
}

export function resolveRemoteControlSelection(authoredRobotIDs,configuredRobotIDs=[],defaultRobotID='') {
  const authored=uniqueIDs(authoredRobotIDs,'authored Robot IDs');
  if (authored.length < 2) {
    throw new Error('remote-control isolation requires at least two authored UGVs');
  }
  const selected=configuredRobotIDs.length > 0
    ? uniqueIDs(configuredRobotIDs,'configured Robot IDs')
    : [defaultRobotID || authored[0]];
  const authoredSet=new Set(authored);
  const unknown=selected.filter((id) => !authoredSet.has(id));
  if (unknown.length > 0) {
    throw new Error(`configured Robot IDs are not authored UGVs: ${unknown.join(', ')}`);
  }
  if (selected.length >= authored.length) {
    throw new Error('remote-control isolation requires at least one unselected sibling UGV');
  }
  const selectedSet=new Set(selected);
  return {
    selectedRobotIDs:authored.filter((id) => selectedSet.has(id)),
    siblingRobotIDs:authored.filter((id) => !selectedSet.has(id)),
  };
}

export function composeDisconnectedBaseline(previousSamples,liveSamples,disconnectedRobotIDs) {
  const previousByID=sampleMap(previousSamples,'previous connected Robot samples');
  const liveByID=sampleMap(liveSamples,'live sibling Robot samples');
  const disconnected=new Set(uniqueIDs(disconnectedRobotIDs,'disconnected Robot IDs'));
  for (const robotId of disconnected) {
    if (!previousByID.has(robotId)) {
      throw new Error(`disconnected Robot ${robotId} has no previous telemetry baseline`);
    }
    if (liveByID.has(robotId)) {
      throw new Error(`disconnected Robot ${robotId} unexpectedly retained live telemetry`);
    }
  }
  for (const robotId of liveByID.keys()) {
    if (!previousByID.has(robotId)) {
      throw new Error(`live sibling Robot ${robotId} was not present in the connected baseline`);
    }
  }
  return previousSamples.map((sample) => disconnected.has(sample.robotId)
    ? sample
    : requiredSample(liveByID,sample.robotId,'live sibling Robot samples'));
}

export function assertControllerRobotIDs(actualRobotIDs,expectedRobotIDs) {
  const actual=uniqueIDs(actualRobotIDs,'controller Robot IDs').sort();
  const expected=uniqueIDs(expectedRobotIDs,'expected controller Robot IDs').sort();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) {
    throw new Error(`remote controller targets ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
}

export function assertRemoteActionResponse(item,{ label,experimentId,controllerId,robotIds,intent,status=202 }) {
  if (!item || item.status!==status) {
    throw new Error(`${label} motion intent failed: ${JSON.stringify(item)}`);
  }
  const actual=item.intent;
  const request=item.request;
  const expectedKeys=['controllerId','experimentId','gear','lateral','longitudinal','robotIds','workflowInstanceId','yaw'].sort();
  if (!request
    || JSON.stringify(Object.keys(request).sort())!==JSON.stringify(expectedKeys)
    || request.experimentId!==experimentId
    || request.workflowInstanceId!=='panel-robot-instruments'
    || request.controllerId!==controllerId
    || JSON.stringify(request.robotIds)!==JSON.stringify([...robotIds])
    || request.gear!==intent.gear
    || request.longitudinal!==intent.longitudinal
    || request.lateral!==intent.lateral
    || request.yaw!==intent.yaw) {
    throw new Error(`${label} motion intent request drifted: ${JSON.stringify(request)}`);
  }
  const expected={ experimentId,workflowInstanceId:'panel-robot-instruments',controllerId,robotIds:[...robotIds],...intent };
  if (!actual || JSON.stringify(actual)!==JSON.stringify(expected)
    || JSON.stringify(actual)!==JSON.stringify(request)) {
    throw new Error(`${label} motion intent request and observed intent diverged: ${JSON.stringify({ actual,request })}`);
  }
  if (status===202 && item.response?.applied!==robotIds.length) {
    throw new Error(`${label} motion intent applied=${JSON.stringify(item.response)}; expected ${robotIds.length}`);
  }
  return item;
}

export function assertPanelRunClick(item,{ experimentId,panelId,robotIds }) {
  const expectedRobotIds=uniqueIDs(robotIds,'Panel Run selected Robot IDs');
  const inputOverridesJson=item?.request?.parameters?.inputOverridesJson;
  if (!panelRunInputOverridesMatch(inputOverridesJson,expectedRobotIds)) {
    throw new Error(`Panel Run click input overrides drifted: ${JSON.stringify(inputOverridesJson)}`);
  }
  const expectedParameters={
    panelId,runMode:'simulation',
    inputOverridesJson,
  };
  assertSystemRunnerRequest(item?.request,{
    label:'Panel Run click',experimentId,actionId:'run-panel',parameters:expectedParameters,
  });
  const run=item?.response?.run;
  if (item.status!==202 || !run
    || run.targetId!=='local'
    || run.automationResourceId!==systemExperimentRunner.resourceId
    || run.actionId!=='run-panel'
    || run.sourceKind!=='experiment'
    || run.sourceRef?.domain!=='experiment'
    || run.sourceRef.resourceId!==experimentId
    || run.sourceRef.branch!=='main'
    || run.parentRunId
    || run.rootRunId!==run.id
    || !Number.isSafeInteger(run.revision) || run.revision<1
    || !sameExactObject(run.parameters,expectedParameters)) {
    throw new Error(`Panel Run click did not return one exact System root: ${JSON.stringify(item)}`);
  }
  return run;
}

export function panelRunInputOverridesMatch(serialized,robotIds) {
  if (typeof serialized!=='string') return false;
  let actual;
  try { actual=JSON.parse(serialized); } catch { return false; }
  const expectedRobotIds=uniqueIDs(robotIds,'Panel Run selected Robot IDs');
  const expected={
    robotId:expectedRobotIds.length===1 ? expectedRobotIds[0] : '',
    robotIds:expectedRobotIds,
    selectionKey:expectedRobotIds.length===0
      ? 'all'
      : `selected:${JSON.stringify([...expectedRobotIds].sort())}`,
  };
  return sameExactObject(actual,expected);
}

export function assertPanelStopClick(item,{ rootRunId,panelId }) {
  const request=item?.request;
  const expectedKeys=['expectedRevision','idempotencyKey','includeAnchor','includeDetached','reason','requestId'].sort();
  if (!item || item.status<200 || item.status>=300
    || JSON.stringify(Object.keys(request ?? {}).sort())!==JSON.stringify(expectedKeys)
    || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision<1
    || request.includeAnchor!==true || request.includeDetached!==true
    || request.reason!==`Stop Panel ${panelId}`
    || typeof request.requestId!=='string' || !request.requestId
    || request.idempotencyKey!==request.requestId
    || item.response?.anchorRunId!==rootRunId
    || item.response?.receipt?.result?.anchorRunId!==rootRunId
    || !(item.response?.outcomes ?? []).some((outcome) => (
      outcome?.runId===rootRunId && (outcome.accepted===true || outcome.alreadyTerminal===true)
    ))) {
    throw new Error(`Panel Stop click did not stop exact root ${rootRunId}: ${JSON.stringify(item)}`);
  }
  return item.response;
}

export function assertMotionIsolation({
  before,moving,after,selectedRobotIDs,siblingRobotIDs,
  expectedLinearX=0.5,commandTolerance=1e-6,
  minimumDisplacementMeters=0.05,minimumSpeedMetersPerSecond=0.1,
  maximumSiblingDisplacementMeters=0.025,maximumSiblingSpeedMetersPerSecond=0.05,
}) {
  const beforeByID=sampleMap(before,'before motion');
  const movingByID=sampleMap(moving,'moving');
  const afterByID=sampleMap(after,'after motion');
  const selected=new Set(uniqueIDs(selectedRobotIDs,'selected Robot IDs'));
  const siblings=new Set(uniqueIDs(siblingRobotIDs,'sibling Robot IDs'));
  if ([...selected].some((robotId) => siblings.has(robotId))) {
    throw new Error('selected and sibling Robot IDs must be disjoint');
  }
  const evidence=[];
  for (const robotId of [...selected,...siblings]) {
    const start=requiredSample(beforeByID,robotId,'before motion');
    const live=requiredSample(movingByID,robotId,'moving');
    const finish=requiredSample(afterByID,robotId,'after motion');
    const displacement=planarDisplacement(start,finish);
    const speed=planarSpeed(live);
    if (selected.has(robotId)) {
      assertCommand(live.command,{ linearX:expectedLinearX },commandTolerance,`${robotId} selected cmd_vel`);
      if (displacement < minimumDisplacementMeters && speed < minimumSpeedMetersPerSecond) {
        throw new Error(`${robotId} did not advance in simulation ground truth: displacement=${displacement.toFixed(4)} speed=${speed.toFixed(4)}`);
      }
    } else {
      assertCommand(live.command,{ zeroOrAbsent:true },commandTolerance,`${robotId} sibling cmd_vel`);
      if (displacement > maximumSiblingDisplacementMeters || speed > maximumSiblingSpeedMetersPerSecond) {
        throw new Error(`${robotId} unselected sibling moved: displacement=${displacement.toFixed(4)} speed=${speed.toFixed(4)}`);
      }
    }
    evidence.push({ robotId,selected:selected.has(robotId),before:start.position,after:finish.position,displacement,speed });
  }
  return evidence;
}

export function assertStoppedMotion({
  released,settled,robotIDs,commandTolerance=1e-9,
  maximumDriftMeters=0.025,maximumSpeedMetersPerSecond=0.05,
}) {
  const releasedByID=sampleMap(released,'released');
  const settledByID=sampleMap(settled,'settled');
  return uniqueIDs(robotIDs,'stopped Robot IDs').map((robotId) => {
    const start=requiredSample(releasedByID,robotId,'released');
    const finish=requiredSample(settledByID,robotId,'settled');
    assertCommand(start.command,{ zeroOrAbsent:false },commandTolerance,`${robotId} release cmd_vel`);
    assertCommand(finish.command,{ zeroOrAbsent:false },commandTolerance,`${robotId} settled cmd_vel`);
    const drift=planarDisplacement(start,finish);
    const speed=planarSpeed(finish);
    if (drift > maximumDriftMeters || speed > maximumSpeedMetersPerSecond) {
      throw new Error(`${robotId} did not stop after release: drift=${drift.toFixed(4)} speed=${speed.toFixed(4)}`);
    }
    return { robotId,drift,speed };
  });
}

export function panelWorkflowRunId(dispatchMembers,workflowInstanceId,rootRunId='') {
  const matches=(dispatchMembers ?? []).filter((item) => item.itemKey===workflowInstanceId);
  if (matches.length!==1 || !matches[0].childRunId) {
    throw new Error(`managed Panel Workflow ${workflowInstanceId} was not dispatched exactly once`);
  }
  if (rootRunId && matches[0].childRunId===rootRunId) {
    throw new Error(`${workflowInstanceId} child Run must not equal the System Runner root`);
  }
  return { targetId:matches[0].targetId || 'local',runId:matches[0].childRunId };
}

export function robotSlotRun(relations,robotId) {
  const groups=(relations?.childRunGroups ?? []).filter((group) => group.producerNodeId==='robot-slots');
  if (groups.length!==1) throw new Error('Robot runtime does not expose one robot-slots child group');
  const group=groups[0];
  const members=(relations?.childRunGroupMembers ?? []).filter((member) => (
    member.groupId===group.id && member.itemKey===robotId
  ));
  if (members.length!==1 || !members[0].childRunId) {
    throw new Error(`Robot runtime does not expose one child Run for ${robotId}`);
  }
  const children=(relations?.childRuns ?? []).filter((item) => item.childRunId===members[0].childRunId);
  if (children.length!==1 || !group.parentRunId
    || children[0].parentRunId!==group.parentRunId || children[0].ownerRunId!==group.parentRunId
    || children[0].relation!=='supervised' || children[0].waitPolicy!=='join-later'
    || children[0].cancelPolicy!=='cascade' || children[0].resultPolicy!=='reference') {
    throw new Error(`${robotId} slot child lost supervised join-later cascade reference ownership`);
  }
  return { targetId:children[0].targetId || members[0].targetId || 'local',runId:members[0].childRunId };
}

export function assertConnectionTransition({
  before,disconnected,reconnected,faultRobotId,stableRobotIDs=[],
  beforeOwnerRunId='',afterOwnerRunId='',
}) {
  const beforeByID=robotProjectionMap(before,'before disconnect');
  const disconnectedByID=robotProjectionMap(disconnected,'disconnected');
  const reconnectedByID=robotProjectionMap(reconnected,'reconnected');
  const first=requiredRobotProjection(beforeByID,faultRobotId,'before disconnect');
  const offline=requiredRobotProjection(disconnectedByID,faultRobotId,'disconnected');
  const restored=requiredRobotProjection(reconnectedByID,faultRobotId,'reconnected');
  if (first.connectionState!=='live' || !Number.isSafeInteger(first.connectionEpoch) || first.connectionEpoch < 1) {
    throw new Error(`${faultRobotId} did not start from one live connection epoch`);
  }
  if (offline.connectionState==='live') {
    throw new Error(`${faultRobotId} never exposed disconnected connection truth`);
  }
  if (!Number.isSafeInteger(offline.connectionEpoch) || offline.connectionEpoch!==first.connectionEpoch) {
    throw new Error(`${faultRobotId} disconnected truth changed its connection epoch`);
  }
  const ownerIdentityProvided=Boolean(beforeOwnerRunId || afterOwnerRunId);
  if (ownerIdentityProvided && (!beforeOwnerRunId || !afterOwnerRunId)) {
    throw new Error(`${faultRobotId} reconnect owner evidence is incomplete`);
  }
  const ownerChanged=ownerIdentityProvided && beforeOwnerRunId!==afterOwnerRunId;
  if (restored.connectionState!=='live' || !Number.isSafeInteger(restored.connectionEpoch)
    || restored.connectionEpoch<1 || (!ownerChanged && restored.connectionEpoch<=first.connectionEpoch)) {
    throw new Error(`${faultRobotId} did not reconnect with a newer epoch or replacement owner`);
  }
  if (stableRobotIDs.includes(faultRobotId)) {
    throw new Error(`${faultRobotId} cannot also be a stable sibling Robot`);
  }
  for (const robotId of uniqueIDs(stableRobotIDs,'stable Robot IDs')) {
    const beforeStable=requiredRobotProjection(beforeByID,robotId,'before disconnect');
    const offlineStable=requiredRobotProjection(disconnectedByID,robotId,'disconnected');
    const restoredStable=requiredRobotProjection(reconnectedByID,robotId,'reconnected');
    if (beforeStable.connectionState!=='live' || offlineStable.connectionState!=='live'
      || restoredStable.connectionState!=='live'
      || beforeStable.connectionEpoch!==offlineStable.connectionEpoch
      || beforeStable.connectionEpoch!==restoredStable.connectionEpoch) {
      throw new Error(`${robotId} sibling connection changed during ${faultRobotId} reconnect`);
    }
  }
  return {
    robotId:faultRobotId,
    beforeEpoch:first.connectionEpoch,
    disconnectedState:offline.connectionState,
    reconnectedEpoch:restored.connectionEpoch,
    beforeOwnerRunId,afterOwnerRunId,ownerChanged,
  };
}

export function assertStopOwnership({ sessions,sessionRuns,ownedProcesses }) {
  if ((sessions ?? []).length!==0) throw new Error('Experiment Session remained active after Stop');
  if ((sessionRuns ?? []).length===0) throw new Error('Stop evidence omitted Experiment-owned command/root Runs');
  for (const run of sessionRuns ?? []) {
    if (!run || !terminalRunStatuses.has(run.status)) {
      throw new Error(`Experiment-owned command/root remained active after Stop: ${JSON.stringify(run)}`);
    }
  }
  const activeProcesses=(ownedProcesses ?? []).filter((process) => (
    process.desiredState!=='stopped' || process.observedState!=='stopped' || process.handle!=null
  ));
  if (activeProcesses.length>0) {
    throw new Error(`Experiment-owned Processes remained active after Stop: ${JSON.stringify(activeProcesses)}`);
  }
}

export function assertFinalGlobalCleanup({
  activeSystemRoots,sessions,runOwnedProcesses,actionRuns,
}) {
  if (!Array.isArray(activeSystemRoots) || activeSystemRoots.length!==0) {
    throw new Error(`active System roots remained after cleanup: ${JSON.stringify(activeSystemRoots)}`);
  }
  if (!Array.isArray(sessions) || sessions.length!==0) {
    throw new Error(`Experiment Sessions remained after cleanup: ${JSON.stringify(sessions)}`);
  }
  const activeProcesses=(runOwnedProcesses ?? []).filter((process) => (
    process?.desiredState!=='stopped' || process?.observedState!=='stopped'
    || (process?.handle!==null && process?.handle!==undefined && process?.handle!=='')
  ));
  if (!Array.isArray(runOwnedProcesses) || activeProcesses.length>0) {
    throw new Error(`Run-owned Processes remained active after cleanup: ${JSON.stringify(activeProcesses)}`);
  }
  if (!Array.isArray(actionRuns)) {
    throw new Error('Action cleanup evidence must be an array');
  }
  const nonTerminal=actionRuns.filter((run) => !run || !terminalRunStatuses.has(run.status));
  if (nonTerminal.length>0) {
    throw new Error(`Action children are not terminal after cleanup: ${JSON.stringify(nonTerminal)}`);
  }
  return { activeSystemRoots,sessions,runOwnedProcesses,actionRuns };
}

export function runIsActive(run) {
  return Boolean(run && activeRunStatuses.has(run.status));
}

function assertMecanumSnapshotShape(snapshot,expectedRobotIDs,phase) {
  const expected=uniqueIDs(expectedRobotIDs,'expected Mecanum Robot IDs').sort();
  const actual=(snapshot?.cards ?? []).map((card) => card.id).sort();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) {
    throw new Error(`${phase} Mecanum readouts cover ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
  for (const card of snapshot.cards) {
    if (card.presentation!=='list' || card.platform!=='ground') {
      throw new Error(`${phase} Mecanum ${card.id} is not rendered in the ground list view`);
    }
    if (!Array.isArray(card.metrics) || card.metrics.length!==MECANUM_LIST_METRIC_CONTRACT.length) {
      throw new Error(`${phase} Mecanum ${card.id} metric count drifted`);
    }
    for (let index=0;index<MECANUM_LIST_METRIC_CONTRACT.length;index+=1) {
      const expectedMetric=MECANUM_LIST_METRIC_CONTRACT[index];
      const actualMetric=card.metrics[index];
      if (actualMetric?.role!==expectedMetric.role || actualMetric?.title!==expectedMetric.title) {
        throw new Error(`${phase} Mecanum ${card.id} metric order drifted at ${index}: ${JSON.stringify(actualMetric)}`);
      }
      if (!Array.isArray(actualMetric.values) || actualMetric.values.length!==expectedMetric.valueCount) {
        throw new Error(`${phase} Mecanum ${card.id} ${expectedMetric.title} value count drifted`);
      }
    }
  }
}

function metricRateHz(value) {
  const match=/^([0-9]+(?:\.[0-9]+)?) Hz$/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) : null;
}

function isFiniteReadout(value) {
  return typeof value==='string' && value.trim()!=='' && Number.isFinite(Number(value));
}

function uniqueIDs(items,label) {
  const normalized=(items ?? []).map((item) => String(item).trim()).filter(Boolean);
  if (normalized.length===0 || new Set(normalized).size!==normalized.length) {
    throw new Error(`${label} must be a non-empty unique list`);
  }
  return normalized;
}

function sampleMap(samples,label) {
  const result=new Map();
  for (const sample of samples ?? []) {
    if (!sample?.robotId || result.has(sample.robotId)) throw new Error(`${label} has invalid Robot samples`);
    result.set(sample.robotId,sample);
  }
  return result;
}

function requiredSample(samples,robotId,label) {
  const sample=samples.get(robotId);
  if (!sample) throw new Error(`${label} omitted ${robotId}`);
  return sample;
}

function assertCommand(command,expectation,tolerance,label) {
  if (expectation.zeroOrAbsent===true && command==null) return;
  if (!command) throw new Error(`${label} was not observed`);
  const values=[
    command.linear?.x,command.linear?.y,command.linear?.z,
    command.angular?.x,command.angular?.y,command.angular?.z,
  ].map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`${label} is malformed`);
  if (Object.hasOwn(expectation,'linearX')) {
    if (Math.abs(values[0]-expectation.linearX)>tolerance || values.slice(1).some((value) => Math.abs(value)>tolerance)) {
      throw new Error(`${label}=${JSON.stringify(command)}; expected raw forward cmd_vel ${expectation.linearX}`);
    }
  } else if (values.some((value) => Math.abs(value)>tolerance)) {
    throw new Error(`${label}=${JSON.stringify(command)}; expected exact zero cmd_vel`);
  }
}

function planarDisplacement(left,right) {
  const values=[left.position?.x,left.position?.y,right.position?.x,right.position?.y].map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Robot position truth is malformed');
  return Math.hypot(values[2]-values[0],values[3]-values[1]);
}

function planarSpeed(sample) {
  const values=[sample.velocity?.linear?.x,sample.velocity?.linear?.y].map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Robot velocity truth is malformed');
  return Math.hypot(values[0],values[1]);
}

function assertInvokePanelActionRequest(request,{ label,experimentId }) {
  const expectedKeys=['actionId','automationRef','experimentRef','idempotencyKey','parameters','reason','requestId'].sort();
  const parameterKeys=['inputOverridesJson','panelId','presetId','runMode'].sort();
  if (!request
    || typeof experimentId!=='string' || experimentId.length===0
    || JSON.stringify(Object.keys(request).sort())!==JSON.stringify(expectedKeys)
    || request.automationRef?.domain!==systemExperimentRunner.domain
    || request.automationRef?.resourceId!==systemExperimentRunner.resourceId
    || request.automationRef?.branch!==systemExperimentRunner.branch
    || request.experimentRef?.domain!=='experiment'
    || request.experimentRef?.resourceId!==experimentId
    || request.experimentRef?.branch!=='main'
    || request.actionId!=='invoke-panel-action'
    || JSON.stringify(Object.keys(request.parameters ?? {}).sort())!==JSON.stringify(parameterKeys)
    || request.parameters.panelId!=='robot-control'
    || request.parameters.presetId!=='run'
    || request.parameters.runMode!=='simulation'
    || typeof request.parameters.inputOverridesJson!=='string'
    || typeof request.requestId!=='string' || request.requestId.length===0
    || request.idempotencyKey!==request.requestId
    || typeof request.reason!=='string' || request.reason.trim().length===0) {
    throw new Error(`${label} Action public request shape drifted: ${JSON.stringify(request)}`);
  }
}

function assertSystemRunnerRequest(request,{ label,experimentId,actionId,parameters }) {
  const expectedKeys=['actionId','automationRef','experimentRef','idempotencyKey','parameters','reason','requestId'].sort();
  if (!request
    || JSON.stringify(Object.keys(request).sort())!==JSON.stringify(expectedKeys)
    || request.automationRef?.domain!==systemExperimentRunner.domain
    || request.automationRef.resourceId!==systemExperimentRunner.resourceId
    || request.automationRef.branch!==systemExperimentRunner.branch
    || request.experimentRef?.domain!=='experiment'
    || request.experimentRef.resourceId!==experimentId
    || request.experimentRef.branch!=='main'
    || request.actionId!==actionId
    || !sameExactObject(request.parameters,parameters)
    || typeof request.requestId!=='string' || !request.requestId
    || request.idempotencyKey!==request.requestId
    || typeof request.reason!=='string' || !request.reason.trim()) {
    throw new Error(`${label} public request shape drifted: ${JSON.stringify(request)}`);
  }
}

function sameExactObject(actual,expected) {
  if (!actual || typeof actual!=='object' || Array.isArray(actual)) return false;
  const actualKeys=Object.keys(actual).sort();
  const expectedKeys=Object.keys(expected).sort();
  return JSON.stringify(actualKeys)===JSON.stringify(expectedKeys)
    && expectedKeys.every((key) => JSON.stringify(actual[key])===JSON.stringify(expected[key]));
}

function robotProjectionMap(projection,label) {
  const result=new Map();
  for (const robot of projection?.robots ?? []) {
    if (!robot?.id || result.has(robot.id)) throw new Error(`${label} has invalid Robot connection projections`);
    result.set(robot.id,robot);
  }
  return result;
}

function requiredRobotProjection(robots,robotId,label) {
  const robot=robots.get(robotId);
  if (!robot) throw new Error(`${label} omitted Robot connection ${robotId}`);
  return robot;
}
