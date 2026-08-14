import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const packageRoot = new URL('../', import.meta.url);
const workspaceRoot = new URL('../../../', import.meta.url);
const dist = new URL('dist/', packageRoot);

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

const cssFiles = [
  'packages/tokens/src/index.css',
  'packages/tokens/src/base.css',
  'packages/react/src/styles.css',
  'packages/workflow/src/styles.css',
];
const css = (await Promise.all(cssFiles.map((file) => readFile(new URL(file, workspaceRoot), 'utf8')))).join('\n');
const tokens = [...new Set([...css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((match) => match[1]))].sort();
const classes = [...new Set(
  [...css.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)]
    .map((match) => match[1])
    .filter((className) => className.startsWith('xgc-')),
)].sort();

await Promise.all([
  cp(new URL('scripts/style-policy-contract.mjs', workspaceRoot), new URL('contract.mjs', dist)),
  cp(new URL('src/cli.mjs', packageRoot), new URL('cli.mjs', dist)),
  writeFile(
    new URL('ownership.mjs', dist),
    `export const sharedOwnedClasses = ${JSON.stringify(classes, null, 2)};\nexport const sharedOwnedTokens = ${JSON.stringify(tokens, null, 2)};\n`,
  ),
]);
await chmod(new URL('cli.mjs', dist), 0o755);
