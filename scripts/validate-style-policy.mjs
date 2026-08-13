import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { forbiddenControlAppearanceDefinitions } from './style-policy-contract.mjs';

const root = new URL('../', import.meta.url);
const roots = ['packages', 'apps'];
const forbidden = [
  { pattern: /\bborder-left\s*:/i, label: 'left border' },
  { pattern: /\bborder-inline-start\s*:/i, label: 'inline-start border' },
  { pattern: /\bbox-shadow\s*:\s*inset\s+(?!0(?:px)?\s+0(?:px)?\s+0(?:px)?\b)[^;]+\s0(?:px)?\s0(?:px)?(?:\s|;)/i, label: 'inset edge shadow' },
];

const stateSelector = /(?:^|[.\[#:_-])(?:status|state|ready|online|health|badge|pill|led|dot)(?:$|[.\]#:_="'-])/i;
const decoratedState = [
  { property: /^(?:background|background-color)$/i, allowed: /^(?:none|transparent|inherit|initial|unset)$/i, label: 'filled state background' },
  { property: /^border(?:-(?:block|inline)(?:-(?:start|end))?|-(?:top|right|bottom|left))?$/i, allowed: /^(?:0|0px|none|transparent|inherit|initial|unset)$/i, label: 'enclosing state border' },
  { property: /^border-radius$/i, allowed: /^(?:0|0px|none|inherit|initial|unset)$/i, label: 'rounded state shape' },
  { property: /^box-shadow$/i, allowed: /^(?:none|inherit|initial|unset)$/i, label: 'state shadow or marker' },
];
// A workflow card is a full operational control surface that also contains
// plain status text. Neutral surface chrome is allowed; semantic state must
// never tint or decorate that enclosing card.
const neutralStateContainers = new Set(['.xgc-workflow-status-card']);
const semanticStateMaterial = /(?:success|danger|warning|accent|primary|selected|error)/i;

async function collect(directory) {
  const entries = await readdir(new URL(`${directory}/`, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['dist', 'node_modules', 'storybook-static'].includes(entry.name)) {
        files.push(...await collect(path));
      }
    } else if (extname(entry.name) === '.css') {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
const cssFiles = (await Promise.all(roots.map(collect))).flat();
const cssSources = [];
for (const file of cssFiles) {
  const content = await readFile(new URL(file, root), 'utf8');
  cssSources.push({ file, content });
  for (const match of content.matchAll(/--space-\d+\b/g)) {
    violations.push(`${relative('.', file)}: numeric spacing token ${match[0]}`);
  }
  for (const { pattern, label } of forbidden) {
    if (pattern.test(content)) {
      violations.push(`${relative('.', file)}: prohibited ${label}`);
    }
  }
  for (const rule of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (!stateSelector.test(selector) || /empty-state/i.test(selector)) continue;
    const neutralStateContainer = neutralStateContainers.has(selector);
    for (const declaration of rule[2].split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      if (neutralStateContainer) {
        if (/^(?:background|background-color|border|box-shadow)$/i.test(property) && semanticStateMaterial.test(value)) {
          violations.push(`${relative('.', file)}: semantic state material in neutral container ${selector}`);
        }
        continue;
      }
      for (const policy of decoratedState) {
        if (policy.property.test(property) && !policy.allowed.test(value)) {
          violations.push(`${relative('.', file)}: ${policy.label} in ${selector}`);
        }
      }
    }
  }
}

const tokenSource = cssSources.find(({ file }) => file === 'packages/tokens/src/index.css')?.content ?? '';
const boundedTokenFamilies = [
  ['font size', /--font-(?:xs|sm|md|base|lg|xl|2xl)\s*:/g, 7],
  ['line height', /--line-height-(?:none|tight|normal|relaxed|control)\s*:/g, 5],
  ['tracking', /--tracking-(?:label|caps)\s*:/g, 2],
  ['radius', /--radius-(?:xs|sm|md|lg|xl)\s*:/g, 5],
  ['icon size', /--size-icon-(?:xs|sm|default|lg|xl)\s*:/g, 5],
];
for (const [label, pattern, expected] of boundedTokenFamilies) {
  const count = [...tokenSource.matchAll(pattern)].length;
  if (count !== expected) violations.push(`packages/tokens/src/index.css: ${label} scale drifted (${count}/${expected})`);
}

const productStyleRoots = [
  '../../xgc2/xgc2/web/src',
  '../../../platforms/research-os/web/src',
  '../../../platforms/agent-hub/web/src',
];
const sharedOwnedTokens = new Set(
  cssSources.flatMap(({ content }) => [...content.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((match) => match[1])),
);
for (const directory of productStyleRoots) {
  try {
    for (const file of await collect(directory)) {
      const content = await readFile(new URL(file, root), 'utf8');
      const declarations = content.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of declarations.matchAll(/--space-\d+\b/g)) {
        violations.push(`${relative('.', file)}: numeric spacing token ${match[0]}`);
      }
      for (const match of declarations.matchAll(/--(?:font-(?:2xs|3xl|4xl)|line-height-(?:snug|ui|readable)|tracking-(?:tight|wide|wider|condensed))\b/g)) {
        violations.push(`${relative('.', file)}: retired dense token ${match[0]}`);
      }
      for (const token of forbiddenControlAppearanceDefinitions(declarations)) {
        violations.push(`${relative('.', file)}: product control appearance override ${token}`);
      }
      for (const match of declarations.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
        const token = match[1];
        if (!token.startsWith('--xgc-') && sharedOwnedTokens.has(token)) {
          violations.push(`${relative('.', file)}: product redefines shared theme token ${token}`);
        }
        if (token.startsWith('--color-automation-')) {
          violations.push(`${relative('.', file)}: product defines parallel workflow palette ${token}`);
        }
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const tokenDefinitions = new Set(
  cssSources.flatMap(({ content }) => [...content.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((match) => match[1])),
);
for (const { file, content } of cssSources) {
  for (const match of content.matchAll(/var\((--[a-zA-Z0-9_-]+)/g)) {
    const token = match[1];
    // Shared components may define internal --xgc-* variables or expose a
    // deliberately finite public hook. Product definitions are independently
    // checked above; do not treat this reference exception as product authority.
    if (!token.startsWith('--xgc-') && !tokenDefinitions.has(token)) {
      violations.push(`${relative('.', file)}: undefined shared token ${token}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`XGC2 visual policy violations:\n${violations.join('\n')}`);
}
