/* global Buffer,document,HTMLIFrameElement */
import { createHash } from 'node:crypto';

const DEFAULT_DIAGNOSTIC_LIMIT = 100;

export function installBrowserDiagnostics(page,{ limit = DEFAULT_DIAGNOSTIC_LIMIT } = {}) {
  const diagnostics = {
    console:[],
    requestFailures:[],
    httpErrors:[],
    webSockets:[],
  };

  page.on('console',(message) => {
    if (!['warning','error','assert'].includes(message.type())) return;
    pushBounded(diagnostics.console,{
      type:message.type(),
      text:message.text().slice(0,2_000),
      location:message.location(),
    },limit);
  });
  page.on('requestfailed',(request) => pushBounded(diagnostics.requestFailures,{
    method:request.method(),
    resourceType:request.resourceType(),
    url:request.url(),
    failure:request.failure()?.errorText ?? 'unknown',
  },limit));
  page.on('response',(response) => {
    if (response.status() < 400) return;
    pushBounded(diagnostics.httpErrors,{
      method:response.request().method(),
      status:response.status(),
      statusText:response.statusText(),
      url:response.url(),
    },limit);
  });
  page.on('websocket',(socket) => {
    const entry = {
      url:socket.url(),
      openedAt:new Date().toISOString(),
      sentFrames:0,
      sentBytes:0,
      receivedFrames:0,
      receivedBytes:0,
      errors:[],
      closed:false,
    };
    pushBounded(diagnostics.webSockets,entry,limit);
    socket.on('framesent',(event) => {
      entry.sentFrames += 1;
      entry.sentBytes += payloadBytes(event.payload);
      entry.lastSentAt = new Date().toISOString();
    });
    socket.on('framereceived',(event) => {
      entry.receivedFrames += 1;
      entry.receivedBytes += payloadBytes(event.payload);
      entry.lastReceivedAt = new Date().toISOString();
    });
    socket.on('socketerror',(error) => pushBounded(entry.errors,String(error).slice(0,2_000),limit));
    socket.on('close',() => {
      entry.closed = true;
      entry.closedAt = new Date().toISOString();
    });
  });
  return diagnostics;
}

export async function waitForLichtblickCanvas(page,frame,timeoutMs) {
  const canvases = frame.contentFrame().locator('canvas');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await canvases.count();
    const snapshots = [];
    for (let index = 0; index < count; index += 1) {
      const canvas = canvases.nth(index);
      const bounds = await canvas.boundingBox();
      const dimensions = await canvas.evaluate((element) => ({
        pixelWidth:element.width,
        pixelHeight:element.height,
      })).catch(() => undefined);
      if (!bounds || !dimensions) continue;
      const snapshot = {
        index,
        width:Math.round(bounds.width),
        height:Math.round(bounds.height),
        ...dimensions,
      };
      snapshots.push(snapshot);
      if (bounds.width >= 200 && bounds.height >= 120) {
        return { locator:canvas,count:snapshots.length,canvases:snapshots };
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error('embedded Lichtblick has no visible 3D canvas');
}

export async function observeDynamicCanvas(page,canvas,{
  timeoutMs = 45_000,
  intervalMs = 1_000,
  minimumTransitions = 2,
  minimumUniqueHashes = 3,
} = {}) {
  const samples = [];
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  while (true) {
    const screenshot = await canvas.screenshot();
    samples.push({
      elapsedMs:Date.now() - startedAt,
      hash:sha256(screenshot),
      bytes:screenshot.length,
    });
    const summary = summarizePixelSamples(samples,{ minimumTransitions,minimumUniqueHashes });
    if (summary.dynamic || Date.now() >= deadline) return summary;
    await page.waitForTimeout(Math.max(0,Math.min(intervalMs,deadline - Date.now())));
  }
}

export function summarizePixelSamples(samples,{
  minimumTransitions = 2,
  minimumUniqueHashes = 3,
} = {}) {
  const hashes = samples.map((sample) => sample.hash);
  const transitions = hashes.reduce((count,hash,index) => (
    index > 0 && hash !== hashes[index - 1] ? count + 1 : count
  ),0);
  const uniqueHashes = new Set(hashes).size;
  return {
    beforeHash:hashes[0],
    afterHash:hashes.at(-1),
    transitions,
    uniqueHashes,
    dynamic:transitions >= minimumTransitions && uniqueHashes >= minimumUniqueHashes,
    samples,
  };
}

export async function captureLichtblickFrameDiagnostics(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-xgc-role="lichtblick-frame"]');
    if (!(frame instanceof HTMLIFrameElement)) return { present:false };
    const doc = frame.contentDocument;
    if (!doc) return { present:true,src:frame.src,accessible:false };
    const visibleText = (element) => {
      const bounds = element.getBoundingClientRect();
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style?.visibility !== 'hidden'
        && style?.display !== 'none';
    };
    const diagnosticSelectors = [
      '[role="alert"]','[aria-live]:not([aria-live="off"])',
      '[data-testid*="error" i]','[class*="error" i]','[class*="warning" i]',
    ].join(',');
    const diagnostics = [...doc.querySelectorAll(diagnosticSelectors)]
      .filter(visibleText)
      .map((element) => ({
        tag:element.tagName.toLowerCase(),
        role:element.getAttribute('role'),
        ariaLabel:element.getAttribute('aria-label'),
        text:(element.textContent || '').trim().slice(0,1_000),
      }))
      .filter((entry,index,array) => entry.text
        && array.findIndex((candidate) => candidate.text === entry.text) === index)
      .slice(0,50);
    const controls = [...doc.querySelectorAll('button,[role="button"]')]
      .filter(visibleText)
      .map((element) => ({
        ariaLabel:element.getAttribute('aria-label'),
        title:element.getAttribute('title'),
        text:(element.textContent || '').trim().slice(0,250),
      }))
      .filter(({ ariaLabel,title,text }) => /alert|error|warn|setting|problem/i.test(
        `${ariaLabel || ''} ${title || ''} ${text}`,
      ))
      .slice(0,50);
    const canvases = [...doc.querySelectorAll('canvas')].map((element,index) => {
      const bounds = element.getBoundingClientRect();
      return {
        index,
        width:Math.round(bounds.width),
        height:Math.round(bounds.height),
        pixelWidth:element.width,
        pixelHeight:element.height,
      };
    });
    const resources = doc.defaultView?.performance.getEntriesByType('resource')
      .slice(-100)
      .map((entry) => ({
        name:entry.name,
        initiatorType:entry.initiatorType,
        duration:Math.round(entry.duration),
        transferSize:entry.transferSize,
      })) ?? [];
    return {
      present:true,
      accessible:true,
      src:frame.src,
      url:doc.defaultView?.location.href,
      readyState:doc.readyState,
      title:doc.title,
      bodyText:(doc.body?.innerText || '').trim().slice(0,12_000),
      diagnostics,
      controls,
      canvases,
      resources,
    };
  }).catch((error) => ({ captureError:error.message }));
}

function payloadBytes(payload) {
  if (typeof payload === 'string') return Buffer.byteLength(payload);
  return payload?.byteLength ?? payload?.length ?? 0;
}

function pushBounded(entries,value,limit) {
  if (entries.length >= limit) entries.shift();
  entries.push(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
