import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url);
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
for (const file of (await Promise.all(roots.map(collect))).flat()) {
  const content = await readFile(new URL(file, root), 'utf8');
  for (const { pattern, label } of forbidden) {
    if (pattern.test(content)) {
      violations.push(`${relative('.', file)}: prohibited ${label}`);
    }
  }
  for (const rule of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (!stateSelector.test(selector) || /empty-state/i.test(selector)) continue;
    for (const declaration of rule[2].split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      for (const policy of decoratedState) {
        if (policy.property.test(property) && !policy.allowed.test(value)) {
          violations.push(`${relative('.', file)}: ${policy.label} in ${selector}`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`XGC2 visual policy violations:\n${violations.join('\n')}`);
}
