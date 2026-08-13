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
  '--size-control-workflow-toolbar',
  '--size-control-workflow-element-toolbar',
  '--size-header-page',
  '--size-header-panel',
  '--size-header-code',
  '--size-code-viewport-compact',
  '--size-code-viewport-default',
  '--size-scrollbar',
  '--size-scrollbar-thumb-min',
  '--size-scrollbar-end',
  '--stroke-scrollbar-inset',
  '--radius-scrollbar',
  '--duration-quick',
  '--duration-fast',
  '--duration-deliberate',
  '--easing-standard',
  '--easing-enter',
  '--easing-exit',
  '--opacity-hidden',
  '--opacity-subdued',
  '--opacity-disabled',
  '--opacity-deemphasized',
  '--opacity-secondary',
  '--opacity-full',
  '--color-scrollbar-track',
  '--color-scrollbar-thumb',
  '--color-scrollbar-thumb-hover',
  '--color-scrollbar-thumb-active',
  '--shadow-selection-highlight-halo',
  '--background-app',
  '--background-surface',
  '--background-panel-header',
  '--shadow-card',
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

const boundedFoundationFamilies = [
  ['interaction duration', /--duration-(?:quick|fast|deliberate)\s*:/g, 3],
  ['interaction easing', /--easing-(?:standard|enter|exit)\s*:/g, 3],
  ['opacity', /--opacity-(?:hidden|subdued|disabled|deemphasized|secondary|full)\s*:/g, 6],
];
for (const [label, pattern, expected] of boundedFoundationFamilies) {
  const count = [...css.matchAll(pattern)].length;
  if (count !== expected) throw new Error(`${label} scale drifted (${count}/${expected})`);
}

for (const skin of ['dark', 'light']) {
  if (!css.includes(`[data-skin="${skin}"]`)) {
    throw new Error(`Missing ${skin} skin selector`);
  }
}

function skinBlock(skin) {
  const selector = skin === 'dark'
    ? /:root,\s*:root\[data-skin="dark"\]\s*\{([\s\S]*?)\n\}/
    : /:root\[data-skin="light"\]\s*\{([\s\S]*?)\n\}/;
  const match = css.match(selector);
  if (!match) throw new Error(`Cannot inspect ${skin} skin block`);
  return match[1];
}

function hexTokens(block) {
  return new Map(
    [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)]
      .map((match) => [match[1], match[2].toLowerCase()]),
  );
}

function declarationValue(block, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return block.match(new RegExp(`${escaped}:\\s*([\\s\\S]*?);`))?.[1];
}

function rgb(hex) {
  return hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));
}

function luminance(hex) {
  const channels = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const contrastContracts = [
  ['--color-text', '--color-bg-app', 7, 'body text'],
  ['--color-text', '--color-bg-control', 7, 'control text'],
  ['--color-text-muted', '--color-bg-surface', 4.5, 'secondary text'],
  ['--color-text-faint', '--color-bg-surface', 4.5, 'quiet text'],
  ['--color-text-disabled', '--color-bg-surface', 3, 'disabled text'],
  ['--color-text-inverse', '--color-bg-primary', 4.5, 'primary control text'],
  ['--color-border-strong', '--color-bg-control', 3, 'control boundary'],
  ['--color-border-focus', '--color-bg-control', 3, 'focus indicator'],
  ['--color-selection-highlight', '--color-bg-canvas', 3, 'spatial selection'],
  ['--color-terminal-fg', '--color-terminal-bg', 7, 'terminal text'],
  ['--color-terminal-muted', '--color-terminal-bg', 4.5, 'terminal metadata'],
  ['--color-syntax-comment', '--color-bg-code', 4.5, 'code comments'],
];

const neutralFoundationTokens = [
  '--color-bg-app', '--color-bg-chrome', '--color-bg-sidebar',
  '--color-bg-surface', '--color-bg-surface-hover', '--color-bg-subtle',
  '--color-bg-muted', '--color-bg-code', '--color-bg-canvas',
  '--color-bg-control', '--color-bg-control-hover', '--color-bg-active',
  '--color-bg-selected', '--color-border-muted', '--color-border',
  '--color-border-strong', '--color-border-hover', '--color-text',
  '--color-text-strong', '--color-text-heading', '--color-text-muted',
  '--color-text-soft', '--color-text-softer', '--color-text-faint',
  '--color-text-disabled', '--color-terminal-bg', '--color-terminal-fg',
  '--color-terminal-surface', '--color-terminal-muted',
  '--color-terminal-muted-hover', '--color-terminal-muted-active',
  '--color-chart-axis', '--color-chart-grid', '--color-chart-label',
];

const neutralMaterialTokens = [
  '--background-app', '--background-chrome', '--background-sidebar',
  '--background-surface', '--background-control', '--background-panel-header',
  '--shadow-card', '--shadow-floating', '--shadow-dialog', '--shadow-upward',
  '--shadow-drawer', '--shadow-focus',
];

function assertNotBlueBiased(value, context) {
  const [red, green, blue] = rgb(value);
  if (blue > red || blue > green) {
    throw new Error(`${context} (${value}) reintroduces a blue-grey bias`);
  }
}

for (const skin of ['dark', 'light']) {
  const tokens = hexTokens(skinBlock(skin));
  for (const [foreground, background, minimum, role] of contrastContracts) {
    const foregroundValue = tokens.get(foreground);
    const backgroundValue = tokens.get(background);
    if (!foregroundValue || !backgroundValue) {
      throw new Error(`${skin} ${role} contrast requires literal hex tokens`);
    }
    const ratio = contrast(foregroundValue, backgroundValue);
    if (ratio < minimum) {
      throw new Error(`${skin} ${role} contrast is ${ratio.toFixed(2)}:1; expected at least ${minimum}:1`);
    }
  }

  for (const token of neutralFoundationTokens) {
    const value = tokens.get(token);
    if (!value) throw new Error(`${skin} neutral foundation token ${token} must use a literal hex value`);
    assertNotBlueBiased(value, `${skin} ${token}`);
  }

  for (const token of neutralMaterialTokens) {
    const value = declarationValue(skinBlock(skin), token);
    if (!value) throw new Error(`${skin} neutral material token ${token} must be defined`);
    for (const match of value.matchAll(/#[\da-f]{6}\b/gi)) {
      assertNotBlueBiased(match[0].toLowerCase(), `${skin} ${token}`);
    }
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
