import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeRootObservationAtRequest,
  classifyFrontendRuntimeRead,
  duplicateRelationRevisionKeys,
  duplicateRuntimeReadRevisionKeys,
  lifecycleRuntimeReadViolations,
  observedRuntimeIdentitySnapshot,
  parseRuntimeReadIdentity,
  relationIntroducedRunReads,
  runtimeReadLedger,
  runObservationAtRequest,
} from './strict-sse-runtime-read-gate.mjs';

test('classifies local Robot reads and remote runtime/detail reads while excluding SSE',() => {
  assert.deepEqual(classifyFrontendRuntimeRead(request(
    'http://127.0.0.1/api/execution-targets/local/orchestration-runs/run-1/robots',
  )),{ kind:'robot-runtime',targetId:'local' });
  assert.deepEqual(classifyFrontendRuntimeRead(request(
    'http://127.0.0.1/api/execution-targets/agent%2Fscout/automation-execution-history',
  )),{ kind:'history',targetId:'agent/scout' });
  assert.deepEqual(classifyFrontendRuntimeRead(request(
    'http://127.0.0.1/api/execution-targets/agent%2Fscout/orchestration-runs/run-1',
  )),{ kind:'orchestration-runtime',targetId:'agent/scout' });
  assert.equal(classifyFrontendRuntimeRead(request(
    'http://127.0.0.1/api/execution-targets/agent%2Fscout/orchestration-runs/run-1/robots/events',
    'text/event-stream',
  )),undefined);
});

test('parses only exact bounded history, Session, and Run-detail identities',() => {
  assert.deepEqual(parseRuntimeReadIdentity(read('history',
    'http://127.0.0.1/api/execution-targets/local/automation-execution-history?automationResourceId=automation-a&limit=25',
  )),{ ok:true,identity:{ kind:'history',targetId:'local',automationResourceId:'automation-a' } });
  assert.deepEqual(parseRuntimeReadIdentity(read('session',
    'http://127.0.0.1/api/execution-targets/local/experiment-sessions',
  )),{ ok:true,identity:{ kind:'session',targetId:'local' } });
  assert.deepEqual(parseRuntimeReadIdentity(read('orchestration-runtime',
    'http://127.0.0.1/api/execution-targets/local/orchestration-runs/run%2Fa/node-summaries',
  )),{ ok:true,identity:{ kind:'run',targetId:'local',runId:'run/a',endpoint:'node-summaries' } });
  assert.equal(parseRuntimeReadIdentity(read('history',
    'http://127.0.0.1/api/execution-targets/local/automation-execution-history?automationResourceId=automation-a&limit=1000',
  )).ok,false);
  assert.equal(parseRuntimeReadIdentity(read('session',
    'http://127.0.0.1/api/execution-targets/local/experiment-sessions?experimentId=experiment-a',
  )).ok,false);
});

test('builds current-page observed identities and rejects duplicate exact replay reads',() => {
  const reads=[
    { ...read('history','http://x/api/execution-targets/local/automation-execution-history?automationResourceId=a&limit=25'),at:10,pageEpoch:2 },
    { ...read('orchestration-runtime','http://x/api/execution-targets/local/orchestration-runs/run-1'),at:11,pageEpoch:2 },
    { ...read('session','http://x/api/execution-targets/local/experiment-sessions'),at:12,pageEpoch:2 },
    { ...read('history','http://x/api/execution-targets/local/automation-execution-history?automationResourceId=old&limit=25'),at:9,pageEpoch:1 },
  ];
  assert.deepEqual(observedRuntimeIdentitySnapshot(reads,{ beforeAt:20,pageEpoch:2,targetId:'local' }),{
    historyResourceIds:['a'],runRefs:[{ targetId:'local',runId:'run-1' }],
    sessionTargetIds:['local'],invalidReads:[],
  });
  const ledger=runtimeReadLedger([
    reads[0],{ ...reads[0],at:13 },
    { ...read('relations','http://x/api/execution-targets/local/orchestration-runs/run-1/relations'),at:14,pageEpoch:2 },
    { ...read('relations','http://x/api/execution-targets/local/orchestration-runs/run-1/relations'),at:15,pageEpoch:2 },
  ]);
  assert.deepEqual(ledger.duplicateHistoryKeys,[{ key:'local:history:a',count:2 }]);
  assert.deepEqual(ledger.duplicateRunEndpointKeys,[{ key:'local:run-1:relations',count:2 }]);
});

test('attributes each relation request to the latest root revision received before it',() => {
  const root={ id:'root',revision:2,status:'waiting' };
  const connections=[{ frames:[
    { entityType:'orchestration',entityId:'root',offset:10,receivedAt:100,runRevision:3,runStatus:'waiting' },
    { entityType:'orchestration',entityId:'other',offset:11,receivedAt:110,runRevision:9,runStatus:'failed' },
    { entityType:'orchestration',entityId:'root',offset:12,receivedAt:200,runRevision:4,runStatus:'stopped' },
  ] }];
  assert.deepEqual(activeRootObservationAtRequest(root,150,connections),{
    id:'root',revision:3,status:'waiting',observed:true,active:true,
  });
  assert.deepEqual(activeRootObservationAtRequest(root,250,connections),{
    id:'root',revision:4,status:'stopped',observed:true,active:false,
  });
  assert.deepEqual(runObservationAtRequest('other',150,connections),{
    id:'other',revision:9,status:'failed',observed:true,
  });
  assert.deepEqual(duplicateRelationRevisionKeys([
    { id:'root',revision:2 },{ id:'root',revision:3 },{ id:'root',revision:3 },
  ]),['root:3']);
});

test('rejects duplicate detail reads only within the same exact Run revision',() => {
  assert.deepEqual(duplicateRuntimeReadRevisionKeys([
    { targetId:'local',runId:'run',endpoint:'relations',revision:2 },
    { targetId:'local',runId:'run',endpoint:'relations',revision:2 },
    { targetId:'local',runId:'run',endpoint:'relations',revision:3 },
  ]),[{ key:'local:run:relations:2',count:2 }]);
});

test('admits a child identity only after its exact parent relations were observed',() => {
  const links=[{
    parentTargetId:'local',parentRunId:'parent',childTargetId:'local',childRunId:'child',
  }];
  assert.deepEqual(relationIntroducedRunReads({
    rootRef:{ targetId:'local',runId:'parent' },links,
    reads:[
      { targetId:'local',runId:'parent',endpoint:'relations',at:10 },
      { targetId:'local',runId:'child',endpoint:'run',at:20 },
    ],
  }),{
    rootKey:'local\0parent',
    introduced:[{
      childKey:'local\0child',parentKey:'local\0parent',parentRelationAt:10,childFirstReadAt:20,
    }],
    invalid:[],
  });
  assert.equal(relationIntroducedRunReads({
    rootRef:{ targetId:'local',runId:'parent' },links,
    reads:[
      { targetId:'local',runId:'child',endpoint:'run',at:10 },
      { targetId:'local',runId:'parent',endpoint:'relations',at:20 },
    ],
  }).invalid.length,1);
  assert.equal(relationIntroducedRunReads({
    rootRef:{ targetId:'local',runId:'parent' },links:[],
    reads:[{ targetId:'local',runId:'unknown',endpoint:'run',at:20 }],
  }).invalid.length,1);
});

test('ordinary Experiment lifecycle reads only histories, Sessions, and System-root relations',() => {
  const allowed=[
    read('history','http://x/api/execution-targets/local/automation-execution-history?automationResourceId=a&limit=25'),
    read('session','http://x/api/execution-targets/local/experiment-sessions'),
    read('relations','http://x/api/execution-targets/local/orchestration-runs/system/relations'),
  ];
  assert.deepEqual(lifecycleRuntimeReadViolations(allowed,{
    targetId:'local',systemRootId:'system',
  }),{ invalidReads:[],forbiddenRunReads:[],foreignReads:[] });
  const violation=lifecycleRuntimeReadViolations([
    ...allowed,
    read('orchestration-runtime','http://x/api/execution-targets/local/orchestration-runs/panel-child'),
    read('relations','http://x/api/execution-targets/local/orchestration-runs/panel-child/relations'),
  ],{ targetId:'local',systemRootId:'system' });
  assert.deepEqual(violation.forbiddenRunReads.map(({ runId,endpoint }) => ({ runId,endpoint })),[
    { runId:'panel-child',endpoint:'run' },
    { runId:'panel-child',endpoint:'relations' },
  ]);
});

function request(url,accept='application/json') {
  return { method:() => 'GET',url:() => url,headers:() => ({ accept }) };
}

function read(kind,url,targetId='local') {
  return { kind,targetId,url };
}
