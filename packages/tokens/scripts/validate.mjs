import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const baseCss = await readFile(new URL('../src/base.css', import.meta.url), 'utf8');
const requiredTokens = [
  '--color-bg-app',
  '--color-bg-surface',
  '--color-border',
  '--color-text',
  '--color-accent',
  '--space-8',
  '--radius-control',
  '--size-control-default',
  '--size-control-navigation',
  '--size-header-page',
  '--size-header-panel',
  '--size-header-code',
  '--size-scrollbar',
  '--size-scrollbar-thumb-min',
  '--stroke-scrollbar-inset',
  '--radius-scrollbar',
  '--color-scrollbar-track',
  '--color-scrollbar-thumb',
  '--color-scrollbar-thumb-hover',
  '--color-scrollbar-thumb-active',
  '--background-panel-header',
];

const missing = requiredTokens.filter((token) => !css.includes(`${token}:`));
if (missing.length > 0) {
  throw new Error(`Missing required design tokens: ${missing.join(', ')}`);
}

for (const skin of ['dark', 'light']) {
  if (!css.includes(`[data-skin="${skin}"]`)) {
    throw new Error(`Missing ${skin} skin selector`);
  }
}

for (const rule of [
  'scrollbar-color:',
  '*::-webkit-scrollbar {',
  '*::-webkit-scrollbar-thumb:hover',
  '*::-webkit-scrollbar-thumb:active',
  '*::-webkit-scrollbar-button',
]) {
  if (!baseCss.includes(rule)) {
    throw new Error(`Missing global scrollbar rule: ${rule}`);
  }
}
