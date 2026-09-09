/* global process,setTimeout,URL */

import { writeFileSync } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const SYSTEM_EXPERIMENT_RUNNER = Object.freeze({
  domain:'automation',
  resourceId:'069f036b-9638-4827-9524-73ff03fe99c9',
  branch:'main',
  actions:Object.freeze({ run:'run',runPanel:'run-panel',invokePanelAction:'invoke-panel-action',stopAll:'stop-all' }),
});

export const EXPERIMENT_START_BOUNDARY_TIMEOUT_MS = 10_000;

const activeStatuses = new Set(['accepted','queued','running','waiting','stopping']);
const terminalStatuses = new Set(['succeeded','failed','canceled','stopped','rejected']);

export async function resolveLocalFleetCoreContainer(environmentName) {
  const explicit=process.env[environmentName]?.trim() || '';
  if (explicit) return canonicalContainerName(explicit,environmentName);
  const { stdout }=await execFile('docker',[
    'ps',
    '--filter','label=com.docker.compose.project=xgc2-local-fleet-lab',
    '--filter','label=com.docker.compose.service=core',
    '--format','{{.Names}}',
  ],{ timeout:10_000,maxBuffer:64*1024 });
  const matches=[...new Set(stdout.split('\n').map((value) => value.trim()).filter(Boolean))];
  if (matches.length!==1) {
    throw new Error(`expected one running local-fleet Core container, found ${matches.length}`);
  }
  return canonicalContainerName(matches[0],environmentName);
}

function canonicalContainerName(value,environmentName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) {
    throw new Error(`${environmentName} is not a canonical Docker container name`);
  }
  return value;
}

export async function resolveManagedFixture(context,webUrl,{ key,name,resourceId='' }) {
  const experiments = await getJSON(context,webUrl,'/api/experiments');
  if (!key) throw new Error('managed dev Experiment fixture key is required');
  const marker = 'devfixture';
  const matches = experiments.filter((experiment) => (
    (!resourceId || experiment?.head?.resourceId === resourceId)
      && experiment?.spec?.name === name
      && experiment.spec.tags?.includes(marker)
  ));
  if (matches.length !== 1) {
    throw new Error(`managed dev Experiment is absent or duplicated: ${name}`);
  }
  const experiment = matches[0];
  assertPublicExperimentContract(experiment,marker);
  return experiment;
}

export function assertPublicExperimentContract(experiment,marker='') {
  if (experiment?.spec?.schemaVersion !== 15
    || experiment?.head?.domain !== 'experiment'
    || typeof experiment?.head?.resourceId !== 'string'
    || experiment.head.resourceId.length === 0
    || experiment?.branch?.name !== 'main') {
    throw new Error('Experiment is not one exact public schema-v15 main-branch document');
  }
  for (const legacy of ['compositionProfile','processPlacements','bindings','planRef']) {
    if (Object.hasOwn(experiment.spec,legacy)) {
      throw new Error(`Experiment retained removed field ${legacy}`);
    }
  }
  if (marker && !experiment.spec.tags?.includes(marker)) {
    throw new Error(`Experiment is missing managed fixture tag ${marker}`);
  }
  const workflows = new Map((experiment.spec.workflowInstances ?? []).map((item) => [item.id,item]));
  for (const dashboard of experiment.spec.dashboards ?? []) {
    for (const panel of dashboard.panels ?? []) {
      const owners = (panel.portBindings ?? []).filter((binding) => binding.kind === 'workflow');
      if (owners.length !== 1) throw new Error(`Panel ${panel.id} does not bind exactly one Panel Workflow`);
      const owner = owners[0];
      const workflow = workflows.get(owner.workflowInstanceId);
      if (!workflow || !workflow.actionPresets?.some((preset) => preset.id === owner.presetId)) {
        throw new Error(`Panel ${panel.id} references an unavailable Workflow preset`);
      }
    }
  }
}

export function managedWorkflowBindingIds(experiment) {
  return [...new Set((experiment.spec.dashboards ?? []).flatMap((dashboard) => (
    (dashboard.panels ?? []).flatMap((panel) => (
      (panel.portBindings ?? [])
        .filter((binding) => binding.kind === 'workflow' && binding.managed === true)
        .map((binding) => binding.workflowInstanceId)
    ))
  )))].sort();
}

export function managedWorkflowPolicies(experiment) {
  const result=new Map();
  for (const dashboard of experiment.spec.dashboards ?? []) {
    for (const panel of dashboard.panels ?? []) {
      for (const binding of panel.portBindings ?? []) {
        if (binding.kind!=='workflow' || binding.managed!==true) continue;
        result.set(binding.workflowInstanceId,{
          relation:binding.relation,
          cancelPolicy:binding.relation==='detached-observed' ? 'retain' : 'cascade',
        });
      }
    }
  }
  return result;
}

export async function assertNoActiveSystemRunner(context,webUrl) {
  const history = await systemRunnerHistory(context,webUrl);
  const active = history.entries.filter((entry) => entry.phase === 'run'
    && entry.run && activeStatuses.has(entry.run.status));
  if (active.length > 0) {
    throw new Error(`a System Experiment Runner is already active: ${active.map((entry) => entry.run.id).join(', ')}`);
  }
}

export class LiveHarnessError extends Error {
  constructor(message,cause) {
    super(message,{ cause });
    this.name='LiveHarnessError';
    this.layer='Harness';
  }
}

export class ExperimentStopUIRecoveryError extends Error {
  constructor(message,stopEvidence,cause) {
    super(message,{ cause });
    this.name='ExperimentStopUIRecoveryError';
    this.stopEvidence=stopEvidence;
  }
}

export function completedExperimentStopEvidence(cause) {
  if (!(cause instanceof ExperimentStopUIRecoveryError)) return undefined;
  return cause.stopEvidence?.backendFinal?.status==='confirmed'
    ? cause.stopEvidence
    : undefined;
}

export function emptyLiveLayers() {
  return {
    Harness:'BLOCKED',Authoring:'BLOCKED',Lifecycle:'not-run',DataPlane:'not-run',Physical:'not-run',Release:'not-run',
  };
}

export function isClosedPageMessage(cause) {
  const message=cause instanceof Error ? cause.message : String(cause ?? '');
  return /target page, context or browser has been closed|page is closed|context or browser has been closed/i
    .test(message);
}

export function isLiveHarnessError(cause) {
  return cause instanceof LiveHarnessError || cause?.layer==='Harness' || isClosedPageMessage(cause);
}

export function classifyLiveOutcome({ authoring='BLOCKED',acceptedRunId='',cause }={}) {
  const layers=emptyLiveLayers();
  layers.Authoring=authoring;
  if (!cause) {
    layers.Harness='PASS';
    if (acceptedRunId) layers.Lifecycle='PASS';
    return { outcome:authoring==='PASS' && acceptedRunId ? 'PASS' : 'FAIL',layers };
  }
  if (!acceptedRunId) {
    layers.Lifecycle='not-run';
    if (isLiveHarnessError(cause) || authoring==='PASS') layers.Harness='FAIL';
    return { outcome:'FAIL',layers };
  }
  layers.Harness='PASS';
  layers.Authoring=authoring==='PASS' ? 'PASS' : authoring;
  layers.Lifecycle='FAIL';
  return { outcome:'FAIL',layers };
}

export function writeLiveReport(outPath,result) {
  writeFileSync(outPath,`${JSON.stringify(result,null,2)}\n`);
}

export async function runWithLiveReport({
  outPath,result,execute,stopAcceptedRun,
}) {
  const report=result ?? {};
  report.layers=report.layers ?? emptyLiveLayers();
  report.errors=report.errors ?? [];
  report.warnings=report.warnings ?? [];
  let acceptedRunId=typeof report.run?.id==='string' ? report.run.id : '';
  try {
    await execute(report);
    acceptedRunId=report.run?.id || acceptedRunId;
    if (!report.outcome) {
      const classified=classifyLiveOutcome({
        authoring:report.layers.Authoring,acceptedRunId,
      });
      report.outcome=classified.outcome;
      report.layers={ ...report.layers,...classified.layers };
    }
  } catch (cause) {
    acceptedRunId=report.run?.id || acceptedRunId;
    const classified=classifyLiveOutcome({
      authoring:report.layers.Authoring,acceptedRunId,cause,
    });
    report.outcome=classified.outcome;
    report.layers={ ...report.layers,...classified.layers };
    report.errors.push(cause instanceof Error ? cause.message : String(cause));
    report.harness={
      ...(report.harness ?? {}),
      layer:classified.layers.Harness,
      pageClosed:isClosedPageMessage(cause) || (typeof cause?.pageClosed==='boolean' ? cause.pageClosed : undefined),
    };
  } finally {
    if (acceptedRunId && stopAcceptedRun && !report.stop?.completed) {
      try {
        const stopped=await stopAcceptedRun(acceptedRunId);
        report.stop={ ...(report.stop ?? {}),...(stopped && typeof stopped==='object' ? stopped : { completed:true }) };
      } catch (stopCause) {
        report.stop={ ...(report.stop ?? {}),error:stopCause instanceof Error ? stopCause.message : String(stopCause) };
        report.warnings.push('accepted run Total Stop in finally failed');
      }
    }
    report.lock='released';
    writeLiveReport(outPath,report);
  }
  return report;
}

export function assertPageOpen(page,when) {
  if (typeof page?.isClosed==='function' && page.isClosed()) {
    throw new LiveHarnessError(`Playwright page is closed ${when}`);
  }
}

export async function clickAndWaitForPageResponse(page,{ click,match,timeoutMs }) {
  assertPageOpen(page,'before registering the response wait');
  const ownedPage=page;
  const responsePromise=ownedPage.waitForResponse((response) => {
    try {
      return match(response);
    } catch {
      return false;
    }
  },{ timeout:timeoutMs });
  const settled=responsePromise.then(
    (response) => ({ response,error:undefined }),
    (error) => ({ response:undefined,error }),
  );
  try {
    assertPageOpen(ownedPage,'before click');
    await click();
  } catch (cause) {
    const observed=await settled;
    throw closedPageOrCause(cause,observed.error,ownedPage);
  }
  const observed=await settled;
  if (observed.error || !observed.response) {
    throw closedPageOrCause(
      observed.error || new Error('System Runner POST response was not observed'),
      undefined,
      ownedPage,
    );
  }
  assertPageOpen(ownedPage,'after the System Runner POST response');
  return observed.response;
}

function closedPageOrCause(primary,secondary,page) {
  const cause=primary || secondary;
  if (isLiveHarnessError(cause) || isClosedPageMessage(secondary)
    || (typeof page?.isClosed==='function' && page.isClosed())) {
    return cause instanceof LiveHarnessError
      ? cause
      : new LiveHarnessError(
        `Playwright page/context closed before System Runner POST was accepted: ${messageOf(cause)}`,
        cause instanceof Error ? cause : undefined,
      );
  }
  return cause instanceof Error ? cause : new Error(String(cause));
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause ?? '');
}

export async function reconcileForeignActiveExperimentSessions({
  listExperiments,listSessions,stopAll,exceptExperimentIds=[],reason,
}) {
  const excluded=new Set(exceptExperimentIds.filter(Boolean));
  const experiments=await listExperiments();
  const sessionsBefore=[];
  const stoppedForeign=[];
  const warnings=[];
  const remainingActive=[];
  for (const item of experiments) {
    const experimentId=item?.head?.resourceId;
    if (!experimentId) continue;
    const sessions=await listSessions(experimentId);
    for (const session of sessions ?? []) {
      const state=session.session?.state;
      sessionsBefore.push({
        experimentId,state,runMode:session.session?.runMode,
      });
      if (state!=='active' || excluded.has(experimentId)) continue;
      const stop=await stopAll({
        experimentId,
        reason:reason || 'targeted live: stop foreign active Experiment',
      });
      const after=await listSessions(experimentId);
      const stillActive=(after ?? []).some((entry) => entry.session?.state==='active');
      const record={
        experimentId,
        http:stop?.status,
        ok:stop?.ok===true,
        sessionsAfter:after ?? [],
      };
      if (stillActive) {
        remainingActive.push(record);
        stoppedForeign.push(record);
        continue;
      }
      if (stop?.ok!==true) {
        record.warning='stop-all failed but sessionsAfter is empty';
        warnings.push(record);
      }
      stoppedForeign.push(record);
    }
  }
  return {
    sessionsBefore,stoppedForeign,warnings,remainingActive,
    blocked:remainingActive.length>0,
  };
}

export async function startExperimentThroughUI({
  page,context,webUrl,experiment,runMode,timeoutMs=EXPERIMENT_START_BOUNDARY_TIMEOUT_MS,onAccepted,
}) {
  const experimentId = experiment.head.resourceId;
  const path = '/api/execution-targets/local/orchestration-runs';
  const runButton = page.locator(`[data-xgc-role="experiment-run"][data-xgc-id="${experimentId}"]`);
  await runButton.waitFor({ state:'visible',timeout:30_000 });
  if (await runButton.isDisabled()) {
    throw new Error(`Experiment Run is disabled: ${await runButton.getAttribute('title') || 'no reason'}`);
  }
  assertPageOpen(page,'after the Run control was ready');
  const startedAt = Date.now();
  let clickCompletedAt=startedAt;
  const response = await clickAndWaitForPageResponse(page,{
    timeoutMs,
    match:(candidate) => (
      candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === path
        && requestStartsSystemRunner(candidate.request(),experimentId,runMode)
    ),
    click:async () => {
      await runButton.click({ timeout:30_000 });
      clickCompletedAt=Date.now();
    },
  });
  const responseReceivedAt = Date.now();
  const body = await responseJSON(response);
  if (response.status() !== 202 || !body?.run) {
    throw new Error(`System Runner Start HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  const request = response.request().postDataJSON();
  assertSystemRunnerStartRequest(request,experimentId,runMode);
  assertSystemRunnerRoot(body.run,experimentId,runMode,true);
  onAccepted?.(body.run);
  const boundary = await waitForStartBoundary(
    context,webUrl,experiment,body.run.id,runMode,timeoutMs,
  );
  const observationLatencyMs = Date.now()-startedAt;
  const phaseLatencyMs={
    click:clickCompletedAt-startedAt,
    response:responseReceivedAt-clickCompletedAt,
    boundary:observationLatencyMs-(responseReceivedAt-startedAt),
  };
  const durableBoundaryAtMs=Date.parse(boundary.durableBoundaryAt);
  const dispatchLatencyMs=durableBoundaryAtMs-startedAt;
  if (!Number.isFinite(dispatchLatencyMs) || dispatchLatencyMs<0) {
    throw new Error(`Experiment durable dispatch boundary has invalid latency ${dispatchLatencyMs} ms: ${boundary.durableBoundaryAt}`);
  }
  if (dispatchLatencyMs > EXPERIMENT_START_BOUNDARY_TIMEOUT_MS) {
    throw new Error(
      `Experiment durable dispatch boundary took ${dispatchLatencyMs} ms; `
      + `limit is ${EXPERIMENT_START_BOUNDARY_TIMEOUT_MS} ms; `
      + `durableBoundaryAt=${boundary.durableBoundaryAt}; observationLatencyMs=${observationLatencyMs}; `
      + `phases=${JSON.stringify(phaseLatencyMs)}`,
    );
  }
  const history=await systemRunnerHistory(context,webUrl);
  const historyEntry=exactHistoryRun(history,body.run.id,experimentId);
  return {
    responseStatus:response.status(),request,response:body,...boundary,
    historyEntry,
    // Compatibility alias for existing live receipts. It now names the
    // product's durable dispatch latency, never read-model observation delay.
    latencyMs:dispatchLatencyMs,
    dispatchLatencyMs,observationLatencyMs,phaseLatencyMs,
  };
}

export async function waitForStartBoundary(context,webUrl,experiment,runId,runMode,timeoutMs=EXPERIMENT_START_BOUNDARY_TIMEOUT_MS) {
  const expectedBindings = managedWorkflowBindingIds(experiment);
  const expectedPolicies = managedWorkflowPolicies(experiment);
  return waitFor(async () => {
    const run = await orchestrationRun(context,webUrl,runId);
    assertSystemRunnerRoot(run,experiment.head.resourceId,runMode,true);
    if (terminalStatuses.has(run.status)) {
      throw new Error(`System Runner became ${run.status} before the Panel dispatch boundary: ${run.primaryError || run.reason || ''}`);
    }
    const sessions = await experimentSessions(context,webUrl,experiment.head.resourceId);
    const session = sessions.length === 1 ? sessions[0] : undefined;
    const relations = await orchestrationRelations(context,webUrl,runId);
    const groups = relations.childRunGroups.filter((group) => group.producerNodeId === 'run-panels');
    const group = groups.length === 1 ? groups[0] : undefined;
    const members = group
      ? relations.childRunGroupMembers.filter((member) => member.groupId === group.id)
      : [];
    const childRelations=members.map((member) => (
      relations.childRuns.find((candidate) => candidate.childRunId===member.childRunId)
    ));
    const exactPolicies=members.every((member,index) => {
      const policy=expectedPolicies.get(member.itemKey);
      const child=childRelations[index];
      return policy && child
        && child.relation===(policy.relation==='detached-observed' ? 'detached' : policy.relation)
        && child.cancelPolicy===policy.cancelPolicy;
    });
    const exactMemberSet=JSON.stringify(members.map((member) => member.itemKey).sort())
      ===JSON.stringify(expectedBindings);
    if (run.status !== 'waiting'
      || session?.session?.state !== 'active'
      || session.session.runMode !== runMode
      || session.session.experimentResourceId !== experiment.head.resourceId
      || !group || !['sealed','resolved'].includes(group.state)
      || group.expectedMembers !== expectedBindings.length
      || group.memberCount !== expectedBindings.length
      || members.length !== expectedBindings.length
      || !exactMemberSet
      || !exactPolicies
      || !group.sealedAt
      || childRelations.some((child) => !child?.boundAt)) return undefined;
    const durableBoundaryAt=latestDurableDispatchTimestamp(group,childRelations);
    return {
      run,session,relations,dispatchGroup:group,dispatchMembers:members,
      managedBindingIds:expectedBindings,durableBoundaryAt,
    };
  },Math.max(1,timeoutMs),'System Runner did not open its Session and seal the managed Panel dispatch set');
}

function latestDurableDispatchTimestamp(group,childRelations) {
  const candidates=[
    { path:'dispatchGroup.sealedAt',value:group.sealedAt },
    ...childRelations.map((child,index) => ({
      path:`dispatchMembers[${index}].childRun.boundAt`,value:child.boundAt,
    })),
  ];
  let latest;
  for (const candidate of candidates) {
    const milliseconds=typeof candidate.value==='string' ? Date.parse(candidate.value) : Number.NaN;
    if (!Number.isFinite(milliseconds)) {
      throw new Error(`${candidate.path} is not a finite durable dispatch timestamp`);
    }
    if (!latest || milliseconds>latest.milliseconds) latest={ ...candidate,milliseconds };
  }
  return latest.value;
}

export async function stopExperimentThroughUI({ page,context,webUrl,experiment,runId,timeoutMs=180_000 }) {
  const experimentId = experiment.head.resourceId;
  const path = '/api/execution-targets/local/orchestration-runs';
  const stopButton = page.locator(`[data-xgc-role="experiment-stop"][data-xgc-id="${experimentId}"]`);
  await stopButton.waitFor({ state:'visible',timeout:30_000 });
  if (await stopButton.isDisabled()) throw new Error('Experiment Stop is disabled');
  assertPageOpen(page,'after the Stop control was ready');
  const response = await clickAndWaitForPageResponse(page,{
    timeoutMs,
    match:(candidate) => (
      candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname === path
        && requestStartsStopAll(candidate.request(),experimentId)
    ),
    click:() => stopButton.click({ timeout:30_000 }),
  });
  const request = response.request().postDataJSON();
  assertSystemRunnerActionRequest(request,experimentId,SYSTEM_EXPERIMENT_RUNNER.actions.stopAll,{});
  const body = await responseJSON(response);
  if (response.status() < 200 || response.status() >= 300) {
    throw new Error(`System Runner Stop HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  if (!body?.run || body.run.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.stopAll) {
    throw new Error(`Experiment Stop returned an invalid protected stop-all root: ${JSON.stringify(body)}`);
  }
  const final = await waitFor(async () => {
    const run=await orchestrationRun(context,webUrl,runId);
    const sessions = await experimentSessions(context,webUrl,experimentId);
    if (activeStatuses.has(run.status) || sessions.length!==0) return undefined;
    const ownedProcesses=await experimentOwnedProcesses(context,webUrl,runId);
    if (ownedProcesses.some((process) => (
      process.desiredState!=='stopped' || process.observedState!=='stopped'
    ))) return undefined;
    return {
      run,roots:[run],sessions,ownedProcesses,
    };
  },timeoutMs,'one or more Session-owned System Runner roots remained active after Stop All');
  const backendFinal={ status:'confirmed',...final };
  const stopEvidence={
    responseStatus:response.status(),request,response:body,...final,backendFinal,
    uiRunControlRecovery:{ status:'pending' },
  };
  try {
    await page.locator(`[data-xgc-role="experiment-run"][data-xgc-id="${experimentId}"]`)
      .waitFor({ state:'visible',timeout:30_000 });
    stopEvidence.uiRunControlRecovery={ status:'recovered' };
    return stopEvidence;
  } catch (cause) {
    stopEvidence.uiRunControlRecovery={
      status:'failed',
      error:cause instanceof Error ? cause.message : String(cause),
      controls:await experimentLifecycleControlEvidence(page,experimentId),
    };
    throw new ExperimentStopUIRecoveryError(
      `Experiment backend Stop completed, but the Run control did not recover: ${stopEvidence.uiRunControlRecovery.error}`,
      stopEvidence,
      cause instanceof Error ? cause : undefined,
    );
  }
}

async function experimentLifecycleControlEvidence(page,experimentId) {
  const roles=['experiment-run','experiment-stop','experiment-state-loading'];
  const controls=[];
  for (const role of roles) {
    const locator=page.locator(`[data-xgc-role="${role}"][data-xgc-id="${experimentId}"]`);
    const count=await locator.count().catch(() => 0);
    if (count===0) continue;
    controls.push({
      role,
      visible:await locator.isVisible().catch(() => false),
      disabled:await locator.isDisabled().catch(() => undefined),
      title:await locator.getAttribute('title').catch(() => null),
      mode:await locator.getAttribute('data-xgc-mode').catch(() => null),
    });
  }
  return controls;
}

export async function activeSystemRunnerForExperiment(context,webUrl,experimentId) {
  const sessions=await experimentSessions(context,webUrl,experimentId);
  if (sessions.length!==1) return undefined;
  const rootMember=(sessions[0].members ?? []).find((member) => member.kind==='workflow_command');
  if (!rootMember?.ownerId) return undefined;
  const run=await orchestrationRun(context,webUrl,rootMember.ownerId);
  return activeStatuses.has(run.status) ? run : undefined;
}

export async function experimentRunClosure(context,webUrl,rootRunId) {
  const queue = [{ targetId:'local',runId:rootRunId }];
  const visited = new Map();
  while (queue.length > 0) {
    const batch=[];
    while (queue.length>0 && batch.length<8) {
      const current=queue.shift();
      const key=`${current.targetId}\u0000${current.runId}`;
      if (visited.has(key)) continue;
      visited.set(key,current);
      batch.push(current);
    }
    if (visited.size>1000) throw new Error('Experiment Run closure exceeds 1000 Runs');
    const relationsBatch=await Promise.all(batch.map(async (current) => {
      try {
        return {
          current,
          relations:await getJSON(context,webUrl,
            `/api/execution-targets/${encodeURIComponent(current.targetId)}/orchestration-runs/${encodeURIComponent(current.runId)}/relations`),
        };
      } catch (cause) {
        if (current.runId===rootRunId) throw cause;
        return { current,relations:undefined };
      }
    }));
    for (const { current,relations } of relationsBatch) {
      if (!relations) continue;
      for (const child of relations.childRuns ?? []) {
        queue.push({ targetId:child.targetId || current.targetId,runId:child.childRunId });
      }
    }
  }
  return [...visited.values()];
}

export async function experimentOwnedProcesses(context,webUrl,rootRunId) {
  const closure = await experimentRunClosure(context,webUrl,rootRunId);
  const byTarget = new Map();
  for (const item of closure) {
    const runs = byTarget.get(item.targetId) ?? [];
    runs.push(item);
    byTarget.set(item.targetId,runs);
  }
  const resultByIdentity = new Map();
  for (const [targetId,runs] of byTarget) {
    for (let index=0;index<runs.length;index+=8) {
      const batch=runs.slice(index,index+8);
      const pages=await Promise.all(batch.map(({ runId }) => getJSON(context,webUrl,
        `/api/execution-targets/${encodeURIComponent(targetId)}/process-instances`
        + `?ownerType=orchestration-run&ownerId=${encodeURIComponent(runId)}&limit=1000`)));
      pages.flat().forEach((process) => {
        if (process.ownerType!=='orchestration-run') return;
        resultByIdentity.set(`${process.targetId || targetId}\u0000${process.id}`,{
          ...process,targetId:process.targetId || targetId,
        });
      });
    }
  }
  return [...resultByIdentity.values()].sort((left,right) => (
    left.targetId.localeCompare(right.targetId) || left.id.localeCompare(right.id)
  ));
}

export async function systemRunnerHistory(context,webUrl) {
  return getJSON(context,webUrl,
    `/api/execution-targets/local/automation-execution-history?automationResourceId=${SYSTEM_EXPERIMENT_RUNNER.resourceId}&limit=20`);
}

export async function orchestrationRun(context,webUrl,runId) {
  return getJSON(context,webUrl,
    `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(runId)}`);
}

export async function orchestrationRelations(context,webUrl,runId) {
  return getJSON(context,webUrl,
    `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(runId)}/relations`);
}

export async function experimentSessions(context,webUrl,experimentId) {
  return getJSON(context,webUrl,
    `/api/execution-targets/local/experiment-sessions?experimentId=${encodeURIComponent(experimentId)}`);
}

export async function getJSON(context,webUrl,path) {
  const response = await context.request.get(`${webUrl}${path}`);
  if (!response.ok()) throw new Error(`${response.status()} GET ${path}: ${await response.text()}`);
  return response.json();
}

export async function waitFor(probe,timeoutMs,message,intervalMs=100) {
  const deadline = Date.now()+timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== undefined) return value;
    } catch (cause) {
      lastError = cause;
    }
    await new Promise((resolve) => setTimeout(resolve,intervalMs));
  }
  throw new Error(lastError ? `${message}: ${lastError.message || lastError}` : message);
}

function requestStartsSystemRunner(request,experimentId,runMode) {
  try {
    const body = request.postDataJSON();
    assertSystemRunnerStartRequest(body,experimentId,runMode);
    return true;
  } catch {
    return false;
  }
}

function assertSystemRunnerStartRequest(body,experimentId,runMode) {
  const keys=Object.keys(body ?? {}).sort();
  const expected=['actionId','automationRef','experimentRef','idempotencyKey','parameters','reason','requestId'].sort();
  if (JSON.stringify(keys)!==JSON.stringify(expected)
    || body?.automationRef?.domain!==SYSTEM_EXPERIMENT_RUNNER.domain
    || body.automationRef.resourceId!==SYSTEM_EXPERIMENT_RUNNER.resourceId
    || body.automationRef.branch!==SYSTEM_EXPERIMENT_RUNNER.branch
    || body?.experimentRef?.domain!=='experiment'
    || body.experimentRef.resourceId!==experimentId
    || body.experimentRef.branch!=='main'
    || body.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.run
    || Object.keys(body.parameters ?? {}).length!==1 || body.parameters.runMode!==runMode
    || typeof body.requestId!=='string' || body.requestId.length===0
    || body.idempotencyKey!==body.requestId
    || typeof body.reason!=='string' || body.reason.trim().length===0
    || Object.hasOwn(body,'runId')) {
    throw new Error(`invalid System Experiment Runner start request: ${JSON.stringify(body)}`);
  }
}

function assertSystemRunnerRoot(run,experimentId,runMode,parametersVisible,actionId=SYSTEM_EXPERIMENT_RUNNER.actions.run) {
  if (!run || typeof run.id !== 'string' || run.id.length === 0
    || run.targetId !== 'local'
    || run.automationResourceId !== SYSTEM_EXPERIMENT_RUNNER.resourceId
    || run.actionId !== actionId
    || run.sourceKind !== 'experiment'
    || run.sourceRef?.domain !== 'experiment'
    || run.sourceRef.resourceId !== experimentId
    || run.sourceRef.branch !== 'main'
    || (parametersVisible && (run.automationRef?.domain !== 'automation'
      || run.automationRef.resourceId !== SYSTEM_EXPERIMENT_RUNNER.resourceId
      || run.automationRef.branch !== 'main'))
    || run.parentRunId
    || run.rootRunId !== run.id
    || !Number.isSafeInteger(run.revision) || run.revision < 1
    || (parametersVisible && run.parameters?.runMode !== runMode)) {
    throw new Error(`invalid exact System Experiment Runner root: ${JSON.stringify(run)}`);
  }
}

function requestStartsStopAll(request,experimentId) {
  try {
    assertSystemRunnerActionRequest(
      request.postDataJSON(),experimentId,SYSTEM_EXPERIMENT_RUNNER.actions.stopAll,{},
    );
    return true;
  } catch {
    return false;
  }
}

function assertSystemRunnerActionRequest(body,experimentId,actionId,parameters) {
  const keys=Object.keys(body ?? {}).sort();
  const expected=['actionId','automationRef','experimentRef','idempotencyKey','parameters','reason','requestId'].sort();
  if (JSON.stringify(keys)!==JSON.stringify(expected)
    || body?.automationRef?.domain!==SYSTEM_EXPERIMENT_RUNNER.domain
    || body.automationRef.resourceId!==SYSTEM_EXPERIMENT_RUNNER.resourceId
    || body.automationRef.branch!==SYSTEM_EXPERIMENT_RUNNER.branch
    || body?.experimentRef?.domain!=='experiment'
    || body.experimentRef.resourceId!==experimentId
    || body.experimentRef.branch!=='main'
    || body.actionId!==actionId
    || JSON.stringify(body.parameters)!==JSON.stringify(parameters)
    || typeof body.requestId!=='string' || body.requestId.length===0
    || body.idempotencyKey!==body.requestId
    || typeof body.reason!=='string' || body.reason.trim().length===0) {
    throw new Error(`invalid System Experiment Runner ${actionId} request: ${JSON.stringify(body)}`);
  }
}

function exactHistoryRun(history,runId,experimentId) {
  const entries = history.entries.filter((entry) => entry.phase === 'run' && entry.run?.id === runId);
  if (entries.length !== 1) throw new Error(`System Runner history does not contain exact Run ${runId}`);
  const entry = entries[0];
  assertSystemRunnerRoot(entry.run,experimentId,'',false);
  return entry;
}

async function responseJSON(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}
