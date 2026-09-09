import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countProcMaps,
  classifyChromeCommandLine,
  parseProcStatus,
  selectPageRendererProcess,
  summarizeBrowserResourceGrowth,
  summarizeBrowserResourcePhaseGrowth,
} from './browser-resource-diagnostics.mjs';

test('parses the bounded Linux process status fields used by browser evidence',() => {
  assert.deepEqual(parseProcStatus(`Name:\tchrome\nState:\tS (sleeping)\nPid:\t42\nPPid:\t7\nVmPeak:\t9000 kB\nVmSize:\t8000 kB\nVmHWM:\t7000 kB\nVmRSS:\t6000 kB\nRssAnon:\t5000 kB\nRssFile:\t900 kB\nRssShmem:\t100 kB\nVmSwap:\t12 kB\nThreads:\t8\n`),{
    name:'chrome',state:'S (sleeping)',pid:42,parentPid:7,threadCount:8,
    vmPeakKiB:9000,vmSizeKiB:8000,vmHwmKiB:7000,vmRssKiB:6000,
    rssAnonKiB:5000,rssFileKiB:900,rssShmemKiB:100,vmSwapKiB:12,
  });
});

test('counts only non-empty proc maps records without allocating a split array',() => {
  assert.equal(countProcMaps('1000-2000 r--p 0 00:00 0\n2000-3000 rw-p 0 00:00 0\n'),2);
  assert.equal(countProcMaps('\n  \n1000-2000 r--p 0 00:00 0'),1);
});

test('classifies Chrome rewritten argv without searching unrelated user processes',() => {
  assert.deepEqual(classifyChromeCommandLine(
    '/opt/google/chrome/chrome --type=renderer --user-data-dir=/tmp/playwright-profile --lang=en-US\0',
  ),{
    executable:'/opt/google/chrome/chrome',role:'renderer',userDataDir:'/tmp/playwright-profile',
  });
});

test('matches the page renderer by its bracketed CDP process time',() => {
  const selected=selectPageRendererProcess({
    before:[
      { type:'renderer',id:11,cpuTime:2.1 },
      { type:'renderer',id:12,cpuTime:8.0 },
    ],
    after:[
      { type:'renderer',id:11,cpuTime:2.14 },
      { type:'renderer',id:12,cpuTime:8.0 },
    ],
    processTime:2.12,
  });
  assert.equal(selected.pid,11);
  assert.equal(selected.confidence,'exact');
});

test('refuses to invent a page renderer when CDP timing is ambiguous',() => {
  const selected=selectPageRendererProcess({
    before:[
      { type:'renderer',id:11,cpuTime:2.1 },
      { type:'renderer',id:12,cpuTime:2.1 },
    ],
    after:[
      { type:'renderer',id:11,cpuTime:2.12 },
      { type:'renderer',id:12,cpuTime:2.12 },
    ],
    processTime:2.11,
  });
  assert.equal(selected.pid,undefined);
  assert.equal(selected.confidence,'ambiguous');
});

test('reports renderer map and native-memory growth without crossing PID epochs',() => {
  const sample=(id,observedAt,pid,mapCount,vmRssKiB,jsHeapUsedSize) => ({
    id,cell:id,phase:'after-stop',observedAt,
    pageRenderer:{ pid },
    processes:[{ pid,mapCount,vmRssKiB,vmHwmKiB:vmRssKiB+10 }],
    performance:{ JSHeapUsedSize:jsHeapUsedSize,ArrayBufferContents:2 },
  });
  const growth=summarizeBrowserResourceGrowth([
    sample('old','2026-08-24T00:00:00.000Z',10,100,1000,100),
    sample('new-1','2026-08-24T00:01:00.000Z',20,200,2000,200),
    sample('new-2','2026-08-24T00:03:00.000Z',20,260,2900,240),
  ]);
  assert.equal(growth.latestRendererPid,20);
  assert.equal(growth.sampleCount,2);
  assert.equal(growth.durationMs,120_000);
  assert.deepEqual(growth.delta,{
    mapCount:60,vmRssKiB:900,vmHwmKiB:900,jsHeapUsedSize:40,arrayBufferContents:0,
  });
  assert.deepEqual(growth.ratePerMinute,{
    mapCount:30,vmRssKiB:450,vmHwmKiB:450,jsHeapUsedSize:20,arrayBufferContents:0,
  });
});

test('separates screenshot, Stop, and idle renderer growth for one cell',() => {
  const phases=[
    ['before-start',100,1000,700,10,20,4,100,50],
    ['active',120,1300,850,14,28,12,110,60],
    ['after-screenshot',150,1500,1000,13,28,6,112,55],
    ['after-stop',155,1520,1010,12,27,5,104,45],
    ['after-idle',156,1510,1005,11,26,4,100,40],
  ].map(([phase,mapCount,vmRssKiB,rssAnonKiB,jsUsed,jsTotal,arrayBuffers,nodes,listeners]) => ({
    id:`cell:${phase}`,cell:'lane/simulation/round-1',phase,observedAt:'2026-08-24T00:00:00Z',
    pageRenderer:{ pid:42 },
    processes:[{ pid:42,mapCount,vmRssKiB,vmHwmKiB:vmRssKiB,rssAnonKiB,rssFileKiB:vmRssKiB-rssAnonKiB }],
    performance:{ JSHeapUsedSize:jsUsed,JSHeapTotalSize:jsTotal,ArrayBufferContents:arrayBuffers },
    domCounters:{ documents:1,nodes,jsEventListeners:listeners },
    frames:[{
      iframeCount:0,videoCount:1,canvasCount:0,mountedWebglCanvasCount:0,
      webglContextsCreated:0,webglContextLosses:0,
    }],
  }));

  const summary=summarizeBrowserResourcePhaseGrowth(phases);

  assert.equal(summary.cells.length,1);
  assert.deepEqual(summary.cells[0].samples,{
    beforeStart:'cell:before-start',active:'cell:active',
    afterScreenshot:'cell:after-screenshot',afterStop:'cell:after-stop',afterIdle:'cell:after-idle',
  });
  assert.equal(summary.cells[0].delta.screenshot.mapCount,30);
  assert.equal(summary.cells[0].delta.screenshot.vmRssKiB,200);
  assert.equal(summary.cells[0].delta.screenshot.rssAnonKiB,150);
  assert.equal(summary.cells[0].delta.stop.mapCount,5);
  assert.equal(summary.cells[0].delta.idle.vmRssKiB,-10);
  assert.equal(summary.cells[0].delta.cycle.jsHeapUsedSize,1);
  assert.equal(summary.cells[0].delta.stop.videoCount,0);
  assert.equal(summary.afterIdleBaseline.sampleCount,1);
});

test('reports after-idle baseline steps only inside the latest renderer epoch',() => {
  const afterIdle=(id,cell,pid,mapCount,vmRssKiB) => ({
    id,cell,phase:'after-idle',observedAt:'2026-08-24T00:00:00Z',pageRenderer:{ pid },
    processes:[{ pid,mapCount,vmRssKiB,vmHwmKiB:vmRssKiB,rssAnonKiB:vmRssKiB-100,rssFileKiB:100 }],
    performance:{},domCounters:{},frames:[],
  });
  const completeCell=(cell,pid,base) => [
    ['before-start',base,base*10],['active',base+1,base*10+1],
    ['after-screenshot',base+2,base*10+2],['after-stop',base+3,base*10+3],
    ['after-idle',base+4,base*10+4],
  ].map(([phase,mapCount,vmRssKiB]) => ({
    ...afterIdle(`${cell}:${phase}`,cell,pid,mapCount,vmRssKiB),phase,
  }));
  const summary=summarizeBrowserResourcePhaseGrowth([
    ...completeCell('old',11,10),
    ...completeCell('new-1',22,20),
    ...completeCell('new-2',22,30),
  ]);

  assert.equal(summary.afterIdleBaseline.pid,22);
  assert.equal(summary.afterIdleBaseline.sampleCount,2);
  assert.equal(summary.afterIdleBaseline.delta.mapCount,10);
  assert.deepEqual(summary.afterIdleBaseline.steps.map(({ cell,mapCount,vmRssKiB }) => ({ cell,mapCount,vmRssKiB })),[
    { cell:'new-2',mapCount:10,vmRssKiB:100 },
  ]);
});
