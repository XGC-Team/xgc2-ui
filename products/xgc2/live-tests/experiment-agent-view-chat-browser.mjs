// The installed shared chat consumes the received MCP image and replays it.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFileSync,mkdirSync,writeFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const output=resolve(process.env.XGC_VIEW_EVIDENCE_DIR ?? `${tmpdir()}/xgc2-view-browser`);mkdirSync(output,{recursive:true});
const bundle=await build({stdin:{contents:`
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import {AgentConversation} from '@xgc2/agent-runtime/react';
 import {applyEvent,emptyStream} from '@xgc2/agent-runtime/state';
 window.showReceivedView=(event)=>{
  const state=applyEvent(emptyStream('s_image','codex'),event);
  createRoot(document.getElementById('chat')).render(React.createElement(AgentConversation,{state,active:true,locale:'zh',emptyState:null}));
 };
`,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',platform:'browser'});
const browser=await chromium.launch({headless:true,executablePath:existsSync(chromium.executablePath())?chromium.executablePath():'/usr/bin/google-chrome'});
const budget=setTimeout(()=>void browser.close(),30000);
try{
 const page=await browser.newPage({viewport:{width:600,height:700}});
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='green';x.fillRect(0,0,320,180);x.fillStyle='red';x.fillRect(120,20,100,80);return c.toDataURL('image/jpeg',.7).split(',')[1];});
 const event={schemaVersion:'xgc.agent-runtime/v1',sessionId:'s_image',seq:1,provider:'codex',kind:'item.snapshot',turnId:'t_image',itemId:'image-one',role:'tool',title:'xgc2_view',status:'completed',text:'',createdAt:'2026-09-10T01:00:00Z',details:{type:'mcpToolCall',server:'xgc2',tool:'xgc2_view',arguments:{view:'panel',panelId:'world-camera'},result:{content:[
  {type:'text',text:JSON.stringify({imageTitle:{en:'Panel screenshot',zh:'面板截图'},observedAt:'2026-09-10T01:00:00Z'})},
  {type:'image',mimeType:'image/jpeg',data,width:320,height:180},
 ]}}};
 const css=readFileSync('node_modules/@xgc2/agent-runtime/dist/agent-chat.css','utf8');
 async function show(target){
  await target.setContent('<style>html,body{margin:0;height:100%;}#chat{height:680px;}</style><div id="chat"></div>');
  await target.addStyleTag({content:css});await target.addScriptTag({content:bundle.outputFiles[0].text});
  await target.evaluate(event=>window.showReceivedView(event),JSON.parse(JSON.stringify(event)));
  const thumbnail=target.locator('[data-xgc-role="agent-tool-thumbnail"]');await thumbnail.waitFor({state:'visible'});
  await thumbnail.evaluate(image=>image.decode());
  assert.equal(await thumbnail.count(),1);
  assert.equal(await thumbnail.getAttribute('src'),`data:image/jpeg;base64,${data}`);
  assert.equal(await thumbnail.getAttribute('alt'),'面板截图');
  const rect=await thumbnail.boundingBox();assert.ok(rect.width<=600 && rect.height<=256 && rect.height>0);
  assert.equal(await target.locator('figure time').getAttribute('datetime'),'2026-09-10T01:00:00Z');
  return thumbnail;
 }
 await show(page);
 await page.screenshot({path:`${output}/chat-thumbnail.png`});
 const replay=await browser.newPage({viewport:{width:600,height:700}});await show(replay);
 const receipt={passed:2,results:['installed shared chat displays the exact MCP image with label and time','fresh page replay displays the same image once'],imageSHA256:createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')};
 writeFileSync(`${output}/chat-receipt.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
}finally{clearTimeout(budget);await browser.close();}
