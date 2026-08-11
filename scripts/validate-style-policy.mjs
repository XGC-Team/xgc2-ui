import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url);
const roots = ['packages', 'apps'];
const forbidden = [
  { pattern: /\bborder-left\s*:/i, label: 'left border' },
  { pattern: /\bborder-inline-start\s*:/i, label: 'inline-start border' },
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
}

if (violations.length > 0) {
  throw new Error(`Left-side state accents are prohibited:\n${violations.join('\n')}`);
}
