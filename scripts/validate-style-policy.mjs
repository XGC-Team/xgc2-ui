import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import {
  rawFoundationValueViolations,
  semanticGeometryViolations,
  statusVisualContractViolations,
} from './style-policy-contract.mjs';

const root = new URL('../', import.meta.url);
const roots = ['packages', 'apps'];
const forbidden = [
  { pattern: /\bborder-left\s*:/i, label: 'left border' },
  { pattern: /\bborder-inline-start\s*:/i, label: 'inline-start border' },
  { pattern: /\bbox-shadow\s*:\s*inset\s+(?!0(?:px)?\s+0(?:px)?\s+0(?:px)?\b)[^;]+\s0(?:px)?\s0(?:px)?(?:\s|;)/i, label: 'inset edge shadow' },
];

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
  for (const violation of statusVisualContractViolations(content)) {
    violations.push(`${relative('.', file)}: ${violation}`);
  }
  for (const violation of rawFoundationValueViolations(content)) {
    violations.push(`${relative('.', file)}: ${violation}`);
  }
  for (const violation of semanticGeometryViolations(content)) {
    violations.push(`${relative('.', file)}: ${violation}`);
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
