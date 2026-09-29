// Explicit isolated browser gate: node --test live-tests/mark-prompt-drawer.browser.test.mjs
import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium,expect } from '@playwright/test';
import { build } from 'esbuild';
import { after,before,test } from 'node:test';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
let browser;
let script;
let css;

before(async () => {
  // Real React controls and their installed shared skin; only external Herdr
  // delivery is replaced. No station, listener or robot request is involved.
  const bundle = await build({
    stdin: {
      contents: `
        import React,{useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {ConfigDrawer} from './src/components/ConfigDrawer';
        import {ControlButton} from './src/components/controls/ControlButton';
        import {MarkPromptDock} from './src/devtools/mark-prompt/MarkPromptDock';
        function Fixture(){
          const [open,setOpen]=useState(false);
          return <><button onClick={()=>setOpen(true)}>Open drawer</button>
            <ConfigDrawer open={open} title="Fixture settings" onClose={()=>setOpen(false)}
              actions={<ControlButton size="compact" onClick={()=>window.saved=(window.saved||0)+1}>Save fixture</ControlButton>}
              footer={<ControlButton size="compact" onClick={()=>window.inspected=(window.inspected||0)+1}>Inspect fixture</ControlButton>}>
              <input aria-label="Fixture name" defaultValue="Example" />
            </ConfigDrawer><MarkPromptDock page="Fixture" /></>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
      resolveDir: webRoot,loader: 'tsx',
    },
    bundle: true,write: false,outfile: 'fixture.js',format: 'iife',jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"','import.meta.env': '{}' },
    plugins: [{
      name: 'isolated-mark-commands',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/(markPromptCommandService|browserDiagnostics)$/ },({ path }) => ({ path,namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/,namespace: 'fixture' },({ path }) => ({ contents: path.endsWith('browserDiagnostics')
          ? 'export const installMarkPromptBrowserDiagnostics=()=>()=>{};'
          : 'export class MarkPromptCommandError extends Error{};export const MARK_PROMPT_DEFAULT_PANE_LABEL="fixture";export const listMarkPromptTargets=async()=>[];export const sendMarkPromptCommand=()=>{throw Error("No delivery in layout test")};' }));
      },
    }],
  });
  script = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text;
  css = readFileSync(resolve(webRoot,'node_modules/@xgc2/ui-react/dist/styles.css'),'utf8')
    + bundle.outputFiles.find((file) => file.path.endsWith('.css')).text;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/google-chrome' });
});
after(async () => { await browser?.close(); });

for (const { name,position,width } of [
  { name: 'default lower-right',width: 1440,position: undefined },
  { name: 'persisted header collision',width: 1440,position: { xPercent: 1,yPercent: 0.04 } },
  { name: 'narrow persisted header collision',width: 680,position: { xPercent: 1,yPercent: 0.04 } },
]) test(`keeps standard drawer actions clickable with the ${name} Mark dock`, async () => {
  const page = await browser.newPage({ viewport: { width,height: 960 } });
  try {
    await page.route('http://fixture.test/',(route) => route.fulfill({ contentType: 'text/html',body: '<html data-skin="light"><body><div id="root"></div></body></html>' }));
    await page.goto('http://fixture.test/');
    if (position) await page.evaluate((value) => localStorage.setItem('xgc.markPrompt.position',JSON.stringify(value)),position);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: script });
    const toolbar = page.locator('[data-xgc-role="mark-prompt-toolbar"]');
    await toolbar.waitFor();
    const preferred = await toolbar.boundingBox();
    await page.getByRole('button',{ name: 'Open drawer' }).click();
    const save = page.getByRole('button',{ name: 'Save fixture' });
    await expect.poll(() => save.evaluate((button) => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.left + box.width / 2,box.top + box.height / 2));
    })).toBe(true);
    await save.click({ timeout: 3000 });
    expect(await page.evaluate(() => window.saved)).toBe(1);
    const inspect = page.getByRole('button',{ name: 'Inspect fixture' });
    await inspect.click({ timeout: 3000 });
    expect(await page.evaluate(() => window.inspected)).toBe(1);
    await page.setViewportSize({ width: width === 1440 ? 680 : 1440,height: 960 });
    await save.click({ timeout: 3000 });
    await inspect.click({ timeout: 3000 });
    await page.setViewportSize({ width,height: 960 });
    await page.getByRole('button',{ name: 'Close drawer' }).click();
    await expect.poll(async () => (await toolbar.boundingBox())?.y).toBe(preferred?.y);
    if (position) expect(await page.evaluate(() => JSON.parse(localStorage.getItem('xgc.markPrompt.position')))).toEqual(position);
  } finally { await page.close(); }
});
