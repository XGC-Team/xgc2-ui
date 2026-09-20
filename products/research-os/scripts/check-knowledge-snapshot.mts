import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { academicGraph } from '../src/features/resources/knowledge-graph-layout.ts'
import { decodeKnowledgeView, emptyKnowledgeView } from '../src/features/resources/knowledge-view-state.ts'
import { assembleKnowledgePages, readCompleteKnowledgeGraph, KnowledgePageCollector, knowledgeQueryIdentity, trimKnowledgeQuery, normalizeKnowledgeInspection, type KnowledgePage } from '../src/features/resources/knowledge-snapshot.ts'

// Existing, unchanged Go-produced oracle from the integrated devops#49/ui#32 pair.
const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/knowledge-projection-v2.json', import.meta.url), 'utf8')) as KnowledgePage[]
const fresh = () => structuredClone(fixture)

test('retains the integrated combined-digest/limit-bound v2 contract', async () => {
  const page = await assembleKnowledgePages(fresh())
  assert.equal(page.complete, true)
  assert.equal(page.nodes.length, 4); assert.equal(page.edges.length, 6)
  assert.equal(page.queryId, await knowledgeQueryIdentity({limit: 2}))
  assert.notEqual(page.queryId, await knowledgeQueryIdentity({limit: 3}))
  assert.equal('queryKey' in page, false)
})

test('complete retrieval uses the existing collector and pins the next snapshot', async () => {
  const pages = fresh(); let calls = 0
  const result = await readCompleteKnowledgeGraph(async query => {
    if(calls){assert.equal(query.snapshot,pages[0].snapshot);assert.equal(query.cursor,pages[0].nextCursor)}
    return pages[calls++]
  }, {limit: 2})
  assert.equal(calls,2); assert.equal(result.edges.length,6)
})

test('retrieval captures the caller query before asynchronous hashing', async () => {
  const pages=fresh(); const query={limit:2,tags:[] as string[]};let calls=0
  const pending=readCompleteKnowledgeGraph(async request=>{assert.equal(request.limit,2);assert.deepEqual(request.tags,[]);return pages[calls++]},query)
  query.limit=3;query.tags.push('changed')
  await pending
})

test('request query mismatch is rejected immediately', async () => {
  let calls=0
  await assert.rejects(()=>readCompleteKnowledgeGraph(async()=>{calls++;return fresh()[0]}, {limit:3}),/different query/)
  assert.equal(calls,1)
})

test('pre-dispatch cancellation performs no read', async()=>{
  const controller=new AbortController();controller.abort()
  await assert.rejects(()=>readCompleteKnowledgeGraph(async()=>{assert.fail('read after abort')},{limit:2},controller.signal),{name:'AbortError'})
})

test('a reader ignoring cancellation cannot publish a late response', async()=>{
  const controller=new AbortController();let calls=0
  await assert.rejects(()=>readCompleteKnowledgeGraph(async()=>{calls++;controller.abort();return fresh()[0]},{limit:2},controller.signal),{name:'AbortError'})
  assert.equal(calls,1)
})

test('cancellation during the final digest rejects a complete-looking result', async()=>{
  const collector=new KnowledgePageCollector();for(const page of fresh())collector.add(page)
  const controller=new AbortController();const pending=collector.finish(controller.signal);controller.abort()
  await assert.rejects(()=>pending,{name:'AbortError'})
})

test('network interruption never publishes partial data', async()=>{
  const pages=fresh();let calls=0;const offline=new Error('offline')
  await assert.rejects(()=>readCompleteKnowledgeGraph(async()=>{if(calls++)throw offline;return pages[0]},{limit:2}),e=>e===offline)
})

test('existing source-revision integrity checks are retained', async()=>{
  const pages=fresh();pages[0].edges[0].sourceRevision=`sha256:${'0'.repeat(64)}`
  await assert.rejects(()=>assembleKnowledgePages(pages),/source revision/)
})

test('a missing assertion is still rejected even when all nodes arrive', async()=>{
  const pages=fresh();pages[0].edges.pop()
  await assert.rejects(()=>assembleKnowledgePages(pages),/incomplete node\/assertion/)
})

test('Go Unicode trimming includes NEL but not BOM', async()=>{
  assert.equal(trimKnowledgeQuery('\u0085title:A\u3000'),'title:A')
  assert.equal(await knowledgeQueryIdentity({query:'\u0085title:A\u3000'}),await knowledgeQueryIdentity({query:'title:A'}))
  assert.notEqual(await knowledgeQueryIdentity({query:'\ufefftitle:A'}),await knowledgeQueryIdentity({query:'title:A'}))
})

test('layout retains every assertion identity and source revision', async()=>{
  const page=await assembleKnowledgePages(fresh());const graph=academicGraph(page)
  assert.deepEqual(graph.edges.map(e=>e.resourceId),page.edges.map(e=>e.id))
  assert.deepEqual(graph.edges.map(e=>e.sourceRevision),page.edges.map(e=>e.sourceRevision))
  for(const node of graph.nodes)assert.equal(node.degree,page.edges.filter(e=>e.source===node.resourceId||e.target===node.resourceId).length)
  assert.equal(graph.edges.filter(e=>e.self).length,1)
})

test('layout kind is not silently replaced by a filename heuristic', async()=>{
  const page=await assembleKnowledgePages(fresh());page.nodes[0].path='memory/lit-test.md'
  assert.equal(academicGraph(page).nodes[0].group,'note')
})

test('view restoration whitelists preferences, not cached graph or permissions',()=>{
  const state={...emptyKnowledgeView(),query:'title:A',focus:'memory/a.md',depth:7,camera:{x:-13,y:22,k:1.5}}
  assert.deepEqual(decodeKnowledgeView(JSON.stringify({...state,nodes:['private'],authorized:true})),state)
  for(const raw of ['{broken',JSON.stringify({...state,version:0}),JSON.stringify({...state,camera:{x:0,y:0,k:-1}})])assert.deepEqual(decodeKnowledgeView(raw),emptyKnowledgeView())
})

test('Inspect normalizes actual empty Go slices without changing the page contract',()=>{
  const first=fresh()[0];const result=normalizeKnowledgeInspection({snapshot:first.snapshot,node:first.nodes[0],outgoing:null,incoming:null},first.nodes[0].id,first.snapshot)
  assert.deepEqual(result.outgoing,[]);assert.deepEqual(result.incoming,[])
  const page=fresh()[0];(page as unknown as {edges:null}).edges=null
  assert.throws(()=>new KnowledgePageCollector().add(page),/arrays/)
})

test('Inspect preserves relations whose other endpoint is outside the visible graph',()=>{
  const page=fresh()[0],node=page.nodes[0],edges=page.edges.filter(e=>e.source===node.id)
  const result=normalizeKnowledgeInspection({snapshot:page.snapshot,node,outgoing:edges,incoming:[]},node.id,page.snapshot)
  assert.deepEqual(result.outgoing,edges)
  assert.ok(result.outgoing.some(e=>e.target.startsWith('unresolved:')))
})

test('Inspect refuses mismatched resource, snapshot and fabricated source revision',()=>{
  const page=fresh()[0],node=page.nodes[0]
  const response={snapshot:page.snapshot,node,outgoing:[page.edges[0]],incoming:null}
  assert.throws(()=>normalizeKnowledgeInspection(response,'another',page.snapshot),/resource/)
  assert.throws(()=>normalizeKnowledgeInspection(response,node.id,`sha256:${'0'.repeat(64)}`),/snapshot/)
  response.outgoing[0].sourceRevision=`sha256:${'0'.repeat(64)}`
  assert.throws(()=>normalizeKnowledgeInspection(response,node.id,page.snapshot),/source revision/)
})
