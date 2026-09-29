/* global console,process,URL */
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {chromium} from '@playwright/test';
import {execFile as rawExec} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(rawExec);
import * as H from './experiment-system-runner-e2e.mjs';
const webUrl=process.env.XGC_SCE1_WEB_URL || 'http://127.0.0.1:5174';
const out=process.env.XGC_SCE1_EVIDENCE;
if(!out)throw Error('XGC_SCE1_EVIDENCE is required (output prefix)');
mkdirSync(dirname(out),{recursive:true});
const stopResume=process.env.XGC_SCE1_STOP_RESUME!=='0';
const coreContainer=await H.resolveLocalSwarmCoreContainer('XGC_SCE1_CORE_CONTAINER');
const observer=readFileSync(new URL('./sce1-algorithm-observer.py',import.meta.url),'utf8');
const browser=await chromium.launch({args:['--enable-gpu','--use-angle=gl']});
const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:out+'.videos'}}),page=await context.newPage();
const report={scope:'SCE1 algorithm, Stop/Takeoff/Start resume and landing; Reset excluded',stopResume,startedAt:new Date().toISOString(),actions:[]};let experiment,runId='';
const active=s=>['accepted','queued','waiting','running','stopping'].includes(s);
const ready=p=>p.observedState==='running'&&p.readiness?.status==='passing'&&p.liveness?.status==='passing';
const tile=id=>page.locator('[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="paper-leader-sce1"] [data-xgc-role="panel-action-invoke"][data-xgc-id="'+id+'"]');
async function clickRun(locator){const [res]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/execution-targets/local/orchestration-runs'),locator.click()]);const body=await res.json();if(res.status()!==202)throw Error(JSON.stringify(body));return body.run.id;}
async function terminal(id,timeout=120000){const r=await H.waitFor(async()=>{const r=await H.orchestrationRun(context,webUrl,id);return active(r.status)?undefined:r;},timeout,'Action did not finish');if(r.status!=='succeeded')throw Error(JSON.stringify(r));return r;}
async function command(id){const r=await clickRun(tile(id));await terminal(r);const rel=await H.orchestrationRelations(context,webUrl,r);for(const c of rel.childRuns)await terminal(c.childRunId);report.actions.push({id,runId:r});console.log('command',id);}
async function probe(mode){const {stdout}=await execFile('docker',['exec','-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',coreContainer,'python3','-c',observer,mode],{timeout:240000,maxBuffer:1024*1024});return JSON.parse(stdout);}
async function serviceChild(rootRunId,label){
 const relations=await H.orchestrationRelations(context,webUrl,rootRunId);
 if(relations.childRuns.length>1)throw Error(`${label} dispatched ${relations.childRuns.length} children`);
 if(relations.childRuns.length!==1)return undefined;
 const child=await H.orchestrationRun(context,webUrl,relations.childRuns[0].childRunId);
 if(!active(child.status))throw Error(`${label} workflow ended ${child.status}`);
 return child;
}
async function algorithmReady(rootRunId){
 const workflow=await H.waitFor(async()=>{
  const child=await serviceChild(rootRunId,'Algorithm');if(!child)return undefined;
  const relations=await H.orchestrationRelations(context,webUrl,child.id);
  const jobs=await Promise.all((relations.waits??[]).filter(wait=>wait.type==='job').map(wait=>H.getJSON(context,webUrl,`/api/execution-targets/local/jobs/${wait.subjectId}`)));
  return jobs.length&&jobs.every(job=>job.status==='running')?{workflowRunId:child.id,workflowStatus:child.status,jobs}:undefined;
 },180000,'SCE1 algorithm process jobs not running');
 const program=`import json,rospy
from std_msgs.msg import Empty
rospy.init_node('sce1_ready_probe',anonymous=True)
rospy.wait_for_message('/sce1_central_controller/ready',Empty,timeout=180)
print(json.dumps({'topic':'/sce1_central_controller/ready','messageType':'std_msgs/Empty','received':True}))`;
 const {stdout}=await execFile('docker',['exec','-e','ROS_MASTER_URI=http://127.0.0.1:11311','-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages',coreContainer,'python3','-c',program],{timeout:240000,maxBuffer:1024*1024});
 return {...workflow,readySignal:JSON.parse(stdout)};
}
async function recordReady(rootRunId){
 return H.waitFor(async()=>{
  const child=await serviceChild(rootRunId,'Record');if(!child)return undefined;
  const recorders=(await H.experimentOwnedProcesses(context,webUrl,rootRunId)).filter(p=>p.definitionId==='rosbag-record-selected');
  if(recorders.length>1)throw Error(`Record workflow owns ${recorders.length} recorders`);
  return recorders.length===1&&ready(recorders[0])?{workflowRunId:child.id,workflowStatus:child.status,recorder:recorders[0]}:undefined;
 },180000,'SCE1 Record workflow recorder not ready');
}
try{
 await H.assertNoActiveSystemRunner(context,webUrl);
 experiment=await H.resolveManagedFixture(context,webUrl,{key:'px4-mecanum-swarm',name:'SCE'});
 report.experimentId=experiment.head.resourceId;
 await page.goto(webUrl+'/#/experiments/'+experiment.head.resourceId);
 const mode=page.locator('[data-xgc-role="experiment-run-mode-select"]').getByRole('button');await mode.click();await page.getByRole('option',{name:'simulation',exact:true}).click();await page.getByRole('tab',{name:'GCS',exact:true}).click();
 const start=await H.startExperimentThroughUI({page,context,webUrl,experiment,runMode:'simulation',onAccepted:r=>{runId=r.id;report.runId=runId}});report.start=start;console.log('Foundation started',runId);
 report.foundation=await H.waitFor(async()=>{const p=await H.experimentOwnedProcesses(context,webUrl,runId);return p.filter(p=>p.definitionId==='px4-sitl-fs150'&&ready(p)).length===5&&p.filter(p=>p.definitionId.includes('mecanum')&&ready(p)).length>=2?p:undefined;},240000,'5+2 foundation not ready');
 report.algorithmRun=await clickRun(tile('run'));
 report.algorithmReady=await algorithmReady(report.algorithmRun);
 await H.waitFor(async()=>await tile('run').getAttribute('data-xgc-status')==='running'?true:undefined,30000,'Algorithm not green');
 report.recordRun=await clickRun(tile('record'));
 report.recorder=await recordReady(report.recordRun);
 report.resetPose={status:'NOT_TESTED',reason:'Algorithm-first trial uses dataset initial placement; failed Reset workflow tracked separately.'};await command('takeoff');report.hover=await probe('hover');await command('start');
 if(stopResume){report.midpoint=await probe('midpoint');await command('stop');report.stopped=await probe('stopped');await page.screenshot({path:out+'.stopped.png'});await command('takeoff');report.resumedHover=await probe('hover');await command('start');}
 report.finished=await probe('finished');await page.screenshot({path:out+'.regret.png'});
 await command('stop');report.landed=await probe('stopped');
 report.stop=await H.stopExperimentThroughUI({page,context,webUrl,experiment,runId});runId='';report.outcome='PASS';console.log('PASS',out);
}catch(e){report.outcome='FAIL';report.failure=String(e);console.error(e);if(runId){if(report.algorithmRun){try{await page.getByRole('tab',{name:'GCS',exact:true}).click();await command('stop');}catch(error){report.stopCommandError=String(error);}}try{report.cleanup=await H.stopExperimentThroughUI({page,context,webUrl,experiment,runId});runId=''}catch(e){report.cleanupError=String(e)}}process.exitCode=1;
}finally{writeFileSync(out+'.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
