import test from 'node:test'
import assert from 'node:assert/strict'
import { createReviewEngine, type ReviewPort } from '../src/features/review/review-engine.ts'
import { dependencyClosure, emptyReviewBook, fingerprint, operationState, parseReviewBook, REVIEW_PATH, selectedGroups, semanticCanvas, serializeReviewBook, validateAnchor, validateProposal, type Anchor, type FileRecord, type Operation, type Proposal, type Scope } from '../src/features/review/review-model.ts'
import { impactedDrafts, patchTarget, targetChoices, targetValue } from '../src/features/review/review-targets.ts'
import { acquireReviewWrite, assertEditorClean, isReviewLocked, registerReviewEditor, subscribeWrites } from '../src/features/review/write-coordinator.ts'
import { buildSourceMatch, previewProvenance, type BuildRecord } from '../src/features/review/build-provenance.ts'
import { emptyDraftBook, newDraft, serializeDraftBook } from '../src/features/projects/draft-model.ts'

const scope: Scope = {projectId: 'project-test', workspace: 'paper-test'}
const at = '2026-09-16T04:00:00Z'
const anchor: Anchor = {kind:'text',workspace:scope.workspace,path:'main.tex',digest:'s1',quote:'strong'}
const source = 'A strong conclusion.\nUnrelated content.'
const canvas = JSON.stringify({version:2, nodes:[{id:'claim',kind:'idea',title:'Claim',body:'all cases',x:10,y:20,extension:{keep:true}}],edges:[],outlines:[{artifact:'canvas',items:[]}],extension:{keep:true}})
const drafts = emptyDraftBook(scope)
for (const [kind, id] of [['paper','paper'],['slides','slides'],['storyboard','video']] as const) {
  const d = newDraft(kind, kind, at, id); d.blocks[0].id='block'; d.blocks[0].title='Title'; drafts.drafts.push(d)
}
const blockContent = serializeDraftBook(drafts)
const textOp = (id='op', path='main.tex'): Operation => ({id,target:{kind:'text',workspace:scope.workspace,path,start:2,end:8},baseDigest:'s1',before:'strong',after:'qualified',reason:'Only holds under specified assumptions.',evidence:[anchor],dependsOn:[],impacts:[]})
const canvasOp = (id='canvas'): Operation => ({...textOp(id),target:{kind:'canvas',workspace:scope.workspace,path:'thinking.canvas.json',objectId:'claim',field:'body'},baseDigest:'c1',before:'all cases',after:'conditions apply'})
const blockOp = (kind='paper', field='title'): Operation => ({...textOp(`block-${kind}`),target:{kind:'block',workspace:scope.workspace,path:'research-drafts.json',objectId:kind,blockId:'block',field,artifact:kind==='video'?'storyboard':kind},baseDigest:'b1',before:field==='title'?'Title':'',after:field==='duration'?'3.5':'Scoped claim'})
const proposal = (ops: Operation[]=[textOp()]): Proposal => ({id:'proposal',title:'Limit claim scope',author:'human-reviewer',at,feedback:{id:'feedback',author:'human-reviewer',at,body:'Evidence is conditional.',anchor},operations:ops})
function http(status: number) { return Object.assign(new Error(`HTTP ${status}`),{status}) }
function fixture(hook?: (path: string, content: string, writes: {path:string;content:string}[], commit:()=>{digest:string})=>Promise<{digest:string}>|{digest:string}) {
  const files = new Map<string,FileRecord>([['main.tex',{content:source,digest:'s1'}],['other.tex',{content:source,digest:'s1'}],['thinking.canvas.json',{content:canvas,digest:'c1'}],['research-drafts.json',{content:blockContent,digest:'b1'}]])
  const writes: {path:string;content:string}[] = [];let serial=1
  const port: ReviewPort = {
    read: async(workspace,path)=>{assert.equal(workspace,scope.workspace);const f=files.get(path);if(!f)throw http(404);return {...f}},
    write: async(workspace,path,content,guard)=>{
      assert.equal(workspace,scope.workspace); const existing=files.get(path)
      if(guard.createOnly&&existing)throw http(409)
      if(guard.expectedDigest&&existing?.digest!==guard.expectedDigest)throw http(409)
      const commit=()=>{const digest=`saved-${++serial}`;files.set(path,{content,digest});writes.push({path,content});return{digest}}
      return hook?hook(path,content,writes,commit):commit()
    },
    lease:()=>async()=>{},
  }
  const engine=createReviewEngine(scope,port,()=>{})
  return {files,writes,port,engine,targetWrites:()=>writes.filter(w=>w.path!==REVIEW_PATH)}
}
async function prepared(ops?: Operation[], hook?: Parameters<typeof fixture>[0]) { const f=fixture(hook);await f.engine.load();await f.engine.add(proposal(ops));return f }

// These execute production models and transport contracts, not a rendered React app or the real backend.
test('empty journal load is not a write',async()=>{const f=fixture();await f.engine.load();assert.equal(f.writes.length,0);assert.equal(f.engine.snapshot().book?.version,1)})
test('saving proposal does not modify target files',async()=>{const f=await prepared();assert.equal(f.targetWrites().length,0);assert.equal(f.engine.snapshot().book?.proposals.length,1)})
test('single source apply records write-ahead intent then real target acknowledgement',async()=>{
 const f=await prepared();await f.engine.run('proposal',['op'],'operator','apply')
 assert.deepEqual(f.writes.map(w=>w.path),[REVIEW_PATH,REVIEW_PATH,'main.tex',REVIEW_PATH])
 assert.equal(JSON.parse(f.writes[1].content).attempts[0].outcome,'pending')
 assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'applied')
 assert.equal(f.files.get('main.tex')!.content,source.replace('strong','qualified'))
})
test('source reverse uses exact saved post-version',async()=>{const f=await prepared();await f.engine.run('proposal',['op'],'operator','apply');await f.engine.run('proposal',['op'],'operator','revert');assert.equal(f.files.get('main.tex')!.content,source);assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'reverted')})
test('source reverse never erases subsequent edits',async()=>{
 const f=await prepared();await f.engine.run('proposal',['op'],'operator','apply');f.files.set('main.tex',{content:'later user edits',digest:'later'})
 await assert.rejects(f.engine.run('proposal',['op'],'operator','revert'),/Source changed/)
 assert.equal(f.files.get('main.tex')!.content,'later user edits');assert.equal(f.targetWrites().length,1)
})
test('stale proposal is durably recorded as not dispatched',async()=>{
 const f=await prepared();f.files.set('main.tex',{content:'human change',digest:'s2'})
 await assert.rejects(f.engine.run('proposal',['op'],'operator','apply'),/Baseline conflict/)
 assert.equal(f.targetWrites().length,0);assert.equal(f.engine.snapshot().book?.notDispatched?.length,1)
})
test('successful application cannot be double-clicked or replayed',async()=>{
 const f=await prepared();const first=f.engine.run('proposal',['op'],'operator','apply')
 await assert.rejects(f.engine.run('proposal',['op'],'operator','apply'),/already running/);await first
 await assert.rejects(f.engine.run('proposal',['op'],'operator','apply'),/already decided/);assert.equal(f.targetWrites().length,1)
})
test('same-file independent fields combine into one conditional write',async()=>{
 const b={...canvasOp('title'),target:{...canvasOp().target,field:'title' as const},before:'Claim',after:'Qualified claim'} as Operation
 const f=await prepared([canvasOp(),b]);await f.engine.run('proposal',['canvas','title'],'operator','apply')
 assert.equal(f.targetWrites().length,1);const c=JSON.parse(f.files.get('thinking.canvas.json')!.content)
 assert.equal(c.nodes[0].title,'Qualified claim');assert.equal(c.nodes[0].body,'conditions apply');assert.deepEqual(c.extension,{keep:true})
})
test('canvas field reverse preserves unrelated later layout and other fields',async()=>{
 const f=await prepared([canvasOp()]);await f.engine.run('proposal',['canvas'],'operator','apply')
 const c=JSON.parse(f.files.get('thinking.canvas.json')!.content);c.nodes[0].x=600;c.nodes[0].title='Later title';f.files.set('thinking.canvas.json',{content:JSON.stringify(c),digest:'later'})
 await f.engine.run('proposal',['canvas'],'operator','revert');const actual=JSON.parse(f.files.get('thinking.canvas.json')!.content)
 assert.equal(actual.nodes[0].x,600);assert.equal(actual.nodes[0].title,'Later title');assert.equal(actual.nodes[0].body,'all cases')
})
test('canvas field reverse refuses a later edit of the same field',async()=>{
 const f=await prepared([canvasOp()]);await f.engine.run('proposal',['canvas'],'operator','apply')
 const c=JSON.parse(f.files.get('thinking.canvas.json')!.content);c.nodes[0].body='new reasoning';f.files.set('thinking.canvas.json',{content:JSON.stringify(c),digest:'later'})
 await assert.rejects(f.engine.run('proposal',['canvas'],'operator','revert'),/field changed/);assert.equal(f.targetWrites().length,1)
})
for(const kind of ['paper','slides','video']) test(`${kind} field adapter keeps identity, other artifacts and supports guarded recovery`,async()=>{
 const f=await prepared([blockOp(kind)]);await f.engine.run('proposal',[`block-${kind}`],'operator','apply')
 const b=JSON.parse(f.files.get('research-drafts.json')!.content);assert.equal(b.drafts.find((d:{id:string})=>d.id===kind).blocks[0].title,'Scoped claim')
 const untouched=b.drafts.filter((d:{id:string})=>d.id!==kind);assert.ok(untouched.every((d:{blocks:{title:string}[]})=>d.blocks[0].title==='Title'))
 b.drafts.find((d:{id:string})=>d.id!==kind).title='Later unrelated object';f.files.set('research-drafts.json',{content:JSON.stringify(b),digest:'later'})
 await f.engine.run('proposal',[`block-${kind}`],'operator','revert')
 assert.ok(f.files.get('research-drafts.json')!.content.includes('Later unrelated object'))
})
test('storyboard duration has its own numeric validation',()=>{assert.throws(()=>patchTarget(blockContent,[{...blockOp('video','duration'),after:'a paragraph'}],scope),/duration/);assert.ok(patchTarget(blockContent,[blockOp('video','duration')],scope).includes('3.5'))})
test('paper fields cannot be applied as storyboard fields',()=>{const o=blockOp('video','argument');assert.throws(()=>patchTarget(blockContent,[o],scope),/Field does not belong/);o.target={...o.target,artifact:'paper'} as typeof o.target;assert.throws(()=>patchTarget(blockContent,[o],scope),/Artifact changed/)})
test('preview creates no writes and rejects overlapping source ranges',()=>{const p=proposal([textOp('a'),textOp('b')]);assert.throws(()=>patchTarget(source,p.operations,scope),/Overlapping/);assert.equal(fixture().writes.length,0)})
test('deleting source text is recoverable only on its exact post-version',async()=>{const f=await prepared([{...textOp(),after:''}]);await f.engine.run('proposal',['op'],'a','apply');await f.engine.run('proposal',['op'],'a','revert');assert.equal(f.files.get('main.tex')!.content,source)})
test('multiple source ranges reverse in correct shifted coordinates',async()=>{
 const other={...textOp('other'),target:{kind:'text' as const,workspace:scope.workspace,path:'main.tex',start:21,end:30},before:'Unrelated',after:'Independent'}
 const f=await prepared([textOp(),other]);await f.engine.run('proposal',['op','other'],'a','apply');await f.engine.run('proposal',['op','other'],'a','revert');assert.equal(f.files.get('main.tex')!.content,source)
})
test('dependency closure selects both directions and prevents partial invalid groups',()=>{
 const b={...textOp('b'),dependsOn:['op']},p=proposal([textOp(),b]);assert.deepEqual(new Set(dependencyClosure(p,['op'])),new Set(['op','b']));assert.throws(()=>selectedGroups(p,['b']),/whole dependency/)
})
test('cycles, missing dependencies and duplicate ids are rejected before writing',()=>{
 assert.throws(()=>validateProposal(proposal([{...textOp(),dependsOn:['op']}]),scope),/dependency/)
 assert.throws(()=>validateProposal(proposal([{...textOp(),dependsOn:['missing']}]),scope),/dependency/)
 assert.throws(()=>validateProposal(proposal([{...textOp('a'),dependsOn:['b']},{...textOp('b'),dependsOn:['a']}]),scope),/Cyclic/)
 assert.throws(()=>validateProposal(proposal([textOp(),textOp()]),scope),/Duplicate/)
})
test('cross-file dependent operations remain preview-only with zero target writes',async()=>{const f=await prepared([textOp(),{...canvasOp(),dependsOn:['op']}]);await assert.rejects(f.engine.run('proposal',['op','canvas'],'operator','apply'),/preview-only/);assert.equal(f.targetWrites().length,0)})
test('dependent group can be rejected without writing either target',async()=>{const f=await prepared([textOp(),{...canvasOp(),dependsOn:['op']}]);await assert.rejects(f.engine.reject('proposal',['op'],'a','reason'),/complete/);await f.engine.reject('proposal',['op','canvas'],'a','Both are unsound');assert.equal(f.targetWrites().length,0);assert.equal(operationState(f.engine.snapshot().book!,'proposal','canvas'),'rejected')})
test('refused second file preserves first successful write and detailed partial outcome',async()=>{
 const f=await prepared([textOp(),canvasOp()],(path,_,__,commit)=>{if(path==='thinking.canvas.json')throw http(403);return commit()})
 await f.engine.run('proposal',['op','canvas'],'operator','apply')
 assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'applied');assert.equal(operationState(f.engine.snapshot().book!,'proposal','canvas'),'not-written')
 assert.equal(f.targetWrites().length,1);assert.equal(f.engine.snapshot().book!.attempts[1].detail,'HTTP 403')
})
test('baseline failure of a second file persists exact untouched scope',async()=>{
 const f=await prepared([textOp(),canvasOp()]);f.files.get('thinking.canvas.json')!.digest='newer'
 await assert.rejects(f.engine.run('proposal',['op','canvas'],'operator','apply'),/thinking.canvas.json/)
 assert.equal(f.targetWrites().length,1);assert.equal(f.engine.snapshot().book!.notDispatched![0].operationIds[0],'canvas')
})
for(const code of [409,412]) test(`server CAS ${code} is a conflict, not success`,async()=>{
 const f=await prepared(undefined,(path,_,__,commit)=>{if(path==='main.tex')throw http(code);return commit()});await f.engine.run('proposal',['op'],'a','apply')
 assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'conflict');assert.equal(f.targetWrites().length,0)
 await f.engine.reject('proposal',['op'],'a','Reject stale proposal');assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'rejected')
})
test('target committed but response lost is uncertain, not retried',async()=>{
 const f=await prepared(undefined,(path,_,__,commit)=>{const r=commit();if(path==='main.tex')throw new Error('response lost');return r})
 await f.engine.run('proposal',['op'],'a','apply');assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'uncertain')
 await assert.rejects(f.engine.run('proposal',['op'],'a','apply'),/uncertain/);const observed=await f.engine.inspect(f.engine.snapshot().book!.attempts[0].id);assert.equal(observed.match,'after')
 await f.engine.confirmObservation(f.engine.snapshot().book!.attempts[0].id,observed.digest,'human');assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'applied');assert.equal(f.targetWrites().length,1)
})
test('unknown second outcome stops later independent writes',async()=>{
 const f=await prepared([textOp(),canvasOp(),textOp('last','other.tex')],(path,_,__,commit)=>{if(path==='thinking.canvas.json')throw http(500);return commit()})
 await f.engine.run('proposal',['op','canvas','last'],'a','apply');assert.equal(f.targetWrites().length,1);assert.equal(operationState(f.engine.snapshot().book!,'proposal','last'),'review')
})
test('journal acknowledgement failure after target success survives reload as unresolved intent',async()=>{
 let fail=true
 const f=await prepared(undefined,(path,content,writes,commit)=>{if(fail&&path===REVIEW_PATH&&writes.some(w=>w.path==='main.tex')){fail=false;throw http(503)}return commit()})
 await assert.rejects(f.engine.run('proposal',['op'],'a','apply'),/Journal not confirmed/)
 assert.equal(f.engine.snapshot().auditUncertain,true);assert.equal(f.engine.snapshot().transient?.outcome,'applied')
 const reloaded=createReviewEngine(scope,f.port,()=>{});await reloaded.load();assert.equal(operationState(reloaded.snapshot().book!,'proposal','op'),'uncertain')
 await assert.rejects(reloaded.run('proposal',['op'],'a','apply'),/uncertain/);assert.equal(f.targetWrites().length,1)
 const id=reloaded.snapshot().book!.attempts[0].id,observation=await reloaded.inspect(id)
 await reloaded.confirmObservation(id,observation.digest,'human');assert.equal(operationState(reloaded.snapshot().book!,'proposal','op'),'applied')
})
test('write-ahead journal failure prevents the target write entirely',async()=>{
 let count=0;const f=await prepared(undefined,(path,_,__,commit)=>{if(path===REVIEW_PATH&&++count===2)throw http(409);return commit()})
 await assert.rejects(f.engine.run('proposal',['op'],'a','apply'),/Journal/);assert.equal(f.targetWrites().length,0)
})
test('missing target revision in response is uncertain even with content written',async()=>{
 const f=await prepared(undefined,(path,_,__,commit)=>{const r=commit();return path==='main.tex'?{digest:''}:r})
 await f.engine.run('proposal',['op'],'a','apply');assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'uncertain')
})
test('manual confirmation refuses a file changed since inspection',async()=>{
 const f=await prepared(undefined,(path,_,__,commit)=>{if(path==='main.tex')throw http(500);return commit()});await f.engine.run('proposal',['op'],'a','apply')
 const id=f.engine.snapshot().book!.attempts[0].id,seen=await f.engine.inspect(id);f.files.set('main.tex',{content:'later',digest:'later'})
 await assert.rejects(f.engine.confirmObservation(id,seen.digest,'human'),/changed after inspection/)
})
test('mixed content is not automatically recovered or confirmed',async()=>{
 const f=await prepared(undefined,(path,_,__,commit)=>{if(path==='main.tex')throw http(500);return commit()});await f.engine.run('proposal',['op'],'a','apply')
 f.files.set('main.tex',{content:'mixed later edits',digest:'mixed'});const id=f.engine.snapshot().book!.attempts[0].id
 assert.equal((await f.engine.inspect(id)).match,'different');await assert.rejects(f.engine.confirmObservation(id,'mixed','human'),/manual recovery/)
})
test('rejected proposal never writes and is durable across reload',async()=>{const f=await prepared();await f.engine.reject('proposal',['op'],'a','Not supported');await f.engine.load();assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'rejected');await assert.rejects(f.engine.run('proposal',['op'],'a','apply'),/decided/);assert.equal(f.targetWrites().length,0)})
test('foreign workspaces, unsafe paths and malformed anchor versions are refused',()=>{
 for(const path of ['../main.tex','/main.tex','.github/config.md','run.js']) assert.throws(()=>validateProposal(proposal([{...textOp(),target:{...textOp().target,path}}]),scope))
 assert.throws(()=>validateProposal(proposal([{...textOp(),target:{...textOp().target,workspace:'other'}}]),scope),/Cross-workspace/)
 assert.throws(()=>validateAnchor({...anchor,digest:''}),/observed version/)
 assert.throws(()=>validateAnchor({...anchor,kind:'pdf',origin:'project-build',page:0}),/build\/page/)
})
test('future/corrupt/foreign journals do not become empty editable journals',()=>{
 for(const text of ['{bad',JSON.stringify({...emptyReviewBook(scope),version:2}),JSON.stringify({...emptyReviewBook(scope),projectId:'other'})])assert.throws(()=>parseReviewBook(text,scope))
})
test('unknown journal extension fields survive round trip',()=>{const b={...emptyReviewBook(scope),extra:{keep:true}};assert.deepEqual(JSON.parse(serializeReviewBook(parseReviewBook(JSON.stringify(b),scope))).extra,{keep:true})})
test('knowledge approval records scope and reviewer but never writes global knowledge',async()=>{
 const f=fixture();await f.engine.load();const p={...proposal([]),promotion:{destination:'global-knowledge' as const,scope:'Only this conditional observation',conditions:'Valid for condition X',verification:'unverified',decision:'pending' as const}}
 await f.engine.add(p);await f.engine.decidePromotion(p.id,'approved-scope','reviewer')
 assert.equal(f.targetWrites().length,0);assert.equal(f.engine.snapshot().book!.proposals[0].promotion!.decidedBy,'reviewer')
 await assert.rejects(f.engine.decidePromotion(p.id,'rejected','reviewer'),/already decided/)
})
test('coordinate-only movement is not a semantic impact; body change is',()=>{const c=JSON.parse(canvas);c.nodes[0].x=500;assert.equal(semanticCanvas(canvas),semanticCanvas(JSON.stringify(c)));c.nodes[0].body='changed';assert.notEqual(semanticCanvas(canvas),semanticCanvas(JSON.stringify(c)))})
test('explicit common source marks multiple artifacts as possibly impacted without modifying them',()=>{
 const b=structuredClone(drafts);for(const d of b.drafts)d.sources=[{id:'shared',path:'main.tex',workspace:scope.workspace,digest:'s1'}]
 assert.equal(impactedDrafts(serializeDraftBook(b),scope,textOp().target).length,3);assert.equal(impactedDrafts(blockContent,scope,canvasOp().target).length,0)
})
test('missing or archived block targets never retarget another block',()=>{const b=structuredClone(drafts);b.drafts[0].archivedAt=at;assert.throws(()=>targetValue(serializeDraftBook(b),blockOp().target,scope),/archived/);assert.equal(targetChoices(blockContent,'block',scope).length,13)})
test('damaged canvas is refused instead of repaired during a proposal',()=>{const c=JSON.parse(canvas);c.edges=[{from:'missing',to:'claim'}];assert.throws(()=>patchTarget(JSON.stringify(c),[canvasOp()],scope),/Invalid canvas edge/)})
test('write coordinator blocks dirty editors and serializes concurrent requests',async()=>{
 let dirty=true,reloads=0,notifications=0;const unsub=subscribeWrites(()=>notifications++)
 const unregister=registerReviewEditor('w','p',{blocked:()=>dirty,reload:async()=>{reloads++}})
 assert.throws(()=>acquireReviewWrite('w','p'),/unsaved/);dirty=false;const release=acquireReviewWrite('w','p')
 assert.equal(isReviewLocked('w','p'),true);assert.throws(()=>acquireReviewWrite('w','p'),/unsaved/);await release();await release()
 assert.equal(reloads,1);assert.equal(isReviewLocked('w','p'),false);assert.equal(notifications,2);unregister();unsub()
})
test('editors mounted during a write are refreshed before unlock',async()=>{const release=acquireReviewWrite('w','p');let refreshed=false;const stop=registerReviewEditor('w','p',{blocked:()=>false,reload:async()=>{assert.ok(isReviewLocked('w','p'));refreshed=true}});await release();assert.ok(refreshed);stop();assert.doesNotThrow(()=>assertEditorClean('w','p'))})
const successful:BuildRecord={task:{workspaceRef:scope.workspace,entryPoint:'main.tex',gitCommit:'git-old',inputs:[{path:'main.tex',digest:'abc'}]},manifest:{buildId:'build-old',completedAt:'2026-09-15T01:00:00Z',status:'succeeded',outputs:[{digest:'pdf-old',mediaType:'application/pdf'}]}}
const pdf={workspace:scope.workspace,path:'main.tex',buildId:'build-old',digest:'pdf-old'}
test('failed later build retains old preview identity and true failure receipt',()=>{const failed:BuildRecord={...successful,manifest:{buildId:'build-failed',completedAt:'2026-09-16T01:00:00Z',status:'failed'}};const r=previewProvenance([failed,successful],pdf);assert.ok(r.valid);assert.ok(r.laterFailure);assert.equal(r.selected?.task.gitCommit,'git-old');assert.equal(pdf.buildId,'build-old')})
test('missing input revision means unknown positional mapping, not a guessed match',()=>{assert.equal(buildSourceMatch(successful,scope.workspace,'main.tex','sha256:abc'),'match');assert.equal(buildSourceMatch(successful,scope.workspace,'main.tex','def'),'changed');assert.equal(buildSourceMatch(successful,scope.workspace,'chapter.tex','abc'),'unknown');assert.equal(buildSourceMatch(undefined,scope.workspace,'main.tex','abc'),'unknown')})
test('a PDF with the wrong digest is not a verified successful preview',()=>{assert.equal(previewProvenance([successful],{...pdf,digest:'wrong'}).valid,false)})
test('fingerprints represent exact content, not titles',async()=>{assert.notEqual(await fingerprint('a'),await fingerprint('b'));assert.equal(await fingerprint('a'),await fingerprint('a'))})

test('a failed editor refresh does not relabel a successful target as not dispatched',async()=>{
 const f=await prepared();f.port.lease=()=>async()=>{throw new Error('view refresh failed')}
 await f.engine.run('proposal',['op'],'a','apply')
 assert.equal(operationState(f.engine.snapshot().book!,'proposal','op'),'applied');assert.equal(f.engine.snapshot().book!.notDispatched,undefined)
 assert.match(f.engine.snapshot().error,/refresh failed/)
})
test('an engine closed before target dispatch does not send the target request',async()=>{
 let close:()=>void=()=>{}
 const f=await prepared(undefined,(path,content,_,commit)=>{const r=commit();if(path===REVIEW_PATH&&JSON.parse(content).attempts.some((a:{outcome:string})=>a.outcome==='pending'))close();return r})
 close=()=>f.engine.dispose();await f.engine.run('proposal',['op'],'a','apply');assert.equal(f.targetWrites().length,0)
})
test('failed build inputs cannot authorize a PDF positional mapping',()=>{assert.equal(buildSourceMatch({...successful,manifest:{...successful.manifest,status:'failed'}},scope.workspace,'main.tex','abc'),'unknown')})
