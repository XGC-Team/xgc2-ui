// Real Chromium pixels and live MediaStream frames; no station or robot actions.
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const output = resolve(process.env.XGC_VIEW_EVIDENCE_DIR ?? `${tmpdir()}/xgc2-view-browser`);
mkdirSync(output, { recursive: true });
const bundle = await build({ entryPoints: ['src/domains/experiment/agentViewCapture.ts'], bundle: true, write: false, format: 'iife', globalName: 'Capture', platform: 'browser' });
const executablePath = existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/google-chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const budget = setTimeout(() => void browser.close(), 45000);
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.setContent(`<style>
    body { margin:0; font:24px sans-serif; }
    .panel { position:relative; width:320px; height:200px; background:rgb(0,128,0); color:white; }
    #styled::before { content:""; position:absolute; left:280px; top:20px; width:20px; height:20px; background:orange; }
    canvas { position:absolute; left:10px; top:80px; }
    .frame { position:absolute; left:10px; top:50px; width:80px; height:100px; overflow:hidden; }
    video { width:80px; height:100px; object-fit:cover; object-position:center; }
    .overlay { position:absolute; top:0; right:0; width:15px; height:15px; background:yellow; }
    .hidden { display:none; }
  </style>
  <section id="styled" class="panel" data-xgc-role="experiment-panel" data-xgc-id="styled">Panel status<canvas width="100" height="80"></canvas><svg width="30" height="30" style="position:absolute;left:220px;top:120px"><rect width="30" height="30" fill="blue"/></svg><input style="position:absolute;left:10px;top:35px;width:180px" value="initial"/></section>
  <section class="hidden panel" data-xgc-role="experiment-panel" data-xgc-id="hidden">Invisible</section>
  <section class="panel" data-xgc-role="experiment-panel" data-xgc-id="camera"><span>Connecting / controls</span><div class="frame"><video muted data-xgc-role="camera-video-stream"></video><div class="overlay"></div></div></section>
  <section data-xgc-role="experiment-panel" data-xgc-id="iframe"><iframe data-xgc-role="lichtblick-frame"></iframe></section>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    const canvas = document.querySelector('#styled canvas'); const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0,0,100,80);
    document.querySelector('input').value = 'Current operator value';
  });
  const capture = (panelId, view = 'panel', signal = false) => page.evaluate(async ({panelId,view,signal}) => {
    const abort = new AbortController();
    if (signal) setTimeout(() => abort.abort(), 50);
    try { return await Capture.captureExperimentPanel(panelId,view,'gazebo-world-camera',{signal:abort.signal}); }
    catch(error) { return {error:Capture.captureErrorCode(error)}; }
  }, {panelId,view,signal});
  const save = (name, shot) => {
    assert.ok(shot.jpegBase64, `${name}: ${JSON.stringify(shot)}`);
    writeFileSync(`${output}/${name}.jpg`,Buffer.from(shot.jpegBase64,'base64'));
  };
  const pixels = (shot, coordinates) => page.evaluate(async ({jpeg,coordinates}) => {
    const image = new Image(); image.src = `data:image/jpeg;base64,${jpeg}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    return coordinates.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data].slice(0,3));
  },{jpeg:shot.jpegBase64,coordinates});
  const near = (actual, expected) => assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=20), `${actual} != ${expected}`);

  const styled = await capture('styled');save('styled-tool',styled);
  await page.locator('#styled').screenshot({path:`${output}/styled-browser.png`});
  assert.equal(styled.kind,'panel');assert.equal(styled.width,320);assert.equal(styled.height,200);
  const samples = await pixels(styled,[[300,180],[50,120],[230,130],[290,30]]);
  [[0,128,0],[255,0,0],[0,0,255],[255,165,0]].forEach((expected,i)=>near(samples[i],expected));
  results.push('panel preserves background, canvas, SVG, pseudo-element pixels');
  assert.equal((await capture('hidden')).error,'panel_not_visible');
  assert.equal((await capture('iframe')).error,'panel_view_unsupported');
  results.push('hidden/iframe panels fail explicitly');
  const connecting = await capture('camera');save('connecting-panel',connecting);
  assert.equal(connecting.kind,'panel');assert.equal((await capture('camera','camera')).error,'camera_frame_unavailable');
  results.push('stopped camera panel remains observable while source read fails');

  await page.evaluate(async () => {
    const c=document.createElement('canvas');c.width=160;c.height=90;const ctx=c.getContext('2d');
    const stream=c.captureStream(30);const video=document.querySelector('video');video.srcObject=stream;video.muted=true;
    const draw=()=>{ctx.fillStyle='red';ctx.fillRect(0,0,53,90);ctx.fillStyle='lime';ctx.fillRect(53,0,54,90);ctx.fillStyle='blue';ctx.fillRect(107,0,53,90);};
    window.viewFixture={stream,timer:setInterval(draw,30)};
    await video.play();
  });
  const panel = await capture('camera');save('video-panel',panel);assert.equal(panel.kind,'panel');
  const panelPixels=await pixels(panel,[[30,100],[84,55],[300,180]]);
  near(panelPixels[0],[0,255,0]);near(panelPixels[1],[255,255,0]);near(panelPixels[2],[0,128,0]);
  results.push('full video panel preserves cover crop, overlay and surrounding UI');
  const camera=await capture('camera','camera');save('camera-source-fallback',camera);
  assert.equal(camera.kind,'camera-frame');assert.equal(camera.width,160);assert.equal(camera.height,90);
  const framePixels=await pixels(camera,[[15,45],[80,45],[145,45]]);
  [[255,0,0],[0,255,0],[0,0,255]].forEach((expected,i)=>near(framePixels[i],expected));
  results.push('camera mode returns full uncropped advancing source video');

  await page.evaluate(()=>clearInterval(window.viewFixture.timer));
  const start=Date.now();assert.equal((await capture('camera','camera')).error,'camera_frame_unavailable');assert.ok(Date.now()-start<3500);
  results.push('stalled live track fails within bounded freshness timeout');
  assert.equal((await capture('camera','camera',true)).error,'capture_cancelled');
  results.push('unmount cancellation terminates frame wait');
  await page.evaluate(()=>{document.querySelector('video').pause();window.viewFixture.stream.getTracks().forEach(t=>t.stop());});
  assert.equal((await capture('camera','camera')).error,'camera_frame_unavailable');
  assert.equal((await capture('camera')).kind,'panel');
  results.push('paused/ended residual frame is rejected as camera but shown in panel');
  assert.equal(await page.locator('.html2canvas-container').count(),0);
  results.push('capture leaves no temporary document behind');
  writeFileSync(`${output}/receipt.json`,JSON.stringify({passed:results.length,results},null,2));
  console.log(JSON.stringify({passed:results.length,results,output},null,2));
} finally {clearTimeout(budget);await browser.close();}
