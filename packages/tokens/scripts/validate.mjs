import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const baseCss = await readFile(new URL('../src/base.css', import.meta.url), 'utf8');
const requiredTokens = [
  '--color-bg-app',
  '--color-bg-canvas',
  '--color-bg-code',
  '--color-bg-surface',
  '--color-bg-selected',
  '--color-border',
  '--color-border-accent-soft',
  '--color-text',
  '--color-text-disabled',
  '--color-accent',
  '--color-selection-highlight',
  '--color-selection-glow',
  '--space-2xs',
  '--space-xs',
  '--space-sm',
  '--space-md',
  '--space-lg',
  '--space-xl',
  '--space-2xl',
  '--space-3xl',
  '--space-layout-default',
  '--space-page-padding',
  '--space-panel-padding',
  '--space-control-gap',
  '--radius-control',
  '--radius-surface',
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
  '--shadow-selection-highlight-halo',
  '--background-panel-header',
];

const missing = requiredTokens.filter((token) => !css.includes(`${token}:`));
if (missing.length > 0) {
  throw new Error(`Missing required design tokens: ${missing.join(', ')}`);
}

const numericSpacingTokens = [...`${css}\n${baseCss}`.matchAll(/--space-\d+\b/g)].map((match) => match[0]);
if (numericSpacingTokens.length > 0) {
  throw new Error(
    `Numeric spacing aliases are prohibited; use the bounded rhythm or a semantic role: ${[...new Set(numericSpacingTokens)].join(', ')}`,
  );
}

for (const skin of ['dark', 'light']) {
  if (!css.includes(`[data-skin="${skin}"]`)) {
    throw new Error(`Missing ${skin} skin selector`);
  }
}

for (const token of ['--color-selection-highlight', '--color-selection-glow']) {
  const definitions = [...css.matchAll(new RegExp(`${token}:`, 'g'))].length;
  if (definitions !== 2) {
    throw new Error(`${token} must define exactly one value per skin (${definitions}/2)`);
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
