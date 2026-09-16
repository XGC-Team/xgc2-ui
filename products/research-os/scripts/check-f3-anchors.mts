import test from 'node:test'
import assert from 'node:assert/strict'
import {captureTarget,verifyAnchor,requireBuildSource,connectReview} from '../src/features/review/review-api.ts'
import {observedFiles,observeSavedFile} from '../src/features/review/file-observations.ts'
import type {Anchor} from '../src/features/review/review-model.ts'
const scope={projectId:'p',workspace:'w'},anchor:Anchor={kind:'text',workspace:'w',path:'main.tex',digest:'d1',quote:'exact'}
async function mock(data:unknown,fn:()=>Promise<unknown>,status=200){const old=globalThis.fetch;const calls: {url:string;init?:RequestInit}[]=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({data}),{status,headers:{'Content-Type':'application/json'}})};try{await fn();return calls}finally{globalThis.fetch=old}}
test('stale text locator never silently repins to current content',async()=>{await mock({content:'exact',digest:'d2'},()=>assert.rejects(verifyAnchor(anchor,scope),/stale/))})
test('exact source locator verifies its recorded field/range',async()=>{await mock({content:'exact',digest:'d1'},()=>verifyAnchor({...anchor,target:{kind:'text',workspace:'w',path:'main.tex',start:0,end:5}},scope));await mock({content:'wrong',digest:'d1'},()=>assert.rejects(verifyAnchor({...anchor,target:{kind:'text',workspace:'w',path:'main.tex',start:0,end:5}},scope),/not found/))})
test('external PDF is evidence, not an inferred source-edit permission',async()=>{await assert.rejects(verifyAnchor({...anchor,kind:'pdf',origin:'external',page:1},scope),/External PDF/)})
test('missing recorded PDF build cannot fall back to a newer build',async()=>{const data=[{task:{workspaceRef:'w',entryPoint:'main.tex'},manifest:{buildId:'new',status:'succeeded',outputs:[{digest:'new-pdf',mediaType:'application/pdf'}]}}];await mock(data,()=>assert.rejects(verifyAnchor({...anchor,kind:'pdf',origin:'project-build',buildId:'old',page:1},scope),/not replaced/))})
test('source capture rejects displayed content that has not been saved',async()=>{await mock({content:'exact',digest:'d1'},()=>assert.rejects(captureTarget(scope,{kind:'text',workspace:'w',path:'main.tex',start:0,end:5},'unsaved'),/Displayed content/))})
test('matching build input is required, not only a successful compile label',async()=>{await mock([{task:{workspaceRef:'w',entryPoint:'main.tex'},manifest:{buildId:'b',status:'succeeded'}}],()=>assert.rejects(requireBuildSource('w','main.tex','b','d1'),/Needs confirmation/))})
test('source read encodes path components without treating percent signs as escape input',async()=>{const calls=await mock({content:'exact',digest:'d1'},()=>captureTarget(scope,{kind:'text',workspace:'w',path:'draft 10%/中.tex',start:0,end:5}));assert.ok(calls[0].url.includes('draft%2010%25/%E4%B8%AD.tex'))})
test('invalid journal load blocks decisions instead of replacing the journal',async()=>{const e=connectReview(scope,()=>{});await mock({content:'{broken',digest:'j1'},()=>assert.rejects(e.load()));assert.ok(e.snapshot().auditUncertain);await assert.rejects(e.add({} as never),/Reload/);e.dispose()})
test('saved observations report only acknowledged new revisions and distinguish layout changes',()=>{
 const c=JSON.stringify({version:1,nodes:[{id:'n',kind:'idea',title:'t',body:'b',x:1,y:2}],edges:[]}),v=JSON.parse(c);v.nodes[0].x=42
 const before=observedFiles().length
 observeSavedFile(scope,'thinking.canvas.json',{content:c,digest:'a'},{content:JSON.stringify(v),digest:''},'editor');assert.equal(observedFiles().length,before)
 observeSavedFile(scope,'thinking.canvas.json',{content:c,digest:'a'},{content:JSON.stringify(v),digest:'b'},'editor');assert.equal(observedFiles().at(-1)!.semantic,false)
 v.nodes[0].body='changed';observeSavedFile(scope,'thinking.canvas.json',{content:c,digest:'a'},{content:JSON.stringify(v),digest:'c'},'editor');assert.equal(observedFiles().at(-1)!.semantic,true)
})
