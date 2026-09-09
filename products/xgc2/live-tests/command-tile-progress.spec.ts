import { expect,test,type Locator } from '@playwright/test';

const custom = '[data-xgc-role="panel-action-invoke"][data-xgc-id="custom1"]';
const setMode = '[data-xgc-role="px4-set-mode-apply"][data-xgc-id="robot-control"]';
const plotBag = '[data-xgc-role="panel-action-invoke"][data-xgc-id="replay-plot"]';
const progressSelector = '.xgc-workflow-status-card-progress';

test('command tiles keep the same visible progress slot across consumers and states',async ({ page,browser },testInfo) => {
  await page.goto('/');
  await page.locator('[data-xgc-role="primary-nav-item"][data-xgc-id="experiment"]').click();
  await page.locator('[data-xgc-role="experiment-row-open"]')
    .filter({ hasText:'5 PX4 multirotors + 2 Mecanum UGVs experiment' }).click();

  // Navigation reads the real consumers. Commands are never clicked. State
  // coverage runs on detached markup in an offline context without callbacks.
  const isolatedContext = await browser.newContext({ offline:true,viewport:{ width:1440,height:960 },reducedMotion:'reduce' });
  try {
    for (const { dashboard,selectors } of [
      { dashboard:'gcs',selectors:[custom,setMode] },
      { dashboard:'algorithm',selectors:[plotBag] },
    ]) {
      await page.locator(`[data-xgc-role="experiment-dashboard-tabs"] [role="tab"][data-xgc-id="${dashboard}"]`).click();
      for (const selector of selectors) {
        await expect(page.locator(selector)).toBeVisible();
        await expect(page.locator(selector).locator(progressSelector)).toBeVisible();
      }
      const markup = await page.evaluate(() => {
        const root = document.documentElement.cloneNode(true) as HTMLElement;
        root.querySelectorAll('script').forEach((script) => script.remove());
        return root.outerHTML;
      });
      const isolated = await isolatedContext.newPage();
      await isolated.setContent(markup);
      for (const skin of ['light','dark']) {
        await isolated.locator('html').evaluate((element,value) => element.setAttribute('data-skin',value),skin);
        for (const selector of selectors) {
          const button = isolated.locator(selector);
          const track = button.locator(progressSelector);
          const initial = await geometry(button);
          for (const state of [
            { name:'idle',disabled:false,busy:false,running:false,percent:0,mode:'decorative' },
            { name:'disabled',disabled:true,busy:false,running:false,percent:0,mode:'decorative' },
            { name:'busy',disabled:true,busy:true,running:false,percent:0,mode:'indeterminate' },
            { name:'measured',disabled:true,busy:false,running:true,percent:50,mode:'measured' },
            { name:'complete',disabled:false,busy:false,running:false,percent:100,mode:'measured' },
          ]) {
            await button.evaluate((element,value) => {
              const control = element as HTMLButtonElement;
              control.disabled = value.disabled;
              control.setAttribute('aria-busy',String(value.busy));
              control.dataset.xgcRunning = String(value.running);
              control.dataset.xgcProgress = String(value.percent);
              const progress = control.querySelector<HTMLElement>('.xgc-workflow-status-card-progress')!;
              progress.dataset.xgcProgressMode = value.mode;
              progress.querySelector<HTMLElement>('.xgc-progress-fill')!.style.setProperty('--xgc-progress-percent',`${value.percent}%`);
            },state);
            await expect(track,`${selector} ${skin} ${state.name}`).toBeVisible();
            await expect(track).toHaveCSS('opacity','1');
            await expect(button).toHaveCSS('opacity','1');
            expect(await geometry(button)).toEqual(initial);
            expect(await track.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
            if (state.mode === 'measured') {
              await expect.poll(() => track.evaluate((element) => {
                const fill = element.querySelector('.xgc-progress-fill')!;
                return Math.round(fill.getBoundingClientRect().width / element.getBoundingClientRect().width * 100);
              })).toBe(state.percent);
            }
          }
        }
        await testInfo.attach(`${dashboard}-${skin}`,{ body:await isolated.screenshot(),contentType:'image/png' });
      }
      await isolated.close();
    }
  } finally {
    await isolatedContext.close();
  }
});

async function geometry(button:Locator) {
  return button.evaluate((element) => {
    const rect = (target:Element) => {
      const box = target.getBoundingClientRect();
      return { x:box.x,y:box.y,width:box.width,height:box.height };
    };
    return {
      button:rect(element),
      heading:rect(element.querySelector('.xgc-workflow-status-card-heading')!),
      progress:rect(element.querySelector('.xgc-workflow-status-card-progress')!),
    };
  });
}
