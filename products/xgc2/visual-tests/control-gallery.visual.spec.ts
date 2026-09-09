import { expect,test } from '@playwright/test';

for (const skin of ['dark', 'light'] as const) {
  test(`${skin} shared control gallery stays visually stable`, async ({ page }) => {
    await page.goto(`/?xgc-control-gallery=1&skin=${skin}`);
    await expect(page.getByTestId('control-gallery')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
    await page.evaluate(async () => document.fonts.ready);

    if (skin === 'light') {
      // Pixel comparison tolerates small channel deltas, so pin the neutral
      // foundation independently to prevent a full-canvas color cast.
      await expect.poll(() => page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          app: root.getPropertyValue('--color-bg-app').trim().toLowerCase(),
          chrome: root.getPropertyValue('--color-bg-chrome').trim().toLowerCase(),
          surface: root.getPropertyValue('--color-bg-surface').trim().toLowerCase(),
        };
      })).toEqual({
        app: '#f4f6fa',
        chrome: '#ffffff',
        surface: '#ffffff',
      });
    }

    await expect(page).toHaveScreenshot(`control-gallery-${skin}.png`, screenshotOptions);

    await page.getByRole('button', { name: 'Open modal' }).click();
    await expect(page.getByRole('dialog', { name: 'Create automation' })).toBeVisible();
    await expect(page).toHaveScreenshot(`control-gallery-modal-${skin}.png`, screenshotOptions);
    await page.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('button', { name: 'Open drawer' }).click();
    await expect(page.getByRole('dialog', { name: 'Robot settings' })).toBeVisible();
    await expect(page).toHaveScreenshot(`control-gallery-drawer-${skin}.png`, screenshotOptions);
  });
}

const screenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.002,
} as const;
