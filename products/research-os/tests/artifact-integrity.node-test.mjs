// Run actual product TypeScript with Node 22.16+ --experimental-strip-types.
// Network responses below are synthetic protocol fixtures, not real renderers.
import test, {afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {artifactView, inspectArtifactBuild, selectArtifactBuild, verifyArtifactBytes} from '../src/features/artifacts/artifact-record.ts'
import {listArtifactRecords, requestArtifactBuild, writeWorkspaceFile, saveArtifactSources, definitionForSavedDraft} from '../src/features/artifacts/artifact-api.ts'
import {definitionFromDraft, uniquePinnedInputs} from '../src/features/artifacts/artifact-model.ts'
import {newDraft} from '../src/features/projects/draft-model.ts'

const h = 'a'.repeat(64), other = 'b'.repeat(64), schema = 'xgc.research.manuscript/v2'
const scope = {projectId:'project',workspace:'workspace',artifactId:'deck',entryPoint:'artifacts/deck.artifact.json'}
const sourcePath = 'artifacts/deck.md', office = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const digest = value => createHash('sha256').update(value).digest('hex')
const reply = data => Response.json({data})
const originalFetch = globalThis.fetch
afterEach(() => {globalThis.fetch = originalFetch})
function record(id = 'ok', at = '2026-09-20T01:00:00Z', status = 'succeeded') {
  return {task:{schemaVersion:schema,taskId:id,workspaceRef:scope.workspace,manuscriptId:scope.artifactId,entryPoint:scope.entryPoint,sourceDigest:h,requestedAt:at,requestedBy:'synthetic-test',toolchain:{engine:'research-artifact/pptx',engineVersion:'xgc.research.artifact/v1',pinKind:'local-runtime-fingerprint',imageRef:'local:test',imageDigest:h},inputs:[{path:scope.entryPoint,digest:h},{path:sourcePath,digest:h}]},manifest:{schemaVersion:schema,buildId:id,taskId:id,status,startedAt:at,completedAt:'2026-09-20T03:00:00Z',logArtifactRef:`cas://sha256/${h}`,outputs:[{digest:h,artifactRef:`cas://sha256/${h}`,mediaType:office,sizeBytes:4},{digest:other,artifactRef:`cas://sha256/${other}`,mediaType:'image/png',sizeBytes:8}],diagnostics:status==='succeeded'?[]:[{severity:'error',message:'renderer failed'}]}}
}
function draft() {return newDraft('slides','Synthetic deck','2026-09-20T00:00:00Z','deck')}
const options = {rights:'Synthetic test only, not publication approval',attribution:'Fixture'}

test('only complete current v2 receipts become artifact views; no manifest/Git compatibility', () => {
  assert.equal(inspectArtifactBuild(record(),scope).record.task.workspaceRef,'workspace')
  const legacy=record();legacy.task.schemaVersion='xgc.research.manuscript/v1'
  const git=record();git.task.gitCommit='old'
  const empty=record();empty.manifest.outputs=[]
  const thumbnail=record();thumbnail.manifest.outputs=thumbnail.manifest.outputs.slice(1)
  const wrongTask=record();wrongTask.manifest.taskId='other'
  const unpinned=record();delete unpinned.task.toolchain.imageDigest
  for(const bad of [record().manifest,legacy,git,empty,thumbnail,wrongTask,unpinned]) assert.throws(()=>inspectArtifactBuild(bad,scope))
})
test('history filters exact workspace, artifact ID and entry; request order wins over late completion', () => {
  const early=record('early');early.manifest.completedAt='2026-09-20T04:00:00Z'
  const late=record('late','2026-09-20T02:00:00Z','failed')
  const foreign=record('foreign');foreign.task.manuscriptId='not-deck'
  const wrongWorkspace=record('ws');wrongWorkspace.task.workspaceRef='foreign'
  const wrongEntry=record('path');wrongEntry.task.entryPoint='other.artifact.json'
  const view=artifactView([early,foreign,late,wrongWorkspace,wrongEntry],scope)
  assert.equal(view.latest.buildId,'late');assert.equal(view.phase,'failed');assert.equal(view.laterFailure,true)
  assert.equal(view.builds.length,2);assert.equal(selectArtifactBuild(view,'').buildId,'early')
  assert.equal(selectArtifactBuild(view,'late').buildId,'late');assert.equal(selectArtifactBuild(view,'missing'),undefined)
  assert.equal(view.scientific,'not-claimed')
})
test('duplicates and malformed own records are visible errors, never successful fabricated history', () => {
  assert.equal(artifactView([record(),record()],scope).builds.length,0)
  assert.match(artifactView([record(),record()],scope).rejected[0],/Duplicate/)
  const bad=record();bad.manifest.outputs[0].artifactRef=`cas://sha256/${other}`
  const view=artifactView([bad],scope);assert.equal(view.phase,'definition');assert.equal(view.rejected.length,1)
  const cancelled=record('cancelled','2026-09-20T01:00:00Z','cancelled')
  assert.equal(artifactView([cancelled],scope).phase,'cancelled')
  assert.equal(selectArtifactBuild(artifactView([cancelled],scope),'').files.length,2)
})
test('ledger query uses artifact identity, not workspace identity', async () => {
  const urls=[];globalThis.fetch=async url=>{urls.push(String(url));return reply([])}
  await listArtifactRecords({...scope,artifactId:'deck + 1'})
  assert.deepEqual(urls,['/api/v1/manuscripts/build-records?manuscriptId=deck%20%2B%201'])
})
test('explicit generate sends only saved-source intent and verifies complete returned inputs', async () => {
  const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),...init});return reply(record())}
  const build=await requestArtifactBuild(scope,[{path:scope.entryPoint,digest:`sha256:${h}`}])
  assert.equal(build.buildId,'ok');assert.equal(calls.length,1)
  const body=JSON.parse(calls[0].body)
  assert.deepEqual(body,{workspaceRef:'workspace',entryPoint:scope.entryPoint,manuscriptId:'deck',expectedInputs:[{path:scope.entryPoint,digest:h}]})
  assert.match(calls[0].headers['Idempotency-Key'],/^artifact-render:/)
  assert.equal(calls.some(call=>/git/.test(call.url)),false)
  globalThis.fetch=async()=>reply(record().manifest)
  await assert.rejects(requestArtifactBuild(scope,[]),/complete task and manifest/)
  globalThis.fetch=async()=>reply(record())
  await assert.rejects(requestArtifactBuild(scope,[{path:scope.entryPoint,digest:other}]),/differs from the observed saved bytes/)
})
test('HTTP failures preserve actual error and never trigger an automatic retry or old endpoint', async () => {
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:{message:'source changed'}},{status:409})}
  await assert.rejects(requestArtifactBuild(scope,[]),error=>error.status===409&&/source changed/.test(error.message))
  assert.equal(calls,1)
})
test('actual matching bytes are required, independent of a success label or extension', async () => {
  const bytes=Buffer.from('fixture bytes'), file={buildId:'actual',kind:'video',extension:'mp4',digest:digest(bytes),sizeBytes:bytes.length,mediaType:'video/mp4',url:'/not-used'}
  assert.equal((await verifyArtifactBytes(file,new Response(bytes))).size,bytes.length)
  for(const response of [new Response('changed bytes'),new Response(bytes.subarray(1)),new Response(bytes,{status:206}),new Response('missing',{status:404}),new Response(bytes,{headers:{'content-length':'999'}})]) await assert.rejects(verifyArtifactBytes(file,response))
  await assert.rejects(verifyArtifactBytes({...file,digest:other},new Response(bytes)),/SHA-256/)
  await assert.rejects(verifyArtifactBytes(file,new Response(bytes),3),/limit/)
})
test('oversized streams are cancelled before allocating a full file', async () => {
  let cancelled=false
  const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(5))},cancel(){cancelled=true}})
  const file={buildId:'actual',kind:'file',extension:'pptx',digest:h,sizeBytes:4,mediaType:office,url:'/not-used'}
  await assert.rejects(verifyArtifactBytes(file,new Response(stream)),/larger/)
  assert.equal(cancelled,true)
})
test('CAS writes use the previously observed version and do not first GET the newest version', async () => {
  const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),...init});return reply({digest:digest(JSON.parse(init.body).content)})}
  await writeWorkspaceFile('workspace',sourcePath,'new',`sha256:${h}`)
  assert.equal(calls.length,1);assert.equal(calls[0].method,'PUT')
  assert.deepEqual(JSON.parse(calls[0].body),{content:'new',expectedDigest:`sha256:${h}`})
})
test('multi-file save admits partial success, stops before build and never retries a conflict', async () => {
  const calls=[];globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),...init})
    return calls.length===1?reply({digest:digest(JSON.parse(init.body).content)}):Response.json({error:{message:'definition changed'}},{status:409})
  }
  const definition=definitionFromDraft(draft(),options)
  await assert.rejects(saveArtifactSources('workspace',scope.entryPoint,sourcePath,definition,{definition:{content:'old',digest:h},source:{content:'old',digest:h}},'derived'),/Source saved.*definition changed.*no build has been submitted/)
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.method==='PUT'))
})
test('successful save returns receipts for actual source and definition bytes; external source is never overwritten', async () => {
  const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),...init});return reply({digest:digest(JSON.parse(init.body).content)})}
  const definition=definitionFromDraft(draft(),options)
  const saved=await saveArtifactSources('workspace',scope.entryPoint,sourcePath,definition,{definition:null,source:null},'derived')
  assert.equal(saved.inputs.length,2);assert.ok(calls.every(call=>JSON.parse(call.body).createOnly===true))
  assert.equal(saved.observed.source.content,'derived')
  await assert.rejects(saveArtifactSources('workspace',scope.entryPoint,sourcePath,{...definition,source:'original.md'},{definition:null,source:null},'bad'),/authoritative source/)
  assert.equal(calls.length,2)
  globalThis.fetch=async()=>reply({digest:h})
  await assert.rejects(writeWorkspaceFile('workspace',sourcePath,'actual',undefined),/matching byte receipt/)
})
test('derived definition is bound to the exact saved original design, not a boolean saved label', async () => {
  const original=draft(),book={version:1,projectId:'project',workspace:'workspace',drafts:[original]}
  const content=JSON.stringify(book), bookDigest=digest(content),calls=[]
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),...init});return reply({content,digest:`sha256:${bookDigest}`})}
  const definition=await definitionForSavedDraft(scope,original,options)
  assert.ok(definition.dependencies.some(item=>item.kind==='design'&&item.objectId==='deck'&&item.path==='research-drafts.json'&&item.digest===bookDigest))
  await assert.rejects(definitionForSavedDraft(scope,{...original,title:'unsaved change'},options),/saved design differs/)
  assert.ok(calls.every(call=>!call.method||call.method==='GET'))
})
test('foreign project/source and malformed save receipts cannot become local evidence', async () => {
  const original=draft();original.sources=[{id:'foreign',workspace:'foreign',path:'evidence.md',digest:h}]
  assert.throws(()=>definitionFromDraft(original,{...options,workspace:'workspace'}),/same workspace/)
  assert.throws(()=>uniquePinnedInputs([{path:'../unsafe',digest:h}]))
  assert.throws(()=>uniquePinnedInputs([{path:'safe.md',digest:'bad'}]))
  assert.throws(()=>uniquePinnedInputs([{path:'safe.md',digest:h},{path:'safe.md',digest:other}]))
  globalThis.fetch=async()=>{const content=JSON.stringify({version:1,projectId:'foreign',workspace:'workspace',drafts:[draft()]});return reply({content,digest:digest(content)})}
  await assert.rejects(definitionForSavedDraft(scope,draft(),options),/another project/)
})
test('UI composes verified files and single-reader port instead of an iframe or bare manifest preview', async () => {
  const text=await readFile(new URL('../src/features/artifacts/ArtifactStudio.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(text,/<iframe\b|view\.preview|isNonLatexArtifact/)
  assert.match(text,/verifyArtifactBytes/);assert.match(text,/definitionForSavedDraft/)
  assert.match(text,/onOpenPDF/);assert.match(text,/key=\{JSON\.stringify\(\[props\.scope\.projectId/)
})

test('result editor uses observed CAS and invalidates edited/scope-stale inspections', async () => {
  const text=await readFile(new URL('../src/features/experiments/ExperimentResults.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(text,/writeWorkspaceFileCas/)
  assert.match(text,/observed\.plan\?\.digest/);assert.match(text,/observed\.bundle\?\.digest/)
  assert.match(text,/key=\{JSON\.stringify\(\[props\.scope\.projectId/)
  assert.match(text,/setPlanText\(event\.target\.value\); invalidate\(\)/)
  assert.match(text,/setBundleText\(event\.target\.value\); setBundle\(null\); invalidate\(\)/)
  assert.match(text,/if \(!controller\.signal\.aborted\) setInspection/)
})
