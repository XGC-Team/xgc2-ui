/* global HTMLCanvasElement,OffscreenCanvas,window */
import { readFileSync } from 'node:fs';

const trackedPerformanceMetrics = new Set([
  'ArrayBufferContents',
  'AudioHandlers',
  'DetachedScriptStates',
  'Documents',
  'Frames',
  'JSEventListeners',
  'JSHeapTotalSize',
  'JSHeapUsedSize',
  'LayoutObjects',
  'MediaKeySessions',
  'Nodes',
  'ProcessTime',
  'Resources',
  'RTCPeerConnections',
  'WorkerGlobalScopes',
]);

export function installBrowserResourceProbe() {
  const state = {
    webglContextsCreated:0,
    webglContextLosses:0,
    offscreenWebglContextsCreated:0,
  };
  const webglCanvases = new WeakSet();
  const offscreenWebglCanvases = new WeakSet();
  const webglKinds = new Set(['webgl','experimental-webgl','webgl2']);
  const wrapGetContext = (prototype,offscreen) => {
    const original = prototype?.getContext;
    if (typeof original !== 'function') return;
    Object.defineProperty(prototype,'getContext',{
      configurable:true,
      enumerable:false,
      writable:true,
      value:function browserResourceGetContext(type,...options) {
        const context=Reflect.apply(original,this,[type,...options]);
        const kind=String(type ?? '').toLowerCase();
        if (context && webglKinds.has(kind)) {
          if (offscreen && !offscreenWebglCanvases.has(this)) {
            offscreenWebglCanvases.add(this);
            state.offscreenWebglContextsCreated+=1;
          }
          else if (!webglCanvases.has(this)) {
            webglCanvases.add(this);
            state.webglContextsCreated+=1;
            this.addEventListener?.('webglcontextlost',() => {
              state.webglContextLosses+=1;
            });
          }
        }
        return context;
      },
    });
  };
  wrapGetContext(HTMLCanvasElement?.prototype,false);
  if (typeof OffscreenCanvas !== 'undefined') wrapGetContext(OffscreenCanvas.prototype,true);
  window.__xgcBrowserResourceProbe={
    snapshot() {
      const canvases=[...window.document.querySelectorAll('canvas')];
      return {
        href:window.location.href,
        iframeCount:window.document.querySelectorAll('iframe').length,
        videoCount:window.document.querySelectorAll('video').length,
        canvasCount:canvases.length,
        mountedWebglCanvasCount:canvases.filter((canvas) => webglCanvases.has(canvas)).length,
        selectedDashboardIds:[...window.document.querySelectorAll(
          '[data-xgc-role="experiment-dashboard-canvas"]',
        )].map((element) => element.getAttribute('data-xgc-id') || '').filter(Boolean),
        ...state,
      };
    },
  };
}

export async function openBrowserResourceDiagnostics({ browser,context,page,executablePath }) {
  const browserSession=await browser.newBrowserCDPSession();
  const pageSession=await context.newCDPSession(page);
  await pageSession.send('Performance.enable');
  const version=await browserSession.send('Browser.getVersion').catch(() => ({}));
  const diagnostics={
    contract:'browser-resource-diagnostics-v1',
    browser:{
      executablePath:executablePath || '',
      product:stringField(version.product),
      protocolVersion:stringField(version.protocolVersion),
      revision:stringField(version.revision),
      userAgent:stringField(version.userAgent),
      jsVersion:stringField(version.jsVersion),
    },
    kernel:{ maxMapCount:readPositiveIntegerFile('/proc/sys/vm/max_map_count') },
    samples:[],
    growth:emptyGrowth(),
    phaseGrowth:emptyPhaseGrowth(),
    crash:null,
  };
  let captureQueue=Promise.resolve();

  const capture=(cell,phase) => {
    const pending=captureQueue.then(() => collectBrowserResourceSample({
      browserSession,pageSession,page,cell,phase,
    }));
    captureQueue=pending.then(() => undefined,() => undefined);
    return pending.then((sample) => {
      diagnostics.samples.push(sample);
      diagnostics.growth=summarizeBrowserResourceGrowth(diagnostics.samples);
      diagnostics.phaseGrowth=summarizeBrowserResourcePhaseGrowth(diagnostics.samples);
      return sample;
    });
  };
  const recordCrash=async (cell) => {
    const observedAt=new Date().toISOString();
    const sample=await capture(cell,'crash').catch((cause) => ({
      id:`${diagnostics.samples.length+1}:crash`,cell,phase:'crash',observedAt,
      errors:[messageOf(cause)],
    }));
    if (!diagnostics.samples.includes(sample)) {
      diagnostics.samples.push(sample);
      diagnostics.growth=summarizeBrowserResourceGrowth(diagnostics.samples);
      diagnostics.phaseGrowth=summarizeBrowserResourcePhaseGrowth(diagnostics.samples);
    }
    diagnostics.crash={
      cell,observedAt,sample,
      lastCompleteSample:diagnostics.samples.findLast((candidate) => candidate.phase!=='crash') ?? null,
      growth:diagnostics.growth,
    };
    return diagnostics.crash;
  };
  const close=async () => {
    await captureQueue;
    await pageSession.detach().catch(() => undefined);
    await browserSession.detach().catch(() => undefined);
  };
  return { diagnostics,capture,recordCrash,close };
}

export async function collectBrowserResourceSample({ browserSession,pageSession,page,cell,phase }) {
  const observedAt=new Date().toISOString();
  const errors=[];
  const before=await browserSession.send('SystemInfo.getProcessInfo')
    .then((value) => value.processInfo ?? [])
    .catch((cause) => { errors.push(`process-info-before: ${messageOf(cause)}`);return []; });
  const [performance,domCounters]=await Promise.all([
    pageSession.send('Performance.getMetrics')
      .then((value) => performanceMetrics(value.metrics ?? []))
      .catch((cause) => { errors.push(`performance: ${messageOf(cause)}`);return {}; }),
    pageSession.send('Memory.getDOMCounters')
      .catch((cause) => { errors.push(`dom-counters: ${messageOf(cause)}`);return undefined; }),
  ]);
  const after=await browserSession.send('SystemInfo.getProcessInfo')
    .then((value) => value.processInfo ?? [])
    .catch((cause) => { errors.push(`process-info-after: ${messageOf(cause)}`);return []; });
  const pageRenderer=selectPageRendererProcess({
    before,after,processTime:numberField(performance.ProcessTime),
  });
  const processInfo=after.length>0 ? after : before;
  const browserProcess=processInfo.find((process) => process.type==='browser');
  const rendererProcesses=processInfo.filter((process) => process.type==='renderer');
  const processIds=[...new Set([
    ...(browserProcess ? [browserProcess.id] : []),
    ...rendererProcesses.map((process) => process.id),
  ])].filter(positiveInteger);
  const processSamples=processIds.map((pid) => sampleProcProcess(
    pid,
    pid===browserProcess?.id ? 'browser' : 'renderer',
  ));
  const frames=await collectFrameDOMSnapshots(page,errors);
  return {
    id:`${Date.now()}:${phase}`,
    cell,phase,observedAt,
    browserPid:positiveInteger(browserProcess?.id) ? browserProcess.id : undefined,
    pageRenderer,
    rendererPids:rendererProcesses.map((process) => process.id).filter(positiveInteger),
    processes:processSamples,
    performance,
    domCounters:domCounters ? {
      documents:numberField(domCounters.documents),
      nodes:numberField(domCounters.nodes),
      jsEventListeners:numberField(domCounters.jsEventListeners),
    } : undefined,
    frames,
    ...(errors.length>0 ? { errors } : {}),
  };
}

export function parseProcStatus(source) {
  const fields={};
  for (const line of String(source ?? '').split('\n')) {
    const match=/^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (match) fields[match[1]]=match[2].trim();
  }
  return {
    name:fields.Name || '',
    state:fields.State || '',
    pid:statusInteger(fields.Pid),
    parentPid:statusInteger(fields.PPid),
    threadCount:statusInteger(fields.Threads),
    vmPeakKiB:statusKiB(fields.VmPeak),
    vmSizeKiB:statusKiB(fields.VmSize),
    vmHwmKiB:statusKiB(fields.VmHWM),
    vmRssKiB:statusKiB(fields.VmRSS),
    rssAnonKiB:statusKiB(fields.RssAnon),
    rssFileKiB:statusKiB(fields.RssFile),
    rssShmemKiB:statusKiB(fields.RssShmem),
    vmSwapKiB:statusKiB(fields.VmSwap),
  };
}

export function countProcMaps(source) {
  const value=String(source ?? '');
  let count=0;
  let containsContent=false;
  for (let index=0;index<value.length;index+=1) {
    const code=value.charCodeAt(index);
    if (code===10) {
      if (containsContent) count+=1;
      containsContent=false;
    } else if (code!==9 && code!==13 && code!==32) containsContent=true;
  }
  return count+(containsContent ? 1 : 0);
}

export function selectPageRendererProcess({ before,after,processTime }) {
  if (!Number.isFinite(processTime)) return { pid:undefined,confidence:'unavailable',processTime };
  const beforeById=new Map(before.filter(rendererProcess).map((process) => [process.id,process]));
  const candidates=after.filter(rendererProcess).map((process) => {
    const first=beforeById.get(process.id) ?? process;
    const lower=Math.min(first.cpuTime,process.cpuTime)-0.011;
    const upper=Math.max(first.cpuTime,process.cpuTime)+0.011;
    return {
      pid:process.id,
      beforeCpuTime:first.cpuTime,
      afterCpuTime:process.cpuTime,
      distance:processTime<lower ? lower-processTime : processTime>upper ? processTime-upper : 0,
    };
  }).sort((left,right) => left.distance-right.distance || left.pid-right.pid);
  const exact=candidates.filter((candidate) => candidate.distance===0);
  if (exact.length===1) return { ...exact[0],confidence:'exact',processTime,candidates };
  if (exact.length>1) return { pid:undefined,confidence:'ambiguous',processTime,candidates };
  const nearest=candidates[0];
  const next=candidates[1];
  if (nearest && nearest.distance<=0.25 && (!next || next.distance-nearest.distance>=0.05)) {
    return { ...nearest,confidence:'nearest',processTime,candidates };
  }
  return { pid:undefined,confidence:candidates.length ? 'ambiguous' : 'unavailable',processTime,candidates };
}

export function summarizeBrowserResourceGrowth(samples) {
  const observations=[];
  for (const sample of samples) {
    const pid=sample.pageRenderer?.pid;
    if (!positiveInteger(pid)) continue;
    const process=sample.processes?.find((candidate) => candidate.pid===pid);
    if (!process || !Number.isSafeInteger(process.mapCount) || !Number.isSafeInteger(process.vmRssKiB)) continue;
    observations.push({
      sampleId:sample.id,cell:sample.cell,phase:sample.phase,observedAt:sample.observedAt,
      pid,mapCount:process.mapCount,vmRssKiB:process.vmRssKiB,vmHwmKiB:process.vmHwmKiB,
      jsHeapUsedSize:numberField(sample.performance?.JSHeapUsedSize),
      arrayBufferContents:numberField(sample.performance?.ArrayBufferContents),
    });
  }
  if (observations.length===0) return emptyGrowth();
  const latestPid=observations.at(-1).pid;
  const latestSeries=observations.filter((sample) => sample.pid===latestPid);
  const first=latestSeries[0];
  const last=latestSeries.at(-1);
  const durationMs=Math.max(0,Date.parse(last.observedAt)-Date.parse(first.observedAt));
  const delta={
    mapCount:last.mapCount-first.mapCount,
    vmRssKiB:last.vmRssKiB-first.vmRssKiB,
    vmHwmKiB:optionalDelta(first.vmHwmKiB,last.vmHwmKiB),
    jsHeapUsedSize:optionalDelta(first.jsHeapUsedSize,last.jsHeapUsedSize),
    arrayBufferContents:optionalDelta(first.arrayBufferContents,last.arrayBufferContents),
  };
  return {
    latestRendererPid:latestPid,
    sampleCount:latestSeries.length,
    first,last,
    durationMs,delta,
    ratePerMinute:durationMs>0 ? {
      mapCount:perMinute(delta.mapCount,durationMs),
      vmRssKiB:perMinute(delta.vmRssKiB,durationMs),
      vmHwmKiB:perMinute(delta.vmHwmKiB,durationMs),
      jsHeapUsedSize:perMinute(delta.jsHeapUsedSize,durationMs),
      arrayBufferContents:perMinute(delta.arrayBufferContents,durationMs),
    } : undefined,
    recent:latestSeries.slice(-6),
  };
}

export function summarizeBrowserResourcePhaseGrowth(samples) {
  const observations=samples.map(rendererResourceObservation).filter(Boolean);
  const phasesByCell=new Map();
  for (const observation of observations) {
    let phases=phasesByCell.get(observation.cell);
    if (!phases) {
      phases=new Map();
      phasesByCell.set(observation.cell,phases);
    }
    phases.set(observation.phase,observation);
  }
  const cells=[];
  for (const [cell,phases] of phasesByCell) {
    const beforeStart=phases.get('before-start');
    const active=phases.get('active');
    const afterScreenshot=phases.get('after-screenshot');
    const afterStop=phases.get('after-stop');
    const afterIdle=phases.get('after-idle');
    if (!sameRendererSeries([beforeStart,active,afterScreenshot,afterStop,afterIdle])) continue;
    cells.push({
      cell,pid:active.pid,
      samples:{
        beforeStart:beforeStart.sampleId,
        active:active.sampleId,
        afterScreenshot:afterScreenshot.sampleId,
        afterStop:afterStop.sampleId,
        afterIdle:afterIdle.sampleId,
      },
      delta:{
        start:resourceObservationDelta(beforeStart,active),
        screenshot:resourceObservationDelta(active,afterScreenshot),
        stop:resourceObservationDelta(afterScreenshot,afterStop),
        idle:resourceObservationDelta(afterStop,afterIdle),
        cycle:resourceObservationDelta(beforeStart,afterIdle),
      },
      afterIdle,
    });
  }
  const latestPid=cells.at(-1)?.pid;
  const baselines=cells.filter((cell) => cell.pid===latestPid).map((cell) => cell.afterIdle);
  return {
    cells:cells.map(({ cell,pid,samples,delta }) => ({ cell,pid,samples,delta })),
    afterIdleBaseline:baselines.length>0 ? {
      pid:latestPid,sampleCount:baselines.length,
      first:baselines[0],last:baselines.at(-1),
      delta:resourceObservationDelta(baselines[0],baselines.at(-1)),
      steps:baselines.slice(1).map((observation,index) => ({
        cell:observation.cell,
        ...resourceObservationDelta(baselines[index],observation),
      })),
    } : undefined,
  };
}

function rendererResourceObservation(sample) {
  const pid=sample?.pageRenderer?.pid;
  if (!positiveInteger(pid)) return undefined;
  const process=sample.processes?.find((candidate) => candidate.pid===pid);
  if (!process || !Number.isSafeInteger(process.mapCount) || !Number.isSafeInteger(process.vmRssKiB)) return undefined;
  const frames=sample.frames ?? [];
  return {
    sampleId:sample.id,cell:sample.cell,phase:sample.phase,observedAt:sample.observedAt,pid,
    mapCount:process.mapCount,vmRssKiB:process.vmRssKiB,vmHwmKiB:process.vmHwmKiB,
    rssAnonKiB:process.rssAnonKiB,rssFileKiB:process.rssFileKiB,
    jsHeapUsedSize:numberField(sample.performance?.JSHeapUsedSize),
    jsHeapTotalSize:numberField(sample.performance?.JSHeapTotalSize),
    arrayBufferContents:numberField(sample.performance?.ArrayBufferContents),
    documents:numberField(sample.domCounters?.documents),
    nodes:numberField(sample.domCounters?.nodes),
    jsEventListeners:numberField(sample.domCounters?.jsEventListeners),
    iframeCount:sumFrameMetric(frames,'iframeCount'),
    videoCount:sumFrameMetric(frames,'videoCount'),
    canvasCount:sumFrameMetric(frames,'canvasCount'),
    mountedWebglCanvasCount:sumFrameMetric(frames,'mountedWebglCanvasCount'),
    webglContextsCreated:sumFrameMetric(frames,'webglContextsCreated'),
    webglContextLosses:sumFrameMetric(frames,'webglContextLosses'),
  };
}

function sameRendererSeries(observations) {
  if (observations.some((observation) => !observation)) return false;
  const pid=observations[0].pid;
  return observations.every((observation) => observation.pid===pid);
}

function resourceObservationDelta(first,last) {
  return {
    mapCount:optionalDelta(first?.mapCount,last?.mapCount),
    vmRssKiB:optionalDelta(first?.vmRssKiB,last?.vmRssKiB),
    vmHwmKiB:optionalDelta(first?.vmHwmKiB,last?.vmHwmKiB),
    rssAnonKiB:optionalDelta(first?.rssAnonKiB,last?.rssAnonKiB),
    rssFileKiB:optionalDelta(first?.rssFileKiB,last?.rssFileKiB),
    jsHeapUsedSize:optionalDelta(first?.jsHeapUsedSize,last?.jsHeapUsedSize),
    jsHeapTotalSize:optionalDelta(first?.jsHeapTotalSize,last?.jsHeapTotalSize),
    arrayBufferContents:optionalDelta(first?.arrayBufferContents,last?.arrayBufferContents),
    documents:optionalDelta(first?.documents,last?.documents),
    nodes:optionalDelta(first?.nodes,last?.nodes),
    jsEventListeners:optionalDelta(first?.jsEventListeners,last?.jsEventListeners),
    iframeCount:optionalDelta(first?.iframeCount,last?.iframeCount),
    videoCount:optionalDelta(first?.videoCount,last?.videoCount),
    canvasCount:optionalDelta(first?.canvasCount,last?.canvasCount),
    mountedWebglCanvasCount:optionalDelta(first?.mountedWebglCanvasCount,last?.mountedWebglCanvasCount),
    webglContextsCreated:optionalDelta(first?.webglContextsCreated,last?.webglContextsCreated),
    webglContextLosses:optionalDelta(first?.webglContextLosses,last?.webglContextLosses),
  };
}

function sumFrameMetric(frames,key) {
  let total=0;
  let observed=false;
  for (const frame of frames) {
    const value=frame?.[key];
    if (!Number.isFinite(value)) continue;
    total+=value;
    observed=true;
  }
  return observed ? total : undefined;
}

function sampleProcProcess(pid,expectedRole) {
  try {
    const status=parseProcStatus(readFileSync(`/proc/${pid}/status`,'utf8'));
    const commandLine=readFileSync(`/proc/${pid}/cmdline`,'utf8');
    const command=classifyChromeCommandLine(commandLine);
    const role=command.role;
    if (status.pid!==pid) throw new Error(`status PID ${status.pid} does not match CDP PID ${pid}`);
    if (role!==expectedRole) throw new Error(`CDP ${expectedRole} PID command role is ${role}`);
    return {
      ...status,pid,role,executable:command.executable,userDataDir:command.userDataDir,
      mapCount:countProcMaps(readFileSync(`/proc/${pid}/maps`,'utf8')),
    };
  } catch (cause) {
    return { pid,role:expectedRole,error:messageOf(cause) };
  }
}

async function collectFrameDOMSnapshots(page,errors) {
  const frames=[];
  for (const [index,frame] of page.frames().entries()) {
    try {
      const snapshot=await frame.evaluate(() => window.__xgcBrowserResourceProbe?.snapshot?.() ?? ({
        href:window.location.href,
        iframeCount:window.document.querySelectorAll('iframe').length,
        videoCount:window.document.querySelectorAll('video').length,
        canvasCount:window.document.querySelectorAll('canvas').length,
        mountedWebglCanvasCount:undefined,
        webglContextsCreated:undefined,
        webglContextLosses:undefined,
        offscreenWebglContextsCreated:undefined,
        selectedDashboardIds:[...window.document.querySelectorAll(
          '[data-xgc-role="experiment-dashboard-canvas"]',
        )].map((element) => element.getAttribute('data-xgc-id') || '').filter(Boolean),
      }));
      frames.push({ index,...snapshot });
    } catch (cause) {
      errors.push(`frame-${index}: ${messageOf(cause)}`);
    }
  }
  return frames;
}

function performanceMetrics(metrics) {
  return Object.fromEntries(metrics
    .filter(({ name,value }) => trackedPerformanceMetrics.has(name) && Number.isFinite(value))
    .map(({ name,value }) => [name,value]));
}

export function classifyChromeCommandLine(source) {
  const value=String(source ?? '').replaceAll('\0',' ');
  const executable=value.trimStart().split(/\s+/,1)[0] || '';
  const type=/(?:^|\s)--type=([^\s]+)/.exec(value)?.[1] || '';
  const userDataDir=/(?:^|\s)--user-data-dir=([^\s]+)/.exec(value)?.[1] || '';
  return { executable,role:type || 'browser',userDataDir };
}

function rendererProcess(process) {
  return process?.type==='renderer' && positiveInteger(process.id) && Number.isFinite(process.cpuTime);
}

function readPositiveIntegerFile(path) {
  try {
    const value=Number.parseInt(readFileSync(path,'utf8').trim(),10);
    return positiveInteger(value) ? value : undefined;
  } catch { return undefined; }
}

function statusInteger(value) {
  const parsed=Number.parseInt(String(value ?? ''),10);
  return Number.isSafeInteger(parsed) && parsed>=0 ? parsed : undefined;
}

function statusKiB(value) {
  const match=/^(\d+)\s+kB$/i.exec(String(value ?? ''));
  return match ? Number.parseInt(match[1],10) : undefined;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value>0;
}

function numberField(value) {
  return Number.isFinite(value) ? value : undefined;
}

function stringField(value) {
  return typeof value==='string' ? value : '';
}

function optionalDelta(first,last) {
  return Number.isFinite(first) && Number.isFinite(last) ? last-first : undefined;
}

function perMinute(value,durationMs) {
  return Number.isFinite(value) ? value*60_000/durationMs : undefined;
}

function emptyGrowth() {
  return { latestRendererPid:undefined,sampleCount:0,recent:[] };
}

function emptyPhaseGrowth() {
  return { cells:[],afterIdleBaseline:undefined };
}

function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause ?? '');
}
