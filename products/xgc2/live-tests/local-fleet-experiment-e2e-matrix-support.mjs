const CELL_FILTER_PATTERN=/^([A-Za-z][A-Za-z0-9._-]{0,63})\/(simulation|physical|hybrid)$/;
const FAILURE_MODES=new Set(['fail-fast','continue']);
const RESULT_OUTCOMES=new Set(['passed','blocked-hardware','lifecycle-only','failed']);
const RECEIPT_STATUSES=new Set(['running','passed','blocked','partial','failed','incomplete']);
const EXPECTED_LOCAL_FLEET_MATRIX_CELLS=14;

export const LOCAL_FLEET_MATRIX_RECEIPT_CONTRACT='local-fleet-experiment-e2e-matrix-v1';
export const LOCAL_FLEET_MATRIX_BROWSER_EVIDENCE=Object.freeze({
  contract:'browser-resource-diagnostics-v1',
  supportModule:'live-tests/browser-resource-diagnostics.mjs',
  screenshotRequired:true,
});

export function matrixCellKey(laneKey,mode) {
  return `${requiredString(laneKey,'matrix lane key')}/${requiredMode(mode)}`;
}

export function parseSingleCellFilter(value) {
  if (value===undefined || value===null || String(value).trim()==='') return '';
  const normalized=String(value).trim();
  if (!CELL_FILTER_PATTERN.test(normalized)) {
    throw new Error('matrix cell filter must be one canonical lane/mode value');
  }
  return normalized;
}

export function parseFailureMode(value) {
  const normalized=requiredString(value,'matrix failure mode');
  if (!FAILURE_MODES.has(normalized)) {
    throw new Error('matrix failure mode must be fail-fast or continue');
  }
  return normalized;
}

export function buildLocalFleetMatrix(lanes,{
  repeatRounds=3,
  cellFilter='',
  buildRepeatedModeMatrix,
}={}) {
  if (typeof buildRepeatedModeMatrix!=='function') {
    throw new Error('buildRepeatedModeMatrix helper is required');
  }
  const normalizedFilter=parseSingleCellFilter(cellFilter);
  const allRuns=buildRepeatedModeMatrix(lanes,{ repeatRounds });
  const baseCells=[];
  const seen=new Set();
  for (const run of allRuns) {
    const key=matrixCellKey(run?.lane?.key,run?.mode);
    if (!seen.has(key)) {
      seen.add(key);
      baseCells.push({
        key,lane:run.lane.key,mode:run.mode,
        experimentId:requiredString(run?.lane?.experiment?.head?.resourceId,`${key} Experiment resourceId`),
      });
    }
  }
  if (baseCells.length!==EXPECTED_LOCAL_FLEET_MATRIX_CELLS) {
    throw new Error(`local-fleet matrix must contain ${EXPECTED_LOCAL_FLEET_MATRIX_CELLS} canonical cells, found ${baseCells.length}`);
  }
  if (normalizedFilter && !seen.has(normalizedFilter)) {
    throw new Error(`matrix cell filter was not found: ${normalizedFilter}`);
  }
  const selectedRuns=allRuns.filter(({ lane,mode }) => (
    !normalizedFilter || matrixCellKey(lane.key,mode)===normalizedFilter
  )).map(({ lane,mode,round }) => ({
    key:matrixCellKey(lane.key,mode),lane:lane.key,mode,round,
    experimentId:requiredString(lane?.experiment?.head?.resourceId,`${lane.key} Experiment resourceId`),
    experiment:lane.experiment,
  }));
  const selectedCells=baseCells.filter(({ key }) => !normalizedFilter || key===normalizedFilter);
  if (selectedRuns.length===0) throw new Error('local-fleet matrix selection is empty');
  return Object.freeze({
    repeatRounds,cellFilter:normalizedFilter,
    canonicalCellCount:baseCells.length,
    canonicalRunCount:allRuns.length,
    baseCells:Object.freeze(baseCells),
    selectedCells:Object.freeze(selectedCells),
    runs:Object.freeze(selectedRuns),
  });
}

export async function executeMatrixPlan(plan,{
  executeCell,
  failureMode='fail-fast',
  onResult=async () => undefined,
}={}) {
  if (!Array.isArray(plan?.runs) || plan.runs.length===0) {
    throw new Error('matrix execution plan requires runs');
  }
  if (typeof executeCell!=='function') throw new Error('executeCell is required');
  if (typeof onResult!=='function') throw new Error('onResult must be a function');
  const normalizedFailureMode=parseFailureMode(failureMode);
  const results=[];
  let stoppedEarly=false;
  for (const run of plan.runs) {
    let result;
    try {
      result=await executeCell(run);
    } catch (cause) {
      result=cause?.matrixResult ?? failedMatrixResult(run,cause);
    }
    assertMatrixRunResult(result);
    results.push(result);
    await onResult(result,Object.freeze([...results]));
    if (result.outcome==='failed' && normalizedFailureMode==='fail-fast') {
      stoppedEarly=results.length<plan.runs.length;
      break;
    }
  }
  return Object.freeze({
    results:Object.freeze(results),
    stoppedEarly,
    remainingRuns:plan.runs.length-results.length,
  });
}

export class MatrixCellError extends Error {
  constructor(message,matrixResult,{ cause }={}) {
    super(message,{ cause });
    this.name='MatrixCellError';
    this.matrixResult=matrixResult;
  }
}

export function createMatrixReceipt({
  configuration,
  discovery=[],
  plan,
  results=[],
  browserDiagnostics=null,
  errors=[],
  startedAt,
  finishedAt='',
}) {
  const normalizedStartedAt=requiredTimestamp(startedAt,'receipt startedAt');
  const normalizedFinishedAt=finishedAt ? requiredTimestamp(finishedAt,'receipt finishedAt') : '';
  const plannedRuns=Array.isArray(plan?.runs) ? plan.runs.length : 0;
  const counts={ passed:0,blockedHardware:0,lifecycleOnly:0,failed:0 };
  for (const result of results) {
    assertMatrixRunResult(result);
    if (result.outcome==='passed') counts.passed+=1;
    if (result.outcome==='blocked-hardware') counts.blockedHardware+=1;
    if (result.outcome==='lifecycle-only') counts.lifecycleOnly+=1;
    if (result.outcome==='failed') counts.failed+=1;
  }
  const completedRuns=results.length;
  const remainingRuns=Math.max(0,plannedRuns-completedRuns);
  const status=receiptStatus({
    finished:Boolean(normalizedFinishedAt),plannedRuns,completedRuns,remainingRuns,counts,errors,
  });
  const receipt={
    contract:LOCAL_FLEET_MATRIX_RECEIPT_CONTRACT,
    schemaVersion:1,
    status,
    startedAt:normalizedStartedAt,
    finishedAt:normalizedFinishedAt || null,
    configuration:{
      webUrl:requiredString(configuration?.webUrl,'receipt webUrl'),
      repeatRounds:requiredPositiveInteger(configuration?.repeatRounds,'receipt repeatRounds'),
      cellFilter:parseSingleCellFilter(configuration?.cellFilter ?? ''),
      failureMode:parseFailureMode(configuration?.failureMode ?? 'fail-fast'),
      hardware:requiredHardwareState(configuration?.hardware ?? 'absent'),
    },
    discovery:discovery.map((item) => ({
      lane:requiredString(item?.lane,'discovery lane'),
      name:requiredString(item?.name,'discovery name'),
      experimentId:requiredString(item?.experimentId,'discovery Experiment resourceId'),
      runModes:requiredModes(item?.runModes),
    })),
    plan:{
      canonicalCellCount:Number(plan?.canonicalCellCount ?? 0),
      canonicalRunCount:Number(plan?.canonicalRunCount ?? 0),
      selectedCellCount:Array.isArray(plan?.selectedCells) ? plan.selectedCells.length : 0,
      plannedRunCount:plannedRuns,
      cells:(plan?.selectedCells ?? []).map(({ key,lane,mode,experimentId }) => ({ key,lane,mode,experimentId })),
    },
    summary:{ plannedRuns,completedRuns,remainingRuns,...counts },
    results,
    browserDiagnostics,
    errors:errors.map(normalizeErrorEvidence),
  };
  assertMatrixReceipt(receipt);
  return receipt;
}

export function assertMatrixReceipt(receipt) {
  if (receipt?.contract!==LOCAL_FLEET_MATRIX_RECEIPT_CONTRACT || receipt?.schemaVersion!==1) {
    throw new Error('matrix receipt contract is invalid');
  }
  if (!RECEIPT_STATUSES.has(receipt.status)) throw new Error('matrix receipt status is invalid');
  requiredTimestamp(receipt.startedAt,'receipt startedAt');
  if (receipt.finishedAt!==null) requiredTimestamp(receipt.finishedAt,'receipt finishedAt');
  requiredString(receipt?.configuration?.webUrl,'receipt webUrl');
  requiredPositiveInteger(receipt?.configuration?.repeatRounds,'receipt repeatRounds');
  parseSingleCellFilter(receipt?.configuration?.cellFilter ?? '');
  parseFailureMode(receipt?.configuration?.failureMode);
  requiredHardwareState(receipt?.configuration?.hardware);
  if (!Array.isArray(receipt.discovery) || !Array.isArray(receipt.results)
    || !Array.isArray(receipt.errors) || !receipt.plan || !receipt.summary) {
    throw new Error('matrix receipt collections are invalid');
  }
  for (const result of receipt.results) assertMatrixRunResult(result);
  const summary=receipt.summary;
  for (const field of ['plannedRuns','completedRuns','remainingRuns','passed','blockedHardware','lifecycleOnly','failed']) {
    if (!Number.isSafeInteger(summary[field]) || summary[field]<0) {
      throw new Error(`matrix receipt summary ${field} is invalid`);
    }
  }
  if (summary.completedRuns!==receipt.results.length
    || summary.completedRuns+summary.remainingRuns!==summary.plannedRuns) {
    throw new Error('matrix receipt summary counts are inconsistent');
  }
  return receipt;
}

export function assertMatrixRunResult(result) {
  if (!RESULT_OUTCOMES.has(result?.outcome)) throw new Error('matrix run outcome is invalid');
  const expectedKey=matrixCellKey(result?.lane,result?.mode);
  if (result.key!==expectedKey) throw new Error('matrix run key is invalid');
  requiredString(result.experimentId,'matrix result Experiment resourceId');
  requiredPositiveInteger(result.round,'matrix result round');
  requiredTimestamp(result.startedAt,'matrix result startedAt');
  requiredTimestamp(result.finishedAt,'matrix result finishedAt');
  if (!result.checks || typeof result.checks!=='object') throw new Error('matrix result checks are required');
  for (const field of [
    'panelWorkflowsStarted','experimentActive','stopOwnedWorkZero','noRuntimeErrors',
    'noRetiredWorkflowRouteRequests',
  ]) {
    if (typeof result.checks[field]!=='boolean') throw new Error(`matrix result check ${field} is invalid`);
  }
  if (result.mode==='simulation') {
    if (result.outcome==='blocked-hardware') throw new Error('simulation cannot be hardware-blocked');
    if (result.outcome==='passed') assertSimulationBrowserEvidence(result.browserEvidence);
  } else if (result.outcome==='passed') {
    throw new Error('physical and hybrid cells cannot claim full pass from lifecycle-only evidence');
  }
  if (!Array.isArray(result.errors)) throw new Error('matrix result errors are required');
  return result;
}

export function assertSimulationBrowserEvidence(evidence) {
  if (evidence?.contract!==LOCAL_FLEET_MATRIX_BROWSER_EVIDENCE.contract
    || evidence?.supportModule!==LOCAL_FLEET_MATRIX_BROWSER_EVIDENCE.supportModule
    || evidence.status!=='captured'
    || typeof evidence.screenshotPath!=='string' || evidence.screenshotPath.length===0
    || !Array.isArray(evidence.sampleIds) || evidence.sampleIds.length<2) {
    throw new Error('simulation browser evidence attachment is invalid');
  }
  return evidence;
}

function failedMatrixResult(run,cause) {
  const timestamp=new Date().toISOString();
  return {
    key:run.key,lane:run.lane,mode:run.mode,round:run.round,experimentId:run.experimentId,
    outcome:'failed',startedAt:timestamp,finishedAt:timestamp,runId:'',
    checks:{
      panelWorkflowsStarted:false,experimentActive:false,stopOwnedWorkZero:false,noRuntimeErrors:false,
      noUserScriptExecution:run.mode==='simulation' ? null : false,
      noRetiredWorkflowRouteRequests:false,
    },
    browserEvidence:null,
    observation:null,
    stop:null,
    retiredWorkflowRouteRequests:[],
    errors:[normalizeErrorEvidence(cause)],
  };
}

function receiptStatus({ finished,plannedRuns,completedRuns,remainingRuns,counts,errors }) {
  if (!finished) return 'running';
  if (errors.length>0 || counts.failed>0) return 'failed';
  if (plannedRuns===0 || remainingRuns>0 || completedRuns!==plannedRuns) return 'incomplete';
  const limited=counts.blockedHardware+counts.lifecycleOnly;
  if (limited===completedRuns) return 'blocked';
  if (limited>0) return 'partial';
  return 'passed';
}

function requiredModes(value) {
  if (!Array.isArray(value) || value.length===0) throw new Error('discovery runModes are required');
  const modes=value.map(requiredMode);
  if (new Set(modes).size!==modes.length) throw new Error('discovery runModes must be unique');
  return modes;
}

function requiredMode(value) {
  const mode=requiredString(value,'matrix run mode');
  if (!['simulation','physical','hybrid'].includes(mode)) throw new Error(`unknown matrix run mode ${mode}`);
  return mode;
}

function requiredHardwareState(value) {
  const normalized=requiredString(value,'matrix hardware state');
  if (!['absent','connected'].includes(normalized)) {
    throw new Error('matrix hardware state must be absent or connected');
  }
  return normalized;
}

function requiredString(value,label) {
  if (typeof value!=='string' || value.trim()==='') throw new Error(`${label} is required`);
  return value.trim();
}

function requiredPositiveInteger(value,label) {
  const normalized=typeof value==='number' ? value : Number.parseInt(String(value),10);
  if (!Number.isSafeInteger(normalized) || normalized<1) throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function requiredTimestamp(value,label) {
  const normalized=requiredString(value,label);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${label} must be an ISO timestamp`);
  return normalized;
}

function normalizeErrorEvidence(cause) {
  if (cause && typeof cause==='object' && typeof cause.message==='string') {
    return { name:typeof cause.name==='string' ? cause.name : 'Error',message:cause.message };
  }
  return { name:'Error',message:String(cause) };
}
