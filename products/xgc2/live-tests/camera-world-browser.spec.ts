import { expect,test,type Page,type Request } from '@playwright/test';
import {
  assertCameraInitialEvidence,
  assertCameraContinuity,
  assertExclusiveCameraImageBranch,
  assertNoPageFaults,
  assertNoCameraPromptOverlap,
  assertRunStopMutualExclusion,
  assertStopOwnershipClosure,
  cameraVideoContract,
  cameraWorkspaceContract,
  readCameraTargets,
} from './camera-browser-contract.mjs';

const cameraTargets = readCameraTargets(process.env);

for (const target of cameraTargets) {
  test.describe(`Camera ${target.caseId}`,() => {
    test('owns one Run through list/back/reload and closes all ownership on Stop',async ({ page }) => {
      const faults = installFaultRecorder(page);
      let ownedRunId = '';
      try {
        await openCameraExperiment(page,target);
        const idleState = await waitForSettledRunStop(page,target);
        assertRunStopMutualExclusion(idleState,`${target.caseId} initial Run/Stop`);
        if (!idleState.runVisible) throw new Error(`${target.caseId} fixture is not idle; this case will not adopt an external Run`);
        await selectRunMode(page,target);
        ownedRunId = await startOwnedExperimentRun(page,target,(runId) => { ownedRunId = runId; });
        const runningState = await waitForSettledRunStop(page,target);
        assertRunStopMutualExclusion(runningState,`${target.caseId} started Run/Stop`);
        if (!runningState.stopVisible) throw new Error(`${target.caseId} did not expose Stop for owned Run ${ownedRunId}`);
        await waitForCameraReady(page,target);
        assertExclusiveCameraImageBranch(await waitForCameraBranch(page,target,'video'),`${target.caseId} initial image branch`);
        assertNoCameraPromptOverlap(await readCameraLayoutEvidence(page,target),`${target.caseId} initial layout`);
        const before = await readVideoEvidence(page,target);
        assertCameraInitialEvidence(before,target,`${target.caseId} initial video`);
        await expect.poll(async () => (await readVideoEvidence(page,target)).currentTime)
          .toBeGreaterThan(before.currentTime + 0.2);
        const progressed = await readVideoEvidence(page,target);
        const marker = await markVideoElement(page,target);

        await page.locator('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]').click();
        await expect(page.locator('[data-xgc-role="experiment-list-route"]')).toBeVisible();
        await expect(page.locator(`${workspaceSelector(target)}:visible`)).toHaveCount(0);
        await expect(page.locator(cameraPanelSelector(target.panelId))).toHaveCount(1);

        await openCameraExperimentFromList(page,target);
        await selectGcsDashboard(page,target);
        await waitForCameraReady(page,target);
        await expect.poll(async () => (await readVideoEvidence(page,target)).currentTime)
          .toBeGreaterThan(progressed.currentTime + 0.2);
        const after = await readVideoEvidence(page,target);
        assertCameraContinuity({
          sameVideoElement:after.sameAsMarkedElement && after.marker === marker,before:progressed,after,
        },`${target.caseId} same-tab list/back`);
        await assertOwnedRunStillActive(page,target,ownedRunId);
        assertNoCameraPromptOverlap(await readCameraLayoutEvidence(page,target),`${target.caseId} list/back layout`);

        await rapidReload(page,target);
        assertRunStopMutualExclusion(await waitForSettledRunStop(page,target),`${target.caseId} post-reload Run/Stop`);
        await waitForCameraReady(page,target);
        await assertOwnedRunStillActive(page,target,ownedRunId);
        assertExclusiveCameraImageBranch(await waitForCameraBranch(page,target,'video'),`${target.caseId} post-reload image branch`);
        assertNoCameraPromptOverlap(await readCameraLayoutEvidence(page,target),`${target.caseId} post-reload layout`);

        await stopOwnedExperimentRun(page,target,ownedRunId);
        ownedRunId = '';
        assertExclusiveCameraImageBranch(await waitForCameraBranch(page,target,'empty'),`${target.caseId} stopped image branch`);
        assertNoCameraPromptOverlap(await readCameraLayoutEvidence(page,target),`${target.caseId} stopped layout`);
      } finally {
        if (ownedRunId) await stopOwnedExperimentRun(page,target,ownedRunId);
      }
      assertNoPageFaults(faults,target.caseId);
    });
  });
}

async function openCameraExperiment(page: Page,target: CameraTarget) {
  await page.goto('/');
  await expect(page.locator('[data-xgc-role="app-shell"]')).toBeVisible();
  await page.locator('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]').click();
  await expect(page.locator('[data-xgc-role="experiment-list-route"]')).toBeVisible();
  await openCameraExperimentFromList(page,target);
  await selectGcsDashboard(page,target);
}

async function openCameraExperimentFromList(page: Page,target: CameraTarget) {
  const row = page.locator(experimentRowSelector(target.experimentId));
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator(`${experimentSurfaceSelector(target.experimentId)}:visible`)).toHaveCount(1);
}

async function selectGcsDashboard(page: Page,target: CameraTarget) {
  const gcsTab = page.locator(`[data-xgc-role="experiment-dashboard-tabs"] [role="tab"][data-xgc-id="${target.dashboardId}"]`);
  await expect(gcsTab).toHaveCount(1);
  if ((await gcsTab.getAttribute('aria-selected')) !== 'true') await gcsTab.click();
}

async function selectRunMode(page: Page,target: CameraTarget) {
  const selected = page.locator(
    `[data-xgc-role="experiment-run-mode"][data-xgc-id="${target.experimentId}"][data-xgc-value="${target.runMode}"]`,
  );
  if (await selected.isVisible().catch(() => false)) return;
  const root = page.locator(`[data-xgc-role="experiment-run-mode-select"][data-xgc-id="${target.experimentId}"]`);
  await expect(root).toBeVisible();
  await root.getByRole('button').click();
  await page.getByRole('option',{ name:target.runMode,exact:true }).click();
  await expect(selected).toBeVisible();
}

async function startOwnedExperimentRun(page: Page,target: CameraTarget,onAccepted:(runId:string)=>void) {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/execution-targets/local/orchestration-runs'
    && requestMatchesExperimentCommand(response.request(),target.experimentId,'run',target.runMode)
  ));
  await page.locator(runSelector(target.experimentId)).click();
  const response = await responsePromise;
  const rawBody = await response.text();
  let body: { run?:{ id?:unknown;sourceRef?:{ resourceId?:unknown };parameters?:{ runMode?:unknown } } } = {};
  try { body = JSON.parse(rawBody) as typeof body; } catch { /* diagnosed below after cleanup ownership recovery */ }
  let runId = typeof body.run?.id === 'string' ? body.run.id : '';
  if (response.status() === 202 && !runId) runId = await discoverAcceptedRun(page,target);
  if (response.status() === 202 && runId) onAccepted(runId);
  if (response.status() !== 202 || !runId || body.run?.sourceRef?.resourceId !== target.experimentId
    || body.run?.parameters?.runMode !== target.runMode) {
    throw new Error(`${target.caseId} Start returned no exact owned Run: HTTP ${response.status()} ${rawBody}`);
  }
  return runId;
}

async function discoverAcceptedRun(page:Page,target:CameraTarget) {
  const sessions = array(await getJSON(page,
    `/api/execution-targets/local/experiment-sessions?experimentId=${encodeURIComponent(target.experimentId)}`));
  if (sessions.length !== 1) return '';
  const owner = array(record(sessions[0])?.members).map(record).find((member) => member?.kind === 'workflow_command')?.ownerId;
  if (typeof owner !== 'string') return '';
  const run = record(await getJSON(page,`/api/execution-targets/local/orchestration-runs/${encodeURIComponent(owner)}`));
  return record(run?.sourceRef)?.resourceId === target.experimentId && run?.actionId === 'run' ? owner : '';
}

async function stopOwnedExperimentRun(page: Page,target: CameraTarget,runId: string) {
  if (!await page.locator(stopSelector(target.experimentId)).isVisible().catch(() => false)) {
    await openCameraExperiment(page,target);
  }
  const stop = page.locator(stopSelector(target.experimentId));
  if (await stop.isVisible().catch(() => false)) {
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/execution-targets/local/orchestration-runs'
      && requestMatchesExperimentCommand(response.request(),target.experimentId,'stop-all')
    ));
    await stop.click();
    const response = await responsePromise;
    if (response.status() < 200 || response.status() >= 300) {
      throw new Error(`${target.caseId} Stop HTTP ${response.status()}: ${await response.text()}`);
    }
  }
  const closure = await waitForStopOwnershipClosure(page,target,runId);
  assertStopOwnershipClosure(closure,`${target.caseId} Stop ownership`);
  const state = await waitForSettledRunStop(page,target);
  assertRunStopMutualExclusion(state,`${target.caseId} stopped Run/Stop`);
  if (!state.runVisible) throw new Error(`${target.caseId} retained Stop instead of returning to Run`);
}

function experimentCommand(value: unknown,experimentId: string,actionId: 'run'|'stop-all',runMode?:string) {
  const body = record(value);
  const experimentRef = record(body?.experimentRef);
  const parameters = record(body?.parameters);
  return body?.actionId === actionId
    && experimentRef?.resourceId === experimentId
    && (actionId !== 'run' || parameters?.runMode === runMode);
}

function requestMatchesExperimentCommand(request:Request,experimentId:string,actionId:'run'|'stop-all',runMode?:string) {
  try { return experimentCommand(request.postDataJSON(),experimentId,actionId,runMode); } catch { return false; }
}

async function waitForStopOwnershipClosure(page: Page,target: CameraTarget,rootRunId: string) {
  const deadline = Date.now() + 90_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const closure = await readStopOwnershipClosure(page,target,rootRunId);
      assertStopOwnershipClosure(closure,`${target.caseId} Stop ownership`);
      return closure;
    } catch (cause) {
      lastError = cause;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${target.caseId} Stop ownership did not close: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function assertOwnedRunStillActive(page: Page,target: CameraTarget,runId: string) {
  const run = record(await getJSON(page,
    `/api/execution-targets/local/orchestration-runs/${encodeURIComponent(runId)}`));
  if (!run || !['accepted','queued','running','waiting'].includes(String(run.status))) {
    throw new Error(`${target.caseId} lost owned Run ${runId}: ${JSON.stringify(run)}`);
  }
  const sessions = array(await getJSON(page,
    `/api/execution-targets/local/experiment-sessions?experimentId=${encodeURIComponent(target.experimentId)}`));
  const ownsRoot = sessions.length === 1 && array(record(sessions[0])?.members).some((memberValue) => {
    const member = record(memberValue);
    return member?.kind === 'workflow_command' && member.ownerId === runId;
  });
  if (!ownsRoot) throw new Error(`${target.caseId} Session no longer owns Run ${runId}`);
}

async function readStopOwnershipClosure(page: Page,target: CameraTarget,rootRunId: string) {
  const queue = [{ targetId:'local',runId:rootRunId }];
  const seen = new Set<string>();
  const runs:JsonRecord[] = [];
  const processes:JsonRecord[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    const key = `${current.targetId}\u0000${current.runId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 1000) throw new Error('camera Run ownership closure exceeds 1000 Runs');
    const run = record(await getJSON(page,
      `/api/execution-targets/${encodeURIComponent(current.targetId)}/orchestration-runs/${encodeURIComponent(current.runId)}`));
    if (run) runs.push(run);
    const relations = record(await getJSON(page,
      `/api/execution-targets/${encodeURIComponent(current.targetId)}/orchestration-runs/${encodeURIComponent(current.runId)}/relations`));
    for (const childValue of array(relations?.childRuns)) {
      const child = record(childValue);
      if (typeof child?.childRunId !== 'string') continue;
      queue.push({
        targetId:typeof child.targetId === 'string' ? child.targetId : current.targetId,
        runId:child.childRunId,
      });
    }
    const owned = await getJSON(page,
      `/api/execution-targets/${encodeURIComponent(current.targetId)}/process-instances`
      + `?ownerType=orchestration-run&ownerId=${encodeURIComponent(current.runId)}&limit=1000`);
    for (const process of array(owned)) if (record(process)) processes.push(process as JsonRecord);
  }
  const sessions = array(await getJSON(page,
    `/api/execution-targets/local/experiment-sessions?experimentId=${encodeURIComponent(target.experimentId)}`));
  return { runs,sessions,processes };
}

async function getJSON(page: Page,path: string):Promise<unknown> {
  const response = await page.request.get(path);
  if (!response.ok()) throw new Error(`HTTP ${response.status()} GET ${path}: ${await response.text()}`);
  return response.json();
}

type JsonRecord = Record<string,unknown>;
function record(value:unknown):JsonRecord|undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}
function array(value:unknown):unknown[] { return Array.isArray(value) ? value : []; }

async function waitForCameraReady(page: Page,target: CameraTarget) {
  const contract = cameraWorkspaceContract(target.panelKind) as CameraWorkspaceContract;
  const videoContract = cameraVideoContract(target);
  await page.waitForFunction(({ panelId,contract,videoContract }) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const workspace = document.querySelector(
      `[data-xgc-role="${contract.workspaceRole}"][data-xgc-id="${CSS.escape(panelId)}"]`,
    );
    if (!(workspace instanceof HTMLElement) || !visible(workspace)) return false;
    const liveView = contract.liveViewRole
      ? workspace.querySelector(`[data-xgc-role="${contract.liveViewRole}"]`)
      : workspace;
    const runtime = contract.runtimeRole
      ? workspace.querySelector(`[data-xgc-role="${contract.runtimeRole}"]`)
      : workspace;
    const panel = workspace.querySelector('[data-xgc-role="camera-video-panel"]');
    const video = workspace.querySelector('[data-xgc-role="camera-video-stream"]');
    if (!(liveView instanceof HTMLElement) || !(runtime instanceof HTMLElement)
      || !(panel instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) return false;
    const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const lifecycleReady = !contract.lifecycleAttribute
      || workspace.getAttribute(contract.lifecycleAttribute) === videoContract.lifecycle;
    return lifecycleReady
      && panel.getAttribute('data-state') === videoContract.state
      && video.readyState === videoContract.readyState
      && video.videoWidth === videoContract.videoWidth
      && video.videoHeight === videoContract.videoHeight
      && !video.paused
      && !video.ended
      && track?.readyState === 'live';
  },{ panelId:target.panelId,contract,videoContract },{ timeout:90_000 });
}

async function readCameraBranch(page: Page,target: CameraTarget) {
  const contract = cameraWorkspaceContract(target.panelKind) as CameraWorkspaceContract;
  return page.evaluate(({ panelId,contract }) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const workspaces = [...document.querySelectorAll(
      `[data-xgc-role="${contract.workspaceRole}"][data-xgc-id="${CSS.escape(panelId)}"]`,
    )];
    const visibleWorkspaces = workspaces.filter(visible);
    const workspace = visibleWorkspaces[0];
    const imageViews = !workspace ? [] : contract.branchRole
      ? [...workspace.querySelectorAll(`[data-xgc-role="${contract.branchRole}"]`)]
      : [workspace];
    const imageView = imageViews.find(visible) ?? imageViews[0];
    return {
      totalWorkspaceCount:workspaces.length,
      visibleWorkspaceCount:visibleWorkspaces.length,
      imageViewCount:imageViews.length,
      emptyStateCount:imageView?.querySelectorAll(contract.emptyStateSelector).length ?? 0,
      cameraPanelCount:imageView?.querySelectorAll('[data-xgc-role="camera-video-panel"]').length ?? 0,
    };
  },{ panelId:target.panelId,contract });
}

async function readCameraLayoutEvidence(page: Page,target: CameraTarget) {
  const contract = cameraWorkspaceContract(target.panelKind) as CameraWorkspaceContract;
  return page.evaluate(({ panelId,contract }) => {
    const visible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const workspace = [...document.querySelectorAll(
      `[data-xgc-role="${contract.workspaceRole}"][data-xgc-id="${CSS.escape(panelId)}"]`,
    )].find(visible);
    if (!(workspace instanceof HTMLElement)) return { visibleVideoCount:0,visiblePromptCount:0,overlapArea:0 };
    const videos = [...workspace.querySelectorAll('[data-xgc-role="camera-video-stream"]')].filter(visible);
    const prompts = [...workspace.querySelectorAll(contract.emptyStateSelector)].filter(visible);
    let overlapArea = 0;
    for (const video of videos) for (const prompt of prompts) {
      const left = video.getBoundingClientRect();
      const right = prompt.getBoundingClientRect();
      overlapArea += Math.max(0,Math.min(left.right,right.right)-Math.max(left.left,right.left))
        * Math.max(0,Math.min(left.bottom,right.bottom)-Math.max(left.top,right.top));
    }
    return { visibleVideoCount:videos.length,visiblePromptCount:prompts.length,overlapArea };
  },{ panelId:target.panelId,contract });
}

async function waitForCameraBranch(page: Page,target: CameraTarget,expected: 'empty'|'video') {
  await expect.poll(async () => {
    const snapshot = await readCameraBranch(page,target);
    const hasVideo = snapshot.visibleWorkspaceCount === 1
      && snapshot.imageViewCount === 1
      && snapshot.emptyStateCount === 0
      && snapshot.cameraPanelCount === 1;
    const hasEmpty = snapshot.visibleWorkspaceCount === 1
      && snapshot.imageViewCount === 1
      && snapshot.emptyStateCount === 1
      && snapshot.cameraPanelCount === 0;
    return expected === 'video' ? hasVideo : hasEmpty;
  },{ timeout:30_000 }).toBe(true);
  return readCameraBranch(page,target);
}

async function readVideoEvidence(page: Page,target: CameraTarget) {
  const contract = cameraWorkspaceContract(target.panelKind) as CameraWorkspaceContract;
  return page.locator(cameraPanelSelector(target.panelId)).first().evaluate((panel,contract) => {
    const video = panel.querySelector('[data-xgc-role="camera-video-stream"]');
    if (!(video instanceof HTMLVideoElement)) throw new Error('CameraVideoPanel video element is missing');
    const workspace = panel.closest(`[data-xgc-role="${contract.workspaceRole}"]`);
    const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const runtimeReady = !contract.runtimeRole
      || Boolean(workspace?.querySelector(`[data-xgc-role="${contract.runtimeRole}"]`));
    const lifecycle = contract.lifecycleAttribute
      ? workspace?.getAttribute(contract.lifecycleAttribute) ?? ''
      : runtimeReady && panel.getAttribute('data-state') === 'playing' ? 'ready' : '';
    return {
      lifecycle,
      state:panel.getAttribute('data-state') ?? '',
      readyState:video.readyState,
      videoWidth:video.videoWidth,
      videoHeight:video.videoHeight,
      currentTime:video.currentTime,
      paused:video.paused,
      ended:video.ended,
      trackReadyState:track?.readyState ?? '',
      marker:(video as HTMLVideoElement & { __xgcCameraAcceptanceMarker?: string }).__xgcCameraAcceptanceMarker ?? '',
      sameAsMarkedElement:(window as Window & { __xgcCameraAcceptanceVideo?: HTMLVideoElement }).__xgcCameraAcceptanceVideo === video,
    };
  },contract);
}

async function markVideoElement(page: Page,target: CameraTarget) {
  return page.locator(`${cameraPanelSelector(target.panelId)} [data-xgc-role="camera-video-stream"]`).first().evaluate((element) => {
    if (!(element instanceof HTMLVideoElement)) throw new Error('CameraVideoPanel video element is missing');
    const marker = `camera-acceptance-${Date.now()}-${Math.random()}`;
    Object.defineProperty(element,'__xgcCameraAcceptanceMarker',{ configurable:true,writable:true,value:marker });
    (window as Window & { __xgcCameraAcceptanceVideo?: HTMLVideoElement }).__xgcCameraAcceptanceVideo = element;
    return marker;
  });
}

async function waitForSettledRunStop(page: Page,target: CameraTarget) {
  await page.waitForFunction(({ experimentId }) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const escapedId = CSS.escape(experimentId);
    const run = document.querySelector(`[data-xgc-role="experiment-run"][data-xgc-id="${escapedId}"]`);
    const stop = document.querySelector(`[data-xgc-role="experiment-stop"][data-xgc-id="${escapedId}"]`);
    const loading = document.querySelector(`[data-xgc-role="experiment-state-loading"][data-xgc-id="${escapedId}"]`);
    const runVisible = visible(run);
    const stopVisible = visible(stop);
    const loadingVisible = visible(loading);
    return !loadingVisible && runVisible !== stopVisible;
  },{ experimentId:target.experimentId },{ timeout:30_000 });
  return readRunStopState(page,target);
}

async function readRunStopState(page: Page,target: CameraTarget) {
  return page.evaluate(({ experimentId }) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const escapedId = CSS.escape(experimentId);
    return {
      runVisible:visible(document.querySelector(`[data-xgc-role="experiment-run"][data-xgc-id="${escapedId}"]`)),
      stopVisible:visible(document.querySelector(`[data-xgc-role="experiment-stop"][data-xgc-id="${escapedId}"]`)),
      loadingVisible:visible(document.querySelector(`[data-xgc-role="experiment-state-loading"][data-xgc-id="${escapedId}"]`)),
    };
  },{ experimentId:target.experimentId });
}

async function rapidReload(page: Page,target: CameraTarget) {
  const session = await page.context().newCDPSession(page);
  for (let index = 0;index < 4;index += 1) {
    await session.send('Page.reload',{ ignoreCache:false });
    await page.waitForTimeout(40);
  }
  await expect(page.locator('[data-xgc-role="app-shell"]')).toHaveCount(1);
  await expect(page.locator(`${experimentSurfaceSelector(target.experimentId)}:visible`)).toHaveCount(1);
  await selectGcsDashboard(page,target);
  await expect(page.locator(`${workspaceSelector(target)}:visible`)).toHaveCount(1);
}

function installFaultRecorder(page: Page) {
  const faults: string[] = [];
  page.on('console',(message) => {
    if (message.type() === 'error') faults.push(`console: ${message.text()}`);
  });
  page.on('pageerror',(error) => faults.push(`pageerror: ${error.message}`));
  return faults;
}

function experimentRowSelector(experimentId: string) {
  return `[data-xgc-role="experiment-row"][data-xgc-id="${experimentId}"]`;
}

function experimentSurfaceSelector(experimentId: string) {
  return `[data-xgc-role="experiment-dashboard-surface"][data-xgc-id="${experimentId}"]`;
}

function workspaceSelector(target: CameraTarget) {
  const contract = cameraWorkspaceContract(target.panelKind) as CameraWorkspaceContract;
  return `[data-xgc-role="${contract.workspaceRole}"][data-xgc-id="${target.panelId}"]`;
}

function cameraPanelSelector(panelId: string) {
  return `[data-xgc-role="camera-video-panel"][data-xgc-id="${panelId}"]`;
}

function runSelector(experimentId: string) {
  return `[data-xgc-role="experiment-run"][data-xgc-id="${experimentId}"]`;
}

function stopSelector(experimentId: string) {
  return `[data-xgc-role="experiment-stop"][data-xgc-id="${experimentId}"]`;
}

type CameraTarget = {
  caseId:string;
  experimentId:string;
  panelId:string;
  dashboardId:string;
  panelKind:'gazebo-world-camera'|'camera-intrinsic-calibration';
  runMode:'simulation'|'physical'|'hybrid';
};

type CameraWorkspaceContract = {
  workspaceRole:string;
  branchRole:string;
  liveViewRole:string;
  runtimeRole:string;
  emptyStateSelector:string;
  lifecycleAttribute:string;
};
