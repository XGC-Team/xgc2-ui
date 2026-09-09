#!/usr/bin/env node
/* global console,process,setTimeout,URL */

import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { chromium } from '@playwright/test';
import {
  installBrowserResourceProbe,
  openBrowserResourceDiagnostics,
} from './browser-resource-diagnostics.mjs';
import {
  activeSystemRunnerForExperiment,
  assertNoActiveSystemRunner,
  completedExperimentStopEvidence,
  experimentRunClosure,
  experimentSessions,
  getJSON,
  orchestrationRun,
  resolveManagedFixture,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';
import {
  buildRepeatedModeMatrix,
  fixtureLanePlans,
  resolveLaneRunModes,
  validateRepeatRounds,
} from './six-experiments-mode-matrix.mjs';
import {
  assertNoRetiredWorkflowRouteRequests,
  recordRetiredWorkflowRouteRequest,
} from './retired-workflow-route-ledger.mjs';
import {
  LOCAL_FLEET_MATRIX_BROWSER_EVIDENCE,
  MatrixCellError,
  buildLocalFleetMatrix,
  createMatrixReceipt,
  executeMatrixPlan,
  parseFailureMode,
  parseSingleCellFilter,
} from './local-fleet-experiment-e2e-matrix-support.mjs';

const ACTIVE_RUN_STATUSES=new Set(['accepted','queued','running','waiting','stopping']);
const STARTED_WORKFLOW_STATUSES=new Set(['accepted','queued','running','waiting','succeeded']);
const PROHIBITED_PRE_STOP_STATUSES=new Set(['failed','rejected','canceled','stopped','stopping']);

const options=parseOptions(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const exitCode=await runMatrix(options).catch((cause) => {
  console.error(cause instanceof Error ? cause.stack || cause.message : String(cause));
  return 1;
});
process.exitCode=exitCode;

async function runMatrix(configuration) {
  mkdirSync(dirname(configuration.receiptPath),{ recursive:true });
  const screenshotDirectory=`${configuration.receiptPath}.screenshots`;
  mkdirSync(screenshotDirectory,{ recursive:true });
  const startedAt=new Date().toISOString();
  let browser;
  let context;
  let page;
  let browserResources;
  let discovery=[];
  let plan=emptyPlan(configuration);
  let results=[];
  let fatalErrors=[];
  let activeCell='preflight';
  const pageErrors=[];
  const consoleErrors=[];
  const retiredWorkflowRouteRequests=[];

  const writeReceipt=(finishedAt='') => {
    const diagnostics=browserResources?.diagnostics
      ? { ...browserResources.diagnostics,pageErrors,consoleErrors,retiredWorkflowRouteRequests }
      : {
        contract:'browser-resource-diagnostics-v1',samples:[],pageErrors,consoleErrors,
        retiredWorkflowRouteRequests,
      };
    const receipt=createMatrixReceipt({
      configuration,discovery,plan,results,browserDiagnostics:diagnostics,
      errors:fatalErrors,startedAt,finishedAt,
    });
    writeFileSync(configuration.receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
    return receipt;
  };

  try {
    const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
      chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
      '/usr/bin/chromium','/usr/bin/chromium-browser',
    ].find((candidate) => candidate && existsSync(candidate));
    browser=await chromium.launch(executablePath ? { executablePath } : {});
    context=await browser.newContext({ viewport:{ width:1600,height:1000 } });
    await context.addInitScript(installBrowserResourceProbe);
    page=await context.newPage();
    browserResources=await openBrowserResourceDiagnostics({ browser,context,page,executablePath });
    page.on('pageerror',(error) => pageErrors.push({ cell:activeCell,message:error.message }));
    page.on('console',(message) => {
      if (message.type()==='error') {
        consoleErrors.push({ cell:activeCell,message:message.text(),location:message.location() });
      }
    });
    page.on('request',(request) => {
      recordRetiredWorkflowRouteRequest(retiredWorkflowRouteRequests,request,activeCell);
    });

    const recipes=JSON.parse(readFileSync(
      new URL('../../local-fleet-lab/experiment-fixture-recipes.json',import.meta.url),'utf8',
    )).recipes;
    const lanes=[];
    for (const fixturePlan of fixtureLanePlans(recipes)) {
      const experiment=await resolveManagedFixture(context,configuration.webUrl,fixturePlan);
      lanes.push(resolveLaneRunModes(fixturePlan,experiment));
    }
    discovery=lanes.map((lane) => ({
      lane:lane.key,name:lane.name,experimentId:lane.experiment.head.resourceId,runModes:lane.modes,
    }));
    plan=buildLocalFleetMatrix(lanes,{
      repeatRounds:configuration.repeatRounds,
      cellFilter:configuration.cellFilter,
      buildRepeatedModeMatrix,
    });
    writeReceipt();
    await assertNoActiveSystemRunner(context,configuration.webUrl);

    const execution=await executeMatrixPlan(plan,{
      failureMode:configuration.failureMode,
      executeCell:async (run) => {
        activeCell=`${run.key}/round-${run.round}`;
        console.log(`BEGIN ${activeCell}`);
        const result=await runCell({
          run,page,context,browserResources,configuration,screenshotDirectory,
          pageErrors,consoleErrors,retiredWorkflowRouteRequests,
        });
        console.log(`${result.outcome.toUpperCase()} ${activeCell}`);
        return result;
      },
      onResult:async (_result,currentResults) => {
        results=currentResults;
        writeReceipt();
      },
    });
    results=[...execution.results];
    assertNoRetiredWorkflowRouteRequests(retiredWorkflowRouteRequests,{
      scope:'local-fleet exact-cell browser matrix',
    });
    const receipt=writeReceipt(new Date().toISOString());
    console.log(`RECEIPT ${configuration.receiptPath}`);
    console.log(`STATUS ${receipt.status} ${receipt.summary.completedRuns}/${receipt.summary.plannedRuns}`);
    if (receipt.status==='passed') return 0;
    if (['blocked','partial'].includes(receipt.status)) return 2;
    return 1;
  } catch (cause) {
    fatalErrors=[...fatalErrors,errorEvidence(cause)];
    const receipt=writeReceipt(new Date().toISOString());
    console.error(`FAILED ${receipt.status}: ${fatalErrors.at(-1).message}`);
    return 1;
  } finally {
    await browserResources?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function runCell({
  run,page,context,browserResources,configuration,screenshotDirectory,pageErrors,consoleErrors,
  retiredWorkflowRouteRequests,
}) {
  const startedAt=new Date().toISOString();
  const result={
    key:run.key,lane:run.lane,mode:run.mode,round:run.round,experimentId:run.experimentId,
    outcome:'failed',startedAt,finishedAt:startedAt,runId:'',
    checks:{
      panelWorkflowsStarted:false,experimentActive:false,stopOwnedWorkZero:false,noRuntimeErrors:false,
      noUserScriptExecution:run.mode==='simulation' ? null : false,
      noRetiredWorkflowRouteRequests:false,
    },
    start:null,browserEvidence:null,observation:null,stop:null,retiredWorkflowRouteRequests:[],errors:[],
  };
  let acceptedRunId='';
  let stopped=false;
  const pageErrorStart=pageErrors.length;
  const consoleErrorStart=consoleErrors.length;
  const retiredRouteRequestStartIndex=retiredWorkflowRouteRequests.length;
  const sampleIds=[];
  try {
    await openExperimentCell(page,configuration.webUrl,run);
    if (run.mode==='simulation') {
      sampleIds.push((await browserResources.capture(run.key,`round-${run.round}-before-start`)).id);
    }
    const started=await startExperimentThroughUI({
      page,context,webUrl:configuration.webUrl,experiment:run.experiment,runMode:run.mode,
      onAccepted:(accepted) => {
        acceptedRunId=accepted.id;
        result.runId=acceptedRunId;
      },
    });
    result.start={
      responseStatus:started.responseStatus,durableBoundaryAt:started.durableBoundaryAt,
      dispatchLatencyMs:started.dispatchLatencyMs,observationLatencyMs:started.observationLatencyMs,
      phaseLatencyMs:started.phaseLatencyMs,
    };
    const observation=await observeActiveCell({
      context,webUrl:configuration.webUrl,run,started,hardware:configuration.hardware,
      stabilityMs:configuration.stabilityMs,
    });
    result.observation=observation;
    result.checks.panelWorkflowsStarted=true;
    result.checks.experimentActive=true;
    result.checks.noRuntimeErrors=true;
    if (run.mode!=='simulation') result.checks.noUserScriptExecution=true;

    if (run.mode==='simulation') {
      sampleIds.push((await browserResources.capture(run.key,`round-${run.round}-active`)).id);
      const screenshotPath=join(
        screenshotDirectory,
        `${run.lane}-${run.mode}-round-${String(run.round).padStart(2,'0')}.png`,
      );
      await page.screenshot({ path:screenshotPath,fullPage:true });
      result.browserEvidence={
        ...LOCAL_FLEET_MATRIX_BROWSER_EVIDENCE,
        status:'captured',screenshotPath,sampleIds,
      };
    }

    try {
      const stoppedEvidence=await stopExperimentThroughUI({
        page,context,webUrl:configuration.webUrl,experiment:run.experiment,
        runId:acceptedRunId,timeoutMs:configuration.waitMs,
      });
      stopped=true;
      result.stop=await assertOwnedWorkZero({
        context,webUrl:configuration.webUrl,experimentId:run.experimentId,
        runId:acceptedRunId,stoppedEvidence,
      });
      result.checks.stopOwnedWorkZero=true;
    } catch (stopCause) {
      const stoppedEvidence=completedExperimentStopEvidence(stopCause);
      if (stoppedEvidence) {
        stopped=true;
        result.stop=await assertOwnedWorkZero({
          context,webUrl:configuration.webUrl,experimentId:run.experimentId,
          runId:acceptedRunId,stoppedEvidence,
        });
        result.checks.stopOwnedWorkZero=true;
      }
      throw stopCause;
    }
    if (run.mode==='simulation') {
      sampleIds.push((await browserResources.capture(run.key,`round-${run.round}-after-stop`)).id);
      result.browserEvidence={ ...result.browserEvidence,sampleIds };
    }
    assertNoNewBrowserErrors({ pageErrors,consoleErrors,pageErrorStart,consoleErrorStart,cell:run.key });
    result.retiredWorkflowRouteRequests=assertNoRetiredWorkflowRouteRequests(
      retiredWorkflowRouteRequests,{
        startIndex:retiredRouteRequestStartIndex,
        scope:`${run.key}/round-${run.round}`,
      },
    );
    result.checks.noRetiredWorkflowRouteRequests=true;
    result.outcome=run.mode==='simulation'
      ? 'passed'
      : configuration.hardware==='absent' ? 'blocked-hardware' : 'lifecycle-only';
    result.finishedAt=new Date().toISOString();
    return result;
  } catch (cause) {
    if (acceptedRunId && !stopped) {
      try {
        const cleanup=await stopExperimentThroughUI({
          page,context,webUrl:configuration.webUrl,experiment:run.experiment,
          runId:acceptedRunId,timeoutMs:configuration.waitMs,
        });
        stopped=true;
        result.stop=await assertOwnedWorkZero({
          context,webUrl:configuration.webUrl,experimentId:run.experimentId,
          runId:acceptedRunId,stoppedEvidence:cleanup,
        });
        result.checks.stopOwnedWorkZero=true;
      } catch (cleanupCause) {
        const cleanup=completedExperimentStopEvidence(cleanupCause);
        if (cleanup) {
          result.stop=await assertOwnedWorkZero({
            context,webUrl:configuration.webUrl,experimentId:run.experimentId,
            runId:acceptedRunId,stoppedEvidence:cleanup,
          });
          result.checks.stopOwnedWorkZero=true;
        }
        result.errors.push(errorEvidence(cleanupCause,'cleanup'));
      }
    }
    result.outcome='failed';
    result.finishedAt=new Date().toISOString();
    result.errors.unshift(errorEvidence(cause,'cell'));
    throw new MatrixCellError(`${run.key} round ${run.round} failed`,result,{ cause });
  }
}

async function openExperimentCell(page,webUrl,run) {
  const target=`${webUrl}/#/experiments/${run.experimentId}`;
  const current=new URL(page.url());
  if (run.round>1 && current.href===target) {
    await page.reload({ waitUntil:'domcontentloaded',timeout:30_000 });
  } else {
    await page.goto(target,{ waitUntil:'domcontentloaded',timeout:30_000 });
  }
  await page.locator('[data-xgc-role="experiment-topbar-actions"]').waitFor({ state:'visible',timeout:30_000 });
  await page.locator('[data-xgc-role="experiment-state-loading"]').waitFor({ state:'detached',timeout:30_000 })
    .catch(() => undefined);
  const root=page.locator(
    `[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${run.experimentId}"]`,
  );
  await root.waitFor({ state:'visible',timeout:30_000 });
  if (await root.getAttribute('data-disabled')==='true') throw new Error(`${run.key} mode selector is disabled`);
  await root.getByRole('button').click({ timeout:30_000 });
  await page.getByRole('option',{ name:run.mode,exact:true }).click({ timeout:30_000 });
  await page.locator(
    `[data-xgc-role="experiment-run-mode"][data-xgc-id="${run.experimentId}"][data-xgc-value="${run.mode}"]`,
  ).waitFor({ state:'visible',timeout:30_000 });
}

async function observeActiveCell({ context,webUrl,run,started,hardware,stabilityMs }) {
  const first=await waitFor(
    () => activeSnapshot({ context,webUrl,run,started,hardware }),
    Math.max(10_000,stabilityMs*4),
    `${run.key} did not reach an active Panel Workflow boundary`,
  );
  await new Promise((resolveDelay) => setTimeout(resolveDelay,stabilityMs));
  const second=await activeSnapshot({ context,webUrl,run,started,hardware });
  if (!second) throw new Error(`${run.key} lost its active Panel Workflow boundary during stability window`);
  return {
    rootStatus:second.root.status,
    managedBindingIds:started.managedBindingIds,
    childRuns:second.managedRuns.map(runEvidence),
    activeWorkflowCount:second.activeManagedRuns.length,
    waitingWorkflowCount:second.waitingManagedRuns.length,
    closureRunCount:second.closureRuns.length,
    userScriptExecutionCount:second.userScriptExecutions.length,
    stabilityMs,
    samples:[first.sampledAt,second.sampledAt],
  };
}

async function activeSnapshot({ context,webUrl,run,started,hardware }) {
  if (started.managedBindingIds.length===0) {
    throw new Error(`${run.key} exposes no managed Panel Workflow bindings`);
  }
  const root=await orchestrationRun(context,webUrl,started.run.id);
  if (root.status!=='waiting' || root.primaryError) {
    throw new Error(`${run.key} System Runner is not cleanly waiting: ${JSON.stringify(runEvidence(root))}`);
  }
  const activeRoot=await activeSystemRunnerForExperiment(context,webUrl,run.experimentId);
  if (activeRoot?.id!==started.run.id) return undefined;
  const childRelations=new Map((started.relations.childRuns ?? []).map((child) => [child.childRunId,child]));
  if (started.dispatchMembers.length!==started.managedBindingIds.length) return undefined;
  const managedRuns=[];
  for (const member of started.dispatchMembers) {
    const child=childRelations.get(member.childRunId);
    if (!child) return undefined;
    const targetId=child.targetId || 'local';
    managedRuns.push(await getJSON(
      context,webUrl,
      `/api/execution-targets/${encodeURIComponent(targetId)}/orchestration-runs/${encodeURIComponent(member.childRunId)}`,
    ));
  }
  if (managedRuns.length!==started.managedBindingIds.length
    || managedRuns.some((child) => !STARTED_WORKFLOW_STATUSES.has(child.status))) return undefined;
  const activeManagedRuns=managedRuns.filter((child) => ACTIVE_RUN_STATUSES.has(child.status));
  if (activeManagedRuns.length===0) return undefined;
  const waitingManagedRuns=managedRuns.filter((child) => child.status==='waiting');
  if (run.mode!=='simulation' && hardware==='absent' && waitingManagedRuns.length===0) return undefined;

  const closureRuns=await readRunClosure(context,webUrl,started.run.id);
  const prohibited=closureRuns.filter((child) => (
    PROHIBITED_PRE_STOP_STATUSES.has(child.status) || Boolean(child.primaryError)
  ));
  if (prohibited.length>0) {
    throw new Error(`${run.key} produced errored or prematurely stopped Runs: ${JSON.stringify(prohibited.map(runEvidence))}`);
  }
  const userScriptExecutions=run.mode==='simulation'
    ? []
    : await readUserScriptExecutions(context,webUrl,closureRuns);
  if (userScriptExecutions.length>0) {
    throw new Error(`${run.key} executed user.script outside simulation: ${JSON.stringify(userScriptExecutions)}`);
  }
  return {
    sampledAt:new Date().toISOString(),root,managedRuns,activeManagedRuns,waitingManagedRuns,
    closureRuns,userScriptExecutions,
  };
}

async function readRunClosure(context,webUrl,rootRunId) {
  const identities=await experimentRunClosure(context,webUrl,rootRunId);
  const runs=[];
  for (let index=0;index<identities.length;index+=8) {
    const batch=identities.slice(index,index+8);
    runs.push(...await Promise.all(batch.map(async ({ targetId,runId }) => ({
      ...await getJSON(
        context,webUrl,
        `/api/execution-targets/${encodeURIComponent(targetId)}/orchestration-runs/${encodeURIComponent(runId)}`,
      ),
      targetId,
    }))));
  }
  return runs;
}

async function readUserScriptExecutions(context,webUrl,runs) {
  const executions=[];
  for (let index=0;index<runs.length;index+=8) {
    const batch=runs.slice(index,index+8);
    const summariesBatch=await Promise.all(batch.map((run) => getJSON(
      context,webUrl,
      `/api/execution-targets/${encodeURIComponent(run.targetId || 'local')}`
        + `/orchestration-runs/${encodeURIComponent(run.id)}/node-summaries`,
    )));
    summariesBatch.forEach((summaries,batchIndex) => {
      const currentRun=batch[batchIndex];
      for (const summary of summaries) {
        if (summary.kind==='user.script' && Number(summary.occurrenceCount)>0) {
          executions.push({
            targetId:currentRun.targetId || 'local',runId:currentRun.id,
            nodeId:summary.nodeId,status:summary.status,occurrenceCount:summary.occurrenceCount,
            failedOccurrenceCount:summary.failedOccurrenceCount,
          });
        }
      }
    });
  }
  return executions;
}

async function assertOwnedWorkZero({ context,webUrl,experimentId,runId,stoppedEvidence }) {
  const activeRoot=await activeSystemRunnerForExperiment(context,webUrl,experimentId);
  const sessions=await experimentSessions(context,webUrl,experimentId);
  const closureRuns=await readRunClosure(context,webUrl,runId);
  const activeRuns=closureRuns.filter((run) => ACTIVE_RUN_STATUSES.has(run.status));
  const activeProcesses=stoppedEvidence.ownedProcesses.filter((process) => (
    process.desiredState!=='stopped' || process.observedState!=='stopped'
  ));
  const activeOwnedWorkCount=(activeRoot ? 1 : 0)+sessions.length+activeRuns.length+activeProcesses.length;
  if (activeOwnedWorkCount!==0) {
    throw new Error(`Stop retained owned work: ${JSON.stringify({
      activeRoot:activeRoot?.id || '',sessions:sessions.length,
      activeRuns:activeRuns.map(runEvidence),activeProcesses,
    })}`);
  }
  return {
    responseStatus:stoppedEvidence.responseStatus,
    rootStatus:stoppedEvidence.run.status,
    sessionCount:sessions.length,
    activeRunCount:activeRuns.length,
    activeProcessCount:activeProcesses.length,
    activeOwnedWorkCount,
    backendFinal:stoppedEvidence.backendFinal,
    uiRunControlRecovery:stoppedEvidence.uiRunControlRecovery,
    ownedProcesses:stoppedEvidence.ownedProcesses.map((process) => ({
      id:process.id,targetId:process.targetId,definitionId:process.definitionId,
      desiredState:process.desiredState,observedState:process.observedState,
    })),
  };
}

function assertNoNewBrowserErrors({ pageErrors,consoleErrors,pageErrorStart,consoleErrorStart,cell }) {
  const newPageErrors=pageErrors.slice(pageErrorStart);
  const newConsoleErrors=consoleErrors.slice(consoleErrorStart);
  if (newPageErrors.length>0 || newConsoleErrors.length>0) {
    throw new Error(`${cell} browser errors: ${JSON.stringify({ newPageErrors,newConsoleErrors })}`);
  }
}

function runEvidence(run) {
  return {
    id:run?.id || '',targetId:run?.targetId || 'local',status:run?.status || '',
    automationResourceId:run?.automationResourceId || '',
    sourceRef:run?.sourceRef || null,primaryError:run?.primaryError || '',reason:run?.reason || '',
  };
}

function emptyPlan(configuration) {
  return {
    repeatRounds:configuration.repeatRounds,cellFilter:configuration.cellFilter,
    canonicalCellCount:0,canonicalRunCount:0,baseCells:[],selectedCells:[],runs:[],
  };
}

function parseOptions(argv) {
  const values={
    webUrl:process.env.XGC_LOCAL_FLEET_MATRIX_WEB_URL || 'http://127.0.0.1:5174',
    receiptPath:process.env.XGC_LOCAL_FLEET_MATRIX_EVIDENCE || '',
    cellFilter:process.env.XGC_LOCAL_FLEET_MATRIX_CELL || '',
    repeatRounds:process.env.XGC_LOCAL_FLEET_MATRIX_REPEAT || '3',
    failureMode:process.env.XGC_LOCAL_FLEET_MATRIX_FAILURE_MODE || 'fail-fast',
    hardware:process.env.XGC_LOCAL_FLEET_MATRIX_HARDWARE || 'absent',
    waitMs:process.env.XGC_LOCAL_FLEET_MATRIX_WAIT_MS || '180000',
    stabilityMs:process.env.XGC_LOCAL_FLEET_MATRIX_STABILITY_MS || '1500',
    help:false,
  };
  for (let index=0;index<argv.length;index+=1) {
    const argument=argv[index];
    if (argument==='--help' || argument==='-h') values.help=true;
    else if (argument==='--continue') values.failureMode='continue';
    else if (argument==='--fail-fast') values.failureMode='fail-fast';
    else if (argument.startsWith('--cell=')) values.cellFilter=argument.slice('--cell='.length);
    else if (argument==='--cell') values.cellFilter=nextArgument(argv,++index,'--cell');
    else if (argument.startsWith('--repeat=')) values.repeatRounds=argument.slice('--repeat='.length);
    else if (argument==='--repeat') values.repeatRounds=nextArgument(argv,++index,'--repeat');
    else if (argument.startsWith('--receipt=')) values.receiptPath=argument.slice('--receipt='.length);
    else if (argument==='--receipt') values.receiptPath=nextArgument(argv,++index,'--receipt');
    else if (argument.startsWith('--web-url=')) values.webUrl=argument.slice('--web-url='.length);
    else if (argument==='--web-url') values.webUrl=nextArgument(argv,++index,'--web-url');
    else if (argument.startsWith('--hardware=')) values.hardware=argument.slice('--hardware='.length);
    else if (argument==='--hardware') values.hardware=nextArgument(argv,++index,'--hardware');
    else if (argument.startsWith('--wait-ms=')) values.waitMs=argument.slice('--wait-ms='.length);
    else if (argument.startsWith('--stability-ms=')) values.stabilityMs=argument.slice('--stability-ms='.length);
    else throw new Error(`unknown argument ${argument}`);
  }
  if (values.help) return values;
  const receiptPath=requiredString(values.receiptPath,'--receipt or XGC_LOCAL_FLEET_MATRIX_EVIDENCE');
  return Object.freeze({
    webUrl:requiredURL(values.webUrl),receiptPath:resolve(receiptPath),
    cellFilter:parseSingleCellFilter(values.cellFilter),
    repeatRounds:validateRepeatRounds(values.repeatRounds),
    failureMode:parseFailureMode(values.failureMode),
    hardware:requiredHardwareState(values.hardware),
    waitMs:positiveInteger(values.waitMs,'matrix wait ms'),
    stabilityMs:positiveInteger(values.stabilityMs,'matrix stability ms'),
    help:false,
  });
}

function usage() {
  return [
    'Usage: npm run test:live:local-fleet-experiment-matrix -- --receipt PATH [options]',
    '',
    'Options:',
    '  --cell LANE/MODE     Run one canonical cell (still repeat=3 by default)',
    '  --repeat N           Repeat every selected cell at least three times',
    '  --fail-fast          Stop after the first failed round (default)',
    '  --continue           Continue after failed rounds and preserve all evidence',
    '  --hardware STATE     absent (default) or connected; non-simulation never claims full pass',
    '  --web-url ORIGIN     Existing local-fleet Vite origin (default http://127.0.0.1:5174)',
    '  --wait-ms N          Stop/cleanup timeout in milliseconds',
    '  --stability-ms N     Active waiting stability observation window',
    '',
    'This command never starts or restarts the dev environment.',
  ].join('\n');
}

function nextArgument(argv,index,name) {
  const value=argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function requiredURL(value) {
  const parsed=new URL(requiredString(value,'matrix web URL'));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname!=='/' || parsed.search || parsed.hash) {
    throw new Error('matrix web URL must be an HTTP origin');
  }
  return parsed.origin;
}

function requiredHardwareState(value) {
  const normalized=requiredString(value,'matrix hardware state');
  if (!['absent','connected'].includes(normalized)) {
    throw new Error('matrix hardware state must be absent or connected');
  }
  return normalized;
}

function positiveInteger(value,label) {
  const normalized=Number.parseInt(String(value),10);
  if (!Number.isSafeInteger(normalized) || normalized<1) throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function requiredString(value,label) {
  if (typeof value!=='string' || value.trim()==='') throw new Error(`${label} is required`);
  return value.trim();
}

function errorEvidence(cause,phase='harness') {
  return {
    phase,name:cause instanceof Error ? cause.name : 'Error',
    message:cause instanceof Error ? cause.message : String(cause),
  };
}
