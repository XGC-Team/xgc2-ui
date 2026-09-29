// Static browser evidence for the real dialog and shared skin. No Core, swarm,
// Vite listener, or physical commands are used. Workflow facts are fixtures.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp,mkdir,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const webRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const evidence=resolve(process.env.XGC_PREFLIGHT_EVIDENCE_DIR || resolve(webRoot,'test-results/preflight-arm-test'));
const temp=await mkdtemp(resolve(tmpdir(),'xgc-preflight-'));
const entry=resolve(temp,'fixture.tsx');
await mkdir(evidence,{recursive:true});
await writeFile(entry,`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PreflightArmTestDialog} from ${JSON.stringify(resolve(webRoot,'src/panels/robot/PreflightArmTestDialog.tsx'))};
import '@xgc2/ui-react/styles.css';
import ${JSON.stringify(resolve(webRoot,'src/styles/skin.css'))};
import ${JSON.stringify(resolve(webRoot,'src/styles/robot-px4-control.css'))};
function Fixture(){
 const [stage,setStage]=useState('confirmation');window.preflightStage=setStage;
 const active=stage!=='finished';
 const rows=stage==='confirmation'||stage==='testing'
  ? ['UAV 01','UAV 02','UAV 03'].map(robotId=>({robotId,status:'pending'}))
  : [{robotId:'UAV 01',status:'passed'},{robotId:'UAV 02',status:'failed',detail:'Timed out waiting for observed state'},{robotId:'UAV 03',status:'excluded',detail:'Already armed'}];
 const run={id:'fixture-run',status:active?'running':'succeeded',revision:1,parameters:{robotIds:['UAV 01','UAV 02','UAV 03']}};
 const nodes=[{nodeId:'arm-observe',kind:'robot.operation-observe',status:stage==='confirmation'?'pending':stage==='testing'?'running':'succeeded',progress:{rows}}];
 if(stage==='cleanup'||stage==='finished')nodes.push({nodeId:'disarm-observe',kind:'robot.operation-observe',status:stage==='cleanup'?'running':'succeeded',progress:{rows:rows.slice(0,2).map(row=>({...row,status:stage==='cleanup'?'pending':'passed'}))}});
 const detail={run,nodeSummaries:nodes,invocations:[],loading:false,error:''};
 const finish=()=>{setStage('cleanup')};
 window.preflightScope={interactions:{chatDecisions:stage==='confirmation'||stage==='results'?[{id:'decision',status:'open',revision:1,origin:{runId:run.id},payload:{decision:{approveLabel:stage==='confirmation'?'Authorize arm test':'Reboot failed robots'}}}]:[],respond:async(_,action)=>{window.preflightResponse=action;setStage(action==='approved'?'testing':'cleanup')}}};
 const automation={runDetailsById:{[run.id]:detail},loadRunDetail:load,retainRunDetail:retain};
 return <PreflightArmTestDialog targetId="fixture" automation={automation} port={{control:finish}} invocation={run} robotIds={run.parameters.robotIds} onClose={()=>{window.preflightClosed=true}}/>;
}
const load=async()=>({});const retain=()=>()=>{};
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
let browser;
try {
 await build({entryPoints:[entry],outfile:resolve(temp,'fixture.js'),bundle:true,format:'iife',platform:'browser',jsx:'automatic',nodePaths:[resolve(webRoot,'node_modules')],define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-boundaries',setup(builder){
  builder.onResolve({filter:/domains\/(robot\/robotPublic|automation\/automationPublic|groundStationInteraction\/groundStationInteractionPublic)$/},args=>({path:args.path,namespace:'fixtures'}));
  builder.onLoad({filter:/.*/,namespace:'fixtures'},args=>({loader:'js',contents:args.path.includes('robotPublic')?'export const useRobotText=()=>text=>text;':args.path.includes('automationPublic')?'export const isAutomationExecutionRunActive=run=>["running","waiting","stopping","accepted"].includes(run.status);':'export const useGroundStationInteractionScope=()=>window.preflightScope;export const useGroundStationDecisionPresentation=()=>{};'}));
 }}]});
 const js=await readFile(resolve(temp,'fixture.js'),'utf8');const css=await readFile(resolve(temp,'fixture.css'),'utf8');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:780}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<html data-skin="dark"><head></head><body><div id="root"></div></body></html>');
 await page.addStyleTag({content:css+' body{font-family:system-ui;background:var(--color-bg-app);color:var(--color-text);margin:0}'});
 await page.addScriptTag({content:js});
 const dialog=page.locator('[data-xgc-role="preflight-arm-test-dialog"]');await dialog.waitFor();
 await page.getByRole('button',{name:'Authorize arm test'}).click();
 await page.locator('.is-testing').first().waitFor();
 assert.equal(await page.locator('.is-testing').count(),3);
 const marker=await page.locator('.is-testing').first().evaluate(el=>({color:getComputedStyle(el).color,animation:getComputedStyle(el).animationName}));
 assert.equal(marker.color,'rgb(255, 255, 255)');assert.equal(marker.animation,'preflight-arm-test-spin');
 await page.screenshot({path:resolve(evidence,'testing-dark.png')});
 await page.evaluate(()=>window.preflightStage('results'));
 await page.getByRole('button',{name:'Reboot failed robots'}).waitFor();
 assert.equal(await page.locator('[data-state="passed"]').count(),1);assert.equal(await page.locator('[data-state="failed"]').count(),1);
 await page.screenshot({path:resolve(evidence,'results-dark.png')});
 await page.setViewportSize({width:390,height:780});await page.evaluate(()=>document.documentElement.dataset.skin='light');await page.waitForTimeout(300);
 await page.screenshot({path:resolve(evidence,'results-light-narrow.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'End and disarm'}).click();
 await page.getByText('Disarming tested robots…').waitFor();
 assert.equal(await page.evaluate(()=>window.preflightResponse),'rejected');
 await page.evaluate(()=>window.preflightStage('finished'));
 await page.getByRole('button',{name:'Close',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.preflightClosed),true);assert.deepEqual(errors,[]);
 await writeFile(resolve(evidence,'result.json'),JSON.stringify({passed:true,fixtureOnly:true,marker,screenshots:['testing-dark.png','results-dark.png','results-light-narrow.png'],pageErrors:errors},null,2));
 console.log('Preflight static browser checks passed; evidence: '+evidence);
} finally {await browser?.close();await rm(temp,{recursive:true,force:true});}
