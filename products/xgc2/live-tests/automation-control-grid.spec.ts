import { expect,test,type Locator } from '@playwright/test';

const experimentName = '5 PX4 multirotors + 2 Mecanum UGVs experiment';
const gridSelector = '[data-xgc-role="automation-workflow-action-grid"][data-xgc-id="paper-leader-sce1"]';
const actionSelector = '[data-xgc-role="panel-action-invoke"]';

test('Automation grids wrap square actions with equal outer insets',async ({ page,browser },testInfo) => {
  const response = await page.request.get('/api/experiments');
  expect(response.ok()).toBe(true);
  const experiments = await response.json() as { head:{ resourceId:string;name:string } }[];
  const experiment = experiments.find(({ head }) => head.name === experimentName);
  expect(experiment).toBeDefined();
  await page.goto(`/#/experiments/${experiment!.head.resourceId}/gcs`);
  const grid = page.locator(gridSelector);
  await expect(grid.locator(actionSelector)).toHaveCount(7);

  for (const viewport of [{ width:1920,height:1080 },{ width:1440,height:960 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => equalInsets(await gridGeometry(grid))).toBe(true);
    const geometry = await gridGeometry(grid);
    expect(geometry.columns).toBe(geometry.view.width <= 300 ? 2 : 4);
    verifyGrid(geometry,7);
    const resetPose = geometry.cards.find((card) => card.id === 'reset-pose');
    expect(resetPose).toBeDefined();
    expect(resetPose!.width).toBeCloseTo(resetPose!.height,1);
    for (const skin of ['light','dark']) {
      await page.locator('html').evaluate((element,value) => element.setAttribute('data-skin',value),skin);
      await testInfo.attach(`gcs-${viewport.width}-${skin}`,{
        body:await grid.screenshot(),contentType:'image/png',
      });
    }
    await testInfo.attach(`gcs-${viewport.width}-geometry`,{
      body:Buffer.from(JSON.stringify(geometry,null,2)),contentType:'application/json',
    });
  }

  // Detached markup preserves the actual stylesheet and tile DOM, but has no
  // React callbacks or network access. Resizing never edits the saved panel.
  const markup = await page.evaluate((selector) => ({
    styles:[...document.querySelectorAll('style')].map((style) => style.outerHTML).join(''),
    panel:document.querySelector(selector)!.closest('.automation-workflow-panel')!.outerHTML,
  }),gridSelector);
  const isolatedContext = await browser.newContext({ offline:true,viewport:{ width:1440,height:960 } });
  try {
    const isolated = await isolatedContext.newPage();
    await isolated.setContent(`<html data-skin="light"><head>${markup.styles}</head><body><div id="probe" style="width:382px;height:422px">${markup.panel}</div></body></html>`);
    const isolatedGrid = isolated.locator(gridSelector);
    for (const size of [
      { width:382,height:180,columns:4 },
      { width:280,height:422,columns:2 },
      { width:170,height:560,columns:1 },
    ]) {
      await isolated.locator('#probe').evaluate((element,value) => {
        const host = element as HTMLElement;
        host.style.width = `${value.width}px`;
        host.style.height = `${value.height}px`;
      },size);
      const geometry = await gridGeometry(isolatedGrid);
      expect(geometry.columns).toBe(size.columns);
      verifyGrid(geometry,7);
      await testInfo.attach(`isolated-${size.width}x${size.height}-geometry`,{
        body:Buffer.from(JSON.stringify(geometry,null,2)),contentType:'application/json',
      });
    }
    await isolated.locator('#probe').evaluate((element) => {
      (element as HTMLElement).style.width = '382px';
    });
    await isolatedGrid.evaluate((element) => {
      element.querySelectorAll('[data-xgc-role="panel-action-invoke"]').forEach((action,index) => {
        if (index > 0) action.remove();
      });
      // Match controlActionGridStyle for a real single binding, including its
      // narrow row count. Density remains four regardless of item count.
      const grid = element as HTMLElement;
      for (const name of ['--control-cols','--control-rows','--control-narrow-cols','--control-narrow-rows','--control-stacked-rows']) {
        grid.style.setProperty(name,'1');
      }
    });
    const sparse = await gridGeometry(isolatedGrid);
    expect(sparse.columns).toBe(1);
    verifyGrid(sparse,1);
    expect(sparse.cards[0].width).toBeCloseTo((sparse.view.width - sparse.padding * 2 - sparse.gap * 3) / 4,1);
    expect(sparse.width).toBeCloseTo(sparse.cards[0].width + sparse.padding * 2,1);
    expect(sparse.height).toBeCloseTo(sparse.cards[0].height + sparse.padding * 2,1);
  } finally {
    await isolatedContext.close();
  }
});

async function gridGeometry(grid:Locator) {
  return grid.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const view = element.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(element);
    const cards = [...element.querySelectorAll('[data-xgc-role="panel-action-invoke"]')].map((card) => {
      const rect = card.getBoundingClientRect();
      const progress = card.querySelector('.xgc-workflow-status-card-progress')!.getBoundingClientRect();
      return {
        id:card.getAttribute('data-xgc-id'),x:rect.x,y:rect.y,width:rect.width,height:rect.height,
        progressWidth:progress.width,progressHeight:progress.height,
        progressInside:progress.left >= rect.left && progress.right <= rect.right
          && progress.top >= rect.top && progress.bottom <= rect.bottom,
      };
    });
    return {
      width:box.width,height:box.height,padding:Number.parseFloat(style.paddingTop),gap:Number.parseFloat(style.gap),
      view:{ width:view.width,height:view.height },
      withinView:box.left >= view.left && box.right <= view.right + 0.8
        && box.top >= view.top && box.bottom <= view.bottom + 0.8,
      columns:style.gridTemplateColumns.split(' ').length,
      insets:{
        left:Math.min(...cards.map((card) => card.x)) - box.left,
        top:Math.min(...cards.map((card) => card.y)) - box.top,
        right:box.right - Math.max(...cards.map((card) => card.x + card.width)),
        bottom:box.bottom - Math.max(...cards.map((card) => card.y + card.height)),
      },
      cards,
    };
  });
}

function equalInsets(geometry:Awaited<ReturnType<typeof gridGeometry>>) {
  return Object.values(geometry.insets).every((inset) => Math.abs(inset - geometry.padding) < 0.8);
}

function verifyGrid(geometry:Awaited<ReturnType<typeof gridGeometry>>,count:number) {
  expect(geometry.cards).toHaveLength(count);
  expect(equalInsets(geometry),JSON.stringify(geometry)).toBe(true);
  expect(geometry.withinView).toBe(true);
  const rows = Math.ceil(count / geometry.columns);
  expect(geometry.height).toBeCloseTo(geometry.padding * 2 + rows * geometry.cards[0].height + (rows - 1) * geometry.gap,1);
  for (const card of geometry.cards) {
    expect(card.width,`${card.id} must remain square`).toBeCloseTo(card.height,1);
    expect(card.width).toBeCloseTo(geometry.cards[0].width,1);
    expect(card.height).toBeCloseTo(geometry.cards[0].height,1);
    expect(card.progressWidth).toBeGreaterThan(0);
    expect(card.progressHeight).toBeGreaterThan(0);
    expect(card.progressInside).toBe(true);
  }
}
