import { createHash } from 'node:crypto';

export const REQUIRED_VISUALIZATION_KINDS = Object.freeze([
  'px4_multirotor','scout_mini','mecanum_ugv',
]);
export const MANUAL_VIEWER_IDS = Object.freeze(['rviz','gzclient']);
export const MANUAL_VIEWER_CALL_NODES = Object.freeze({
  rviz:'call-rviz',gzclient:'call-gzclient',
});
export const SEMANTIC_CANVAS_IDS = Object.freeze({
  threeD:'3D!xgc2',cameraAR:'Image!xgc2-camera-ar',
});

const ACTIVE_RUN_STATUSES = new Set(['accepted','queued','running','waiting','stopping']);
const VIEWER_ACTIVE_STATUSES = new Set(['accepted','queued','waiting','starting','running','ready']);
const TERMINAL_RUN_STATUSES = new Set(['succeeded','failed','canceled','stopped','rejected']);
const DEFAULT_RVIZ_PATH_LINE_WIDTH_METERS = 0.03;
const CANONICAL_RUN_MODE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

export function discoverVisualizationMatrix(experiments) {
  if (!Array.isArray(experiments)) throw new Error('Experiment catalog must be an array');
  const plans=[];
  for (const experiment of experiments) {
    const experimentId=canonicalText(experiment?.head?.resourceId);
    const name=canonicalText(experiment?.spec?.name);
    const robots=experiment?.spec?.robots;
    const runModes=experiment?.spec?.runModes;
    if (!experimentId || !name || !Array.isArray(robots) || robots.length===0
      || !Array.isArray(runModes) || runModes.length===0) continue;
    const panelBindings=visualizationPanelBindings(experiment);
    if (!panelBindings) continue;
    const roster=robots.map((binding,index) => experimentBinding(binding,index));
    const modes=runModes.map((mode) => canonicalText(mode));
    if (modes.some((mode) => !mode) || new Set(modes).size!==modes.length) {
      throw new Error(`Experiment ${experimentId} has invalid run modes`);
    }
    plans.push({ experiment,experimentId,name,runModes:modes,roster,...panelBindings });
  }
  plans.sort((left,right) => left.name.localeCompare(right.name)
    || left.experimentId.localeCompare(right.experimentId));
  if (plans.length===0) {
    throw new Error('no Robot Experiment exposes both ROS Control and Lichtblick panels');
  }
  assertVisualizationKindCoverage(plans.flatMap((plan) => plan.roster));
  return plans;
}

export function parseVisualizationModeFilter(raw='') {
  if (typeof raw!=='string') throw new Error('XGC_VISUALIZATION_E2E_MODES must be a string');
  if (!raw.trim()) return [];
  const modes=raw.split(',').map((mode) => mode.trim());
  if (modes.some((mode) => !mode)) {
    throw new Error('XGC_VISUALIZATION_E2E_MODES must not contain empty modes');
  }
  if (new Set(modes).size!==modes.length) {
    throw new Error('XGC_VISUALIZATION_E2E_MODES must not contain duplicate modes');
  }
  const invalid=modes.filter((mode) => !CANONICAL_RUN_MODE_PATTERN.test(mode));
  if (invalid.length>0) {
    throw new Error(`XGC_VISUALIZATION_E2E_MODES contains non-canonical modes: ${invalid.join(', ')}`);
  }
  return modes;
}

export function filterVisualizationPlansByMode(plans,requestedModes=[]) {
  if (!Array.isArray(plans) || plans.length===0) {
    throw new Error('visualization plans must be a non-empty array');
  }
  if (!Array.isArray(requestedModes)) {
    throw new Error('visualization mode filter must be an array');
  }
  if (requestedModes.length===0) return plans;
  for (const plan of plans) {
    const declared=new Set(plan?.runModes || []);
    const absent=requestedModes.filter((mode) => !declared.has(mode));
    if (absent.length>0) {
      throw new Error(
        `Experiment ${canonicalText(plan?.experimentId) || canonicalText(plan?.name) || 'unknown'}`
        + ` does not declare requested visualization modes: ${absent.join(', ')}`,
      );
    }
  }
  const requested=new Set(requestedModes);
  return plans.map((plan) => ({
    ...plan,runModes:plan.runModes.filter((mode) => requested.has(mode)),
  }));
}

export function assertVisualizationKindCoverage(roster) {
  const kinds=new Set((roster || []).map((robot) => robot.kind));
  for (const kind of REQUIRED_VISUALIZATION_KINDS) {
    if (!kinds.has(kind)) throw new Error(`visualization matrix does not cover Robot kind ${kind}`);
  }
}

export function assertViewerOptIn({ tiles,relations,runMode }) {
  const byId=tileMap(tiles);
  for (const serviceId of MANUAL_VIEWER_IDS) {
    const tile=byId.get(serviceId);
    if (!tile) throw new Error(`ROS Control is missing ${serviceId} Panel Action`);
    if (tile.runId || VIEWER_ACTIVE_STATUSES.has(tile.status) || tile.percent!==0
      || tile.running==='true') {
      throw new Error(`${serviceId} auto-started in ${runMode}`);
    }
    const callNodeId=MANUAL_VIEWER_CALL_NODES[serviceId];
    if ((relations?.childRuns || []).some((child) => (
      child.callNodeId===callNodeId && !child.launchAbandonedAt
    ))) {
      throw new Error(`${serviceId} auto-started through ${callNodeId}`);
    }
  }
}

export function assertManualViewerEvidence({ before,after,runMode }) {
  assertViewerTilesIdle(before);
  const byId=tileMap(after);
  const runIds=new Set();
  for (const serviceId of MANUAL_VIEWER_IDS) {
    const tile=byId.get(serviceId);
    const ready=tile?.status==='ready' && tile.percent===100 && tile.running==='true';
    const waiting=runMode==='physical' && serviceId==='gzclient'
      && VIEWER_ACTIVE_STATUSES.has(tile?.status) && tile.status!=='ready';
    if (!tile || (!ready && !waiting) || !canonicalText(tile.runId)) {
      throw new Error(`${serviceId} manual Panel Action did not enter the expected state in ${runMode}`);
    }
    if (runIds.has(tile.runId)) throw new Error('manual viewers reused one Run identity');
    runIds.add(tile.runId);
  }
  return Object.fromEntries(MANUAL_VIEWER_IDS.map((serviceId) => [serviceId,byId.get(serviceId).runId]));
}

export function assertViewerRunIdentity(tiles,expectedRunIds) {
  const byId=tileMap(tiles);
  for (const serviceId of MANUAL_VIEWER_IDS) {
    const tile=byId.get(serviceId);
    const expectedRunId=canonicalText(expectedRunIds?.[serviceId]);
    if (!expectedRunId || tile?.runId!==expectedRunId
      || !VIEWER_ACTIVE_STATUSES.has(tile.status)) {
      throw new Error(`${serviceId} viewer Run identity changed during UI recovery`);
    }
  }
}

export function mergeOwnedProcessClosures(closures) {
  if (!Array.isArray(closures) || closures.length===0) {
    throw new Error('Run-owned Process closure evidence must be a non-empty array');
  }
  const roots=new Set();
  const processes=new Map();
  for (const closure of closures) {
    const rootRunId=canonicalText(closure?.rootRunId);
    const targetId=canonicalText(closure?.targetId);
    if (!rootRunId || !targetId || roots.has(`${targetId}\0${rootRunId}`)
      || !Array.isArray(closure?.processes)) {
      throw new Error('Run-owned Process closure has an invalid or duplicate root identity');
    }
    roots.add(`${targetId}\0${rootRunId}`);
    for (const process of closure.processes) {
      const processTargetId=canonicalText(process?.targetId)||targetId;
      const processId=canonicalText(process?.id);
      const ownerId=canonicalText(process?.ownerId);
      if (!processId || !ownerId || process?.ownerType!=='orchestration-run') {
        throw new Error('Run-owned Process has no exact orchestration identity or owner');
      }
      const key=`${processTargetId}\0${processId}`;
      const existing=processes.get(key);
      if (existing && (existing.ownerId!==ownerId
        || existing.definitionId!==process.definitionId)) {
        throw new Error(`Run-owned Process ${processId} changed identity across exact closures`);
      }
      processes.set(key,{ ...process,targetId:processTargetId });
    }
  }
  return [...processes.values()].sort((left,right) => (
    left.targetId.localeCompare(right.targetId)||left.id.localeCompare(right.id)
  ));
}

export function extractNodeOutput(invocations,nodeIds) {
  const allowed=new Set(Array.isArray(nodeIds) ? nodeIds : [nodeIds]);
  const matches=(invocations || []).filter((invocation) => allowed.has(invocation?.nodeId)
    && invocation.status==='succeeded');
  if (matches.length!==1) {
    throw new Error(`expected one succeeded node output for ${[...allowed].join(' or ')}`);
  }
  const outputs=matches[0].outputRefs || [];
  const main=outputs.find((output) => output.port==='main') || (outputs.length===1 ? outputs[0] : undefined);
  if (!main || !Object.hasOwn(main,'value')) {
    throw new Error(`node ${matches[0].nodeId} has no public output`);
  }
  return main.value;
}

export function frozenVisualizationRoster(experiment,robotOutput) {
  const bindings=experiment?.spec?.robots;
  const robots=robotOutput?.robots;
  if (!Array.isArray(bindings) || !Array.isArray(robots) || robots.length!==bindings.length
    || robotOutput?.robotCount!==robots.length) {
    throw new Error('frozen Robot output does not match the Experiment roster size');
  }
  const outputById=new Map(robots.map((robot) => [robot?.id,robot]));
  if (outputById.size!==robots.length) throw new Error('frozen Robot output repeats a slot identity');
  const result=[];
  for (let index=0;index<bindings.length;index+=1) {
    const binding=experimentBinding(bindings[index],index);
    const robot=outputById.get(binding.id);
    if (!robot) throw new Error(`frozen Robot output is missing slot ${binding.id}`);
    if (robot.robotAssetId!==binding.robotAssetId || robot.kind!==binding.kind
      || robot.namespace!==binding.namespace || robot.hybridSource!==binding.hybridSource) {
      throw new Error(`frozen Robot output drifted from Experiment slot ${binding.id}`);
    }
    const visualization=robot.visualization;
    if (!visualization || typeof visualization!=='object' || Array.isArray(visualization)) {
      throw new Error(`frozen Robot ${binding.id} has no visualization contract`);
    }
    const namespace=canonicalNamespace(robot.namespace);
    const name=namespace.slice(1);
    const pathRelative=canonicalRelativeTopic(visualization.pathTopic);
    if (!pathRelative) throw new Error(`frozen Robot ${binding.id} has no Path topic`);
    const descriptionPackage=canonicalText(visualization.descriptionPackage);
    const descriptionFile=canonicalText(visualization.descriptionFile);
    if (!descriptionPackage || !descriptionFile) {
      throw new Error(`frozen Robot ${binding.id} has no RobotModel description`);
    }
    const configuredPathLineWidth=visualization.pathLineWidthMeters ?? 0;
    if (typeof configuredPathLineWidth!=='number' || !Number.isFinite(configuredPathLineWidth)
      || configuredPathLineWidth<0
      || (configuredPathLineWidth>0 && configuredPathLineWidth<0.001)
      || configuredPathLineWidth>100) {
      throw new Error(`frozen Robot ${binding.id} has an invalid Path line width`);
    }
    const sceneModel=canonicalText(visualization.sceneModel)
      || canonicalText(robot.scout?.mocapRigidBodyName)
      || canonicalText(robot.px4?.modelName)
      || canonicalText(robot.scout?.modelName)
      || canonicalText(robot.mecanum?.modelName)
      || name;
    const modelId=canonicalText(robot.px4?.modelId);
    if (binding.kind==='px4_multirotor' && modelId!=='fs150') {
      throw new Error(`frozen PX4 Robot ${binding.id} is not the FS150 airframe`);
    }
    result.push({
      slotId:binding.id,robotAssetId:binding.robotAssetId,name,kind:binding.kind,namespace,
      hybridSource:binding.hybridSource,initialPose:binding.initialPose,sceneModel,
      sceneClass:canonicalText(visualization.sceneClass),
      robotDescriptionParameter:`${namespace}/visual_robot_description`,
      pathTopic:`${namespace}/${pathRelative}`,
      pathLineWidthMeters:configuredPathLineWidth || DEFAULT_RVIZ_PATH_LINE_WIDTH_METERS,
      modelId,visualization,
    });
  }
  return result.sort((left,right) => left.name.localeCompare(right.name));
}

export function assertRvizLayoutOutput(layout,{ roster,runMode }) {
  if (!layout || layout.schemaVersion!==1 || layout.fixedFrame!=='world'
    || layout.runMode!==runMode || !Array.isArray(layout.robots)
    || !Array.isArray(layout.robotDisplays) || !Array.isArray(layout.displays)
    || typeof layout.config!=='string' || !layout.config.trim()) {
    throw new Error('RViz layout output is incomplete');
  }
  const declaredDisplays=new Set(layout.displays);
  for (const requiredDisplay of ['RobotModel','TF','Path']) {
    if (!declaredDisplays.has(requiredDisplay)) {
      throw new Error(`RViz layout does not declare ${requiredDisplay}`);
    }
  }
  const expectedRobots=roster.map((robot) => ({
    id:robot.name,kind:robot.kind,namespace:robot.namespace,
    ...(robot.sceneClass ? { sceneClass:robot.sceneClass } : {}),sceneModel:robot.sceneModel,
  }));
  if (JSON.stringify(layout.robots)!==JSON.stringify(expectedRobots)) {
    throw new Error('RViz layout Robot roster does not match the frozen Experiment roster');
  }
  assertRvizRobotDisplays(layout.robotDisplays,roster);
  const expectedDigest=rosterDigest('world',runMode,expectedRobots);
  if (layout.rosterDigest!==expectedDigest) {
    throw new Error('RViz layout roster digest is not derived from the frozen roster');
  }
  if (!/^\s*Fixed Frame:\s*world\s*$/m.test(layout.config)) {
    throw new Error('RViz config Fixed Frame is not world');
  }
  const blocks=rvizDisplayBlocks(layout.config);
  const tf=blocks.find((block) => block.className==='rviz/TF');
  if (!tf || !displayEnabled(tf)) {
    throw new Error('RViz config has no enabled TF display');
  }
  for (const robot of roster) {
    const robotModel=blocks.find((block) => block.className==='rviz/RobotModel'
      && block.text.includes(robot.robotDescriptionParameter) && displayEnabled(block));
    if (!robotModel) throw new Error(`RViz config has no enabled RobotModel for ${robot.name}`);
    const path=blocks.find((block) => block.className==='rviz/Path'
      && block.text.includes(robot.pathTopic) && displayEnabled(block));
    if (!path) throw new Error(`RViz config has no enabled Path display for ${robot.name}`);
  }
}

export function assertRvizProcessBinding(process,layout) {
  const parameters=process?.parameters;
  if (!parameters || process.definitionId!=='rviz') throw new Error('RViz process is absent');
  const expectedPath=rvizGeneratedConfigPath(layout?.config);
  if (parameters.configPath!==expectedPath) {
    throw new Error(`RViz process did not use the exact generated config path ${expectedPath}`);
  }
  if (parameters.fixedFrame!=='world'
    || (Object.hasOwn(parameters,'configContent') && parameters.configContent!=='')) {
    throw new Error('RViz process did not consume the generated world-frame roster config');
  }
}

export function rvizGeneratedConfigPath(config) {
  if (typeof config!=='string' || !config.trim()) throw new Error('RViz generated config content is required');
  const digest=createHash('sha256').update(config).digest('hex');
  return `/tmp/xgc2/rviz/${digest}.rviz`;
}

export function assertLichtblickLayoutOutput(layout,roster,layoutMode='3d-above-camera-ar') {
  const panelLayout=layout?.layout;
  const config=layout?.configById;
  if (!panelLayout || typeof panelLayout!=='object' || !config
    || !config[SEMANTIC_CANVAS_IDS.threeD] || !config[SEMANTIC_CANVAS_IDS.cameraAR]) {
    throw new Error('Lichtblick layout must contain 3D and camera AR panels');
  }
  const augmentedPane=layoutMode==='3d-above-camera-ar-plot' ? panelLayout.second?.first : panelLayout.second;
  if (panelLayout.first!==SEMANTIC_CANVAS_IDS.threeD
    || augmentedPane!==SEMANTIC_CANVAS_IDS.cameraAR
    || panelLayout.direction!=='column'
    || (layoutMode==='3d-above-camera-ar-plot' && (panelLayout.second?.direction!=='row'
      || !String(panelLayout.second?.second).startsWith('Plot!')))) {
    throw new Error('Lichtblick split does not match the selected 3D/AR layout');
  }
  const threeD=config[SEMANTIC_CANVAS_IDS.threeD];
  if (threeD.followTf!=='world' || threeD.followMode!=='follow-none'
    || threeD.topics?.['/xgc/scene']?.visible!==true
    || threeD.topics?.['/xgc/tf']?.visible!==true) {
    throw new Error('Lichtblick 3D panel is not pinned to the world scene');
  }
  for (const robot of roster) {
    const layer=threeD.layers?.[`xgc2-urdf-${robot.name}`];
    if (!layer || layer.layerId!=='foxglove.Urdf' || layer.visible!==true
      || layer.parameter!==robot.robotDescriptionParameter
      || layer.framePrefix!==`${robot.sceneModel}/`) {
      throw new Error(`Lichtblick 3D panel has no roster Robot layer for ${robot.name}`);
    }
    const path=threeD.topics?.[robot.pathTopic];
    if (!path || path.visible!==true || path.type!=='line') {
      throw new Error(`Lichtblick 3D panel has no visible roster Path for ${robot.name}`);
    }
  }
  const camera=config[SEMANTIC_CANVAS_IDS.cameraAR];
  if (!canonicalAbsoluteTopic(camera.imageMode?.imageTopic)
    || !canonicalAbsoluteTopic(camera.imageMode?.calibrationTopic)
    || camera.topics?.['/xgc/scene']?.visible!==true) {
    throw new Error('Lichtblick camera AR panel has no live image/calibration scene contract');
  }
}

export function assertSemanticCanvasEvidence(evidence,{ requireMotion=true }={}) {
  const threeD=evidence?.threeD;
  const cameraAR=evidence?.cameraAR;
  for (const [role,canvas] of Object.entries({ threeD,cameraAR })) {
    if (!canvas || canvas.panelId!==SEMANTIC_CANVAS_IDS[role]
      || canvas.width<200 || canvas.height<120 || canvas.pixelWidth<200 || canvas.pixelHeight<120
      || canvas.webgl!==true || !Array.isArray(canvas.samples) || canvas.samples.length===0
      || canvas.samples.some((sample) => sample.bytes<3_000 || !/^[0-9a-f]{64}$/.test(sample.hash))) {
      throw new Error(`${role} canvas is not real rendered WebGL evidence`);
    }
    if (requireMotion && role==='cameraAR' && (canvas.transitions<1 || canvas.uniqueHashes<2)) {
      throw new Error(`${role} canvas did not render advancing pixels`);
    }
  }
  if (threeD.samples[0].hash===cameraAR.samples[0].hash) {
    throw new Error('3D and camera AR canvases rendered identical pixels');
  }
}

export function assertTrajectoryProgress(before,after,roster) {
  const beforeBySlot=sampleMap(before);
  const afterBySlot=sampleMap(after);
  for (const robot of roster) {
    const first=beforeBySlot.get(robot.slotId);
    const second=afterBySlot.get(robot.slotId);
    if (!first || !second || first.topic!==robot.pathTopic || second.topic!==robot.pathTopic) {
      throw new Error(`Path evidence is missing for ${robot.slotId}`);
    }
    assertPathSample(first,robot);
    assertPathSample(second,robot);
    // History is bounded by age and point budget. Once full, new samples
    // replace old ones instead of increasing the array length.
    if (second.pointCount<=first.pointCount
      && !(Number.isFinite(first.oldestStamp) && second.oldestStamp>first.oldestStamp)) {
      throw new Error(`${robot.slotId} Path history did not advance`);
    }
    if (second.latestStamp<=first.latestStamp) {
      throw new Error(`${robot.slotId} Path timestamp did not advance`);
    }
  }
}

export function assertStopClosure({ activeRun,processes,tiles,viewerRuns=[] }) {
  if (activeRun && ACTIVE_RUN_STATUSES.has(activeRun.status)) {
    throw new Error(`Experiment retained active Run ${activeRun.id}`);
  }
  for (const process of processes || []) {
    if (process.desiredState!=='stopped' || process.observedState!=='stopped' || process.handle!=null) {
      throw new Error(`Run-owned Process ${process.id || process.definitionId} survived Stop`);
    }
  }
  const byId=tileMap(tiles);
  for (const serviceId of MANUAL_VIEWER_IDS) {
    const tile=byId.get(serviceId);
    if (!tile || tile.runId || tile.percent!==0 || tile.running==='true'
      || (tile.status && tile.status!=='idle')) {
      throw new Error(`${serviceId} Panel Action retained runtime after Stop`);
    }
  }
  for (const run of viewerRuns) {
    if (!run || !TERMINAL_RUN_STATUSES.has(run.status)) {
      throw new Error(`manual viewer Run ${run?.id || 'unknown'} is not terminal after Stop`);
    }
  }
}

export function processReady(process) {
  return process?.desiredState==='running' && process.observedState==='running'
    && process.handle!=null && process.readiness?.status==='passing'
    && process.liveness?.status==='passing';
}

export function processInactive(process) {
  return process?.desiredState==='stopped' && process.observedState==='stopped' && process.handle==null;
}

function visualizationPanelBindings(experiment) {
  let lichtblick;
  let rosControl;
  let configDashboard;
  let gcsDashboard;
  for (const dashboard of experiment?.spec?.dashboards || []) {
    if (dashboard?.id==='config') configDashboard=dashboard;
    for (const panel of dashboard?.panels || []) {
      if (panel?.pluginId==='xgc2-lichtblick') {
        lichtblick={ dashboardId:dashboard.id,panelId:panel.id,layoutMode:panel.view?.options?.layoutMode,...workflowOwner(panel) };
        gcsDashboard=dashboard;
      }
      if (panel?.pluginId==='ros-basic-services-control') {
        rosControl={ dashboardId:dashboard.id,dashboardName:dashboard.name,panelId:panel.id,...workflowOwner(panel) };
      }
    }
  }
  if (!lichtblick || !rosControl
    || !gcsDashboard || !configDashboard) return undefined;
  return {
    lichtblick,rosControl,
    gcsDashboard:{ id:gcsDashboard.id,name:gcsDashboard.name },
    configDashboard:{ id:configDashboard.id,name:configDashboard.name },
  };
}

function workflowOwner(panel) {
  const owners=(panel?.portBindings || []).filter((binding) => binding.kind==='workflow');
  if (owners.length!==1 || !canonicalText(owners[0].workflowInstanceId)) {
    throw new Error(`Panel ${panel?.id || 'unknown'} has no exact workflow owner`);
  }
  return { workflowInstanceId:owners[0].workflowInstanceId,presetId:owners[0].presetId };
}

function experimentBinding(binding,index) {
  const id=canonicalText(binding?.id);
  const robotAssetId=canonicalText(binding?.ref?.resourceId);
  const namespace=canonicalNamespace(binding?.namespace);
  const hybridSource=canonicalText(binding?.hybridSource);
  const kind=bindingKind(binding);
  if (!id || !robotAssetId || !namespace || !hybridSource || !kind) {
    throw new Error(`Experiment Robot binding ${index} is incomplete`);
  }
  const initialPose={
    x:Number(binding?.initialPose?.x),y:Number(binding?.initialPose?.y),
    z:Number(binding?.initialPose?.z),yaw:Number(binding?.initialPose?.yaw),
  };
  if (Object.values(initialPose).some((value) => !Number.isFinite(value))) {
    throw new Error(`Experiment Robot binding ${index} has an invalid initial pose`);
  }
  return {
    id,robotAssetId,namespace,hybridSource,kind,
    initialPose,
  };
}

function bindingKind(binding) {
  const arms=[
    ['px4','px4_multirotor'],['scout','scout_mini'],['mecanum','mecanum_ugv'],
  ].filter(([key]) => Object.hasOwn(binding || {},key));
  return arms.length===1 ? arms[0][1] : '';
}

function assertViewerTilesIdle(tiles) {
  const byId=tileMap(tiles);
  for (const serviceId of MANUAL_VIEWER_IDS) {
    const tile=byId.get(serviceId);
    if (!tile || tile.runId || tile.percent!==0 || tile.running==='true'
      || VIEWER_ACTIVE_STATUSES.has(tile.status)) {
      throw new Error(`${serviceId} was not idle before its manual Panel Action`);
    }
  }
}

function tileMap(tiles) {
  const result=new Map();
  for (const tile of tiles || []) {
    const id=canonicalText(tile?.id);
    if (!id || result.has(id)) throw new Error('ROS Control tiles have invalid identities');
    result.set(id,{ ...tile,percent:Number(tile.percent || 0),runId:canonicalText(tile.runId),status:canonicalText(tile.status) });
  }
  return result;
}

function rvizDisplayBlocks(config) {
  const lines=config.split('\n');
  const managerIndex=lines.findIndex((line) => yamlKeyIndent(line,'Visualization Manager')>=0);
  if (managerIndex<0) return [];
  const managerIndent=yamlKeyIndent(lines[managerIndex],'Visualization Manager');
  const managerEnd=yamlBlockEnd(lines,managerIndex,managerIndent);
  const managerPropertyIndent=minimumContentIndent(lines,managerIndex+1,managerEnd,managerIndent);
  let displaysIndex=-1;
  for (let index=managerIndex+1;index<managerEnd;index+=1) {
    if (yamlKeyIndent(lines[index],'Displays')===managerPropertyIndent) {
      displaysIndex=index;
      break;
    }
  }
  if (displaysIndex<0) return [];
  const displaysIndent=managerPropertyIndent;
  const displaysEnd=yamlBlockEnd(lines,displaysIndex,displaysIndent,managerEnd);
  const itemIndent=minimumListItemIndent(lines,displaysIndex+1,displaysEnd,displaysIndent);
  if (itemIndent<0) return [];
  const result=[];
  for (let index=displaysIndex+1;index<displaysEnd;index+=1) {
    const itemText=directYamlListItem(lines[index],itemIndent);
    if (itemText===undefined) continue;
    const end=yamlBlockEnd(lines,index,itemIndent,displaysEnd);
    const classNames=[];
    const inlineClass=rvizClassProperty(itemText);
    if (inlineClass) classNames.push(inlineClass);
    for (let propertyIndex=index+1;propertyIndex<end;propertyIndex+=1) {
      if (leadingSpaceCount(lines[propertyIndex])!==itemIndent+2) continue;
      const className=rvizClassProperty(lines[propertyIndex].slice(itemIndent+2));
      if (className) classNames.push(className);
    }
    if (classNames.length>1) throw new Error('RViz display item repeats its direct Class property');
    if (classNames.length===1) {
      result.push({
        className:classNames[0],indent:itemIndent,text:lines.slice(index,end).join('\n'),
      });
    }
    index=end-1;
  }
  return result;
}

function displayEnabled(block) {
  const propertyIndent=' '.repeat(block.indent+2);
  return block.text.split('\n').includes(`${propertyIndent}Enabled: true`);
}

function assertRvizRobotDisplays(displays,roster) {
  if (displays.length!==roster.length) {
    throw new Error('RViz robotDisplays count does not match the frozen Experiment roster');
  }
  const seen=new Set();
  for (let index=0;index<roster.length;index+=1) {
    const display=displays[index];
    const robot=roster[index];
    assertExactObjectFields(display,[
      'id','initialPose','pathLineWidthMeters','pathTopic','robotDescriptionParameter','tfPrefix',
    ],`RViz robotDisplay ${robot.name}`);
    const id=canonicalText(display.id);
    if (!id || seen.has(id)) throw new Error(`RViz robotDisplays repeat Robot ${id || 'identity'}`);
    seen.add(id);
    if (id!==robot.name
      || display.robotDescriptionParameter!==robot.robotDescriptionParameter
      || display.tfPrefix!==robot.sceneModel
      || display.pathTopic!==robot.pathTopic
      || display.pathLineWidthMeters!==robot.pathLineWidthMeters) {
      throw new Error(`RViz robotDisplay does not match frozen Robot ${robot.name}`);
    }
    assertExactObjectFields(display.initialPose,['x','y','yaw','z'],
      `RViz robotDisplay ${robot.name} initialPose`);
    for (const axis of ['x','y','z','yaw']) {
      if (display.initialPose[axis]!==robot.initialPose[axis]) {
        throw new Error(`RViz robotDisplay ${robot.name} initialPose does not match the frozen roster`);
      }
    }
  }
}

function assertExactObjectFields(value,fields,label) {
  if (!value || typeof value!=='object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  const actual=Object.keys(value).sort();
  const expected=[...fields].sort();
  if (JSON.stringify(actual)!==JSON.stringify(expected)) {
    throw new Error(`${label} fields are not exact`);
  }
}

function yamlKeyIndent(line,key) {
  const indent=leadingSpaceCount(line);
  return line.slice(indent).trimEnd()===`${key}:` ? indent : -1;
}

function directYamlListItem(line,indent) {
  if (leadingSpaceCount(line)!==indent || line[indent]!=='-') return undefined;
  const suffix=line.slice(indent+1);
  if (suffix && !suffix.startsWith(' ')) return undefined;
  return suffix.trim();
}

function rvizClassProperty(value) {
  const match=value.match(/^Class:\s+(rviz\/[A-Za-z0-9_]+)\s*$/);
  return match?.[1];
}

function yamlBlockEnd(lines,startIndex,indent,limit=lines.length) {
  for (let index=startIndex+1;index<limit;index+=1) {
    if (!lines[index].trim()) continue;
    if (leadingSpaceCount(lines[index])<=indent) return index;
  }
  return limit;
}

function minimumContentIndent(lines,startIndex,endIndex,parentIndent) {
  let result=Number.POSITIVE_INFINITY;
  for (let index=startIndex;index<endIndex;index+=1) {
    if (!lines[index].trim()) continue;
    const indent=leadingSpaceCount(lines[index]);
    if (indent>parentIndent) result=Math.min(result,indent);
  }
  return Number.isFinite(result) ? result : -1;
}

function minimumListItemIndent(lines,startIndex,endIndex,parentIndent) {
  let result=Number.POSITIVE_INFINITY;
  for (let index=startIndex;index<endIndex;index+=1) {
    const indent=leadingSpaceCount(lines[index]);
    if (indent>parentIndent && directYamlListItem(lines[index],indent)!==undefined) {
      result=Math.min(result,indent);
    }
  }
  return Number.isFinite(result) ? result : -1;
}

function leadingSpaceCount(line) {
  return line.match(/^ */)[0].length;
}

function rosterDigest(fixedFrame,runMode,robots) {
  return createHash('sha256').update(JSON.stringify({ fixedFrame,runMode,robots })).digest('hex');
}

function sampleMap(samples) {
  const result=new Map();
  for (const sample of samples || []) {
    if (!canonicalText(sample?.slotId) || result.has(sample.slotId)) {
      throw new Error('Path samples have invalid slot identities');
    }
    result.set(sample.slotId,sample);
  }
  return result;
}

function assertPathSample(sample,robot) {
  if (sample.messageType!=='nav_msgs/Path' || sample.frameId!=='world'
    || sample.poseFramesWorld!==true || sample.tfWorldLinked!==true
    || !Number.isSafeInteger(sample.pointCount) || sample.pointCount<1
    || !Number.isFinite(sample.latestStamp) || sample.latestStamp<=0
    || !Number.isFinite(sample.minZ) || !Number.isFinite(sample.maxZ)) {
    throw new Error(`${robot.slotId} Path/TF evidence is incomplete`);
  }
  if (robot.kind==='px4_multirotor' && sample.minZ < -0.25) {
    throw new Error(`${robot.slotId} Path uses a negative-down z frame`);
  }
  if ((robot.kind==='scout_mini' || robot.kind==='mecanum_ugv')
    && (Math.max(Math.abs(sample.minZ),Math.abs(sample.maxZ))>1
      || sample.maxZ-sample.minZ>0.25)) {
    throw new Error(`${robot.slotId} ground Path does not remain in the world ground plane`);
  }
}

function canonicalText(value) {
  return typeof value==='string' && value.trim()===value ? value : '';
}

function canonicalNamespace(value) {
  const namespace=canonicalText(value);
  return /^\/[A-Za-z_][A-Za-z0-9_]*$/.test(namespace) ? namespace : '';
}

function canonicalRelativeTopic(value) {
  const topic=canonicalText(value);
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/.test(topic) ? topic : '';
}

function canonicalAbsoluteTopic(value) {
  const topic=canonicalText(value);
  return /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/.test(topic) ? topic : '';
}
