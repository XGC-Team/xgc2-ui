/* global URL */
import assert from 'node:assert/strict';
import {execFile as rawExec} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {waitFor} from './experiment-system-runner-e2e.mjs';
const execFile=promisify(rawExec);

/** Drive the real calibration controls; correspondence pixels come from the independent Gazebo plant pose. */
export async function cameraCalibrationEvidence({page,context,webUrl,plan,processes,coreContainer,screenshotPath}) {
 const camera=processes.find(p=>p.definitionId==='gazebo-static-camera');
 assert(camera,'The run has no simulation camera');
 const panel=plan.experiment.spec.dashboards.flatMap(d=>d.panels.map(p=>({...p,dashboardName:d.name}))).find(p=>p.pluginId==='gazebo-world-camera');
 assert(panel,'The experiment has no world camera panel');
 const videoEvidence=await cameraVideoEvidence({page,panel});
 await page.locator(`[data-xgc-role="gazebo-world-camera-calibration-mode"][data-xgc-id="${panel.id}"]`).click();
 const freeze=page.locator('[data-xgc-role="camera-calibration-freeze"]');await freeze.waitFor();
 const processId=await freeze.getAttribute('data-xgc-id');
 const base=`/api/visualization/targets/local/camera-calibration/${processId}/api/v1`;
 const action=async(name,locator)=>{
  const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/${name}`),locator.click()]);
  const body=await response.json();assert(response.ok(),`${name}: ${JSON.stringify(body)}`);return body;
 };
 const frozen=await action('freeze',freeze);
 assert.equal(frozen.mode,'frozen');assert(frozen.markers.length>=4,'Not enough actual tracked markers');
 const program=readFileSync(new URL('./fleet-camera-plant-projection.py',import.meta.url),'utf8');
 const {stdout}=await execFile('docker',['exec','-e','PYTHONPATH=/opt/ros/noetic/lib/python3/dist-packages','-e','LD_LIBRARY_PATH=/opt/ros/noetic/lib:/opt/ros/noetic/lib/x86_64-linux-gnu',coreContainer,'python3','-c',program,JSON.stringify(frozen),JSON.stringify(camera.parameters)],{timeout:30000,maxBuffer:1024*1024});
 const truth=JSON.parse(stdout);assert(truth.points.length>=4,'Less than four marker origins are inside the actual camera field of view');
 const stage=page.locator('[data-xgc-role="camera-calibration-image"]');await stage.locator('img').waitFor();
 for(const point of truth.points){
  await page.locator('[data-xgc-role="camera-calibration-marker"]').getByRole('button').click();await page.getByRole('option',{name:point.marker,exact:true}).click();
  const box=await stage.boundingBox();assert(box);const scale=Math.min(box.width/frozen.frame.width,box.height/frozen.frame.height);
  await stage.click({position:{x:(box.width-frozen.frame.width*scale)/2+point.pixel[0]*scale,y:(box.height-frozen.frame.height*scale)/2+point.pixel[1]*scale}});
 }
 const solved=await action('solve',page.locator('[data-xgc-role="camera-calibration-solve"]'));
 assert.equal(solved.saved,false);assert(!solved.output_file,'Solve persisted an unreviewed file');
 assert(solved.max_reprojection_error_px<3,`Reprojection error ${solved.max_reprojection_error_px}px`);
 const translationError=Math.hypot(...solved.translation.map((v,i)=>v-truth.translation[i]));
 const dot=Math.min(1,Math.abs(solved.quaternion_xyzw.reduce((sum,v,i)=>sum+v*truth.quaternion[i],0)));
 const rotationError=2*Math.acos(dot)*180/Math.PI;
 assert(translationError<0.08,`Camera plant translation differs by ${translationError}m`);assert(rotationError<1,`Camera plant rotation differs by ${rotationError}deg`);
 const saved=await action('save',page.locator('[data-xgc-role="camera-calibration-save"]'));assert(saved.saved);assert.equal(saved.candidate_id,solved.candidate_id);
 const result=page.locator('[data-xgc-role="camera-calibration-result"]');await result.waitFor();await page.screenshot({path:screenshotPath});
 const state=await context.request.get(webUrl+base+'/state');assert(state.ok());const persisted=await state.json();assert.equal(persisted.result?.candidate_id,saved.candidate_id);
 await action('live',page.locator('[data-xgc-role="camera-calibration-live"]'));await page.getByRole('button',{name:'Close extrinsic calibration',exact:true}).click();
 return {video:videoEvidence,processId,markers:truth.points.length,translationErrorM:translationError,rotationErrorDegrees:rotationError,solved,saved,screenshotPath};
}

export async function cameraVideoEvidence({page,panel}) {
 await page.getByRole('tab',{name:panel.dashboardName,exact:true}).click();
 const video=page.locator(`[data-xgc-role="gazebo-world-camera-workspace"][data-xgc-id="${panel.id}"] video`);
 await waitFor(async()=>await video.evaluate(el=>el.readyState===4&&el.videoWidth===3840&&el.videoHeight===2160).catch(()=>false)?true:undefined,90000,'The camera did not decode 4K frames');
 const before=await video.evaluate(el=>({time:el.currentTime,width:el.videoWidth,height:el.videoHeight,frames:el.getVideoPlaybackQuality().totalVideoFrames}));
 await waitFor(async()=>await video.evaluate((el,at)=>el.currentTime>at+0.2,before.time)?true:undefined,10000,'Camera frame time did not advance');
 const after=await video.evaluate(el=>({time:el.currentTime,frames:el.getVideoPlaybackQuality().totalVideoFrames}));
 assert(after.time>before.time && after.frames>before.frames,'The live camera did not advance decoded frames');
 return {before,after};
}
