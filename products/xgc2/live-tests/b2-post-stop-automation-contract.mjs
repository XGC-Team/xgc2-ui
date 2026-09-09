const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function selectExactTerminalExperimentRun(page,expected,label) {
  object(page,`${label} terminal history page`);
  equal(page.complete,true,`${label} terminal history completeness`);
  invariant(!Object.hasOwn(page,'unavailableSources'),
    `${label} terminal history must not declare unavailable sources`);
  const entries = array(page.entries,`${label} terminal history entries`);
  const matches = entries.filter((entry) => entry?.runId === expected.runId);
  equal(matches.length,1,`${label} exact terminal history run count`);
  const entry = object(matches[0],`${label} terminal history entry`);
  equal(entry.id,expected.runId,`${label} terminal history id`);
  equal(entry.runId,expected.runId,`${label} terminal history runId`);
  equal(entry.targetId,expected.targetId,`${label} terminal history targetId`);
  equal(entry.automationResourceId,expected.resourceId,
    `${label} terminal history Automation resource`);
  equal(entry.phase,'run',`${label} terminal history phase`);
  const run = object(entry.run,`${label} terminal history Run`);
  equal(run.id,expected.runId,`${label} terminal Run id`);
  equal(run.targetId,expected.targetId,`${label} terminal Run targetId`);
  equal(run.automationResourceId,expected.resourceId,`${label} terminal Run resourceId`);
  equal(run.status,'succeeded',`${label} terminal Run status`);
  invariant(typeof run.finishedAt === 'string' && !Number.isNaN(Date.parse(run.finishedAt)),
    `${label} terminal Run must retain a finishedAt timestamp`);
  equal(run.sourceKind,'experiment',`${label} terminal Run sourceKind`);
  assertExperimentRef(run.sourceRef,expected.experimentId,`${label} terminal Run sourceRef`);
  return entry;
}

export function assertB2PostStopAutomationEvidence(evidence,expected) {
  object(evidence,'B2 post-stop Automation evidence');
  equal(evidence.experimentId,expected.experimentId,'post-stop experimentId');
  equal(evidence.targetId,expected.targetId,'post-stop targetId');
  equal(evidence.browserContext?.initialPageCount,0,'fresh browser context initial page count');
  equal(evidence.reload?.requested,true,'explicit page reload');
  invariant(Number.isInteger(evidence.reload?.mainFrameNavigationCount)
    && evidence.reload.mainFrameNavigationCount >= 2,
  'post-stop browser must perform initial navigation and explicit reload');
  equal(array(evidence.pageErrors,'post-stop page errors').length,0,'post-stop page error count');

  const bootstrap = object(evidence.terminalHistoryBootstrap,'terminal history bootstrap');
  for (const [label,contract] of Object.entries({ service:expected.service,algorithm:expected.algorithm })) {
    const record = object(bootstrap[label],`${label} bootstrap record`);
    equal(record.httpStatus,200,`${label} bootstrap HTTP status`);
    equal(record.path,`/api/execution-targets/${encodeURIComponent(expected.targetId)}`
      + `/automation-execution-history?automationResourceId=${encodeURIComponent(contract.resourceId)}`
      + '&runStatus=succeeded&limit=100',`${label} bootstrap endpoint path`);
    selectExactTerminalExperimentRun(record.page,{
      ...contract,targetId:expected.targetId,experimentId:expected.experimentId,
    },label);
  }

  const panel = object(evidence.panel,'post-stop Automation panel');
  equal(panel.count,1,'post-stop Automation panel count');
  equal(panel.auditScope,
    `Experiment-correlated history for ${expected.experimentId}. Current live control requires Session ownership.`,
    'post-stop Automation audit scope');
  const service = assertHistory(panel.service,expected.service,expected.experimentId,'service');
  const sums = deepValuesForKey(service.nodeOutput,'sum');
  invariant(sums.length === 1 && sums[0] === 42,
    'post-stop service History must contain exactly one numeric sum=42');

  const algorithm = assertHistory(panel.algorithm.history,expected.algorithm,expected.experimentId,'algorithm');
  const wrapper = object(algorithm.nodeOutput,'post-stop algorithm canonical output');
  sameStrings(Object.keys(wrapper),['jobId','result'],'post-stop algorithm canonical output keys');
  equal(wrapper.jobId,expected.algorithm.jobId,'post-stop algorithm History jobId');
  const result = object(wrapper.result,'post-stop algorithm canonical result');
  equal(result.exitCode,0,'post-stop algorithm exitCode');
  includes(nonEmptyString(result.stdoutTail,'post-stop algorithm stdoutTail'),
    expected.algorithm.resultStdoutMarker,'post-stop algorithm stdoutTail');
  equal(nonEmptyString(result.stderrTail,'post-stop algorithm stderrTail').trim(),
    expected.algorithm.jobStderr.trim(),'post-stop algorithm stderrTail');

  const jobLogs = object(panel.algorithm.jobLogs,'post-stop algorithm Job logs');
  equal(jobLogs.source,'job-log-endpoint','post-stop Job log source');
  equal(jobLogs.runId,expected.algorithm.runId,'post-stop Job log runId');
  equal(jobLogs.nodeId,'algorithm','post-stop Job log nodeId');
  equal(jobLogs.jobId,expected.algorithm.jobId,'post-stop Job log exact jobId');
  includes(jobLogs.stdout,expected.algorithm.jobStdoutStartMarker,'post-stop Job stdout');
  includes(jobLogs.stdout,expected.algorithm.resultStdoutMarker,'post-stop Job stdout');
  includes(jobLogs.stdout,expected.algorithm.jobStdoutSuccessMarker,'post-stop Job stdout');
  equal(nonEmptyString(jobLogs.stderr,'post-stop Job stderr').trim(),
    expected.algorithm.jobStderr.trim(),'post-stop Job stderr');

  const lifecycle = object(panel.algorithm.orchestrationLifecycleLogs,
    'post-stop orchestration lifecycle logs');
  equal(lifecycle.source,'orchestration-run-log-endpoint','post-stop lifecycle source');
  equal(lifecycle.runId,expected.algorithm.runId,'post-stop lifecycle runId');
  includes(lifecycle.stdout,expected.algorithm.lifecycleStartMarker,'post-stop lifecycle stdout');
  includes(lifecycle.stdout,expected.algorithm.lifecycleSuccessMarker,'post-stop lifecycle stdout');
  equal(lifecycle.stderr,'No stderr captured yet.','post-stop lifecycle stderr placeholder');

  const endpointResponses = array(evidence.endpointResponses,'post-stop endpoint responses');
  for (const endpoint of ['job-stdout','job-stderr','orchestration-stdout','orchestration-stderr']) {
    const matches = endpointResponses.filter((response) => response?.endpoint === endpoint);
    invariant(matches.length >= 1,`post-stop ${endpoint} endpoint was not observed`);
    invariant(matches.every((response) => response.status === 200),
      `post-stop ${endpoint} endpoint did not remain HTTP 200`);
  }
}

function assertHistory(history,expected,experimentId,label) {
  const value = object(history,`post-stop ${label} History`);
  equal(value.runId,expected.runId,`post-stop ${label} History runId`);
  equal(value.source,`Experiment: ${experimentId}`,`post-stop ${label} History source`);
  equal(value.nodeId,expected.nodeId,`post-stop ${label} History nodeId`);
  equal(value.nodeStatus,'succeeded',`post-stop ${label} History node status`);
  equal(value.outputExpanded,true,`post-stop ${label} History output expansion`);
  equal(value.outputVisible,true,`post-stop ${label} History output visibility`);
  object(value.nodeOutput,`post-stop ${label} History node output`);
  return value;
}

function assertExperimentRef(value,experimentId,label) {
  const ref = object(value,label);
  equal(ref.domain,'experiment',`${label} domain`);
  equal(ref.resourceId,experimentId,`${label} resourceId`);
  equal(ref.branch,'main',`${label} branch`);
  id(ref.commitId,`${label} commitId`);
  invariant(Number.isInteger(ref.version) && ref.version > 0,`${label} version must be positive`);
  invariant(typeof ref.digest === 'string' && DIGEST_PATTERN.test(ref.digest),
    `${label} digest must be sha256`);
}

function deepValuesForKey(value,key,result = []) {
  if (Array.isArray(value)) {
    for (const item of value) deepValuesForKey(item,key,result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [candidate,nested] of Object.entries(value)) {
    if (candidate === key) result.push(nested);
    deepValuesForKey(nested,key,result);
  }
  return result;
}

function object(value,label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value),`${label} must be an object`);
  return value;
}

function array(value,label) {
  invariant(Array.isArray(value),`${label} must be an array`);
  return value;
}

function id(value,label) {
  invariant(typeof value === 'string' && ID_PATTERN.test(value),`${label} must be a canonical ID`);
  return value;
}

function nonEmptyString(value,label) {
  invariant(typeof value === 'string' && value.trim(),`${label} must be non-empty`);
  return value;
}

function includes(value,needle,label) {
  invariant(typeof value === 'string' && value.includes(needle),`${label} must contain ${needle}`);
}

function sameStrings(actual,expected,label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  invariant(JSON.stringify(left) === JSON.stringify(right),
    `${label} differ: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
}

function equal(actual,expected,label) {
  invariant(Object.is(actual,expected),`${label} differs: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

function invariant(condition,message) {
  if (!condition) throw new Error(message);
}
