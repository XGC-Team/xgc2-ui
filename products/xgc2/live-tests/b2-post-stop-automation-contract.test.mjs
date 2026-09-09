import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertB2PostStopAutomationEvidence,
  selectExactTerminalExperimentRun,
} from './b2-post-stop-automation-contract.mjs';

const targetId = 'xgc2-dev-lab-agent-b2';
const experimentId = 'experiment-b2';
const expected = {
  targetId,experimentId,
  service:{ resourceId:'service-resource',runId:'service-run',nodeId:'typed-call' },
  algorithm:{
    resourceId:'algorithm-resource',runId:'algorithm-run',nodeId:'algorithm',jobId:'job-algorithm',
    resultStdoutMarker:'{"algorithm":"integer-summary-v1"}',
    jobStdoutStartMarker:'attempt 1 started',jobStdoutSuccessMarker:'attempt 1 succeeded',
    jobStderr:'algorithm starting\nalgorithm completed',
    lifecycleStartMarker:'run starting with definition ',
    lifecycleSuccessMarker:'node algorithm succeeded',
  },
};

function historyPage(workflow) {
  return { complete:true,entries:[{
    id:workflow.runId,runId:workflow.runId,targetId,
    automationResourceId:workflow.resourceId,acceptedAt:'2026-08-10T00:00:00Z',phase:'run',
    run:{ id:workflow.runId,targetId,automationResourceId:workflow.resourceId,status:'succeeded',
      finishedAt:'2026-08-10T00:00:01Z',
      sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:experimentId,branch:'main',
        commitId:'commit-experiment',version:7,digest:'a'.repeat(64) } },
  }] };
}

function evidence() {
  const algorithmResult = { exitCode:0,stdoutTail:expected.algorithm.resultStdoutMarker,
    stderrTail:expected.algorithm.jobStderr };
  return {
    experimentId,targetId,browserContext:{ initialPageCount:0 },
    reload:{ requested:true,mainFrameNavigationCount:2 },pageErrors:[],
    terminalHistoryBootstrap:{
      service:{ httpStatus:200,path:'/api/execution-targets/xgc2-dev-lab-agent-b2/automation-execution-history?automationResourceId=service-resource&runStatus=succeeded&limit=100',page:historyPage(expected.service) },
      algorithm:{ httpStatus:200,path:'/api/execution-targets/xgc2-dev-lab-agent-b2/automation-execution-history?automationResourceId=algorithm-resource&runStatus=succeeded&limit=100',page:historyPage(expected.algorithm) },
    },
    panel:{ count:1,
      auditScope:`Experiment-correlated history for ${experimentId}. Current live control requires Session ownership.`,
      service:{ runId:'service-run',source:`Experiment: ${experimentId}`,nodeId:'typed-call',
        nodeStatus:'succeeded',outputExpanded:true,outputVisible:true,nodeOutput:{ response:{ sum:42 } } },
      algorithm:{
        history:{ runId:'algorithm-run',source:`Experiment: ${experimentId}`,nodeId:'algorithm',
          nodeStatus:'succeeded',outputExpanded:true,outputVisible:true,
          nodeOutput:{ jobId:'job-algorithm',result:algorithmResult } },
        jobLogs:{ source:'job-log-endpoint',runId:'algorithm-run',nodeId:'algorithm',jobId:'job-algorithm',
          stdout:`attempt 1 started\n${expected.algorithm.resultStdoutMarker}\nattempt 1 succeeded`,
          stderr:expected.algorithm.jobStderr },
        orchestrationLifecycleLogs:{ source:'orchestration-run-log-endpoint',runId:'algorithm-run',
          stdout:'run starting with definition algorithm-resource@7\nnode algorithm succeeded',
          stderr:'No stderr captured yet.' },
      },
    },
    endpointResponses:['job-stdout','job-stderr','orchestration-stdout','orchestration-stderr']
      .map((endpoint) => ({ endpoint,status:200 })),
  };
}

test('accepts exact complete terminal history and post-reload panel evidence',() => {
  assert.equal(selectExactTerminalExperimentRun(historyPage(expected.service),{
    ...expected.service,targetId,experimentId,
  },'service').runId,'service-run');
  assert.doesNotThrow(() => assertB2PostStopAutomationEvidence(evidence(),expected));
});

test('rejects unavailable, non-terminal, duplicate, or wrong-origin bootstrap entries',() => {
  for (const mutate of [
    (page) => { page.complete=false; page.unavailableSources=['agent']; },
    (page) => { page.entries[0].run.status='running'; },
    (page) => { page.entries.push(JSON.parse(JSON.stringify(page.entries[0]))); },
    (page) => { page.entries[0].run.sourceRef.resourceId='another-experiment'; },
  ]) {
    const page = historyPage(expected.service);
    mutate(page);
    assert.throws(() => selectExactTerminalExperimentRun(page,{
      ...expected.service,targetId,experimentId,
    },'service'));
  }
});

test('rejects active-ledger substitutes, noncanonical Job wrappers, and missing endpoints',() => {
  const withLedger = evidence();
  withLedger.terminalHistoryBootstrap.service = { httpStatus:503,page:{ unavailableSources:['agent'] } };
  assert.throws(() => assertB2PostStopAutomationEvidence(withLedger,expected));

  const unwrapped = evidence();
  unwrapped.panel.algorithm.history.nodeOutput = unwrapped.panel.algorithm.history.nodeOutput.result;
  assert.throws(() => assertB2PostStopAutomationEvidence(unwrapped,expected));

  const missingEndpoint = evidence();
  missingEndpoint.endpointResponses = missingEndpoint.endpointResponses.filter(
    ({ endpoint }) => endpoint !== 'orchestration-stderr',
  );
  assert.throws(() => assertB2PostStopAutomationEvidence(missingEndpoint,expected));
});
