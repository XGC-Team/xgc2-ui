import { expect,test,type Locator } from '@playwright/test';

test('rapid same-tab reload keeps one app root and exclusive camera lifecycle branches',async ({ page },testInfo) => {
  const fatal:string[] = [];
  const requestFailures:{ url:string;resourceType:string;errorText:string }[] = [];
  page.on('console',(message) => {
    if (message.type() !== 'error' || /ERR_ABORTED/i.test(message.text())) return;
    fatal.push(`console: ${message.text()}`);
  });
  page.on('pageerror',(error) => fatal.push(`pageerror: ${error.message}`));
  page.on('requestfailed',(request) => {
    if (request.resourceType() !== 'script' && !request.url().includes('/api/')) return;
    requestFailures.push({
      url:request.url(),
      resourceType:request.resourceType(),
      errorText:request.failure()?.errorText ?? '',
    });
  });

  await page.goto('/');
  await expect(page.locator('[data-xgc-role="app-shell"]')).toBeVisible();
  const session = await page.context().newCDPSession(page);
  for (let index = 0;index < 12;index += 1) {
    await session.send('Page.reload',{ ignoreCache:false });
    await page.waitForTimeout(35);
  }
  await expect(page.locator('[data-xgc-role="app-shell"]')).toBeVisible();
  await expect(page.locator('[data-xgc-role="app-shell"]')).toHaveCount(1);

  await page.evaluate(async () => {
    await import(`/src/main.tsx?same-tab-bootstrap=${Date.now()}`);
  });
  await expect(page.locator('[data-xgc-role="app-shell"]')).toHaveCount(1);
  const mountState = await page.evaluate(() => {
    const root = document.getElementById('root') as (HTMLElement & { __xgcProductWebRoot?: unknown }) | null;
    return {
      rootCount:document.querySelectorAll('#root').length,
      appShellCount:document.querySelectorAll('[data-xgc-role="app-shell"]').length,
      ownedRoot:Boolean(root?.__xgcProductWebRoot),
    };
  });
  expect(mountState).toEqual({ rootCount:1,appShellCount:1,ownedRoot:true });

  const controlPage = await page.context().newPage();
  const controlFatal:string[] = [];
  controlPage.on('console',(message) => {
    if (message.type() === 'error') controlFatal.push(`console: ${message.text()}`);
  });
  controlPage.on('pageerror',(error) => controlFatal.push(`pageerror: ${error.message}`));
  await controlPage.goto('/');
  await expect(controlPage.locator('[data-xgc-role="app-shell"]')).toBeVisible();
  await expect(controlPage.locator('[data-xgc-role="app-shell"]')).toHaveCount(1);
  expect(controlFatal).toEqual([]);
  await controlPage.close();

  await page.locator('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]').click();
  const fleetExperiment = page.locator('[data-xgc-role="experiment-row"]')
    .filter({ hasText:'6 PX4 multirotors experiment' }).first();
  await expect(fleetExperiment).toBeVisible();
  await fleetExperiment.dblclick();
  const appShell = page.locator('[data-xgc-role="app-shell"][data-xgc-id="experiment"]');
  const gcsMode = page.locator(
    '[data-xgc-role="experiment-gcs-mode"][data-xgc-id="global"]',
  );
  const configTab = page.locator(
    '[data-xgc-role="experiment-dashboard-tabs"] [role="tab"][data-xgc-id="config"]',
  );
  const calibrationTab = page.locator(
    '[data-xgc-role="experiment-dashboard-tabs"] [role="tab"][data-xgc-id="calibration"]',
  );
  const algorithmTab = page.locator(
    '[data-xgc-role="experiment-dashboard-tabs"] [role="tab"][data-xgc-id="algorithm"]',
  );
  const gcsTab = page.locator('[data-xgc-role="experiment-dashboard-tabs"] [role="tab"][data-xgc-id="gcs"]');
  await expect(gcsMode).toBeVisible();
  if (await gcsMode.getAttribute('aria-pressed') === 'true') {
    await gcsMode.click();
    await expect(gcsMode).toHaveAttribute('aria-pressed','false');
    await expect(appShell).not.toHaveAttribute('data-xgc-mode','ground-station');
  }
  await gcsMode.click();
  await expect(gcsMode).toHaveAttribute('aria-pressed','true');
  await expect(appShell).toHaveAttribute('data-xgc-mode','ground-station');

  await expect(configTab).toBeVisible();
  await configTab.click();
  await expect(configTab).toHaveAttribute('aria-selected','true');
  await expect(gcsMode).toHaveAttribute('aria-pressed','true');
  await expect(appShell).toHaveAttribute('data-xgc-mode','ground-station');

  await expect(calibrationTab).toBeVisible();
  await calibrationTab.click();
  await expect(calibrationTab).toHaveAttribute('aria-selected','true');
  await expect(algorithmTab).toBeVisible();
  await algorithmTab.click();
  await expect(algorithmTab).toHaveAttribute('aria-selected','true');
  await expect(gcsTab).toBeVisible();
  await gcsTab.click();
  await expect(gcsTab).toHaveAttribute('aria-selected','true');
  await expect(gcsMode).toHaveAttribute('aria-pressed','true');
  await expect(appShell).toHaveAttribute('data-xgc-mode','ground-station');
  await calibrationTab.click();
  await expect(calibrationTab).toHaveAttribute('aria-selected','true');
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('xgc.nav.experimentGcsMode')
  ))).toBe('true');

  for (let index = 0;index < 4;index += 1) {
    await session.send('Page.reload',{ ignoreCache:false });
    await page.waitForTimeout(35);
  }
  await expect(appShell).toBeVisible();
  await expect(page.locator('[data-xgc-role="app-shell"]')).toHaveCount(1);
  await expect(gcsMode).toHaveAttribute('aria-pressed','true');
  await expect(calibrationTab).toHaveAttribute('aria-selected','true');
  await expect(appShell).toHaveAttribute('data-xgc-mode','ground-station');
  const workspace = page.locator(
    '[data-xgc-role="gazebo-world-camera-workspace"][data-xgc-id="gazebo-world-camera"]:visible',
  );
  await expect(workspace).toHaveCount(1);
  await assertExclusiveCameraImageBranch(workspace);

  await page.locator('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]').click();
  await expect(fleetExperiment).toBeVisible();
  await fleetExperiment.dblclick();
  await expect(calibrationTab).toBeVisible();
  await expect(calibrationTab).toHaveAttribute('aria-selected','true');
  await expect(gcsMode).toHaveAttribute('aria-pressed','true');
  await expect(appShell).toHaveAttribute('data-xgc-mode','ground-station');
  await expect(workspace).toHaveCount(1);
  await assertExclusiveCameraImageBranch(workspace);

  await testInfo.attach('same-tab-reload-lifecycle.json',{
    body:JSON.stringify({
      firstConsoleOrPageError:fatal[0] ?? null,
      firstFailedChunkOrApi:requestFailures[0] ?? null,
      mountState,
      newWindowControl:{ appShellCount:1,fatal:controlFatal },
      gcsPersistence:{
        globalControlPressed:true,
        retainedAcrossDashboardTabs:true,
        retainedAcrossRapidReload:true,
        selectedAfterRouteReturn:true,
        shellMode:'ground-station',
      },
    },null,2),
    contentType:'application/json',
  });
  expect(fatal).toEqual([]);
});

test('same-tab bootstrap remains visible and retries a failed profile module',async ({ page }) => {
  const failedModules:string[] = [];
  const profileRequests:string[] = [];
  let aborted = false;
  page.on('request',(request) => {
    if (request.url().includes('profile-entry')) profileRequests.push(request.url());
  });
  page.on('requestfailed',(request) => {
    if (request.resourceType() === 'script') failedModules.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.route('**/createAutomationsRoute.ts*',async (route) => {
    if (!aborted) {
      aborted = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  const bootstrapStatus = page.locator('[data-xgc-role="product-web-bootstrap-status"]');
  await expect(bootstrapStatus).toHaveAttribute('role','alert');
  await expect(bootstrapStatus).toContainText('could not load');
  expect(failedModules.some((entry) => entry.includes('createAutomationsRoute.ts'))).toBe(true);
  expect(profileRequests.length).toBeGreaterThanOrEqual(2);
  expect(await page.locator('#root').count()).toBe(1);
  expect(await page.locator('[data-xgc-role="app-shell"]').count()).toBe(0);
});

async function assertExclusiveCameraImageBranch(workspace: Locator) {
  const imageView = workspace.locator('[data-xgc-role="gazebo-world-camera-image-view"]');
  await expect(imageView).toHaveCount(1);
  const emptyCount = await imageView.locator('[data-xgc-role="gazebo-world-camera-empty-state"]').count();
  const videoCount = await imageView.locator('.camera-video-panel-root, video').count();
  if (emptyCount === 1) expect(videoCount).toBe(0);
  else {
    expect(emptyCount).toBe(0);
    expect(videoCount).toBeGreaterThan(0);
  }
}
