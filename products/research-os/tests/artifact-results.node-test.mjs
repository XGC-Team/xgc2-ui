// Uses the product's real TypeScript models; Node 22.16+ strip-types, no fake React or Vitest runtime.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {ARTIFACT_SCHEMA, parseArtifactDefinition, validateSavedArtifact, projectArtifactBuilds, selectArtifactBuild, verifyArtifactBytes, bytesDigest} from '../src/features/artifacts/artifact-model.ts'
import {RESULT_SCHEMA, projectResultInspection} from '../src/features/experiments/result-model.ts'

const h = 'a'.repeat(64), other = 'b'.repeat(64)
const scope = {projectId:'project',workspace:'workspace',artifactId:'slides',entryPoint:'slides.artifact.json',inputDigests:{'slides.artifact.json':h,'source.md':h}}
const definition = {schemaVersion:ARTIFACT_SCHEMA,artifactId:'slides',kind:'pptx',title:'Synthetic fixture',source:'source.md',rights:'Synthetic test only',attribution:'Fixture author',dependencies:[{kind:'evidence',objectId:'evidence',path:'source.md',digest:h}]}
function build(id = 'build-1', at = '2026-09-20T00:00:00Z', status = 'succeeded') {
  return {task:{schemaVersion:'xgc.research.manuscript/v1',taskId:id,manuscriptId:'slides',workspaceRef:'workspace',entryPoint:scope.entryPoint,requestedAt:at,requestedBy:'fixture',toolchain:{imageRef:'local:research-artifact/pptx',imageDigest:h,engine:'research-artifact/pptx',engineVersion:ARTIFACT_SCHEMA,pinKind:'local-runtime-fingerprint'},inputs:Object.entries(scope.inputDigests).map(([path,digest])=>({path,digest}))},manifest:{schemaVersion:'xgc.research.manuscript/v1',buildId:id,taskId:id,status,logArtifactRef:`sha256:${h}`,startedAt:at,completedAt:'2026-09-20T02:00:00Z',outputs:[{artifactRef:`sha256:${h}`,digest:h,mediaType:'application/pdf',sizeBytes:100}],diagnostics:status==='failed'?[{severity:'error',message:'preview failed'}]:[]}}
}
test('definitions reject unknown/legacy settings and require same-source saved provenance', () => {
  assert.equal(parseArtifactDefinition(JSON.stringify(definition),'slides').kind,'pptx')
  validateSavedArtifact(definition,scope)
  for (const changed of [{...definition,legacyFormat:'ppt'}, {...definition,schemaVersion:'future'}, {...definition,source:'../other'}, {...definition,rights:''}, {...definition,kind:'video',secondsPerSlide:NaN}, {...definition,composition:'unexpected'}]) assert.throws(()=>parseArtifactDefinition(JSON.stringify(changed),'slides'))
  assert.throws(()=>validateSavedArtifact({...definition,dependencies:[{...definition.dependencies[0],digest:other}]},scope))
  assert.throws(()=>validateSavedArtifact({...definition,source:'not-saved.md'},scope))
})
test('only an exact scoped record becomes a view; incomplete success is not generation', () => {
  const wrong = build(); wrong.task.workspaceRef='other'
  const fake = build('fake'); fake.manifest.outputs=[]
  const result = projectArtifactBuilds([build(),wrong,fake],scope)
  assert.equal(result.builds.length,1); assert.equal(result.rejected.length,1)
  assert.equal(result.builds[0].currentInputs,true)
  assert.equal(result.builds[0].inputDigests['source.md'],h)
  assert.equal(result.builds[0].toolchain.imageDigest,h)
  assert.equal('previewReady' in result.builds[0],false)
  assert.equal(result.builds[0].files[0].url,`/api/v1/manuscripts/build-records/build-1/artifacts/${h}`)
})
test('new saved source cannot borrow an old successful build; failed latest retains old output', () => {
  const old=build('old'), latest=build('new','2026-09-20T01:00:00Z','failed')
  latest.task.inputs[1].digest=other
  const current={...scope,inputDigests:{...scope.inputDigests,'source.md':other}}
  const result=projectArtifactBuilds([latest,old],current)
  assert.equal(result.builds[0].status,'failed')
  assert.equal(result.builds.find(x=>x.buildId==='old').currentInputs,false)
  assert.equal(selectArtifactBuild(result.builds,'').buildId,'old')
  assert.deepEqual(result.builds[0].diagnostics,['preview failed'])
})
test('request order beats late completion and explicit history/missing selection is preserved', () => {
  const first=build('first'), second=build('second','2026-09-20T01:00:00Z')
  first.manifest.completedAt='2026-09-20T04:00:00Z'
  const result=projectArtifactBuilds([first,second],scope)
  assert.equal(result.builds[0].buildId,'second')
  assert.equal(selectArtifactBuild(result.builds,'first').buildId,'first')
  assert.equal(selectArtifactBuild(result.builds,'missing'),null)
  assert.equal(projectArtifactBuilds([first,first],scope).builds.length,0)
})
test('a preview needs actual exact bytes, not a status or file extension', async () => {
  const bytes=new TextEncoder().encode('synthetic exact bytes'), digest=await bytesDigest(bytes)
  const file={buildId:'actual',digest,sizeBytes:bytes.length,mediaType:'video/mp4',url:'/not-used'}
  const blob=await verifyArtifactBytes(file,new Response(bytes))
  assert.equal(blob.size,bytes.length)
  await assert.rejects(verifyArtifactBytes(file,new Response('changed')))
  await assert.rejects(verifyArtifactBytes(file,new Response(bytes,{status:404})))
  await assert.rejects(verifyArtifactBytes({...file,digest:other},new Response(bytes)))
  await assert.rejects(verifyArtifactBytes({...file,sizeBytes:1},new Response(bytes)))
})
async function fixture() {
  const time='2026-09-20T00:00:00Z', roles=['run-receipt','record-manifest','parameters','code','environment','raw','processing']
  const session={schemaVersion:'xgc.research.experiment-ref/v1',contractSchemaVersion:2,contractDigest:h,sessionId:'session',openingRunId:'opening',experiment:{stationId:'station',targetId:'target',experimentResourceId:'experiment',experimentCommitId:'commit',experimentDigest:h},robotSelectionDigest:h,runMode:'simulation',sessionRevision:1,capturedAt:time}
  const sources=roles.map(role=>({roles:[role],artifact:{artifactId:role,sessionId:'session',sessionMemberId:`member-${role}`,targetId:'target',runId:'run',attemptId:'attempt',name:role,mediaType:'application/octet-stream',uri:`cas://sha256/${h}`,sizeBytes:1,digest:h},member:{memberId:`member-${role}`,sessionId:'session',bindingId:'binding',ownerId:'owner',artifactPath:`record/${role}`,memberRevision:1}}))
  const bundle={schemaVersion:RESULT_SCHEMA,projectId:'project',workspaceRef:'workspace',verification:{recordId:'verification',planId:'plan',planRevision:1,planDigest:h,session,createdAt:time},runId:'run',attemptId:'attempt',recording:{recordingId:'record',sessionId:'session',manifestDigest:h,artifact:sources[5].artifact},sources,uses:[{kind:'body',objectId:'paragraph',workspaceRef:'workspace',digest:h,evidenceArtifactIds:['raw']}]}
  const text=JSON.stringify(bundle)
  const report={schemaVersion:RESULT_SCHEMA,bundleDigest:await bytesDigest(new TextEncoder().encode(text)),session,items:sources.map(source=>({source,status:'verified'})),missingRoles:[],referencesVerified:true,checkedAt:time}
  return {bundle,text,report}
}
test('result view binds the exact canonical bytes and original Record, without a Start action', async () => {
  const {text,report}=await fixture(), view=await projectResultInspection(text,report,scope)
  assert.equal(view.recordId,'record'); assert.equal(view.referencesVerified,true); assert.equal(view.evidence.length,7)
  assert.equal(view.experimentCommitId,'commit'); assert.equal(view.uses[0].objectId,'paragraph')
  assert.equal('scientificStatus' in view,false)
  const component=await readFile(new URL('../src/features/experiments/ExperimentResultPanel.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(component,/\bfetch\s*\(|\bpost\s*\(|\buseWorkbench\b|\.Start\s*\(/)
})
test('result rejects cross-project, stale bundle bytes and altered owner membership', async () => {
  const {text,report}=await fixture()
  await assert.rejects(projectResultInspection(text,report,{...scope,projectId:'foreign'}))
  await assert.rejects(projectResultInspection(text+'\n',report,scope))
  const changed=structuredClone(report); changed.items[0].source.member.ownerId='other'
  await assert.rejects(projectResultInspection(text,changed,scope))
  const drift=structuredClone(report); drift.session.contractDigest=other
  await assert.rejects(projectResultInspection(text,drift,scope))
})
test('partial/missing/corrupt evidence is preserved and cannot become a complete receipt', async () => {
  const {text,report}=await fixture()
  report.referencesVerified=false; report.items[5].status='mismatch'; report.items[5].reason='corrupt raw'
  report.items.pop(); report.missingRoles=['raw','processing']; report.recordingProblem='raw unverified'
  const view=await projectResultInspection(text,report,scope)
  assert.equal(view.evidence.length,7); assert.equal(view.evidence.filter(item=>item.status==='verified').length,5)
  assert.equal(view.referencesVerified,false); assert.deepEqual(view.missingRoles,['raw','processing'])
  report.referencesVerified=true
  await assert.rejects(projectResultInspection(text,report,scope))
})

test('Go-produced canonical bundle and inspection project without DTO aliases', {skip: !process.env.RESEARCH_RESULT_WIRE_EVIDENCE}, async () => {
  const fixture=JSON.parse(await readFile(process.env.RESEARCH_RESULT_WIRE_EVIDENCE,'utf8'))
  const view=await projectResultInspection(fixture.canonicalBundle,fixture.inspection,scope)
  assert.equal(view.recordId,'record')
  assert.equal(view.runId,'record-run')
  assert.equal(view.evidence.length,7)
  assert.equal(view.referencesVerified,true)
  assert.deepEqual(view.uses.map(use=>use.kind),['design','body','artifact'])
})
