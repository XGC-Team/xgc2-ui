import { expect,test,type Locator,type Page } from '@playwright/test';

type Capture = { name:string;html:string;selector:string;iconOnly?:boolean;tile?:boolean;held?:boolean };
type ControlState = 'idle' | 'disabled' | 'hover' | 'active' | 'measured' | 'complete' | 'held';

test('danger actions share the Discard surface while icon actions keep a red glyph',async ({ page,browser },testInfo) => {
  const writes:string[] = [];
  await page.route('**/api/**',async (route) => {
    const request = route.request();
    if (!['GET','HEAD','OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      await route.abort();
    } else await route.continue();
  });
  const captures:Capture[] = [];
  await page.goto('/');
  await page.locator('[data-xgc-role="ops-nav-item"][data-xgc-id="operations"]').click();
  captures.push(await capture(page,'operations','[data-xgc-role="operations-kill-all"][data-xgc-id="local"]'));

  await page.locator('[data-xgc-role="primary-nav-item"][data-xgc-id="automations"]').click();
  const archive = page.locator('[data-xgc-role="automation-definition-archive"]')
    .and(page.getByRole('button',{ name:'Archive Paper Leader SCE1 Catkin Build',exact:true }));
  await expect(archive).toBeVisible();
  await expect(archive).toHaveAttribute('data-icon-only','true');
  const archiveId = await archive.getAttribute('data-xgc-id');
  captures.push({ ...await capture(page,'archive',`[data-xgc-role="automation-definition-archive"][data-xgc-id="${archiveId}"]`),iconOnly:true });

  await page.locator('[data-xgc-role="ops-nav-item"][data-xgc-id="system"]').click();
  await page.locator('[data-xgc-role="nav-page-sections"][data-xgc-id="system"] [data-xgc-role="nav-page-section"][data-xgc-id="files"]').click();
  await page.locator('[data-xgc-role="host-file-more-trigger"]').first().click();
  await expect(page.getByRole('menuitem',{ name:'Delete',exact:true })).toBeVisible();
  captures.push(await capture(page,'file-delete-menu','[role="menuitem"][data-tone="danger"]'));

  const response = await page.request.get('/api/experiments');
  expect(response.ok()).toBe(true);
  const experiments = await response.json() as { head:{ resourceId:string;name:string } }[];
  const experiment = experiments.find(({ head }) => head.name === '5 PX4 multirotors + 2 Mecanum UGVs experiment');
  expect(experiment).toBeDefined();
  await page.goto(`/#/experiments/${experiment!.head.resourceId}/gcs`);
  captures.push({ ...await capture(page,'kill','[data-xgc-role="robot-operation-force-disarm"][data-xgc-id="robot-control:force-disarm"]'),tile:true });
  // This header callback only selects a view. Neither E-stop nor Kill is clicked.
  await page.locator('[data-xgc-role="robot-control-panel-view"][data-xgc-id="ground"]').click();
  captures.push({ ...await capture(page,'estop','[data-xgc-role="ugv-chassis-hold"][data-xgc-id="robot-control"]'),tile:true,held:true });

  const referencePage = await page.context().newPage();
  await referencePage.goto('/');
  await mountDiscardReference(referencePage);
  const reference = await capture(referencePage,'discard','[data-danger-reference]');
  await referencePage.close();
  expect(writes).toEqual([]);

  // Actual consumer markup and styles are copied without React callbacks.
  // All press/disabled/held/progress probes run offline, including Discard.
  const isolatedContext = await browser.newContext({ offline:true,viewport:{ width:1440,height:960 },reducedMotion:'reduce' });
  try {
    const referenceView = await isolatedContext.newPage();
    await referenceView.setContent(reference.html);
    const referenceButton = referenceView.locator(reference.selector);
    for (const item of captures) {
      const isolated = await isolatedContext.newPage();
      await isolated.setContent(item.html);
      const button = isolated.locator(item.selector);
      await button.scrollIntoViewIfNeeded();
      for (const skin of ['light','dark']) {
        for (const view of [isolated,referenceView]) {
          await view.locator('html').evaluate((element,value) => element.setAttribute('data-skin',value),skin);
        }
        await setState(isolated,button,'idle');
        const initial = await geometry(button,Boolean(item.tile));
        const states:ControlState[] = ['idle','disabled','hover','active',...(item.tile ? ['measured','complete'] as const : []),...(item.held ? ['held'] as const : [])];
        for (const state of states) {
          await setState(referenceView,referenceButton,state === 'held' ? 'idle' : state);
          await setState(isolated,button,state);
          const expectedSurface = await surface(referenceButton);
          const actualSurface = await surface(button);
          if (item.iconOnly) {
            expect(actualSurface.background,`${item.name} remains an icon action`).not.toBe(expectedSurface.background);
            expect(actualSurface.color).not.toBe(expectedSurface.color);
            expect(await button.innerText()).toBe('');
          } else {
            await expect.poll(async () => (await surface(button)).background,`${item.name} ${skin} ${state}`).toBe(expectedSurface.background);
            if (state !== 'disabled') {
              expect(actualSurface.color,`${item.name} ${skin} ${state} foreground`).toBe(expectedSurface.color);
            }
            if (state === 'held') {
              expect(actualSurface.shadow,`${item.name} latched halo is outer, not inset`).not.toContain('inset');
              expect(actualSurface.shadow).toMatch(/rgb|oklab|color/);
            }
          }
          expect(await geometry(button,Boolean(item.tile)),`${item.name} ${skin} ${state} geometry`).toEqual(initial);
          if (item.tile) {
            const progress = button.locator('.xgc-workflow-status-card-progress');
            await expect(progress).toBeVisible();
            await expect(progress).toHaveCSS('opacity','1');
            await expect(button).toHaveCSS('opacity','1');
            expect(await progress.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
            if (['measured','complete','held'].includes(state)) {
              await expect(progress.locator('.xgc-progress-fill')).toHaveCSS('opacity','1');
              expect(await progress.locator('.xgc-progress-fill').evaluate((element) => getComputedStyle(element).backgroundColor))
                .not.toBe(await progress.evaluate((element) => getComputedStyle(element).backgroundColor));
              expect(await progress.evaluate((element) => {
                const fill = element.querySelector('.xgc-progress-fill')!;
                return Math.round(fill.getBoundingClientRect().width / element.getBoundingClientRect().width * 100);
              })).toBe(state === 'measured' ? 50 : 100);
            }
          }
          await testInfo.attach(`${item.name}-${skin}-${state}`,{ body:await button.screenshot(),contentType:'image/png' });
        }
      }
      await isolated.close();
    }
  } finally {
    await isolatedContext.close();
  }
});

async function capture(page:Page,name:string,selector:string):Promise<Capture> {
  await expect(page.locator(selector)).toBeVisible();
  return { name,selector,html:await page.evaluate(() => {
    const root = document.documentElement.cloneNode(true) as HTMLElement;
    root.querySelectorAll('script,iframe').forEach((element) => element.remove());
    return root.outerHTML;
  }) };
}

async function mountDiscardReference(page:Page) {
  // Render the published ConfirmationDialog itself with inert callbacks. No
  // user document or draft is edited to obtain its real Discard button.
  await page.evaluate(async () => {
    const main = await (await fetch('/src/main.tsx')).text();
    const bootstrap = await (await fetch('/src/app/productWebBootstrap.tsx')).text();
    const moduleUrl = (source:string,pattern:RegExp) => {
      const value = source.match(pattern)?.[1];
      if (!value) throw new Error('Unable to resolve the current Vite module for the isolated reference');
      return value;
    };
    const [react,dom,shared] = await Promise.all([
      import(moduleUrl(main,/from "([^"]*\/react\.js[^"]*)"/)),
      import(moduleUrl(bootstrap,/from "([^"]*react-dom_client[^"]*)"/)),
      import(moduleUrl(main,/from "([^"]*@xgc2_ui-react[^"]*)"/)),
    ]);
    const host = document.createElement('div');
    document.body.append(host);
    dom.createRoot(host).render(react.createElement(shared.ConfirmationDialog,{
      request:{ title:'Discard unsaved draft',message:'Discard the unsaved Automation draft and return to the list?',confirmLabel:'Discard' },
      onCancel:() => undefined,onConfirm:() => undefined,
    }));
  });
  const button = page.getByRole('alertdialog',{ name:'Discard unsaved draft' }).getByRole('button',{ name:'Discard',exact:true });
  await expect(button).toBeVisible();
  await button.evaluate((element) => element.setAttribute('data-danger-reference','true'));
}

async function setState(page:Page,button:Locator,state:ControlState) {
  await page.mouse.up();
  await page.mouse.move(0,0);
  await button.evaluate((element,value) => {
    const control = element as HTMLButtonElement;
    control.disabled = value === 'disabled';
    control.setAttribute('aria-pressed',String(value === 'held'));
    control.setAttribute('aria-busy','false');
    control.dataset.xgcRunning = String(value === 'measured');
    const percent = value === 'measured' ? 50 : ['complete','held'].includes(value) ? 100 : 0;
    control.dataset.xgcProgress = String(percent);
    const progress = control.querySelector<HTMLElement>('.xgc-workflow-status-card-progress');
    if (progress) {
      progress.dataset.xgcProgressMode = percent ? 'measured' : 'decorative';
      progress.querySelector<HTMLElement>('.xgc-progress-fill')!.style.setProperty('--xgc-progress-percent',`${percent}%`);
    }
  },state);
  if (state === 'hover' || state === 'active') await button.hover();
  if (state === 'active') await page.mouse.down();
  await button.evaluate(async (element) => {
    await Promise.all(element.getAnimations().filter((animation) => (
      animation.effect?.getTiming().iterations !== Infinity
    )).map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function surface(button:Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background:style.backgroundColor,color:style.color,shadow:style.boxShadow };
  });
}

async function geometry(button:Locator,absolute:boolean) {
  return button.evaluate((element,strict) => {
    const outer = element.getBoundingClientRect();
    const rect = (target:Element) => {
      const box = target.getBoundingClientRect();
      return { x:strict ? box.x : box.x - outer.x,y:strict ? box.y : box.y - outer.y,width:box.width,height:box.height };
    };
    return {
      // Standard Button retains its established pressed translation. Its
      // layout slot and content offsets stay fixed; command tiles stay fixed
      // in viewport coordinates as well.
      button:strict ? rect(element) : { x:(element as HTMLElement).offsetLeft,y:(element as HTMLElement).offsetTop,width:outer.width,height:outer.height },
      contents:[...element.querySelectorAll('svg,.xgc-workflow-status-card-heading,.xgc-workflow-status-card-progress')].map(rect),
    };
  },absolute);
}
