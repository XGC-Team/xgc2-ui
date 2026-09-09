import { expect,test,type Locator,type Page,type TestInfo } from '@playwright/test';

type LiveEnvironment = {
  targetId: string;
  workflowId: string;
  workflowName: string;
  expectedLog: string;
  initialRunId: string;
  initialProcessId: string;
  initialProcessPid: string;
  stationToken: string;
};

test('operates a real remote Agent workflow without navigation-driven restarts', async ({ page }, testInfo) => {
  const environment = liveEnvironment();
  await page.addInitScript(({ stationToken }) => {
    window.localStorage.setItem('xgcStationToken', stationToken);
    window.localStorage.setItem('xgc-language', JSON.stringify('en-US'));
  }, { stationToken: environment.stationToken });

  await selectRemoteTarget(page, environment.targetId);
  await openWorkflowFromList(page, environment);

  const validHash = automationDetailHash(environment.targetId, environment.workflowId);
  await expect.poll(() => new URL(page.url()).hash).toBe(validHash);
  await expect(byRoleId(page, 'automation-run-stop', environment.initialRunId)).toBeVisible();

  const initialHistoryCount = await inspectHistory(page, environment, environment.initialRunId, environment.initialProcessId);
  await inspectRunLogs(page, environment, environment.initialRunId, environment.initialProcessId);
  const initialProcess = await inspectProcess(page, environment, environment.initialRunId, environment.initialProcessId, environment.initialProcessPid);

  await openWorkflowFromList(page, environment);
  await expect(byRoleId(page, 'automation-run-stop', environment.initialRunId)).toBeVisible();
  await page.reload();
  await expect.poll(() => new URL(page.url()).hash).toBe(validHash);
  await expect(byRoleId(page, 'automation-definition-detail', environment.workflowId)).toBeVisible();
  await expect(byRoleId(page, 'automation-run-stop', environment.initialRunId)).toBeVisible();

  const reloadedInitialHistoryCount = await inspectHistory(page, environment, environment.initialRunId, environment.initialProcessId);
  expect(reloadedInitialHistoryCount).toBe(initialHistoryCount);
  const reloadedInitialProcess = await inspectProcess(page, environment, environment.initialRunId, environment.initialProcessId, environment.initialProcessPid);
  expect(reloadedInitialProcess).toEqual(initialProcess);

  await openWorkflowFromList(page, environment);
  await stopRun(page, environment.initialRunId);

  await authorManualDelayWorkflow(page, environment.targetId, testInfo);
  await openWorkflowFromList(page, environment);

  await byRoleId(page, 'automation-run-open', environment.workflowId).click();
  const secondRunId = await activeRunId(page, environment.initialRunId);
  expect(secondRunId).not.toBe(environment.initialRunId);

  const secondProcess = await inspectNewProcess(page, environment, secondRunId, environment.initialProcessId);
  await openWorkflowFromList(page, environment);
  await expect(byRoleId(page, 'automation-run-stop', secondRunId)).toBeVisible();

  const secondHistoryCount = await inspectHistory(page, environment, secondRunId, secondProcess.id);
  expect(secondHistoryCount).toBe(initialHistoryCount + 1);
  await inspectRunLogs(page, environment, secondRunId, secondProcess.id);

  await openWorkflowFromList(page, environment);
  await page.reload();
  await expect.poll(() => new URL(page.url()).hash).toBe(validHash);
  await expect(byRoleId(page, 'automation-run-stop', secondRunId)).toBeVisible();

  const afterReloadProcess = await inspectProcess(page, environment, secondRunId, secondProcess.id, secondProcess.pid);
  expect(afterReloadProcess).toEqual(secondProcess);

  await openWorkflowFromList(page, environment);
  await stopRun(page, secondRunId);

  await page.reload();
  await expect.poll(() => new URL(page.url()).hash).toBe(validHash);
  await expect(byRoleId(page, 'automation-definition-detail', environment.workflowId)).toBeVisible();

  const invalidHash = automationDetailHash(environment.targetId, `missing-${Date.now()}`);
  await page.evaluate((hash) => { window.location.hash = hash; }, invalidHash);
  await expect(byRoleId(page, 'automations-page', environment.targetId)).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe(automationListHash(environment.targetId));
});

function liveEnvironment(): LiveEnvironment {
  return {
    targetId: requiredEnvironment('XGC_E2E_TARGET_ID'),
    workflowId: requiredEnvironment('XGC_E2E_WORKFLOW_ID'),
    workflowName: requiredEnvironment('XGC_E2E_WORKFLOW_NAME'),
    expectedLog: requiredEnvironment('XGC_E2E_EXPECTED_LOG'),
    initialRunId: requiredEnvironment('XGC_E2E_RUN_ID'),
    initialProcessId: requiredEnvironment('XGC_E2E_PROCESS_ID'),
    initialProcessPid: requiredEnvironment('XGC_E2E_PROCESS_PID'),
    stationToken: requiredEnvironment('XGC_STATION_TOKEN'),
  };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the live full-stack browser lane`);
  return value;
}

async function selectRemoteTarget(page: Page, targetId: string) {
  await page.goto('/');
  await expect(byRole(page, 'app-shell')).toBeVisible();
  const selector = byRoleId(page, 'target-selector-control', 'global');
  await expect(selector).toBeVisible();
  await selector.getByRole('button', { name: 'Target' }).click();
  const option = byRoleId(page, 'select-option', `global:host:${targetId}`);
  await expect(option).toBeVisible();
  await option.click();

  await openAutomationsList(page, targetId);
}

async function openAutomationsList(page: Page, targetId: string) {
  const automations = byRoleId(page, 'primary-nav-item', 'automations');
  await expect(automations).toBeVisible();
  await automations.click();
  await expect(byRoleId(page, 'automations-page', targetId)).toBeVisible();
}

async function openWorkflowFromList(page: Page, environment: Pick<LiveEnvironment,'targetId' | 'workflowId' | 'workflowName'>) {
  const list = byRoleId(page, 'automations-page', environment.targetId);
  if (await byRoleId(page, 'automation-definition-detail', environment.workflowId).isVisible().catch(() => false)) {
    await openAutomationsList(page, environment.targetId);
  } else if (!await list.isVisible().catch(() => false)) {
    await openAutomationsList(page, environment.targetId);
  }

  await expect(list).toBeVisible();
  const row = byRoleId(page, 'automation-definition-row', environment.workflowId);
  await expect(row).toContainText(environment.workflowName);
  await expect(byRoleId(row, 'automation-definition-meta', environment.workflowId)).not.toContainText(environment.targetId);
  await row.click();
  await expect(byRoleId(page, 'automation-definition-detail', environment.workflowId)).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe(automationDetailHash(environment.targetId, environment.workflowId));
}

async function inspectHistory(page: Page, environment: LiveEnvironment, runId: string, processId: string) {
  await byRoleId(page, 'automation-workspace-view', 'executions').click();
  const detail = byRoleId(page, 'automation-execution-detail', runId);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(environment.targetId);
  await expect(detail).toContainText('Root run');

  const relations = byRoleId(detail, 'automation-run-relations', runId);
  await expect(relations).toBeVisible();
  await expect(byRoleId(relations, 'automation-runtime-backend', processId)).toHaveText(processId);
  return byRole(page, 'automation-execution-row').count();
}

async function inspectRunLogs(page: Page, environment: LiveEnvironment, runId: string, processId: string) {
  await byRoleId(page, 'automation-workspace-view', 'editor').click();
  const toggle = byRoleId(page, 'automation-editor-logs-toggle', environment.workflowId);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();

  await expect(byRoleId(page, 'automation-editor-run-state', runId)).toBeVisible();
  await byRoleId(page, 'automation-editor-open-run-logs', runId).click();
  const viewer = byRoleId(page, 'automation-editor-log-viewer', runId);
  await expect(viewer).toBeVisible();

  const stdout = byRoleId(viewer, 'orchestration-log-stream', `${runId}:stdout`);
  const stderr = byRoleId(viewer, 'orchestration-log-stream', `${runId}:stderr`);
  await expect.poll(async () => `${await stdout.textContent()}\n${await stderr.textContent()}`).toContain(environment.expectedLog);

  const source = byRoleId(viewer, 'automation-editor-log-source', runId);
  await source.getByRole('button', { name: 'Log source' }).click();
  const processSource = byRoleId(page, 'select-option', `${runId}:process-instance:${processId}`);
  await expect(processSource).toBeVisible();
  await processSource.click();
  await expect(byRoleId(viewer, 'process-instance-logs', processId)).toBeVisible();
  await expect(byRoleId(viewer, 'process-instance-log-stream', `${processId}:stdout`)).toBeVisible();
}

async function inspectProcess(
  page: Page,
  environment: Pick<LiveEnvironment,'targetId'>,
  runId: string,
  processId: string,
  expectedPid: string,
) {
  await byRoleId(page, 'ops-nav-item', 'operations').click();
  await expect(byRoleId(page, 'operations-page', environment.targetId)).toBeVisible();
  const row = byRoleId(page, 'process-instance-row', processId);
  await expect(row).toBeVisible();
  await expect(byRoleId(row, 'process-instance-runtime', processId)).toContainText(`PID ${expectedPid}`);
  await expect(byRoleId(row, 'process-instance-provenance', processId)).toContainText(runId);
  await expect(byRoleId(row, 'process-instance-state', processId)).toContainText('running');
  await expect(byRoleId(row, 'process-instance-timing', processId)).toContainText('0 restarts');
  return processObservation(row, processId);
}

async function inspectNewProcess(page: Page, environment: LiveEnvironment, runId: string, priorProcessId: string) {
  await byRoleId(page, 'ops-nav-item', 'operations').click();
  await expect(byRoleId(page, 'operations-page', environment.targetId)).toBeVisible();
  const rows = byRole(page, 'process-instance-row');
  const row = rows.filter({ has: byRole(page, 'process-instance-provenance').filter({ hasText: runId }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('running');
  await expect(row).toContainText('0 restarts');

  const processId = await requiredAttribute(row, 'data-xgc-id');
  expect(processId).not.toBe(priorProcessId);
  const runtime = byRoleId(row, 'process-instance-runtime', processId);
  await expect(runtime).toContainText('PID ');
  const pid = pidFromRuntime(await runtime.textContent());
  return processObservation(row, processId, pid);
}

async function processObservation(row: Locator, processId: string, knownPid?: string) {
  const runtime = byRoleId(row, 'process-instance-runtime', processId);
  const timing = byRoleId(row, 'process-instance-timing', processId);
  const pid = knownPid ?? pidFromRuntime(await runtime.textContent());
  return {
    id: processId,
    pid,
    runtime: normalizedText(await runtime.textContent()),
    timing: normalizedRestartText(await timing.textContent()),
  };
}

async function stopRun(page: Page, runId: string) {
  await byRoleId(page, 'automation-run-stop', runId).click();
  await byRoleId(page, 'automation-workspace-view', 'executions').click();
  const detail = byRoleId(page, 'automation-execution-detail', runId);
  await expect(detail).toBeVisible();
  const status = byRoleId(detail, 'automation-run-status', runId);
  await expect.poll(() => status.getAttribute('data-xgc-engine-status')).toMatch(/^(stopped|canceled)$/);
}

async function activeRunId(page: Page, previousRunId: string) {
  const stop = byRole(page, 'automation-run-stop');
  await expect.poll(async () => {
    const ids = await stop.evaluateAll((items) => items.map((item) => item.getAttribute('data-xgc-id') ?? ''));
    return ids.find((id) => id && id !== previousRunId) ?? '';
  }).not.toBe('');
  const ids = await stop.evaluateAll((items) => items.map((item) => item.getAttribute('data-xgc-id') ?? ''));
  const runId = ids.find((id) => id && id !== previousRunId);
  if (!runId) throw new Error('the WebUI did not expose the newly started remote Run');
  return runId;
}

async function authorManualDelayWorkflow(page: Page, targetId: string, testInfo: TestInfo) {
  if (await byRole(page, 'automation-definition-detail').isVisible().catch(() => false)) {
    await openAutomationsList(page, targetId);
  }
  await expect(byRoleId(page, 'automations-page', targetId)).toBeVisible();
  await byRoleId(page, 'automation-definition-create').click();
  const drawer = byRoleId(page, 'automation-definition-create-drawer', 'new');
  await expect(drawer).toBeVisible();
  const workflowName = `Remote manual delay browser E2E ${Date.now()}`;
  await byRole(drawer, 'automation-create-name-field').locator('input').fill(workflowName);

  // New Automations now begin as an unsaved manual-trigger draft. Trigger
  // selection belongs to the editor catalog, not the compact creation drawer.
  await byRoleId(drawer, 'automation-definition-create-submit', 'new').click();

  const detail = byRole(page, 'automation-definition-detail');
  await expect(detail).toBeVisible();
  const resourceId = await requiredAttribute(detail, 'data-xgc-id');
  const outputAdd = byRole(page, 'automation-node-output-add').first();
  await expect(outputAdd).toBeVisible();
  await outputAdd.click();

  const library = byRoleId(page, 'automation-node-library', resourceId);
  await expect(library).toBeVisible();
  await library.getByRole('searchbox', { name: 'Search nodes' }).fill('Delay');
  const delay = byRoleId(library, 'automation-node-catalog-item', 'delay');
  const delayVisible = await delay.waitFor({ state: 'visible',timeout: 3_000 }).then(() => true, () => false);
  if (!delayVisible) {
    testInfo.annotations.push({ type: 'trusted-catalog',description: 'Delay is hidden; using the seeded process workflow only' });
    await byRoleId(library, 'automation-node-library-close', resourceId).click();
  } else {
    await delay.click();
    const nodeDialog = byRole(page, 'automation-node-dialog');
    await expect(nodeDialog).toBeVisible();
    await nodeDialog.getByRole('button', { name: 'Close node dialog' }).click();
    await expect(byRole(page, 'automation-node')).toHaveCount(2);
    await expect(byRole(page, 'automation-edge')).toHaveCount(1);

    const save = byRoleId(page, 'automation-definition-save', resourceId);
    await expect(save).toBeEnabled();
    await save.click();
    // Saving a new draft adopts its canonical resource identity. Assert that
    // transition directly so the locator cannot race the replacement topbar.
    await expect(detail).not.toHaveAttribute('data-xgc-id', resourceId);
    const persistedResourceId = await requiredAttribute(detail, 'data-xgc-id');
    await expect(byRoleId(page, 'automation-definition-save', persistedResourceId)).toBeDisabled();
  }

  await openAutomationsList(page, targetId);
  const row = byRole(page, 'automation-definition-row').filter({ hasText: workflowName });
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  const persistedResourceId = await requiredAttribute(row, 'data-xgc-id');
  expect(persistedResourceId).not.toBe('new');
  await expect(byRoleId(row, 'automation-definition-meta', persistedResourceId)).not.toContainText(targetId);
}

function byRole(scope: Page | Locator, role: string) {
  return scope.locator(`[data-xgc-role=${JSON.stringify(role)}]`);
}

function byRoleId(scope: Page | Locator, role: string, id?: string) {
  const selector = `[data-xgc-role=${JSON.stringify(role)}]${id === undefined ? '' : `[data-xgc-id=${JSON.stringify(id)}]`}`;
  return scope.locator(selector);
}

async function requiredAttribute(locator: Locator, name: string) {
  const value = await locator.getAttribute(name);
  if (!value) throw new Error(`${name} is missing from ${await locator.evaluate((element) => element.outerHTML)}`);
  return value;
}

function pidFromRuntime(value: string | null) {
  const pid = /\bPID\s+(\d+)/.exec(value ?? '')?.[1];
  if (!pid) throw new Error(`remote process runtime did not expose a PID: ${value ?? ''}`);
  return pid;
}

function normalizedText(value: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizedRestartText(value: string | null) {
  return /\b\d+\s+restarts?\b/.exec(normalizedText(value))?.[0] ?? '';
}

function automationDetailHash(targetId: string, resourceId: string) {
  return `#/automations/${encodeURIComponent(targetId)}/workflows/${encodeURIComponent(resourceId)}`;
}

function automationListHash(targetId: string) {
  return `#/automations/${encodeURIComponent(targetId)}/workflows`;
}
