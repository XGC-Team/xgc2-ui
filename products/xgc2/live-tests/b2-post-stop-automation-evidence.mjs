/* global document,process,URL */
import { existsSync,writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { chromium } from '@playwright/test';
import { B2_TARGET_ID } from './browser-evidence-contract.mjs';
import {
  assertB2PostStopAutomationEvidence,
  selectExactTerminalExperimentRun,
} from './b2-post-stop-automation-contract.mjs';

const PANEL_ID = 'b2-onboard-workflows';
const PANEL_TIMEOUT_MS = 45_000;
const configuration = {
  webUrl:requiredURL('XGC_B2_POST_STOP_WEB_URL'),
  experimentId:requiredID('XGC_B2_POST_STOP_EXPERIMENT_ID'),
  service:{
    resourceId:requiredID('XGC_B2_POST_STOP_SERVICE_RESOURCE_ID'),
    runId:requiredID('XGC_B2_POST_STOP_SERVICE_RUN_ID'),
    nodeId:'typed-call',
  },
  algorithm:{
    resourceId:requiredID('XGC_B2_POST_STOP_ALGORITHM_RESOURCE_ID'),
    runId:requiredID('XGC_B2_POST_STOP_ALGORITHM_RUN_ID'),
    nodeId:'algorithm',
    jobId:requiredID('XGC_B2_POST_STOP_ALGORITHM_JOB_ID'),
    resultStdoutMarker:required('XGC_B2_POST_STOP_ALGORITHM_RESULT_STDOUT_MARKER'),
    jobStdoutStartMarker:required('XGC_B2_POST_STOP_JOB_STDOUT_START_MARKER'),
    jobStdoutSuccessMarker:required('XGC_B2_POST_STOP_JOB_STDOUT_SUCCESS_MARKER'),
    jobStderr:required('XGC_B2_POST_STOP_JOB_STDERR'),
    lifecycleStartMarker:required('XGC_B2_POST_STOP_LIFECYCLE_START_MARKER'),
    lifecycleSuccessMarker:required('XGC_B2_POST_STOP_LIFECYCLE_SUCCESS_MARKER'),
  },
  evidencePath:requiredAbsolutePath('XGC_B2_POST_STOP_EVIDENCE'),
};
const expected = { ...configuration,targetId:B2_TARGET_ID };
assertFreshOutput(configuration.evidencePath);

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1440,height:960 } });
const initialPageCount = context.pages().length;
const page = await context.newPage();
const pageErrors = [];
const endpointResponses = [];
let mainFrameNavigationCount = 0;
page.on('pageerror',(error) => pageErrors.push(error.message));
page.on('framenavigated',(frame) => {
  if (frame === page.mainFrame()) mainFrameNavigationCount += 1;
});
page.on('response',(response) => {
  const endpoint = logEndpoint(response.url(),configuration.algorithm);
  if (endpoint) endpointResponses.push({ endpoint,status:response.status(),url:response.url() });
});

try {
  const experimentURL = `${configuration.webUrl}/#/experiments/${configuration.experimentId}`;
  await page.goto(experimentURL,{ waitUntil:'domcontentloaded',timeout:30_000 });
  await page.reload({ waitUntil:'domcontentloaded',timeout:30_000 });
  const terminalHistoryBootstrap = {
    service:await terminalHistoryBootstrapRecord(context,configuration.service),
    algorithm:await terminalHistoryBootstrapRecord(context,configuration.algorithm),
  };

  const gcsTab = await exactLocator(page.getByRole('tab',{ name:'GCS',exact:true }),'GCS tab');
  await gcsTab.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  await gcsTab.click();
  const panel = await exactLocator(page.locator(
    `[data-xgc-role="automation-workflow-panel"][data-xgc-id="${PANEL_ID}"]`,
  ),'B2 onboard Automation panel');
  await panel.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const header = await exactLocator(page.locator(
    `[data-xgc-role="automation-workflow-header-actions"][data-xgc-id="${PANEL_ID}"]`,
  ),'B2 onboard Automation header');

  const serviceHistory = await workflowHistory(page,panel,header,configuration.service,'service');
  const algorithmHistory = await workflowHistory(page,panel,header,configuration.algorithm,'algorithm');
  const algorithmLogs = await workflowLogs(page,panel,header,configuration.algorithm);
  await waitForEndpointResponses(page,endpointResponses);
  const auditScope = ((await panel.locator(
    '[data-xgc-role="automation-workflow-audit-scope"]',
  ).first().textContent()) || '').trim();
  const evidence = {
    experimentId:configuration.experimentId,
    targetId:B2_TARGET_ID,
    observedAt:new Date().toISOString(),
    browserContext:{ initialPageCount },
    reload:{ requested:true,mainFrameNavigationCount,url:page.url() },
    terminalHistoryBootstrap,
    panel:{
      count:await panel.count(),
      auditScope,
      service:serviceHistory,
      algorithm:{ history:algorithmHistory,...algorithmLogs },
    },
    endpointResponses,
    pageErrors,
  };
  assertB2PostStopAutomationEvidence(evidence,expected);
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  assertB2PostStopAutomationEvidence(evidence,expected);
  writeFileSync(configuration.evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
} catch (cause) {
  const failurePath = `${configuration.evidencePath}.failure`;
  await page.screenshot({ path:`${failurePath}.png`,fullPage:true }).catch(() => undefined);
  writeFileSync(`${failurePath}.json`,`${JSON.stringify({
    error:messageOf(cause),url:page.url(),pageErrors,endpointResponses,mainFrameNavigationCount,
  },null,2)}\n`);
  throw cause;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function terminalHistoryBootstrapRecord(context,workflow) {
  const path = `/api/execution-targets/${encodeURIComponent(B2_TARGET_ID)}`
    + `/automation-execution-history?automationResourceId=${encodeURIComponent(workflow.resourceId)}`
    + '&runStatus=succeeded&limit=100';
  const response = await context.request.get(`${configuration.webUrl}${path}`,{
    headers:{ Accept:'application/json' },timeout:30_000,
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (cause) {
    throw new Error(`terminal history ${workflow.resourceId} is not JSON: ${messageOf(cause)}`,{ cause });
  }
  const record = { path,httpStatus:response.status(),page:payload };
  if (record.httpStatus !== 200) {
    throw new Error(`terminal history ${workflow.resourceId} returned HTTP ${record.httpStatus}`);
  }
  selectExactTerminalExperimentRun(payload,{
    ...workflow,targetId:B2_TARGET_ID,experimentId:configuration.experimentId,
  },workflow.nodeId === 'typed-call' ? 'service' : 'algorithm');
  return record;
}

async function workflowHistory(page,panel,header,workflow,label) {
  const historyView = await exactLocator(header.locator(
    '[data-xgc-role="automation-workflow-view"][data-xgc-id="history"]',
  ),'Automation History view');
  await historyView.click();
  await selectWorkflow(page,header,workflow.resourceId);
  const run = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-history-run"][data-xgc-id="${workflow.runId}"]`,
  ),`${label} terminal Automation History run`);
  await run.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  if (await run.getAttribute('aria-current') !== 'true') await run.click();
  const node = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-node"][data-xgc-id="${workflow.nodeId}"]`
      + '[data-xgc-status="succeeded"]',
  ),`${label} succeeded Automation node`);
  await node.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const details = await exactLocator(node.locator('details'),`${label} Automation output details`);
  const output = await exactLocator(details.locator('pre'),`${label} Automation output`);
  await output.waitFor({ state:'attached',timeout:PANEL_TIMEOUT_MS });
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await output.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  let nodeOutput;
  try {
    nodeOutput = JSON.parse((await output.textContent()) || '');
  } catch (cause) {
    throw new Error(`${label} Automation History output is not JSON: ${messageOf(cause)}`,{ cause });
  }
  return {
    runId:workflow.runId,
    source:((await run.locator('[data-xgc-role="automation-workflow-run-source"]').textContent()) || '').trim(),
    nodeId:workflow.nodeId,
    nodeStatus:await node.getAttribute('data-xgc-status'),
    outputExpanded:await details.getAttribute('open') !== null,
    outputVisible:await output.isVisible(),
    nodeOutput,
  };
}

async function workflowLogs(page,panel,header,workflow) {
  const logsView = await exactLocator(header.locator(
    '[data-xgc-role="automation-workflow-view"][data-xgc-id="logs"]',
  ),'Automation Logs view');
  await logsView.click();
  await selectWorkflow(page,header,workflow.resourceId);
  const logs = await exactLocator(panel.locator(
    `[data-xgc-role="automation-workflow-logs"][data-xgc-id="${workflow.runId}"]`,
  ),'terminal algorithm Automation logs');
  await logs.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const run = await exactLocator(logs.locator(
    `[data-xgc-role="automation-workflow-log-run"][data-xgc-id="${workflow.runId}"]`,
  ),'terminal algorithm log run');
  if (await run.getAttribute('aria-current') !== 'true') await run.click();
  const jobLogs = await exactLocator(logs.locator(
    `[data-xgc-role="automation-workflow-job-logs"][data-xgc-id="${workflow.runId}:algorithm"]`
      + '[data-xgc-source="job-log-endpoint"]',
  ),'terminal algorithm Job logs');
  await jobLogs.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const jobId = (await jobLogs.getAttribute('data-xgc-job-id')) || '';
  if (jobId !== workflow.jobId) throw new Error(`terminal algorithm Job changed identity: ${jobId}`);
  const jobStdout = await logStream(page,jobLogs,'job',jobId,'stdout',[
    workflow.jobStdoutStartMarker,workflow.resultStdoutMarker,workflow.jobStdoutSuccessMarker,
  ]);
  const jobStderr = await logStream(page,jobLogs,'job',jobId,'stderr',[workflow.jobStderr.trim()]);
  await assertNoLogAlert(jobLogs,'algorithm Job');

  const lifecycle = await exactLocator(logs.locator(
    `[data-xgc-role="automation-workflow-orchestration-lifecycle"][data-xgc-id="${workflow.runId}"]`
      + '[data-xgc-source="orchestration-run-log-endpoint"]',
  ),'terminal algorithm orchestration lifecycle logs');
  await lifecycle.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const lifecycleStdout = await logStream(page,lifecycle,'orchestration',workflow.runId,'stdout',[
    workflow.lifecycleStartMarker,workflow.lifecycleSuccessMarker,
  ]);
  const lifecycleStderr = await logStream(page,lifecycle,'orchestration',workflow.runId,'stderr',[]);
  await assertNoLogAlert(lifecycle,'algorithm orchestration lifecycle');
  return {
    jobLogs:{ source:await jobLogs.getAttribute('data-xgc-source'),runId:workflow.runId,
      nodeId:'algorithm',jobId,stdout:jobStdout,stderr:jobStderr },
    orchestrationLifecycleLogs:{ source:await lifecycle.getAttribute('data-xgc-source'),
      runId:workflow.runId,stdout:lifecycleStdout,stderr:lifecycleStderr },
  };
}

async function logStream(page,logs,entityType,entityId,stream,needles) {
  const tab = await exactLocator(logs.locator(
    `[data-xgc-role="${entityType}-log-stream-tab"][data-xgc-id="${entityId}:${stream}"]`,
  ),`${entityType} ${stream} log tab`);
  await tab.click();
  const content = await exactLocator(logs.locator(
    `[data-xgc-role="${entityType}-log-stream"][data-xgc-id="${entityId}:${stream}"] pre`,
  ),`${entityType} ${stream} log content`);
  await content.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const deadline = Date.now() + PANEL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = (await content.textContent()) || '';
    if (needles.every((needle) => value.includes(needle))) return value;
    await page.waitForTimeout(500);
  }
  throw new Error(`${entityType} ${stream} log did not contain every frozen marker`);
}

async function selectWorkflow(page,header,resourceId) {
  const selector = await exactLocator(header.locator(
    '[data-xgc-role="automation-workflow-selector-listbox"]',
  ),'Automation workflow selector');
  await selector.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  if (await selector.getAttribute('data-value') === resourceId) return;
  await selector.locator('button[aria-haspopup="listbox"]').click();
  const option = await exactLocator(page.locator(
    `[data-xgc-role="select-option"][data-xgc-id="${resourceId}"]`,
  ),`Automation workflow option ${resourceId}`);
  await option.click();
  await page.waitForFunction(({ expectedResourceId }) => document.querySelector(
    '[data-xgc-role="automation-workflow-selector-listbox"]',
  )?.getAttribute('data-value') === expectedResourceId,
  { expectedResourceId:resourceId },{ timeout:PANEL_TIMEOUT_MS });
}

async function waitForEndpointResponses(page,responses) {
  const required = new Set(['job-stdout','job-stderr','orchestration-stdout','orchestration-stderr']);
  const deadline = Date.now() + PANEL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ([...required].every((endpoint) => responses.some(
      (response) => response.endpoint === endpoint && response.status === 200,
    ))) return;
    await page.waitForTimeout(250);
  }
  throw new Error('the post-stop panel did not receive HTTP 200 from every exact Job/lifecycle log endpoint');
}

function logEndpoint(rawURL,workflow) {
  const url = new URL(rawURL);
  const stream = url.searchParams.get('stream');
  if (stream !== 'stdout' && stream !== 'stderr') return '';
  const jobPath = `/api/execution-targets/${encodeURIComponent(B2_TARGET_ID)}`
    + `/jobs/${encodeURIComponent(workflow.jobId)}/logs`;
  if (url.pathname === jobPath) return `job-${stream}`;
  const orchestrationPath = `/api/execution-targets/${encodeURIComponent(B2_TARGET_ID)}`
    + `/orchestration-runs/${encodeURIComponent(workflow.runId)}/logs`;
  return url.pathname === orchestrationPath ? `orchestration-${stream}` : '';
}

function assertNoLogAlert(locator,label) {
  return locator.getByRole('alert').count().then(async (count) => {
    if (count > 0) throw new Error(`${label} endpoint failed: ${await locator.getByRole('alert').innerText()}`);
  });
}

async function exactLocator(locator,label) {
  await locator.first().waitFor({ state:'attached',timeout:PANEL_TIMEOUT_MS });
  const count = await locator.count();
  if (count !== 1) throw new Error(`${label} count must equal 1; got ${count}`);
  return locator;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredID(name) {
  const value = required(name);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function requiredURL(name) {
  const parsed = new URL(required(name));
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP origin`);
  }
  return parsed.origin;
}

function requiredAbsolutePath(name) {
  const value = required(name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

function assertFreshOutput(path) {
  if (existsSync(path) || existsSync(`${path}.png`)) {
    throw new Error('post-stop Automation evidence output must be fresh');
  }
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
