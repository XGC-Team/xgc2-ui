import { existsSync } from 'node:fs';
import { chromium,defineConfig } from '@playwright/test';

const bundledChromiumAvailable = existsSync(chromium.executablePath());
const systemChromiumPath = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(existsSync);
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (bundledChromiumAvailable ? undefined : systemChromiumPath);

export default defineConfig({
  testDir:'./live-tests',
  outputDir:'test-results/camera-live',
  fullyParallel:false,
  workers:1,
  retries:0,
  timeout:180_000,
  expect:{ timeout:20_000 },
  forbidOnly:true,
  reporter:[['list']],
  use:{
    baseURL:process.env.XGC_CAMERA_WEB_URL ?? 'http://127.0.0.1:5174',
    browserName:'chromium',
    viewport:{ width:1440,height:960 },
    locale:'en-US',
    timezoneId:'UTC',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    launchOptions:chromiumExecutablePath ? { executablePath:chromiumExecutablePath } : undefined,
  },
});
