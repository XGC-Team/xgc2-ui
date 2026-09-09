/* global console,process,URL,setTimeout */
import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFile as rawExec } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import * as H from './experiment-system-runner-e2e.mjs';
import { discoverVisualizationMatrix } from './local-fleet-visualization-e2e-contract.mjs';

const execFile=promisify(rawExec);
const output=process.env.XGC_PARTIAL_START_EVIDENCE;
assert(output,'XGC_PARTIAL_START_EVIDENCE is required');
const webUrl=process.env.XGC_PARTIAL_START_WEB_URL || 'http://127.0.0.1:5174';
const modes=(process.env.XGC_PARTIAL_START_MODES || 'physical,hybrid').split(',');
assert(modes.every(mode=>['physical','hybrid'].includes(mode)) && new Set(modes).size===modes.length);
const definitions={
 scout_mini:{simulation:'scout-gazebo-robot',physical:'swarm-ros-bridge-scout-physical'},
 mecanum_ugv:{simulation:'mecanum-gazebo-robot',physical:'swarm-ros-bridge-mecanum-physical'},
 px4_multirotor:{simulation:'px4-sitl-fs150',physical:'mavros-px4-physical'},
};
const active=status=>['accepted','queued','running','waiting'].includes(status);
const ready=p=>p.desiredState==='running' && p.observedState==='running' && p.readiness?.status==='passing';
const namespace=value=>String(value || '').replace(/^\/+/, '');
const summarize=p=>({id:p.id,definitionId:p.definitionId,namespace:p.parameters?.namespace,
 desiredState:p.desiredState,observedState:p.observedState,readiness:p.readiness?.status,liveness:p.liveness?.status});
mkdirSync(dirname(output),{recursive:true});
const container=await H.resolveLocalFleetCoreContainer('XGC_PARTIAL_START_CORE_CONTAINER');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/google-chrome'});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await context.newPage();
const report={scope:'Physical/hybrid startup without physical robots: real daemon readiness, source selection, absent physical telemetry and complete Stop. No physical motion or algorithm-control acceptance.',cells:[]};
report.runtime={
 image:(await execFile('docker',['inspect',container,'--format','{{.Image}}'])).stdout.trim(),
 packages:(await execFile('docker',['exec',container,'dpkg-query','-W','-f=${Package} ${Version}\n',
  'ros-noetic-xgc2-gazebo-sim-scout','ros-noetic-xgc2-multirotor-controller'])).stdout.trim().split('\n'),
};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
let plan,cell,runId='';

async function stop() {
 if(!runId) return;
 await H.stopExperimentThroughUI({page,context,webUrl,experiment:plan.experiment,runId,timeoutMs:240000});
 await H.waitFor(async()=>{
  const processes=await H.experimentOwnedProcesses(context,webUrl,runId);
  return processes.every(p=>p.desiredState==='stopped' && p.observedState==='stopped' && !p.handle)?true:undefined;
 },60000,'Partial startup retained owned processes after Stop');
 cell.totalStopped=true;cell.remainingOwnedProcesses=0;runId='';save();
}

try {
 const all=discoverVisualizationMatrix(await H.getJSON(context,webUrl,'/api/experiments'));
 const selected=process.env.XGC_PARTIAL_START_EXPERIMENT;
 assert(!selected || all.some(p=>p.experimentId===selected));
 for(plan of all.filter(p=>!selected || p.experimentId===selected)) for(const mode of modes) {
  await H.assertNoActiveSystemRunner(context,webUrl);
  const roster=plan.roster.map(robot=>({...robot,source:mode==='physical'?'physical':robot.hybridSource}));
  assert(roster.every(r=>definitions[r.kind]?.[r.source]),'Frozen roster has an unsupported source or kind');
  cell={experimentId:plan.experimentId,name:plan.name,mode,roster,status:'RUNNING'};report.cells.push(cell);save();
  try {
   assert(plan.experiment.spec.runModes.includes(mode), `Experiment does not declare ${mode} mode`);
   await page.goto(webUrl+'/#/experiments/'+plan.experimentId,{waitUntil:'domcontentloaded'});
   await page.locator('[data-xgc-role="experiment-run-mode-select"]').getByRole('button').click();
   await page.getByRole('option',{name:mode,exact:true}).click();
   await H.startExperimentThroughUI({page,context,webUrl,experiment:plan.experiment,runMode:mode,
    onAccepted:r=>{runId=r.id;cell.runId=runId;save();}});
   await H.waitFor(async()=>{
    const root=await H.orchestrationRun(context,webUrl,runId);assert(active(root.status),root.primaryError || root.reason);
    const processes=await H.experimentOwnedProcesses(context,webUrl,runId);cell.processes=processes.map(summarize);save();
    assert(!processes.some(p=>p.desiredState==='running' && /controller|rosbag-record|user-project-command/.test(p.definitionId)),
     'Total Run automatically started an algorithm/controller/recorder');
    return roster.every(r=>processes.some(p=>p.definitionId===definitions[r.kind][r.source] &&
     namespace(p.parameters?.namespace)===namespace(r.namespace) && ready(p)))?true:undefined;
   },240000,'Selected physical/hybrid robot-link daemons did not become ready');
   const processes=await H.experimentOwnedProcesses(context,webUrl,runId);
   const robotDefinitions=new Set(Object.values(definitions).flatMap(Object.values));
   const robotProcesses=processes.filter(p=>p.desiredState==='running' && robotDefinitions.has(p.definitionId));
   assert.equal(robotProcesses.length,roster.length,'Wrong-source or duplicate robot processes were started');
   const program=readFileSync(new URL('./fleet-algorithm-processes.py',import.meta.url),'utf8');
   const {stdout}=await execFile('docker',['exec',container,'python3','-c',program]);
   assert.equal(JSON.parse(stdout).length,0,'Algorithm/controller OS process started before operator action');
   await new Promise(resolve=>setTimeout(resolve,15000));
   for(const item of await H.experimentRunClosure(context,webUrl,runId)) {
    const run=await H.getJSON(context,webUrl,`/api/execution-targets/${item.targetId}/orchestration-runs/${item.runId}`);
    assert(!['failed','rejected','canceled','stopped','stopping'].includes(run.status),`${run.id}: ${run.primaryError || run.reason}`);
   }
   const sessions=await H.experimentSessions(context,webUrl,plan.experimentId);
   assert.equal(sessions.length,1);assert.equal(sessions[0].session.state,'active');assert.equal(sessions[0].session.runMode,mode);
   // Daemon readiness alone is insufficient; record actual incoming telemetry.
   const telemetry=readFileSync(new URL('./fleet-partial-start-observer.py',import.meta.url),'utf8');
   const observed=await execFile('docker',['exec','-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',container,'python3','-c',telemetry,JSON.stringify(roster)],{timeout:20000});
   cell.telemetry=JSON.parse(observed.stdout);
   assert(cell.telemetry.every(r=>r.source==='physical'
    ? r.poseMessages===0 && !r.connected && (r.kind!=='px4_multirotor' || r.stateMessages>0)
    : r.poseMessages>1 && r.lastPoseStamp>r.firstPoseStamp &&
      (r.kind!=='px4_multirotor' || r.connected && r.stateMessages>0)),
    'Physical telemetry was fabricated/connected unexpectedly, or simulation pose/FCU connection was missing');
   const finalProcesses=await H.experimentOwnedProcesses(context,webUrl,runId);
   assert(roster.every(r=>finalProcesses.some(p=>p.definitionId===definitions[r.kind][r.source] &&
    namespace(p.parameters?.namespace)===namespace(r.namespace) && ready(p))),
   'Robot-link readiness was lost during the observation window');
   assert(!finalProcesses.some(p=>p.desiredState==='running' && /controller|rosbag-record|user-project-command/.test(p.definitionId)),
    'Algorithm/controller/recorder appeared without an operator action');
   cell.processes=finalProcesses.map(summarize);
   cell.status='PASS';console.log(plan.name,mode,'partial startup passed');
  } catch(error) {cell.status='FAIL';cell.error=String(error.message);console.error(plan.name,mode,cell.error);}
  finally {await stop();save();}
 }
 report.overall=report.cells.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
 if(report.overall!=='PASS') process.exitCode=1;
} finally {await stop();await context.close();await browser.close();}
