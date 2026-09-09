/* global console,process,setTimeout,structuredClone,URL */
import { randomUUID } from 'node:crypto';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';
import {
  SYSTEM_EXPERIMENT_RUNNER,
  assertNoActiveSystemRunner,
  clickAndWaitForPageResponse,
  experimentRunClosure,
  getJSON,
  orchestrationRun,
  startExperimentThroughUI,
  stopExperimentThroughUI,
  waitFor,
} from './experiment-system-runner-e2e.mjs';
import {
  USER_ALGORITHM_PANEL_LANES,
  archiveConfigurationRequest,
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
  isRunActive,
  multiBindingPanelSelectors,
  normalizeE2EMarker,
  panelSelectors,
  resolveLaneExperiment,
} from './user-algorithm-panel-contract.mjs';

const mutationConsent=required('XGC_USER_ALGORITHM_PANEL_E2E_MUTATE');
if (mutationConsent!=='disposable-local-fleet') {
  throw new Error('XGC_USER_ALGORITHM_PANEL_E2E_MUTATE must equal disposable-local-fleet');
}
if (required('XGC_USER_ALGORITHM_PANEL_E2E_FULL_SESSION')!=='1') {
  throw new Error('XGC_USER_ALGORITHM_PANEL_E2E_FULL_SESSION=1 is required for the Session-member acceptance phase');
}
if (process.env.XGC_USER_ALGORITHM_PANEL_E2E_MULTI_BINDING?.trim()!=='1') {
  throw new Error('XGC_USER_ALGORITHM_PANEL_E2E_MULTI_BINDING=1 is required for the same-Panel multi-binding phase');
}

const webUrl=requiredURL('XGC_USER_ALGORITHM_PANEL_E2E_WEB_URL','http://127.0.0.1:5174');
const apiUrl=requiredURL('XGC_USER_ALGORITHM_PANEL_E2E_API_URL',webUrl);
const evidencePath=required('XGC_USER_ALGORITHM_PANEL_E2E_EVIDENCE');
const waitTimeoutMs=positiveInteger('XGC_USER_ALGORITHM_PANEL_E2E_WAIT_MS',240_000);
const marker=normalizeE2EMarker(process.env.XGC_USER_ALGORITHM_PANEL_E2E_MARKER
  || `e2e-${randomUUID().replaceAll('-','').slice(0,12)}`);
const stationToken=process.env.XGC_STATION_TOKEN?.trim() || '';
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));

mkdirSync(dirname(evidencePath),{ recursive:true });
const screenshotDirectory=`${evidencePath}.screenshots`;
mkdirSync(screenshotDirectory,{ recursive:true });
const browser=await chromium.launch(executablePath ? { executablePath } : {});
const context=await browser.newContext({
  viewport:{ width:1600,height:1000 },
  ...(stationToken ? { extraHTTPHeaders:{ 'X-XGC-Station-Token':stationToken } } : {}),
});
const page=await context.newPage();
const pageErrors=[];
const consoleErrors=[];
page.on('pageerror',(error) => pageErrors.push(error.message));
page.on('console',(message) => {
  if (message.type()==='error') consoleErrors.push({ text:message.text(),location:message.location() });
});

const report={
  schemaVersion:1,marker,webUrl,apiUrl,startedAt:new Date().toISOString(),
  authoring:{ userScripts:[],automation:null,experiments:[] },
  lanes:[],cleanup:{ roots:[],experiments:[],resources:[],errors:[] },
  pageErrors,consoleErrors,
};
const acceptedRoots=new Map();
const authoredLanes=[];
const createdResources=[];

try {
  const documents=await getJSON(context,apiUrl,'/api/experiments');
  const laneStates=USER_ALGORITHM_PANEL_LANES.map((lane) => ({
    lane,original:resolveLaneExperiment(lane,documents),fixtures:[],multiBinding:undefined,
    experiment:undefined,authoredSpec:undefined,
  }));
  await assertNoActiveSystemRunner(context,apiUrl);
  for (const state of laneStates) await assertNoActiveExperimentSession(state.original.head.resourceId);
  await assertNodeCatalog();

  const scriptSpecs=buildProbeUserScriptSpecs(marker);
  const compileAsset=await createResource('/api/usernode-assets','usernode',scriptSpecs.compile,'compile');
  const runtimeAsset=await createResource('/api/usernode-assets','usernode',scriptSpecs.runtime,'runtime');
  const automationSpec=buildProbeAutomationSpec({
    marker,compileAssetId:compileAsset.head.resourceId,runtimeAssetId:runtimeAsset.head.resourceId,
  });
  const automation=await createResource('/api/automations','automation',automationSpec,'automation');
  report.authoring.automation=resourceEvidence(automation);

  for (const state of laneStates) {
    state.fixtures=buildLanePanelFixtures({
      lane:state.lane,automationResourceId:automation.head.resourceId,marker,
    });
    state.multiBinding=buildMultiBindingPanelFixture({
      lane:state.lane,automationResourceId:automation.head.resourceId,marker,
    });
    const requestedSpec=attachLanePanelFixtures(state.original,[...state.fixtures,state.multiBinding]);
    state.experiment=await commitExperiment(state.original,requestedSpec,`attach-${state.lane.key}`,
      `Attach disposable ${state.lane.label} user Algorithm Panels`);
    state.authoredSpec=structuredClone(state.experiment.spec);
    authoredLanes.push(state);
    report.authoring.experiments.push({
      lane:state.lane.key,resourceId:state.experiment.head.resourceId,
      originalCommitId:state.original.branch.headCommitId,authoredCommitId:state.experiment.branch.headCommitId,
      panelIds:[...state.fixtures,state.multiBinding].map(({ panel }) => panel.id),
    });
    writeReport();
  }

  for (const state of laneStates) {
    const laneEvidence={ lane:state.lane.key,panelRuns:[],multiBindingRuns:[],fullSession:null };
    report.lanes.push(laneEvidence);
    await openLane(state);
    await assertPanelRoster(state);
    for (const mode of ['physical','hybrid']) {
      for (const fixture of state.fixtures) {
        laneEvidence.panelRuns.push(await runPanelCase(state,fixture,mode,{
          compileAssetId:compileAsset.head.resourceId,runtimeAssetId:runtimeAsset.head.resourceId,
        }));
        writeReport();
      }
    }
    laneEvidence.panelRuns.push(await runPanelCase(state,state.fixtures[0],'simulation',{
      compileAssetId:compileAsset.head.resourceId,runtimeAssetId:runtimeAsset.head.resourceId,
    }));
    laneEvidence.panelRuns.push(await runPanelCase(state,state.fixtures[1],'simulation',{
      compileAssetId:compileAsset.head.resourceId,runtimeAssetId:runtimeAsset.head.resourceId,
    }));
    for (const binding of state.multiBinding.bindings) {
      laneEvidence.multiBindingRuns.push(await runMultiBindingCase(state,binding,{
        compileAssetId:compileAsset.head.resourceId,runtimeAssetId:runtimeAsset.head.resourceId,
      }));
    }
    laneEvidence.fullSession=await runFullSessionCase(state,{
      compileAssetId:compileAsset.head.resourceId,runtimeAssetId:runtimeAsset.head.resourceId,
    });
    writeReport();
  }

  if (pageErrors.length>0) throw new Error(`browser page errors: ${JSON.stringify(pageErrors)}`);
  if (consoleErrors.length>0) throw new Error(`browser console errors: ${JSON.stringify(consoleErrors)}`);
  report.outcome='PASS';
} catch (cause) {
  report.outcome='FAIL';
  report.failure={ message:messageOf(cause),url:page.url() };
  await page.screenshot({ path:`${evidencePath}.failure.png`,fullPage:true }).catch(() => undefined);
  throw cause;
} finally {
  await cleanupAcceptedRoots();
  await restoreExperiments();
  await archiveCreatedResources();
  report.finishedAt=new Date().toISOString();
  writeReport();
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}
if (report.cleanup.errors.length>0) {
  report.outcome='FAIL';
  report.failure={ message:`cleanup failed: ${JSON.stringify(report.cleanup.errors)}`,url:page.url() };
  writeReport();
  throw new Error(report.failure.message);
}

async function createResource(path,domain,spec,label) {
  const requestId=`${marker}-${label}-create`;
  const document=assertOrdinaryCreatedResource(await api('POST',path,
    createConfigurationRequest(spec,{ requestId,reason:`Create disposable ${label} acceptance resource` }),[201]),domain);
  createdResources.push({ path,domain,label,document,spec:structuredClone(document.spec) });
  if (domain==='usernode') report.authoring.userScripts.push(resourceEvidence(document));
  return document;
}

async function commitExperiment(document,spec,suffix,reason) {
  const requestId=`${marker}-${suffix}`;
  const path=`/api/experiments/${encodeURIComponent(document.head.resourceId)}/branches/main/commits`;
  return api('POST',path,commitConfigurationRequest(document,spec,{ requestId,reason }),[201]);
}

async function openLane(state) {
  await page.goto(`${webUrl}/#/experiments/${state.experiment.head.resourceId}`,{
    waitUntil:'domcontentloaded',timeout:30_000,
  });
  await page.getByRole('tab',{ name:'GCS',exact:true }).click();
  await page.locator('[data-xgc-role="experiment-dashboard-canvas"][data-xgc-id="gcs"]')
    .waitFor({ state:'visible',timeout:30_000 });
}

async function assertPanelRoster(state) {
  for (const { panel } of state.fixtures) {
    const selectors=panelSelectors(panel.id);
    await page.locator(selectors.frame).waitFor({ state:'visible',timeout:30_000 });
    await page.locator(selectors.run).waitFor({ state:'visible',timeout:30_000 });
    if (await page.locator(selectors.run).isDisabled()) {
      throw new Error(`${state.lane.key}/${panel.id} Run button is disabled before invocation`);
    }
  }
  for (const binding of state.multiBinding.bindings) {
    const selectors=multiBindingPanelSelectors(state.multiBinding.panel.id,binding.portId);
    await page.locator(selectors.actionInvoke).waitFor({ state:'visible',timeout:30_000 });
    if (await page.locator(selectors.actionInvoke).isDisabled()) {
      throw new Error(`${state.lane.key}/${state.multiBinding.panel.id}/${binding.portId} is disabled before invocation`);
    }
  }
}

async function runPanelCase(state,fixture,mode,{ compileAssetId,runtimeAssetId }) {
  await selectMode(state.experiment.head.resourceId,mode);
  const selectors=panelSelectors(fixture.panel.id);
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => {
      if (candidate.request().method()!=='POST'
        || new URL(candidate.url()).pathname!=='/api/execution-targets/local/orchestration-runs') return false;
      try {
        assertPanelRunRequest(candidate.request().postDataJSON(),state.experiment.head.resourceId,fixture.panel.id,mode);
        return true;
      } catch {
        return false;
      }
    },
    click:() => page.locator(selectors.run).click({ timeout:30_000 }),
  });
  const body=await responseJSON(response);
  if (response.status()!==202 || !body?.run) {
    throw new Error(`${state.lane.key}/${fixture.variant.key}/${mode} Panel Start HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  assertPanelRunRequest(response.request().postDataJSON(),state.experiment.head.resourceId,fixture.panel.id,mode);
  acceptedRoots.set(body.run.id,{ experiment:state.experiment,run:body.run,label:`panel:${fixture.panel.id}:${mode}` });
  const child=await resolveAlgorithmChild(body.run.id,body.run.targetId||'local');
  const failCompile=fixture.variant.failCompile;
  let stopped;
  if (mode==='simulation' && !failCompile) {
    const summaries=await waitFor(async () => {
      const current=await orchestrationRun(context,apiUrl,child.runId);
      if (!isRunActive(current.status)) return undefined;
      const values=await nodeSummaries(child.targetId,child.runId);
      try { assertUserScriptModeExecution(mode,values,{ failCompile }); } catch { return undefined; }
      return values;
    },waitTimeoutMs,`${state.lane.key} live Panel did not execute both user.script nodes`);
    await page.locator(selectors.stop).waitFor({ state:'visible',timeout:30_000 });
    const trace=await waitForPanelTrace(selectors,{ failCompile });
    const jobs=await waitForProbeJobs(child.targetId,child.runId,[compileAssetId,runtimeAssetId]);
    const logs=await readProbeJobLogs(child.targetId,jobs,{ lane:state.lane.key,failCompile:false });
    stopped=await stopPanelRoot(state,fixture,body.run.id,selectors);
    await assertNoActiveProbeJobs(child.targetId,child.runId);
    await waitForNoActiveExperimentSession(state.experiment.head.resourceId);
    acceptedRoots.delete(body.run.id);
    return panelCaseEvidence(state,fixture,mode,body.run,child,summaries,trace,jobs,logs,stopped);
  }

  const expectedStatus=mode==='simulation' ? 'failed' : 'succeeded';
  const terminal=await waitFor(async () => {
    const current=await orchestrationRun(context,apiUrl,child.runId);
    return current.status===expectedStatus ? current : undefined;
  },waitTimeoutMs,`${state.lane.key}/${fixture.variant.key}/${mode} child did not become ${expectedStatus}`);
  const summaries=await nodeSummaries(child.targetId,child.runId);
  assertUserScriptModeExecution(mode,summaries,{ failCompile });
  const trace=await waitForPanelTrace(selectors,{ failCompile:mode==='simulation' && failCompile });
  await page.locator(selectors.run).waitFor({ state:'visible',timeout:30_000 });
  if (await page.locator(selectors.stop).count()!==0) {
    throw new Error(`${state.lane.key}/${fixture.variant.key}/${mode} retained header Stop after terminal Run`);
  }
  const jobs=mode==='simulation'
    ? await waitForProbeJobs(child.targetId,child.runId,[compileAssetId])
    : await probeJobs(child.targetId,child.runId);
  if (mode!=='simulation' && jobs.length!==0) {
    throw new Error(`${state.lane.key}/${fixture.variant.key}/${mode} created ${jobs.length} user-script Jobs`);
  }
  const logs=mode==='simulation'
    ? await readProbeJobLogs(child.targetId,jobs,{ lane:state.lane.key,failCompile:true })
    : [];
  await waitFor(async () => {
    const root=await orchestrationRun(context,apiUrl,body.run.id);
    return isRunActive(root.status) ? undefined : root;
  },waitTimeoutMs,'Panel root stayed active after its child became terminal');
  acceptedRoots.delete(body.run.id);
  await waitForNoActiveExperimentSession(state.experiment.head.resourceId);
  return panelCaseEvidence(state,fixture,mode,body.run,{ ...child,run:terminal },summaries,trace,jobs,logs,stopped);
}

async function runMultiBindingCase(state,binding,{ compileAssetId,runtimeAssetId }) {
  const mode='simulation';
  const fixture=state.multiBinding;
  await selectMode(state.experiment.head.resourceId,mode);
  const selectors=multiBindingPanelSelectors(fixture.panel.id,binding.portId);
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => {
      if (candidate.request().method()!=='POST'
        || new URL(candidate.url()).pathname!=='/api/execution-targets/local/orchestration-runs') return false;
      try {
        assertPanelActionRequest(candidate.request().postDataJSON(),state.experiment.head.resourceId,
          fixture.panel.id,binding.presetId,mode);
        return true;
      } catch {
        return false;
      }
    },
    click:() => page.locator(selectors.actionInvoke).click({ timeout:30_000 }),
  });
  const body=await responseJSON(response);
  if (response.status()!==202 || !body?.run) {
    throw new Error(`${state.lane.key}/${fixture.panel.id}/${binding.portId} HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  assertPanelActionRequest(response.request().postDataJSON(),state.experiment.head.resourceId,
    fixture.panel.id,binding.presetId,mode);
  acceptedRoots.set(body.run.id,{ experiment:state.experiment,run:body.run,
    label:`panel-action:${fixture.panel.id}:${binding.presetId}` });
  const child=await resolveAlgorithmChild(body.run.id,body.run.targetId||'local');
  const summaries=await waitFor(async () => {
    const current=await orchestrationRun(context,apiUrl,child.runId);
    if (!isRunActive(current.status)) return undefined;
    const values=await nodeSummaries(child.targetId,child.runId);
    try { assertUserScriptModeExecution(mode,values); } catch { return undefined; }
    return values;
  },waitTimeoutMs,`${state.lane.key}/${binding.portId} did not execute both user.script nodes`);
  await page.locator(selectors.headerStop).waitFor({ state:'visible',timeout:30_000 });
  if (!await page.locator(selectors.actionInvoke).isDisabled()) {
    throw new Error(`${state.lane.key}/${binding.portId} active Action remained invokable`);
  }
  for (const other of fixture.bindings.filter(({ portId }) => portId!==binding.portId)) {
    const otherInvoke=page.locator(multiBindingPanelSelectors(fixture.panel.id,other.portId).actionInvoke);
    await otherInvoke.waitFor({ state:'visible',timeout:30_000 });
    if (await otherInvoke.isDisabled()) {
      throw new Error(`${state.lane.key}/${other.portId} was disabled by another active Action`);
    }
  }
  const trace=await waitForPanelTrace(selectors,{ failCompile:false });
  const jobs=await waitForProbeJobs(child.targetId,child.runId,[compileAssetId,runtimeAssetId]);
  const logs=await readProbeJobLogs(child.targetId,jobs,{ lane:state.lane.key,failCompile:false });
  const stoppedResponse=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => candidate.request().method()==='POST'
      && new URL(candidate.url()).pathname.endsWith('/stop-set'),
    click:() => page.locator(selectors.headerStop).click({ timeout:30_000 }),
  });
  if (!stoppedResponse.ok()) {
    throw new Error(`${state.lane.key}/${binding.portId} header Stop HTTP ${stoppedResponse.status()}`);
  }
  const terminalChild=await waitFor(async () => {
    const current=await orchestrationRun(context,apiUrlForTarget(child.targetId),child.runId);
    return isRunActive(current.status) ? undefined : current;
  },waitTimeoutMs,`${state.lane.key}/${binding.portId} child remained active after header Stop`);
  const terminalRoot=await waitFor(async () => {
    const current=await orchestrationRun(context,apiUrl,body.run.id);
    return isRunActive(current.status) ? undefined : current;
  },waitTimeoutMs,`${state.lane.key}/${binding.portId} root remained active after header Stop`);
  await assertNoActiveProbeJobs(child.targetId,child.runId);
  await waitForNoActiveExperimentSession(state.experiment.head.resourceId);
  await waitFor(async () => {
    const invoke=page.locator(selectors.actionInvoke);
    return await invoke.isVisible() && !await invoke.isDisabled() ? true : undefined;
  },30_000,`${state.lane.key}/${binding.portId} Action did not become invokable after Stop`);
  if (await page.locator(selectors.headerStop).count()!==0) {
    throw new Error(`${state.lane.key}/${binding.portId} retained header Stop after cleanup`);
  }
  acceptedRoots.delete(body.run.id);
  return {
    panelId:fixture.panel.id,portId:binding.portId,presetId:binding.presetId,mode,
    rootRunId:body.run.id,rootStatus:terminalRoot.status,childRunId:child.runId,childStatus:terminalChild.status,
    scriptCounts:assertUserScriptModeExecution(mode,summaries),trace:traceEvidence(trace),
    jobs:jobs.map(({ id,status,parameters }) => ({ id,status,assetResourceId:parameters.asset.resourceId })),
    logs,headerStopStatus:stoppedResponse.status(),
  };
}

async function runFullSessionCase(state,{ compileAssetId,runtimeAssetId }) {
  await openLane(state);
  await selectMode(state.experiment.head.resourceId,'simulation');
  const started=await startExperimentThroughUI({
    page,context,webUrl:apiUrl,experiment:state.experiment,runMode:'simulation',timeoutMs:30_000,
    onAccepted:(run) => acceptedRoots.set(run.id,{ experiment:state.experiment,run,label:`full:${state.lane.key}` }),
  });
  const byVariant=new Map(state.fixtures.map((fixture) => [fixture.variant.key,fixture]));
  const sessionProjection=await waitFor(async () => {
    const sessions=await experimentSessions(state.experiment.head.resourceId);
    if (sessions.length!==1) return undefined;
    const members=new Map(sessions[0].members.map((member) => [member.bindingId,member]));
    const live=members.get(byVariant.get('live').workflow.id);
    const failure=members.get(byVariant.get('failure').workflow.id);
    if (!isRunActive(live?.status) || failure?.status!=='failed'
      || !live.ownerId || !failure.ownerId
      || !String(failure.error??'').includes('compile')) return undefined;
    return { session:sessions[0],live,failure };
  },waitTimeoutMs,`${state.lane.key} full Session did not project live and failed algorithm members`);

  const liveFixture=byVariant.get('live');
  const failureFixture=byVariant.get('failure');
  const liveSummaries=await waitFor(async () => {
    const summaries=await nodeSummaries('local',sessionProjection.live.ownerId);
    try { assertUserScriptModeExecution('simulation',summaries); } catch { return undefined; }
    return summaries;
  },waitTimeoutMs,`${state.lane.key} full Session live algorithm did not execute both scripts`);
  const failureSummaries=await nodeSummaries('local',sessionProjection.failure.ownerId);
  assertUserScriptModeExecution('simulation',failureSummaries,{ failCompile:true });
  const liveSelectors=panelSelectors(liveFixture.panel.id);
  const failureSelectors=panelSelectors(failureFixture.panel.id);
  await page.locator(liveSelectors.stop).waitFor({ state:'visible',timeout:30_000 });
  await page.locator(failureSelectors.run).waitFor({ state:'visible',timeout:30_000 });
  if (await page.locator(failureSelectors.stop).count()!==0) {
    throw new Error(`${state.lane.key} failed full-Session Panel still shows header Stop`);
  }
  const liveTrace=await waitForPanelTrace(liveSelectors,{ failCompile:false });
  const failureTrace=await waitForPanelTrace(failureSelectors,{ failCompile:true });
  await page.locator(`[data-xgc-role="experiment-stop"][data-xgc-id="${state.experiment.head.resourceId}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
  const liveJobs=await waitForProbeJobs('local',sessionProjection.live.ownerId,[compileAssetId,runtimeAssetId]);
  const failureJobs=await waitForProbeJobs('local',sessionProjection.failure.ownerId,[compileAssetId]);
  const liveLogs=await readProbeJobLogs('local',liveJobs,{ lane:state.lane.key,failCompile:false });
  const failureLogs=await readProbeJobLogs('local',failureJobs,{ lane:state.lane.key,failCompile:true });
  const screenshot=`${screenshotDirectory}/${state.lane.key}-full-session.png`;
  await page.screenshot({ path:screenshot,fullPage:true });
  const stopped=await stopExperimentThroughUI({
    page,context,webUrl:apiUrl,experiment:state.experiment,runId:started.run.id,timeoutMs:waitTimeoutMs,
  });
  acceptedRoots.delete(started.run.id);
  await assertNoActiveProbeJobs('local',sessionProjection.live.ownerId);
  await waitForNoActiveExperimentSession(state.experiment.head.resourceId);
  return {
    rootRunId:started.run.id,sessionId:sessionProjection.session.session.id,
    members:{ live:sessionProjection.live,failure:sessionProjection.failure },
    traces:{ live:traceEvidence(liveTrace),failure:traceEvidence(failureTrace) },jobs:{ live:liveJobs,failure:failureJobs },
    logs:{ live:liveLogs,failure:failureLogs },stop:stopped,screenshot,
  };
}

async function resolveAlgorithmChild(rootRunId,rootTargetId) {
  return waitFor(async () => {
    const closure=await experimentRunClosure(context,apiUrl,rootRunId);
    const matches=[];
    for (const identity of closure) {
      if (identity.runId===rootRunId) continue;
      const run=await orchestrationRun(context,apiUrlForTarget(identity.targetId),identity.runId);
      if (run.automationResourceId===report.authoring.automation.resourceId
        && run.actionId==='run-for-experiment') matches.push({ ...identity,run });
    }
    if (matches.length>1) throw new Error(`Panel root ${rootRunId} produced multiple user Algorithm children`);
    return matches[0];
  },waitTimeoutMs,`Panel root ${rootRunId} did not produce its user Algorithm child`);
}

async function stopPanelRoot(state,fixture,rootRunId,selectors) {
  const response=await clickAndWaitForPageResponse(page,{
    timeoutMs:30_000,
    match:(candidate) => candidate.request().method()==='POST'
      && new URL(candidate.url()).pathname===`/api/execution-targets/local/orchestration-runs/${rootRunId}/stop-set`,
    click:() => page.locator(selectors.stop).click({ timeout:30_000 }),
  });
  if (!response.ok()) throw new Error(`${state.lane.key}/${fixture.panel.id} Panel Stop HTTP ${response.status()}`);
  const root=await waitFor(async () => {
    const current=await orchestrationRun(context,apiUrl,rootRunId);
    return isRunActive(current.status) ? undefined : current;
  },waitTimeoutMs,`${state.lane.key}/${fixture.panel.id} Panel root did not stop`);
  await page.locator(selectors.run).waitFor({ state:'visible',timeout:30_000 });
  return { responseStatus:response.status(),root };
}

async function waitForPanelTrace(selectors,{ failCompile }) {
  return waitFor(async () => {
    const trace=page.locator(selectors.frame).locator(selectors.trace);
    if (await trace.count()!==1 || !await trace.isVisible()) return undefined;
    const text=(await trace.textContent())??'';
    try { return assertPanelTraceText(text,{ failCompile }); } catch { return undefined; }
  },30_000,failCompile
    ? 'failed Algorithm Panel did not render its failed node and log'
    : 'Algorithm Panel did not render its workflow trace');
}

async function waitForProbeJobs(targetId,runId,assetIds) {
  return waitFor(async () => {
    const jobs=await probeJobs(targetId,runId);
    const found=new Set(jobs.map((job) => job.parameters?.asset?.resourceId));
    return assetIds.every((id) => found.has(id)) ? jobs : undefined;
  },waitTimeoutMs,`Run ${runId} did not create expected user-script Jobs`);
}

async function probeJobs(targetId,runId) {
  const jobs=await getJSON(context,apiUrlForTarget(targetId),'/api/execution-targets/local/jobs');
  return jobs.filter((job) => job.parameters?.originRunId===runId
    && job.parameters?.asset?.resourceId
    && report.authoring.userScripts.some(({ resourceId }) => resourceId===job.parameters.asset.resourceId));
}

async function readProbeJobLogs(targetId,jobs,{ lane,failCompile }) {
  const evidence=[];
  for (const job of jobs) {
    const stdout=await getJSON(context,apiUrlForTarget(targetId),
      `/api/execution-targets/local/jobs/${encodeURIComponent(job.id)}/logs?stream=stdout&offset=0&limitBytes=65536`);
    const stderr=await getJSON(context,apiUrlForTarget(targetId),
      `/api/execution-targets/local/jobs/${encodeURIComponent(job.id)}/logs?stream=stderr&offset=0&limitBytes=65536`);
    const combined=`${stdout.content??''}\n${stderr.content??''}`;
    if (failCompile) {
      if (!combined.includes('user-project ROS source is unavailable')) {
        throw new Error(`failed compile Job ${job.id} log omits source-unavailable error`);
      }
    } else if (!combined.includes(`lane=${lane}`)) {
      throw new Error(`user-script Job ${job.id} log omits lane=${lane}`);
    }
    evidence.push({ id:job.id,status:job.status,assetResourceId:job.parameters.asset.resourceId,stdout,stderr });
  }
  return evidence;
}

async function assertNoActiveProbeJobs(targetId,runId) {
  await waitFor(async () => {
    const active=(await probeJobs(targetId,runId)).filter((job) => isRunActive(job.status));
    return active.length===0 ? true : undefined;
  },waitTimeoutMs,`Run ${runId} retained active user-script Jobs after Stop`);
}

async function nodeSummaries(targetId,runId) {
  return getJSON(context,apiUrlForTarget(targetId),
    `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(runId)}/node-summaries`);
}

async function experimentSessions(experimentId) {
  return getJSON(context,apiUrl,
    `/api/execution-targets/local/experiment-sessions?experimentId=${encodeURIComponent(experimentId)}`);
}

async function assertNoActiveExperimentSession(experimentId) {
  const sessions=await experimentSessions(experimentId);
  const active=sessions.filter(({ session }) => ['opening','active','stopping'].includes(session?.state));
  if (active.length>0) {
    throw new Error(`Experiment ${experimentId} has ${active.length} active Session(s)`);
  }
}

async function waitForNoActiveExperimentSession(experimentId) {
  return waitFor(async () => {
    const sessions=await experimentSessions(experimentId);
    return sessions.some(({ session }) => ['opening','active','stopping'].includes(session?.state))
      ? undefined
      : true;
  },waitTimeoutMs,`Experiment ${experimentId} retained an active Session after cleanup`);
}

async function assertNodeCatalog() {
  const catalog=await getJSON(context,apiUrl,'/api/execution-targets/local/orchestration-node-catalog');
  for (const [kind,typeVersion] of [
    ['trigger.manual',2],['trigger.automation-call',1],['merge',1],['condition',2],
    ['user.script',1],['automation.return',1],
  ]) {
    if (catalog.filter((node) => node.kind===kind && node.typeVersion===typeVersion).length!==1) {
      throw new Error(`local target is missing exact ${kind}@${typeVersion}`);
    }
  }
}

async function selectMode(experimentId,mode) {
  const root=page.locator(`[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${experimentId}"]`);
  await root.waitFor({ state:'visible',timeout:30_000 });
  if (await root.getAttribute('data-disabled')==='true') throw new Error(`${experimentId} mode selector is disabled`);
  await root.getByRole('button').click({ timeout:30_000 });
  await page.getByRole('option',{ name:mode,exact:true }).click({ timeout:30_000 });
  await page.locator(`[data-xgc-role="experiment-run-mode"][data-xgc-id="${experimentId}"][data-xgc-value="${mode}"]`)
    .waitFor({ state:'visible',timeout:30_000 });
}

async function cleanupAcceptedRoots() {
  for (const [rootRunId,entry] of [...acceptedRoots].reverse()) {
    try {
      const root=await orchestrationRun(context,apiUrl,rootRunId);
      if (isRunActive(root.status)) {
        const requestId=`${marker}-cleanup-${rootRunId.slice(0,8)}`;
        await api('POST',`/api/execution-targets/local/orchestration-runs/${encodeURIComponent(rootRunId)}/stop-set`,{
          expectedRevision:root.revision,includeAnchor:true,includeDetached:true,
          reason:`Cleanup ${entry.label}`,requestId,idempotencyKey:requestId,
        },[200,202]);
        await waitFor(async () => {
          const current=await orchestrationRun(context,apiUrl,rootRunId);
          return isRunActive(current.status) ? undefined : current;
        },waitTimeoutMs,`cleanup root ${rootRunId} did not stop`);
      }
      report.cleanup.roots.push({ runId:rootRunId,result:'stopped-or-terminal' });
    } catch (cause) {
      report.cleanup.errors.push({ phase:'root-stop',runId:rootRunId,error:messageOf(cause) });
    }
  }
  acceptedRoots.clear();
}

async function restoreExperiments() {
  for (const state of [...authoredLanes].reverse()) {
    try {
      const current=await currentResource('/api/experiments',state.experiment.head.resourceId);
      if (!isDeepStrictEqual(current.spec,state.authoredSpec)) {
        throw new Error('Experiment changed after E2E authoring; refusing to overwrite concurrent edits');
      }
      const restored=await commitExperiment(current,state.original.spec,`restore-${state.lane.key}`,
        `Restore ${state.lane.label} Experiment after disposable Panel E2E`);
      report.cleanup.experiments.push({ lane:state.lane.key,resourceId:restored.head.resourceId,result:'restored' });
    } catch (cause) {
      report.cleanup.errors.push({ phase:'experiment-restore',lane:state.lane.key,error:messageOf(cause) });
    }
  }
}

async function archiveCreatedResources() {
  for (const resource of [...createdResources].reverse()) {
    try {
      const current=await currentResource(resource.path,resource.document.head.resourceId,true);
      if (!isDeepStrictEqual(current.spec,resource.spec)) {
        throw new Error(`${resource.label} changed after creation; refusing to archive user edits`);
      }
      const requestId=`${marker}-${resource.label}-archive`;
      await api('DELETE',`${resource.path}/${encodeURIComponent(current.head.resourceId)}`,
        archiveConfigurationRequest(current,{ requestId,reason:`Archive disposable ${resource.label} E2E resource` }),[200,204]);
      report.cleanup.resources.push({ label:resource.label,resourceId:current.head.resourceId,result:'archived' });
    } catch (cause) {
      report.cleanup.errors.push({ phase:'resource-archive',label:resource.label,error:messageOf(cause) });
    }
  }
}

async function currentResource(collectionPath,resourceId,direct=false) {
  if (direct) return api('GET',`${collectionPath}/${encodeURIComponent(resourceId)}?branch=main`,undefined,[200]);
  const documents=await api('GET',collectionPath,undefined,[200]);
  const matches=documents.filter((document) => document.head?.resourceId===resourceId);
  if (matches.length!==1) throw new Error(`resource ${resourceId} is absent or duplicated in ${collectionPath}`);
  return matches[0];
}

async function api(method,path,payload,expectedStatuses) {
  const response=await context.request.fetch(`${apiUrl}${path}`,{
    method,timeout:30_000,
    ...(payload===undefined ? {} : { data:payload }),
  });
  const text=await response.text();
  let body;
  try { body=text ? JSON.parse(text) : undefined; } catch { body=text; }
  if (!expectedStatuses.includes(response.status())) {
    throw new Error(`${method} ${path} returned HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  return body;
}

function assertPanelRunRequest(body,experimentId,panelId,runMode) {
  if (body?.automationRef?.domain!==SYSTEM_EXPERIMENT_RUNNER.domain
    || body.automationRef.resourceId!==SYSTEM_EXPERIMENT_RUNNER.resourceId
    || body.automationRef.branch!==SYSTEM_EXPERIMENT_RUNNER.branch
    || body?.experimentRef?.domain!=='experiment'
    || body.experimentRef.resourceId!==experimentId
    || body.experimentRef.branch!=='main'
    || body.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
    || body.parameters?.panelId!==panelId
    || body.parameters?.runMode!==runMode
    || body.parameters?.inputOverridesJson!=='{}'
    || typeof body.requestId!=='string' || !body.requestId
    || body.idempotencyKey!==body.requestId
    || typeof body.reason!=='string' || !body.reason.trim()
    || Object.hasOwn(body.parameters??{},'automationId')) {
    throw new Error(`invalid public run-panel request: ${JSON.stringify(body)}`);
  }
}

function assertPanelActionRequest(body,experimentId,panelId,presetId,runMode) {
  if (body?.automationRef?.domain!==SYSTEM_EXPERIMENT_RUNNER.domain
    || body.automationRef.resourceId!==SYSTEM_EXPERIMENT_RUNNER.resourceId
    || body.automationRef.branch!==SYSTEM_EXPERIMENT_RUNNER.branch
    || body?.experimentRef?.domain!=='experiment'
    || body.experimentRef.resourceId!==experimentId
    || body.experimentRef.branch!=='main'
    || body.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
    || body.parameters?.panelId!==panelId
    || body.parameters?.presetId!==presetId
    || body.parameters?.runMode!==runMode
    || body.parameters?.inputOverridesJson!=='{}'
    || typeof body.requestId!=='string' || !body.requestId
    || body.idempotencyKey!==body.requestId
    || typeof body.reason!=='string' || !body.reason.trim()
    || Object.hasOwn(body.parameters??{},'automationId')) {
    throw new Error(`invalid public invoke-panel-action request: ${JSON.stringify(body)}`);
  }
}

function panelCaseEvidence(state,fixture,mode,root,child,summaries,trace,jobs,logs,stop) {
  return {
    panelId:fixture.panel.id,variant:fixture.variant.key,mode,
    rootRunId:root.id,childRunId:child.runId,childStatus:child.run?.status,
    scriptCounts:assertUserScriptModeExecution(mode,summaries,{ failCompile:fixture.variant.failCompile }),
    trace:traceEvidence(trace),jobs:jobs.map(({ id,status,parameters }) => ({ id,status,assetResourceId:parameters.asset.resourceId })),
    logs,stop:stop??null,
  };
}

function resourceEvidence(document) {
  return {
    domain:document.head.domain,resourceId:document.head.resourceId,revision:document.head.revision,
    commitId:document.branch.headCommitId,name:document.spec?.name,
  };
}

function traceEvidence(text) {
  const value=String(text??'');
  return {
    length:value.length,
    hasCompile:value.includes('compile'),
    hasAlgorithm:value.includes('algorithm'),
    hasSourceUnavailable:value.includes('user-project ROS source is unavailable'),
    sample:value.slice(0,2000),
  };
}

function apiUrlForTarget(targetId) {
  if (targetId!=='local') throw new Error(`unexpected non-local user Algorithm target ${targetId}`);
  return apiUrl;
}

function writeReport() {
  writeFileSync(evidencePath,`${JSON.stringify(report,null,2)}\n`);
}

async function responseJSON(response) {
  const text=await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

function required(name,fallback='') {
  const value=process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredURL(name,fallback='') {
  const parsed=new URL(required(name,fallback));
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error(`${name} must be HTTP(S)`);
  return parsed.toString().replace(/\/$/,'');
}

function positiveInteger(name,fallback) {
  const value=Number.parseInt(process.env[name]??String(fallback),10);
  if (!Number.isSafeInteger(value) || value<1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
