/* global console,process,URL */
import assert from 'node:assert/strict';
import { execFile as rawExec } from 'node:child_process';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import * as H from './experiment-system-runner-e2e.mjs';
import { cameraVideoEvidence } from './fleet-camera-calibration-evidence.mjs';
import { discoverVisualizationMatrix } from './local-fleet-visualization-e2e-contract.mjs';

const execFile=promisify(rawExec);
const webUrl=process.env.XGC_CONTROLS_WEB_URL || 'http://127.0.0.1:5174';
const output=process.env.XGC_CONTROLS_EVIDENCE;
const gate=process.env.XGC_CONTROLS_GATE || 'mission';
assert(['mission','ground-reset'].includes(gate),'Unknown controls gate');
assert(output,'XGC_CONTROLS_EVIDENCE is required');
mkdirSync(dirname(output),{recursive:true});
const container=await H.resolveLocalFleetCoreContainer('XGC_CONTROLS_CORE_CONTAINER');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/google-chrome'});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await context.newPage();
const report={gate,scope:gate==='ground-reset'?'Focused ground Reset after real displacement; excludes Stop/Track resume.':'Simulation operator controls: manual algorithm ownership, all visible mission commands, real motion, Stop/Start, landing and ground reset. Scientific convergence and full-lap performance are separate gates.',startedAt:new Date().toISOString(),cells:[]};
report.runtime={
 image:(await execFile('docker',['inspect',container,'--format','{{.Image}}'])).stdout.trim(),
 packages:(await execFile('docker',['exec',container,'dpkg-query','-W','-f=${Package} ${Version}\n',
  'ros-noetic-xgc2-gazebo-sim-scout','ros-noetic-xgc2-multirotor-controller','ros-noetic-xgc2-ugv-controller'])).stdout.trim().split('\n'),
};
const active=status=>['accepted','queued','waiting','running','stopping'].includes(status);
const ready=p=>p.desiredState==='running' && p.observedState==='running' && p.readiness?.status==='passing' && p.liveness?.status==='passing';
let cell,plan,runId='',algorithmPanel='';
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const action=id=>page.locator(`[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="${algorithmPanel}"] [data-xgc-role="panel-action-invoke"][data-xgc-id="${id}"]`);
const header=role=>page.locator(`[data-xgc-role="${role}"][data-xgc-id="${algorithmPanel}"]`);
const tab=name=>page.getByRole('tab',{name,exact:true}).click();

async function dispatch(locator) {
 const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname==='/api/execution-targets/local/orchestration-runs'),locator.click()]);
 const body=await response.json();assert.equal(response.status(),202,JSON.stringify(body));assert(body.run?.id);
 return body.run.id;
}
async function terminal(id,timeout=120000) {
 const run=await H.waitFor(async()=>{const r=await H.orchestrationRun(context,webUrl,id);return active(r.status)?undefined:r;},timeout,`Run ${id} did not terminate`);
 assert.equal(run.status,'succeeded',JSON.stringify(run));return run;
}
async function children(id) {
 return H.waitFor(async()=>{const r=await H.orchestrationRelations(context,webUrl,id);return r.childRuns?.length?r.childRuns:undefined;},30000,'Dispatched workflow child is missing');
}
async function command(id) {
 const button=action(id);assert(await button.isVisible(),`Action ${id} is missing`);assert(!await button.isDisabled(),await button.getAttribute('title') || `${id} is disabled`);
 const idRun=await dispatch(button);await terminal(idRun);
 for(const child of await children(idRun)) await terminal(child.childRunId);
 await H.waitFor(async()=>await button.getAttribute('data-xgc-status')==='stopped' && !await button.isDisabled() && !await button.getAttribute('data-xgc-run-id')?true:undefined,30000,`${id} did not return to an invokable finite command`);
 cell.actions.push({id,runId:idRun});await residency();save();console.log(plan.name,id,'passed');
}
async function probe(mode) {
 const roster=plan.roster.map(robot=>({...robot,initialPose:plan.experiment.spec.robots.find(r=>r.id===robot.id).initialPose}));
 const program=readFileSync(new URL('./fleet-controls-observer.py',import.meta.url),'utf8');
 let stdout;
 try {
  ({stdout}=await execFile('docker',['exec','-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages','-e','LD_LIBRARY_PATH=/opt/ros/noetic/lib:/opt/ros/noetic/lib/x86_64-linux-gnu',container,'python3','-c',program,JSON.stringify(roster),mode],{timeout:200000,maxBuffer:1024*1024}));
 } catch(error) {
  const detail=String(error.stderr || error.message).trim().split('\n').at(-1);
  cell.gates.push({mode,status:'FAIL',error:detail});save();
  throw new Error(detail,{cause:error});
 }
 const evidence=JSON.parse(stdout);cell.gates.push(evidence);save();console.log(plan.name,mode,'physical gate passed');return evidence;
}
async function algorithmOSProcesses() {
 const program=readFileSync(new URL('./fleet-algorithm-processes.py',import.meta.url),'utf8');
 const {stdout}=await execFile('docker',['exec',container,'python3','-c',program],{timeout:10000,maxBuffer:1024*1024});return JSON.parse(stdout);
}
async function residency() {
 const processes=await H.experimentOwnedProcesses(context,webUrl,cell.algorithmRun);
 const recorder=processes.find(p=>p.id===cell.recorder.id);assert(recorder && ready(recorder),'Scientific recorder lost algorithm ownership/readiness');
 const workflow=await H.orchestrationRun(context,webUrl,cell.algorithmWorkflow);assert(active(workflow.status),'Algorithm workflow ended after a finite command');
 for(const owned of cell.algorithmProcesses) assert(processes.some(p=>p.id===owned.id && ready(p)),`Algorithm process ${owned.definitionId} ended after a finite command`);
 const os=await algorithmOSProcesses();
 for(const process of cell.algorithmOS || []) assert(os.some(p=>p.pid===process.pid),'Algorithm controller/planner process exited: '+process.pid);
 const stop=await action('custom1').isVisible()?action('custom1'):header('panel-workflow-stop');
 assert(await stop.isVisible() && !await stop.isDisabled(),'Algorithm workflow Stop is missing/disabled');
 if(await action('custom1').isVisible()) assert.equal(await action('custom1').getAttribute('data-xgc-status'),'running');
}
async function stopOwnRun() {
 if(!runId) return;
 await H.stopExperimentThroughUI({page,context,webUrl,experiment:plan.experiment,runId,timeoutMs:240000});
 await H.waitFor(async()=>{const p=await H.experimentOwnedProcesses(context,webUrl,runId);return p.every(x=>x.observedState==='stopped' && x.desiredState==='stopped' && !x.handle)?p:undefined;},60000,'Experiment retained owned processes after Stop');
 cell.totalStopped=true;cell.remainingOwnedProcesses=0;
 runId='';
}

try {
 const plans=discoverVisualizationMatrix(await H.getJSON(context,webUrl,'/api/experiments'));
 const selected=process.env.XGC_CONTROLS_EXPERIMENT;
 assert(!selected || plans.some(p=>p.experimentId===selected),'Selected experiment is absent');
 for(plan of plans.filter(p=>!selected || p.experimentId===selected)) {
  await H.assertNoActiveSystemRunner(context,webUrl);
  cell={name:plan.name,experimentId:plan.experimentId,actions:[],gates:[],status:'RUNNING'};report.cells.push(cell);save();
  try {
  const panels=plan.experiment.spec.dashboards.flatMap(d=>d.panels.map(p=>({...p,dashboardName:d.name})));
  const algorithm=panels.find(p=>p.dashboardName==='GCS' && p.id.startsWith('paper-leader-'));
  const build=panels.find(p=>p.id.startsWith('paper-leader-') && p.id.endsWith('build'));
  assert(algorithm && build,'Algorithm/Build panels are missing');algorithmPanel=algorithm.id;
  await page.goto(webUrl+'/#/experiments/'+plan.experimentId,{waitUntil:'domcontentloaded'});
  await page.locator('[data-xgc-role="experiment-run-mode-select"]').getByRole('button').click();
  await page.getByRole('option',{name:'simulation',exact:true}).click();await tab('GCS');
  const started=await H.startExperimentThroughUI({page,context,webUrl,experiment:plan.experiment,runMode:'simulation',onAccepted:r=>{runId=r.id;cell.runId=runId;save();}});
  cell.startLatencyMs=started.latencyMs;
  const foundation=await H.waitFor(async()=>{const p=await H.experimentOwnedProcesses(context,webUrl,runId);return p.filter(x=>['scout-gazebo-robot','mecanum-gazebo-robot','px4-sitl-fs150'].includes(x.definitionId) && ready(x)).length===plan.roster.length?p:undefined;},300000,'Frozen roster foundation is not ready');
  const premature=foundation.filter(p=>/controller|rosbag-record|user-project-command/.test(p.definitionId) && p.desiredState==='running');
  assert.equal(premature.length,0,'Total Run started user algorithm/controller/recorder: '+JSON.stringify(premature));cell.foundation=foundation.map(p=>({id:p.id,definitionId:p.definitionId}));
  assert.equal((await algorithmOSProcesses()).length,0,'An algorithm/controller OS process exists before the manual Algorithm click');
  console.log(plan.name,'foundation passed');
  const cameraPanel=panels.find(p=>p.pluginId==='gazebo-world-camera');assert(cameraPanel);
  cell.liveCamera=await cameraVideoEvidence({page,panel:cameraPanel});save();
  await tab(build.dashboardName);
  cell.buildRun=await dispatch(page.locator(`[data-xgc-role="panel-workflow-run"][data-xgc-id="${build.id}"]`));save();
  for(const child of await children(cell.buildRun)) await terminal(child.childRunId,3600000);
  console.log(plan.name,'build child passed; System Runner retains the panel owner until Stop');
  await tab('GCS');
  await page.locator(`[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="${algorithmPanel}"] [data-xgc-role="panel-action-invoke"]`).first().waitFor();
  cell.visibleActions=await page.locator(`[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="${algorithmPanel}"] [data-xgc-role="panel-action-invoke"]`).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-xgc-id')));
  const startButton=await action('custom1').isVisible()?action('custom1'):header('panel-workflow-run');
  cell.algorithmRun=await dispatch(startButton);save();
  const childRuns=await children(cell.algorithmRun);assert.equal(childRuns.length,1);cell.algorithmWorkflow=childRuns[0].childRunId;
  cell.recorder=await H.waitFor(async()=>{
   const workflow=await H.orchestrationRun(context,webUrl,cell.algorithmWorkflow);assert(active(workflow.status),'Algorithm failed before READY: '+JSON.stringify(workflow));
   const p=await H.experimentOwnedProcesses(context,webUrl,cell.algorithmRun);return p.find(p=>p.definitionId==='rosbag-record-selected' && ready(p));
  },240000,'Algorithm did not reach its recorder READY boundary');
  cell.algorithmProcesses=(await H.experimentOwnedProcesses(context,webUrl,cell.algorithmRun)).filter(ready).map(p=>({id:p.id,definitionId:p.definitionId}));
  cell.algorithmOS=await algorithmOSProcesses();
  for(const robot of plan.roster) {
   const controller=robot.kind==='px4_multirotor'?'px4_multirotor_controller':robot.kind==='scout_mini'?'unicycle_ugv_controller':'mecanum_ugv_controller';
   assert(cell.algorithmOS.some(p=>p.argv[0].includes('/'+controller+'/') && p.namespace===robot.namespace),'Missing actual controller for '+robot.id);
  }
  await residency();save();console.log(plan.name,'algorithm and recorder ready');
  const hasUAV=plan.roster.some(r=>r.kind==='px4_multirotor');
  assert(gate!=='ground-reset' || !hasUAV,'Focused ground Reset requires a ground-only roster');
  if(hasUAV){await command('takeoff');await probe('hover');}
  const track=cell.visibleActions.includes('track')?'track':'start';
  await command(track);await probe('motion');await command('stop');await probe('stopped');
  if(gate==='mission'){await command(track);await probe('motion');await command('stop');await probe('stopped');}
  if(hasUAV){await command('land');await probe('landed');}
  const reset=cell.visibleActions.find(id=>id==='reset' || id==='reset-pose');
  if(reset){
   const beforeReset=cell.gates.at(-1).robots.filter(r=>plan.roster.some(slot=>slot.kind!=='px4_multirotor' && slot.namespace==='/'+r.name));
   assert(beforeReset.some(r=>r.initialPoseErrorM>0.1),'Reset has no displaced ground robot to verify');
   await command(reset);await probe('reset');
  }
  const exercised=new Set(['custom1',...cell.actions.map(a=>a.id)]);
  assert(cell.visibleActions.every(id=>exercised.has(id)),'Some visible actions were not exercised: '+cell.visibleActions.filter(id=>!exercised.has(id)).join(', '));
  await page.screenshot({path:output+'.'+plan.experimentId+'.png'});
  const stopAlgorithm=await action('custom1').isVisible()?action('custom1'):header('panel-workflow-stop');
  await stopAlgorithm.click();
  await H.waitFor(async()=>{const p=await H.experimentOwnedProcesses(context,webUrl,cell.algorithmRun);return p.every(x=>x.observedState==='stopped' && x.desiredState==='stopped' && !x.handle)?p:undefined;},60000,'Algorithm Stop retained controller/recorder processes');
  await H.waitFor(async()=>{const p=await algorithmOSProcesses();return p.length===0?true:undefined;},30000,'Algorithm Stop retained controller/planner OS processes');
  cell.algorithmStopped=true;await stopOwnRun();cell.status='PASS';save();console.log('PASS',plan.name);
  } catch(error) {
   cell.status='FAIL';cell.error=String(error);console.error('FAIL',plan.name,error);
   await page.screenshot({path:output+'.'+plan.experimentId+'.failure.png'}).catch(()=>undefined);
   await stopOwnRun();save();await H.assertNoActiveSystemRunner(context,webUrl);
  }
 }
 report.outcome=report.cells.every(c=>c.status==='PASS')?'PASS':'FAIL';
 if(report.outcome==='FAIL')process.exitCode=1;
} catch(error) {
 report.outcome='FAIL';report.error=String(error);if(cell)cell.status='FAIL';console.error(error);
 await page.screenshot({path:output+'.failure.png'}).catch(()=>undefined);
 try{await stopOwnRun();}catch(cleanup){report.cleanupError=String(cleanup);}
 process.exitCode=1;
} finally {report.finishedAt=new Date().toISOString();save();await context.close();await browser.close();}
