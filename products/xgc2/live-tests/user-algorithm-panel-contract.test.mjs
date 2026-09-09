import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  USER_ALGORITHM_PANEL_LANES,
  USER_ALGORITHM_PANEL_MULTI_BINDINGS,
  archiveConfigurationRequest,
  assertLaneExperiment,
  assertOrdinaryCreatedResource,
  assertPanelTraceText,
  assertUserScriptModeExecution,
  attachLanePanelFixtures,
  buildLanePanelFixtures,
  buildMultiBindingPanelFixture,
  buildProbeAutomationSpec,
  buildProbeUserScriptSpecs,
  commitConfigurationRequest,
  createConfigurationRequest,
  normalizeE2EMarker,
  multiBindingPanelSelectors,
  panelSelectors,
  resolveLaneExperiment,
} from './user-algorithm-panel-contract.mjs';

const marker='panel-e2e-a1';

test('targets the authored four-Scout and six-FS150 public Experiments without fixed IDs',() => {
  const documents=USER_ALGORITHM_PANEL_LANES.map((lane,index) => experiment(lane,`experiment-${index+1}`));
  for (const lane of USER_ALGORITHM_PANEL_LANES) {
    const resolved=resolveLaneExperiment(lane,documents);
    assert.equal(resolved.spec.name,lane.experimentName);
    assert.equal(resolved.head.resourceId.startsWith('experiment-'),true);
  }
  assert.throws(() => resolveLaneExperiment(USER_ALGORITHM_PANEL_LANES[0],[]),/found 0/);
  assert.throws(() => resolveLaneExperiment(USER_ALGORITHM_PANEL_LANES[0],[documents[0],documents[0]]),/found 2/);
  const drift=structuredClone(documents[0]);
  drift.spec.runModes=['simulation','physical'];
  assert.throws(() => assertLaneExperiment(USER_ALGORITHM_PANEL_LANES[0],drift),/must author simulation, physical, and hybrid/);
});

test('keeps the probe generic and injects the known compile failure only through a user input',() => {
  const specs=buildProbeUserScriptSpecs(marker);
  assert.equal(specs.compile.interpreter,'bash');
  assert.match(specs.compile.source,/XGC_IN_FAIL_COMPILE/);
  assert.match(specs.compile.source,/user-project ROS source is unavailable/);
  assert.doesNotMatch(JSON.stringify(specs),/paper-leader|\/home\/lxk\/Paper|formation_generator/);
  assert.match(specs.runtime.source,/runtime ready/);
  assert.match(specs.runtime.source,/trap stop_runtime TERM INT/);
  assert.throws(() => normalizeE2EMarker('Bad Marker'),/must match/);
});

test('authors one shared run-mode graph where only simulation reaches two user.script nodes',() => {
  const spec=buildProbeAutomationSpec({
    marker,compileAssetId:'compile-resource',runtimeAssetId:'runtime-resource',
  });
  assert.equal(spec.schemaVersion,4);
  assert.deepEqual(spec.targetPolicy,{ mode:'fixed',executionTargetId:'local' });
  assert.deepEqual(spec.nodes.filter((node) => node.kind==='user.script').map(({ id }) => id),['compile','algorithm']);
  assert.deepEqual(spec.actions.map(({ id,entryNodeId }) => ({ id,entryNodeId })),[
    {id:'run',entryNodeId:'manual'},
    {id:'run-for-experiment',entryNodeId:'called'},
  ]);
  const simulation=reachable(spec,'called',{ 'simulation-mode':'true' });
  const nonSimulation=reachable(spec,'called',{ 'simulation-mode':'false' });
  assert.deepEqual([...simulation].filter((id) => ['compile','algorithm'].includes(id)),['compile','algorithm']);
  assert.deepEqual([...nonSimulation].filter((id) => ['compile','algorithm'].includes(id)),[]);
  assert.ok(simulation.has('return'));
  assert.ok(nonSimulation.has('return'));
  assert.doesNotMatch(JSON.stringify(spec),/paper-leader|scenario_launch|roslaunch|\/opt\/xgc2\/user-project/);
});

test('adds two independent managed Panel bindings per lane without changing existing fields',() => {
  for (const lane of USER_ALGORITHM_PANEL_LANES) {
    const source=experiment(lane,`experiment-${lane.key}`);
    const original=structuredClone(source.spec);
    const fixtures=buildLanePanelFixtures({ lane,automationResourceId:'automation-resource',marker });
    const next=attachLanePanelFixtures(source,fixtures);
    assert.equal(fixtures.length,2);
    assert.equal(next.workflowInstances.length,original.workflowInstances.length+2);
    const panels=next.dashboards.find(({ id }) => id==='gcs').panels.filter(({ id }) => id.startsWith(marker));
    assert.equal(panels.length,2);
    assert.equal(new Set(panels.map(({ id }) => id)).size,2);
    for (const panel of panels) {
      assert.equal(panel.pluginId,'automation-workflow-control');
      assert.equal(panel.portBindings.filter(({ kind }) => kind==='workflow').length,1);
      assert.ok(panel.portBindings.some((binding) => binding.kind==='workflow'
        && binding.managed===true && binding.relation==='supervised'));
      assert.ok(panel.portBindings.some((binding) => binding.kind==='action' && binding.presetId==='run'));
      assert.ok(panel.portBindings.some((binding) => binding.kind==='data'
        && binding.projection==='workflowruntime.run.logs'));
    }
    assertNoPanelOverlap(next.dashboards.find(({ id }) => id==='gcs').panels);
    assert.deepEqual(
      { ...next,workflowInstances:undefined,dashboards:undefined },
      { ...original,workflowInstances:undefined,dashboards:undefined },
    );
  }
});

test('authors one same-Panel two-button acceptance fixture without paper-specific behavior',() => {
  for (const lane of USER_ALGORITHM_PANEL_LANES) {
    const fixture=buildMultiBindingPanelFixture({ lane,automationResourceId:'automation-resource',marker });
    assert.equal(fixture.panel.pluginId,'automation-workflow-control');
    assert.equal(fixture.workflow.actionPresets.length,2);
    assert.deepEqual(fixture.bindings,USER_ALGORITHM_PANEL_MULTI_BINDINGS);
    assert.deepEqual(
      fixture.panel.portBindings.filter(({ kind }) => kind==='action').map(({ portId,presetId }) => ({ portId,presetId })),
      USER_ALGORITHM_PANEL_MULTI_BINDINGS.map(({ portId,presetId }) => ({ portId,presetId })),
    );
    assert.equal(fixture.panel.portBindings.filter(({ kind }) => kind==='workflow').length,1);
    assert.ok(fixture.panel.portBindings.some((binding) => binding.kind==='workflow'
      && binding.presetId==='primary' && binding.managed===true));
    assert.doesNotMatch(JSON.stringify(fixture),/paper-leader|formation_generator|roslaunch|\/opt\/xgc2\/user-project/i);
  }
});

test('builds public Create, CAS Commit, and archive requests with exact intent identity',() => {
  const lane=USER_ALGORITHM_PANEL_LANES[0];
  const document=experiment(lane,'experiment-a');
  const create=createConfigurationRequest({ schemaVersion:1 },{ requestId:'create-1',reason:'Create probe' });
  assert.deepEqual(create,{
    namespaceId:'',spec:{schemaVersion:1},reason:'Create probe',requestId:'create-1',idempotencyKey:'create-1',
  });
  const commit=commitConfigurationRequest(document,{ ...document.spec,name:'updated' },{
    requestId:'commit-1',reason:'Attach probe Panels',
  });
  assert.equal(commit.baseCommitId,'commit-a');
  assert.equal(commit.expectedBranchRevision,3);
  assert.equal(commit.expectedResourceRevision,5);
  assert.equal(commit.idempotencyKey,commit.requestId);
  assert.deepEqual(archiveConfigurationRequest(document,{ requestId:'archive-1',reason:'Archive probe' }),{
    expectedRevision:5,reason:'Archive probe',requestId:'archive-1',idempotencyKey:'archive-1',
  });
  assert.equal(assertOrdinaryCreatedResource({
    head:{domain:'automation',resourceId:'automation-a',revision:1},branch:{name:'main'},
  },'automation').head.resourceId,'automation-a');
  assert.throws(() => assertOrdinaryCreatedResource({
    head:{domain:'automation',resourceId:'automation-a',revision:1,system:true},branch:{name:'main'},
  },'automation'),/ordinary/);
});

test('freezes the mode execution counts and failure/log visibility contract',() => {
  const success=[
    node('compile','user.script','succeeded',1,0),
    node('algorithm','user.script','running',1,0),
  ];
  assert.deepEqual(assertUserScriptModeExecution('simulation',success),{ compile:1,algorithm:1 });
  assert.deepEqual(assertUserScriptModeExecution('physical',[
    node('compile','user.script','pending',0,0),node('algorithm','user.script','pending',0,0),
  ]),{ compile:0,algorithm:0 });
  assert.deepEqual(assertUserScriptModeExecution('hybrid',[
    node('compile','user.script','skipped',0,0),node('algorithm','user.script','skipped',0,0),
  ]),{ compile:0,algorithm:0 });
  const failure=[
    { ...node('compile','user.script','compensated',1,1),error:'user script exited: user-project ROS source is unavailable' },
    node('algorithm','user.script','pending',0,0),
  ];
  assert.deepEqual(assertUserScriptModeExecution('simulation',failure,{ failCompile:true }),{ compile:1,algorithm:0 });
  assert.throws(() => assertUserScriptModeExecution('physical',success),/executed user.script/);
  assert.equal(assertPanelTraceText('{"nodes":[{"id":"compile"},{"id":"algorithm"}]}'),
    '{"nodes":[{"id":"compile"},{"id":"algorithm"}]}');
  assert.match(assertPanelTraceText(
    '{"nodeId":"compile","error":"user-project ROS source is unavailable"}',{ failCompile:true },
  ),/source is unavailable/);
  assert.throws(() => assertPanelTraceText(''),/blank/);
});

test('uses stable Panel header selectors and a public-API-only live harness',() => {
  const selectors=panelSelectors('panel-a');
  assert.match(selectors.run,/panel-workflow-run/);
  assert.match(selectors.stop,/panel-workflow-stop/);
  assert.match(selectors.trace,/automation-workflow-trace/);
  const multi=multiBindingPanelSelectors('panel-a','fallback');
  assert.match(multi.actionInvoke,/panel-action-invoke/);
  assert.match(multi.headerStop,/panel-workflow-stop/);
  const source=readFileSync(new URL('./user-algorithm-panel-e2e.mjs',import.meta.url),'utf8');
  for (const route of [
    '/api/usernode-assets','/api/automations','/api/experiments/',
    '/api/execution-targets/local/orchestration-runs',
  ]) assert.ok(source.includes(route),`live harness omits ${route}`);
  assert.match(source,/api\('DELETE'/);
  assert.match(source,/startExperimentThroughUI/);
  assert.match(source,/stopExperimentThroughUI/);
  assert.match(source,/selectors\.stop/);
  assert.match(source,/XGC_USER_ALGORITHM_PANEL_E2E_MULTI_BINDING/);
  assert.match(source,/invokePanelAction/);
  assert.match(source,/headerStop/);
  assert.match(source,/experiment-sessions/);
  assert.doesNotMatch(source,/paper-leader|\/home\/lxk\/Paper|docker compose|docker exec|sqlite|\.db\b/i);
});

function experiment(lane,resourceId) {
  return {
    head:{domain:'experiment',resourceId,revision:5},
    branch:{name:'main',headCommitId:'commit-a',revision:3},
    spec:{
      schemaVersion:15,name:lane.experimentName,description:'',tags:[...lane.requiredTags],
      localizationOffset:{x:0,y:0,z:0},
      runModes:['simulation','physical','hybrid'],
      robots:lane.robotNamespaces.map((namespace,index) => ({
        id:`robot-${index+1}`,namespace,ref:{domain:'robot',resourceId:`robot-${index+1}`,branch:'main'},
      })),
      workflowInstances:[{
        id:'existing-workflow',ref:{domain:'automation',resourceId:'existing-automation',branch:'main'},
        actionPresets:[{id:'run',actionId:'run',inputs:{}}],
      }],
      dashboards:[{
        id:'gcs',name:'GCS',panels:[{
          schemaVersion:4,id:'existing-panel',pluginId:'workflow-logs',title:'Existing',
          grid:{x:0,y:0,w:7,h:4},view:{query:{},options:{},fieldConfig:{}},portBindings:[],
        }],
      }],
    },
  };
}

function reachable(spec,start,routes) {
  const seen=new Set();
  const queue=[start];
  while (queue.length>0) {
    const id=queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of spec.edges.filter(({ from }) => from===id)) {
      if (Object.hasOwn(routes,id) && String(edge.route)!==routes[id]) continue;
      queue.push(edge.to);
    }
  }
  return seen;
}

function assertNoPanelOverlap(panels) {
  panels.forEach((left,index) => panels.slice(index+1).forEach((right) => {
    const a=left.grid;
    const b=right.grid;
    const separated=(a.x+a.w)<=b.x || (b.x+b.w)<=a.x || (a.y+a.h)<=b.y || (b.y+b.h)<=a.y;
    assert.equal(separated,true,`${left.id} overlaps ${right.id}`);
  }));
}

function node(nodeId,kind,status,occurrenceCount,failedOccurrenceCount) {
  return { nodeId,kind,status,occurrenceCount,failedOccurrenceCount };
}
