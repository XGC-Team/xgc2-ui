/* global console,document,HTMLIFrameElement,process,setTimeout,URL */
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import {
  assertNoActiveSystemRunner,
  experimentOwnedProcesses,
  resolveManagedFixture,
  resolveLocalFleetCoreContainer,
  startExperimentThroughUI,
  stopExperimentThroughUI,
} from './experiment-system-runner-e2e.mjs';

const execFile = promisify(execFileCallback);
const configuration = {
  webUrl:requiredURL('XGC_PX4_TRAJECTORY_WEB_URL','http://127.0.0.1:5174'),
  experimentId:optionalID('XGC_PX4_TRAJECTORY_EXPERIMENT_ID'),
  evidencePath:required('XGC_PX4_TRAJECTORY_EVIDENCE'),
  coreContainer:await resolveLocalFleetCoreContainer('XGC_PX4_TRAJECTORY_CORE_CONTAINER'),
};
let expectedNamespaces = [];
const waitTimeoutMs = 360_000;
// This lane proves pose -> namespaced nav_msgs/Path history while the aircraft
// are intentionally stationary. /xgc/scene is labels+TF only; path entities are
// not published there. Actual DMPC displacement is asserted by the paper
// mission E2E; do not turn low simulation real-time factor into a long
// wall-clock wait here.
const minimumHistoryPoints = 20;
const historySampleTimeoutSeconds = 60;
const panelSelector = '[data-xgc-role="experiment-panel"]'
  + '[data-xgc-id="lichtblick"][data-panel-id="lichtblick"]';

mkdirSync(dirname(configuration.evidencePath),{ recursive:true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1600,height:1000 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
let runId = '';
let startObservation = '';
let experiment;
let lichtblickDiagnostics={};
page.on('pageerror',(error) => pageErrors.push(error.message));
page.on('console',(message) => {
  if (message.type() === 'error') consoleErrors.push({ message:message.text(),location:message.location() });
});

try {
  experiment = await resolveManagedFixture(context,configuration.webUrl,{
    key:'six-px4',name:'6 PX4 multirotors experiment',resourceId:configuration.experimentId,
  });
  configuration.experimentId=experiment.head.resourceId;
  expectedNamespaces=experiment.spec.robots.filter((robot) => Object.hasOwn(robot,'px4'))
    .map((robot) => String(robot.namespace || '').replace(/^\/+|\/+$/g,''));
  if (expectedNamespaces.length === 0 || new Set(expectedNamespaces).size !== expectedNamespaces.length
    || expectedNamespaces.some((namespace) => !namespace)) {
    throw new Error('six-PX4 fixture has no exact authored PX4 namespaces');
  }
  await openExperiment(page);
  await assertNoActiveSystemRunner(context,configuration.webUrl);
  await selectSimulation(page);
  await selectGCS(page);
  const runButton = page.locator(
    `[data-xgc-role="experiment-run"][data-xgc-id="${configuration.experimentId}"]`,
  );
  await runButton.waitFor({ state:'visible',timeout:30_000 });
  if (await runButton.isDisabled()) {
    throw new Error(`Run is disabled: ${await runButton.getAttribute('title') || 'no reason'}`);
  }
  const started = await startExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runMode:'simulation',
  });
  runId=started.run.id;
  startObservation='system-runner-panel-dispatch';
  const running = await waitFor(async () => {
    const owned = await experimentOwnedProcesses(context,configuration.webUrl,runId);
    const sitl=owned.filter((item) => item.definitionId==='px4-sitl-fs150');
    const mavros=owned.filter((item) => item.definitionId==='mavros-px4-sitl');
    const scene=owned.filter((item) => item.definitionId==='lichtblick-robot-scene');
    if (sitl.length!==expectedNamespaces.length || mavros.length!==expectedNamespaces.length
      || scene.length!==1 || ![...sitl,...mavros,...scene].every(processReady)) return undefined;
    return { owned,scene:scene[0] };
  },waitTimeoutMs,'authored PX4/MAVROS/trajectory providers did not become ready');

  const scene = running.scene;
  if (!scene || scene.parameters?.fs150Models !== expectedNamespaces.join(',')
    || scene.parameters?.scoutModels !== '' || scene.parameters?.mecanumModels !== '') {
    throw new Error(`Lichtblick PX4 roster drifted: ${JSON.stringify(scene?.parameters)}`);
  }
  const panel = page.locator(panelSelector);
  await panel.waitFor({ state:'visible',timeout:90_000 });
  await panel.scrollIntoViewIfNeeded();
  const frame = panel.locator('[data-xgc-role="lichtblick-frame"]');
  await frame.waitFor({ state:'visible',timeout:90_000 }).catch(async (cause) => {
    const workspace=panel.locator('[data-xgc-role="lichtblick-workspace"]');
    lichtblickDiagnostics=await workspace.evaluate((element) => ({
      activeRunId:element.getAttribute('data-xgc-active-run-id')||'',
      runtimeTarget:element.getAttribute('data-xgc-runtime-target')||'',
      runtimeRunCount:Number(element.getAttribute('data-xgc-runtime-run-count')||0),
      runtimeProcessCount:Number(element.getAttribute('data-xgc-runtime-process-count')||0),
      actionRunCount:Number(element.getAttribute('data-xgc-action-run-count')||0),
      webProcessId:element.getAttribute('data-xgc-web-process-id')||'',
      webReady:element.getAttribute('data-xgc-web-ready')==='true',
      bridgeProcessId:element.getAttribute('data-xgc-bridge-process-id')||'',
      bridgeReady:element.getAttribute('data-xgc-bridge-ready')==='true',
      text:(element.textContent||'').trim(),
    })).catch(() => ({}));
    throw cause;
  });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement && element.contentDocument?.contentType === 'text/html';
  },undefined,{ timeout:90_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement
      && [...(element.contentDocument?.querySelectorAll('canvas') || [])].some((canvas) => {
        const bounds = canvas.getBoundingClientRect();
        return bounds.width >= 200 && bounds.height >= 120;
      });
  },undefined,{ timeout:90_000 });

  const ros = await samplePX4Trajectory();
  for (const path of ros.scenePaths) {
    if (path.pointCount < minimumHistoryPoints || !Number.isFinite(path.span) || path.span <= 0) {
      throw new Error(`${path.id} is not a bounded historical trajectory: ${JSON.stringify(path)}`);
    }
  }
  if (ros.poses.length !== expectedNamespaces.length
    || ros.poses.some(({ stamp }) => !Number.isFinite(stamp) || stamp <= 0)) {
    throw new Error(`MAVROS pose source is incomplete: ${JSON.stringify(ros.poses)}`);
  }
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(`browser errors: ${JSON.stringify({ pageErrors,consoleErrors })}`);
  }
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  writeFileSync(configuration.evidencePath,`${JSON.stringify({
    experimentId:configuration.experimentId,runId,runMode:'simulation',
    startObservation,startupLatencyMs:started.latencyMs,panelSelector,
    ownedProcesses:running.owned.map(processEvidence),sceneProcess:processEvidence(scene),ros,
    pageErrors,consoleErrors,
  },null,2)}\n`);

  await stopExperimentThroughUI({
    page,context,webUrl:configuration.webUrl,experiment,runId,timeoutMs:waitTimeoutMs,
  });
  await waitFor(async () => {
    const processes=await experimentOwnedProcesses(context,configuration.webUrl,runId);
    return processes.every(processInactive) ? true : undefined;
  },waitTimeoutMs,'PX4 Experiment attached/supervised Process closure remained active after Stop');
  runId = '';
  console.log(`PASS: six PX4 MAVROS poses produced six bounded Lichtblick histories; evidence: ${configuration.evidencePath}`);
} catch (cause) {
  await page.screenshot({ path:`${configuration.evidencePath}.failure.png`,fullPage:true }).catch(() => undefined);
  writeFileSync(`${configuration.evidencePath}.failure.json`,`${JSON.stringify({
    experimentId:configuration.experimentId,runId,startObservation,lichtblickDiagnostics,pageErrors,consoleErrors,
    error:cause instanceof Error ? cause.message : String(cause),
  },null,2)}\n`);
  await stopVisibleRun(page).catch(() => undefined);
  throw cause;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function samplePX4Trajectory() {
  const expectedIDs = expectedNamespaces.map((name) => `/${name}/path`);
  const { stdout } = await execFile('docker',[
    'exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311',
    '-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',
    configuration.coreContainer,'python3','-c',trajectorySampleProgram(),
    JSON.stringify(expectedNamespaces),JSON.stringify(expectedIDs),String(minimumHistoryPoints),
    String(historySampleTimeoutSeconds),
  ],{ timeout:90_000,maxBuffer:1024*1024 });
  const evidence = JSON.parse(stdout.trim());
  if (!Array.isArray(evidence.poses) || evidence.poses.length !== expectedNamespaces.length
    || !Array.isArray(evidence.scenePaths) || evidence.scenePaths.length !== expectedIDs.length) {
    throw new Error(`PX4 trajectory sample is incomplete: ${stdout}`);
  }
  return evidence;
}

function trajectorySampleProgram() {
  return String.raw`
import json,math,sys,time
import rospy
from geometry_msgs.msg import PoseStamped
from nav_msgs.msg import Path
names=json.loads(sys.argv[1])
expected=json.loads(sys.argv[2])
minimum_points=int(sys.argv[3])
sample_timeout=float(sys.argv[4])
rospy.init_node('xgc2_px4_trajectory_e2e_sample',anonymous=True,disable_signals=True)
poses=[]
for name in names:
    message=rospy.wait_for_message('/%s/mavros/local_position/pose' % name,PoseStamped,timeout=15.0)
    poses.append({'namespace':name,'stamp':message.header.stamp.to_sec(),'position':{
      'x':message.pose.position.x,'y':message.pose.position.y,'z':message.pose.position.z}})
found={}
deadline=time.time()+sample_timeout
while time.time() < deadline and not rospy.is_shutdown():
    for topic in expected:
        if topic in found and found[topic]['pointCount'] >= minimum_points and found[topic]['span'] > 0:
            continue
        path=rospy.wait_for_message(topic,Path,timeout=10.0)
        points=path.poses
        span=0.0
        for left in points:
            for right in points:
                span=max(span,math.sqrt(
                  (right.pose.position.x-left.pose.position.x)**2
                  +(right.pose.position.y-left.pose.position.y)**2
                  +(right.pose.position.z-left.pose.position.z)**2))
        found[topic]={'id':topic,'pointCount':len(points),'span':span}
    if all(topic in found and found[topic]['pointCount'] >= minimum_points and found[topic]['span'] > 0
           for topic in expected):
        break
print(json.dumps({'poses':poses,'scenePaths':[found[key] for key in expected if key in found]},separators=(',',':')))
`;
}

async function openExperiment(page) {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`,{
    waitUntil:'domcontentloaded',timeout:30_000,
  });
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state:'visible',timeout:30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]')
    .waitFor({ state:'detached',timeout:30_000 }).catch(() => undefined);
}

async function selectSimulation(page) {
  const root = page.locator(
    `[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${configuration.experimentId}"]`,
  );
  await root.waitFor({ state:'visible',timeout:30_000 });
  await root.getByRole('button').click();
  await page.getByRole('option',{ name:'simulation',exact:true }).click();
  await page.locator(
    `[data-xgc-role="experiment-run-mode"][data-xgc-id="${configuration.experimentId}"][data-xgc-value="simulation"]`,
  ).waitFor({ state:'visible',timeout:30_000 });
}

async function selectGCS(page) {
  const tab = page.getByRole('tab',{ name:'GCS',exact:true });
  await tab.waitFor({ state:'visible',timeout:30_000 });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
}

async function stopVisibleRun(page) {
  const stop = page.locator('[data-xgc-role="experiment-stop"]');
  if (await stop.count() && !await stop.isDisabled()) {
    await stop.click();
    await page.locator('[data-xgc-role="experiment-run"]').waitFor({ state:'visible',timeout:waitTimeoutMs });
  }
}

function processReady(item) {
  return item.desiredState === 'running' && item.observedState === 'running' && item.handle != null
    && item.readiness?.status === 'passing' && item.liveness?.status === 'passing';
}

function processInactive(item) {
  return item.desiredState === 'stopped' && item.observedState === 'stopped' && item.handle == null;
}

function processEvidence(item) {
  return {
    id:item.id,definitionId:item.definitionId,desiredState:item.desiredState,
    observedState:item.observedState,readiness:item.readiness?.status,
    liveness:item.liveness?.status,parameters:item.parameters,
  };
}

async function waitFor(probe,timeoutMs,message) {
  const deadline = Date.now()+timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve,250));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
}

function required(name,fallback) {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredURL(name,fallback) {
  const parsed = new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return parsed.origin;
}

function optionalID(name) {
  const value = process.env[name]?.trim() || '';
  if (value && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}
