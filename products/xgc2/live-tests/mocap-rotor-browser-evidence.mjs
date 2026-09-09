/* global document,fetch,getComputedStyle,HTMLIFrameElement,process,URL */
import { createHash } from 'node:crypto';
import { existsSync,writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { chromium } from '@playwright/test';
import {
  MOCAP_ASSET_ID,
  MOCAP_DESCRIPTION_PARAMETER,
  MOCAP_PATH_TOPIC,
  MOCAP_ROBOT_ID,
  MOCAP_TARGET_ID,
  assertMocapBrowserEvidence,
  assertMocapInstrumentProjectionSample,
  assertMocapLayout,
  assertMocapLedger,
  assertMocapTransitionEvidence,
  digestEvidence,
  readJSONEvidence,
  rejectMocapIdentities,
} from './browser-evidence-contract.mjs';

const DASHBOARD_TARGET_ID = 'local';
const PANEL_TIMEOUT_MS = 45_000;
const FORBIDDEN_IDENTITIES = ['mocap_fixture1','xgc2_mocap_fixture_fs150_0','fs150'];
const ASSET_PANEL_IDS = ['robot-assets'];
const GCS_PANEL_IDS = ['robot-instruments','lichtblick'];

const configuration = {
  webUrl:requiredURL('XGC_MOCAP_ROTOR_WEB_URL'),
  experimentId:requiredID('XGC_MOCAP_ROTOR_EXPERIMENT_ID'),
  sessionId:requiredID('XGC_MOCAP_ROTOR_SESSION_ID'),
  onboardRunId:requiredID('XGC_MOCAP_ROTOR_ONBOARD_RUN_ID'),
  onboardRuntimeRunId:requiredID('XGC_MOCAP_ROTOR_ONBOARD_RUNTIME_RUN_ID'),
  projectionRunId:requiredID('XGC_MOCAP_ROTOR_PROJECTION_RUN_ID'),
  onboardResourceId:requiredID('XGC_MOCAP_ROTOR_ONBOARD_RESOURCE_ID'),
  adaptersResourceId:requiredID('XGC_MOCAP_ROTOR_ADAPTERS_RESOURCE_ID'),
  adapterPackageVersion:required('XGC_MOCAP_ROTOR_ADAPTER_PACKAGE_VERSION'),
  adapterSourceDigest:requiredDigest('XGC_MOCAP_ROTOR_ADAPTER_SOURCE_DIGEST'),
  adapterLocalDebSha256:requiredDigest('XGC_MOCAP_ROTOR_ADAPTER_LOCAL_DEB_SHA256'),
  trajectoryPackageVersion:required('XGC_MOCAP_ROTOR_TRAJECTORY_PACKAGE_VERSION'),
  trajectorySourceDigest:requiredDigest('XGC_MOCAP_ROTOR_TRAJECTORY_SOURCE_DIGEST'),
  trajectoryLocalDebSha256:requiredDigest('XGC_MOCAP_ROTOR_TRAJECTORY_LOCAL_DEB_SHA256'),
  ledgerPath:requiredAbsolutePath('XGC_MOCAP_ROTOR_LEDGER'),
  layoutPath:requiredAbsolutePath('XGC_MOCAP_ROTOR_LAYOUT_EVIDENCE'),
  transitionPath:requiredAbsolutePath('XGC_MOCAP_ROTOR_TRANSITION_EVIDENCE'),
  evidencePath:requiredAbsolutePath('XGC_MOCAP_ROTOR_BROWSER_EVIDENCE'),
};

assertDistinctPaths([
  configuration.ledgerPath,
  configuration.layoutPath,
  configuration.transitionPath,
  configuration.evidencePath,
]);
assertFreshOutput(configuration.evidencePath);

const expected = {
  ...configuration,dashboardTargetId:DASHBOARD_TARGET_ID,
  adapterRelease:{
    package:'ros-noetic-xgc2-mocap-rotor-adapter',packageArchitecture:'amd64',
    packageVersion:configuration.adapterPackageVersion,sourceDigest:configuration.adapterSourceDigest,
    localDebSha256:configuration.adapterLocalDebSha256,
  },
  trajectoryRelease:{
    scope:'agent-internal-fixture',targetId:MOCAP_TARGET_ID,
    package:'xgc2-dev-lab-mocap-fs150-trajectory-source',packageArchitecture:'all',
    packageVersion:configuration.trajectoryPackageVersion,
    sourcePath:'products/xgc2/dev-lab/mocap-fs150-trajectory-source/xgc2_mocap_fs150_trajectory_source_node.py',
    sourceDigest:configuration.trajectorySourceDigest,
    installedNode:'/opt/ros/noetic/lib/xgc2_dev_lab_mocap_fs150_trajectory_source/xgc2_mocap_fs150_trajectory_source_node',
    contract:'xgc2-dev-lab-mocap-fs150-trajectory/v1',
    localDebSha256:configuration.trajectoryLocalDebSha256,
  },
};
const ledger = readJSONEvidence(configuration.ledgerPath,'Mocap API ledger');
const layout = readJSONEvidence(configuration.layoutPath,'Mocap Lichtblick layout evidence');
const transition = readJSONEvidence(configuration.transitionPath,'Mocap offline/recovery evidence');
assertMocapLedger(ledger,expected);
assertMocapLayout(layout);
assertMocapTransitionEvidence(transition,expected);

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  chromium.executablePath(),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((candidate) => candidate && existsSync(candidate));

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport:{ width:1440,height:960 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror',(error) => pageErrors.push(error.message));

try {
  await page.goto(`${configuration.webUrl}/#/experiments/${configuration.experimentId}`, {
    waitUntil:'domcontentloaded',timeout:30_000,
  });

  const assetTab = await exactLocator(page.getByRole('tab',{ name:'Asset',exact:true }),'Asset tab');
  await assetTab.waitFor({ state:'visible',timeout:30_000 });
  await assetTab.click();
  const assetCard = await exactLocator(page.locator(
    `[data-xgc-role="experiment-robot-assets-panel-robot"][data-xgc-id="${MOCAP_ASSET_ID}"]`,
  ),'canonical Mocap Rotor Asset card');
  await assetCard.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const assetPanelIds = await configuredPanelIds(page,'asset',ASSET_PANEL_IDS,'Mocap Asset');
  const assetText = (await assetCard.innerText()).trim();
  const asset = {
    resourceId:MOCAP_ASSET_ID,
    count:await assetCard.count(),
    state:(await assetCard.getAttribute('data-xgc-state')) ?? '',
    text:assetText,
  };

  const gcsTab = await exactLocator(page.getByRole('tab',{ name:'GCS',exact:true }),'GCS tab');
  await gcsTab.click();
  const gcsPanelIds = await configuredPanelIds(page,'gcs',GCS_PANEL_IDS,'Mocap GCS');
  const robotCards = page.locator(
    '[data-xgc-role="experiment-panel"][data-xgc-id="robot-instruments"] '
      + '[data-xgc-role="run-robot-card"]',
  );
  const robotCard = await exactLocator(page.locator(
    `[data-xgc-role="run-robot-card"][data-xgc-id="${MOCAP_ROBOT_ID}"]`,
  ),'Mocap Rotor run Robot card');
  await robotCard.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  const flightInstrument = await exactLocator(
    robotCard.locator('[data-xgc-role="robot-flight-instrument"]'),
    'Mocap Rotor flight instrument',
  );
  await page.waitForFunction(({ robotId }) => {
    const card = document.querySelector(
      `[data-xgc-role="run-robot-card"][data-xgc-id="${robotId}"]`,
    );
    const instrument = card?.querySelector('[data-xgc-role="robot-flight-instrument"]');
    return card?.getAttribute('data-xgc-status') === 'online'
      && card?.getAttribute('data-xgc-health') === 'healthy'
      && instrument?.getAttribute('data-xgc-connection') === 'online'
      && instrument?.getAttribute('data-xgc-health') === 'healthy'
      && Number.isFinite(Number(instrument?.getAttribute('data-roll')))
      && Number.isFinite(Number(instrument?.getAttribute('data-pitch')))
      && Number.isFinite(Number(instrument?.getAttribute('data-yaw')));
  },{ robotId:MOCAP_ROBOT_ID },{ timeout:PANEL_TIMEOUT_MS });
  let robotCardText = '';
  let instrument;
  let projectionSampleError;
  const projectionSampleDeadline = Date.now()+PANEL_TIMEOUT_MS;
  const projectionPath = `/api/execution-targets/${encodeURIComponent(DASHBOARD_TARGET_ID)}`
    + `/orchestration-runs/${encodeURIComponent(configuration.projectionRunId)}/robots`;
  while (Date.now()<projectionSampleDeadline) {
    try {
      const sample = await flightInstrument.evaluate(async (root,{ projectionPath,robotId }) => {
        const response = await fetch(projectionPath,{ headers:{ Accept:'application/json' } });
        let projection;
        try { projection = await response.json(); } catch { projection = undefined; }
        const allRobots = Array.isArray(projection?.robots) ? projection.robots : [];
        const robots = allRobots.filter((robot) => robot?.id === robotId);
        if (response.status !== 200 || allRobots.length !== 1 || robots.length !== 1) {
          throw new Error(`Mocap instrument projection is unavailable: HTTP ${response.status}; `
            + `robot count ${allRobots.length}; canonical count ${robots.length}`);
        }
        const projectionRobot = robots[0];
        const channels = projectionRobot.channels && typeof projectionRobot.channels === 'object'
          ? projectionRobot.channels : {};
        const card = root.closest(`[data-xgc-role="run-robot-card"][data-xgc-id="${robotId}"]`);
        if (!card) throw new Error('Mocap Rotor card disappeared during the atomic DOM sample');
        const exact = (selector,label,container=root) => {
          const elements = container.querySelectorAll(selector);
          if (elements.length !== 1) throw new Error(`${label} count must equal 1; got ${elements.length}`);
          return elements[0];
        };
        const text = (element) => element.textContent?.trim() || '';
        const visible = (element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0;
        };
        const metric = (side) => {
          const element = exact(`.robot-flight-metric-ruler[data-xgc-side="${side}"]`,`${side} metric`);
          return {
            value:text(exact(':scope > span > strong',`${side} metric value`,element)),
            unit:text(exact(':scope > span > small',`${side} metric unit`,element)),visible:visible(element),
          };
        };
        const pairs = (selector,valueSelector) => Object.fromEntries(
          [...root.querySelectorAll(`${selector} > span`)].map((element) => [
            text(element.querySelector('small')),
            {
              value:text(element.querySelector(valueSelector)),
              title:element.getAttribute('title') || '',
              tone:element.querySelector(valueSelector)?.getAttribute('data-xgc-tone') || '',
              visible:visible(element),
            },
          ]),
        );
        const hudRows = root.querySelectorAll('.robot-flight-hud-center > div');
        if (hudRows.length !== 2) throw new Error(`HUD row count must equal 2; got ${hudRows.length}`);
        const climbText = text(hudRows[0]);
        const climbValue = climbText.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || '';
        const positionValues = [...hudRows[1].childNodes]
          .filter((node) => node.nodeType === 3 && node.textContent?.trim())
          .map((node) => node.textContent.trim());
        if (positionValues.length !== 2) {
          throw new Error(`local position value count must equal 2; got ${positionValues.length}`);
        }
        const indicators = Object.fromEntries([
          ['network','robot-network-indicator'],['position','robot-position-indicator'],
          ['power','robot-power-indicator'],
        ].map(([key,role]) => {
          const element = exact(`[data-xgc-role="${role}"]`,`${key} indicator`);
          return [key,{
            label:element.getAttribute('aria-label') || '',
            tone:element.getAttribute('data-xgc-tone') || '',visible:visible(element),
          }];
        }));
        const attitude = {
          roll:root.getAttribute('data-roll') || '',pitch:root.getAttribute('data-pitch') || '',
          yaw:root.getAttribute('data-yaw') || '',
        };
        const flightRows = root.querySelectorAll('.robot-flight-bottom-status > span');
        if (flightRows.length !== 2) {
          throw new Error(`flight status row count must equal 2; got ${flightRows.length}`);
        }
        const compass = exact('.robot-flight-yaw-compass','yaw compass');
        const compassHeadings = compass.querySelectorAll(':scope > strong');
        if (compassHeadings.length !== 1) {
          throw new Error(`compass heading count must equal 1; got ${compassHeadings.length}`);
        }
        const readouts = {
          attitude,
          metrics:{ speed:metric('left'),altitude:metric('right') },
          flight:{
            mode:text(flightRows[0]),armed:text(flightRows[1]),
            visible:visible(flightRows[0]) && visible(flightRows[1]),
          },
          frequencies:pairs('.robot-flight-frequency-list','.robot-flight-frequency-value'),
          hud:{
            climb:{
              value:climbValue,unit:'m/s',
              direction:hudRows[0].querySelector('b')?.getAttribute('data-xgc-direction') || '',
              visible:visible(hudRows[0]),
            },
            position:{ x:positionValues[0],y:positionValues[1],visible:visible(hudRows[1]) },
          },
          statuses:pairs('.robot-flight-status-list','.robot-flight-status-value'),
          compass:{ heading:text(compassHeadings[0]).replace(/°$/,''),visible:visible(compass) },
          indicators,
        };
        return {
          cardStatus:card.getAttribute('data-xgc-status') || '',
          cardHealth:card.getAttribute('data-xgc-health') || '',
          connection:root.getAttribute('data-xgc-connection') || '',
          health:root.getAttribute('data-xgc-health') || '',
          roll:attitude.roll,pitch:attitude.pitch,yaw:attitude.yaw,
          projectionAudit:{
            runId:projection?.runId,targetId:projection?.targetId,streamId:projection?.streamId,
            projectionRevision:projection?.projectionRevision,updatedAt:projection?.updatedAt,
            channelSnapshot:Object.fromEntries(Object.entries(channels).map(([channelId,channel]) => [
              channelId,{
                channelId:channel?.channelId,messageId:channel?.messageId,sequence:channel?.sequence,
                stale:channel?.stale,value:channel?.value,
              },
            ])),
          },
          readouts,text:text(root),cardText:text(card),
        };
      },{ projectionPath,robotId:MOCAP_ROBOT_ID });
      const { cardText,...sampleFields } = sample;
      robotCardText = cardText;
      instrument = { cardCount:await robotCards.count(),...sampleFields };
      assertMocapInstrumentProjectionSample({
        readouts:instrument.readouts,projectionAudit:instrument.projectionAudit,
      },expected,transition);
      projectionSampleError = undefined;
      break;
    } catch (error) {
      projectionSampleError = error;
      await page.waitForTimeout(150);
    }
  }
  if (!instrument || projectionSampleError) {
    throw new Error(`Mocap instrument and current projection did not converge: ${
      projectionSampleError instanceof Error ? projectionSampleError.message : String(projectionSampleError)}`);
  }

  const frame = await exactLocator(page.locator('[data-xgc-role="lichtblick-frame"]'),'Mocap Lichtblick frame');
  await waitForHTMLFrame(page,frame,PANEL_TIMEOUT_MS);
  const canvas = await waitForCanvas(page,PANEL_TIMEOUT_MS);
  const frameText = await page.evaluate(() => {
    const element = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement ? element.contentDocument?.body?.innerText || '' : '';
  });
  const beforeFrame = await frame.screenshot();
  await page.waitForTimeout(3_000);
  const afterFrame = await frame.screenshot();
  const frameProcessInstanceId = await frame.getAttribute('data-xgc-id');
  const frameSource = new URL(await frame.getAttribute('src') || '',configuration.webUrl);
  const websocketSource = new URL(frameSource.searchParams.get('ds.url') || 'invalid:',configuration.webUrl);
  const threeD = layout.configById['3D!xgc2'];
  const urdfLayer = threeD.layers['xgc2-urdf-mocap_rotor1'];
  const recoveredPath = transition.recovered;
  const readableAnchors = [MOCAP_DESCRIPTION_PARAMETER,MOCAP_PATH_TOPIC]
    .filter((anchor) => frameText.includes(anchor));
  const lichtblickScreenshotPath = `${configuration.evidencePath}.lichtblick.png`;
  writeFileSync(lichtblickScreenshotPath,afterFrame,{ flag:'wx' });
  const layoutStateDigest = digestEvidence(layout);
  const lichtblick = {
    frameCount:await frame.count(),
    canvasCount:canvas.count,
    canvases:canvas.canvases,
    beforeHash:sha256(beforeFrame),
    afterHash:sha256(afterFrame),
    descriptionParameter:MOCAP_DESCRIPTION_PARAMETER,
    pathTopic:MOCAP_PATH_TOPIC,
    pathPoseCount:transition.recovered.pathPoseCount,
    layoutAudit:{
      selectedLayout:layout.layout,followMode:threeD.followMode,followTf:threeD.followTf,
      cameraDistanceMeters:threeD.cameraState.distance,
      pathRenderer:{
        topic:MOCAP_PATH_TOPIC,visible:threeD.topics[MOCAP_PATH_TOPIC].visible,
        type:threeD.topics[MOCAP_PATH_TOPIC].type,
        lineWidthMeters:threeD.topics[MOCAP_PATH_TOPIC].lineWidth,
        gradient:threeD.topics[MOCAP_PATH_TOPIC].gradient,
        extentMeters:recoveredPath.pathExtentMeters,
        maxDistanceFromLastMeters:recoveredPath.maxDistanceFromLastMeters,
        lastPosition:recoveredPath.pathLastPosition,
      },
      urdfLayer:{ key:'xgc2-urdf-mocap_rotor1',...urdfLayer },
      stateDigest:layoutStateDigest,
    },
    dataSourceAudit:{
      processInstanceId:frameProcessInstanceId,targetId:DASHBOARD_TARGET_ID,
      kind:frameSource.searchParams.get('ds'),proxyPath:frameSource.pathname.replace(/\/$/,''),
      websocketPath:websocketSource.pathname,embedded:frameSource.searchParams.get('xgc2Embed') === '1',
    },
    rendererAudit:{
      canvasCount:canvas.count,readableAnchors,
      anchorMode:readableAnchors.length === 2 ? 'ui-readable' : 'layout-and-screenshot-manual',
      visualGate:{
        pixelSemanticsClaimed:false,screenshotPath:lichtblickScreenshotPath,
        screenshotSha256:sha256(afterFrame),layoutStateDigest,
      },
    },
  };
  lichtblick.dynamic = lichtblick.beforeHash !== lichtblick.afterHash;

  const auditedSurfaces = {
    asset:assetText,
    robotCard:robotCardText,
    lichtblickFrame:frameText,
  };
  const forbiddenMatches = findForbiddenMatches(auditedSurfaces);
  rejectMocapIdentities(auditedSurfaces,'Mocap browser surfaces');
  const identityAudit = {
    scopes:['asset','robot-card','lichtblick-frame'],
    forbiddenMatches,
    surfaceDigests:{
      asset:sha256(assetText),
      robotCard:sha256(robotCardText),
      lichtblickFrame:sha256(frameText),
    },
  };

  const evidence = {
    experimentId:configuration.experimentId,
    sessionId:configuration.sessionId,
    targetId:DASHBOARD_TARGET_ID,
    observedAt:new Date().toISOString(),
    panelRoster:{ asset:assetPanelIds,gcs:gcsPanelIds },
    asset,
    instrument,
    lichtblick,
    identityAudit,
    inputs:{
      ledger:digestEvidence(ledger),
      layout:digestEvidence(layout),
      transition:digestEvidence(transition),
    },
    pageErrors,
  };
  assertMocapBrowserEvidence(evidence,expected,transition,layout,ledger);
  await page.screenshot({ path:`${configuration.evidencePath}.png`,fullPage:true });
  assertMocapBrowserEvidence(evidence,expected,transition,layout,ledger);
  writeFileSync(configuration.evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function waitForHTMLFrame(page,frame,timeoutMs) {
  await frame.waitFor({ state:'visible',timeout:timeoutMs });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    return element instanceof HTMLIFrameElement && element.contentDocument?.contentType === 'text/html';
  },undefined,{ timeout:timeoutMs });
}

async function waitForCanvas(page,timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const frame = document.querySelector('[data-xgc-role="lichtblick-frame"]');
      if (!(frame instanceof HTMLIFrameElement) || !frame.contentDocument) return undefined;
      const canvases = [...frame.contentDocument.querySelectorAll('canvas')]
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            width:Math.round(bounds.width),height:Math.round(bounds.height),
            pixelWidth:element.width,pixelHeight:element.height,
          };
        })
        .filter(({ width,height }) => width >= 200 && height >= 120);
      return { count:canvases.length,canvases };
    });
    if (snapshot?.count > 0) return snapshot;
    await page.waitForTimeout(500);
  }
  throw new Error('embedded Mocap Lichtblick has no visible 3D canvas');
}

async function exactLocator(locator,label) {
  await locator.first().waitFor({ state:'attached',timeout:PANEL_TIMEOUT_MS });
  const count = await locator.count();
  if (count !== 1) throw new Error(`${label} count must equal 1; got ${count}`);
  return locator;
}

async function configuredPanelIds(page,dashboardId,expectedIds,label) {
  const canvas = await exactLocator(page.locator(
    `[data-xgc-role="experiment-dashboard-canvas"][data-xgc-id="${dashboardId}"]`,
  ),`${label} dashboard canvas`);
  await canvas.waitFor({ state:'visible',timeout:PANEL_TIMEOUT_MS });
  for (const panelId of expectedIds) {
    await exactLocator(canvas.locator(
      `[data-xgc-role="experiment-panel"][data-xgc-id="${panelId}"]`,
    ),`${label} configured panel ${panelId}`);
  }
  await page.waitForTimeout(250);
  return canvas.locator('[data-xgc-role="experiment-panel"]').evaluateAll((elements) => elements.map(
    (element) => element.getAttribute('data-xgc-id') || '',
  ));
}

function findForbiddenMatches(surfaces) {
  const serialized = JSON.stringify(surfaces).toLowerCase();
  return FORBIDDEN_IDENTITIES.filter((identity) => serialized.includes(identity.toLowerCase()));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

function requiredDigest(name) {
  const value = required(name);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be a sha256 digest`);
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

function assertDistinctPaths(paths) {
  if (new Set(paths).size !== paths.length) throw new Error('input and output evidence paths must be distinct');
}

function assertFreshOutput(path) {
  if (existsSync(path) || existsSync(`${path}.png`) || existsSync(`${path}.lichtblick.png`)) {
    throw new Error('Mocap browser evidence output must not already exist; use a fresh evidence path');
  }
}
