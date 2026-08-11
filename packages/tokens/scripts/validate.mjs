import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const requiredTokens = [
  '--color-bg-app',
  '--color-bg-surface',
  '--color-border',
  '--color-text',
  '--color-accent',
  '--space-8',
  '--radius-control',
  '--size-control-default',
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
