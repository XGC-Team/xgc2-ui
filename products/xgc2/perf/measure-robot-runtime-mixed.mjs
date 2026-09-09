import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const durationMs = positiveNumber(process.env.XGC_FRONTEND_PERF_DURATION_MS, 10_000);
const warmupMs = positiveNumber(process.env.XGC_FRONTEND_PERF_WARMUP_MS, 3_000);
const server = await createServer({
  root: webRoot,
  configFile: false,
  plugins: [react()],
  logLevel: 'error',
  server: { host: '127.0.0.1',port: 0,strictPort: false },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP address.');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.XGC_CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--disable-gpu-sandbox','--enable-precise-memory-info','--js-flags=--expose-gc'],
  });
  const page = await browser.newPage({ viewport: { width: 1600,height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`http://127.0.0.1:${address.port}/perf/robot-runtime-mixed.html`, {
    waitUntil: 'domcontentloaded',timeout: 30_000,
  });
  await page.waitForFunction(() => globalThis.__xgcMixedRobotBenchmark?.snapshot().cards === 10, null, { timeout: 30_000 });
  await page.evaluate(() => globalThis.__xgcMixedRobotBenchmark.start());
  await page.waitForTimeout(warmupMs);

  const phases = [];
  for (let phase = 1; phase <= 2; phase += 1) {
    await page.evaluate(() => globalThis.__xgcMixedRobotBenchmark.stop());
    await cdp.send('HeapProfiler.collectGarbage');
    await page.evaluate(() => globalThis.__xgcMixedRobotBenchmark.reset());
    const before = metrics(await cdp.send('Performance.getMetrics'));
    await page.evaluate(() => globalThis.__xgcMixedRobotBenchmark.start());
    await page.waitForTimeout(durationMs);
    await page.evaluate(() => globalThis.__xgcMixedRobotBenchmark.stop());
    const after = metrics(await cdp.send('Performance.getMetrics'));
    const benchmark = await page.evaluate(() => globalThis.__xgcMixedRobotBenchmark.snapshot());
    await cdp.send('HeapProfiler.collectGarbage');
    const afterGC = metrics(await cdp.send('Performance.getMetrics'));
    phases.push({
      phase,durationMs,benchmark,
      rates: {
        eventsPerSecond: benchmark.events * 1000 / durationMs,
        changesPerSecond: benchmark.changes * 1000 / durationMs,
        cardRendersPerSecond: sum(Object.values(benchmark.cardRenders)) * 1000 / durationMs,
        mutationsPerSecond: benchmark.mutations * 1000 / durationMs,
      },
      cpu: {
        taskSeconds: delta(after,before,'TaskDuration'),
        scriptSeconds: delta(after,before,'ScriptDuration'),
        taskPercentOfOneCore: delta(after,before,'TaskDuration') * 100_000 / durationMs,
      },
      rendering: {
        layoutSeconds: delta(after,before,'LayoutDuration'),
        recalcStyleSeconds: delta(after,before,'RecalcStyleDuration'),
        layoutCount: delta(after,before,'LayoutCount'),
        recalcStyleCount: delta(after,before,'RecalcStyleCount'),
      },
      heap: {
        startAfterGCBytes: before.JSHeapUsedSize,
        endBeforeGCBytes: after.JSHeapUsedSize,
        endAfterGCBytes: afterGC.JSHeapUsedSize,
        retainedDeltaBytes: afterGC.JSHeapUsedSize - before.JSHeapUsedSize,
      },
    });
  }
  process.stdout.write(`${JSON.stringify({
    workload: { px4: 6,scout: 4,changesPerSecond: 130,eventsPerSecond: 80 },
    warmupMs,durationMs,pageErrors,phases,
  }, null, 2)}\n`);
  if (pageErrors.length > 0) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}

function positiveNumber(value,fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function metrics(result) {
  return Object.fromEntries(result.metrics.map((metric) => [metric.name,metric.value]));
}

function delta(after,before,name) {
  return (after[name] ?? 0) - (before[name] ?? 0);
}

function sum(values) {
  return values.reduce((total,value) => total + value,0);
}
