import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, manifest.peerDependencies['@xgc2/ui-react']);
assert.equal(manifest.bin['xgc2-style-policy'], './dist/cli.mjs');
await access(new URL('../src/cli.mjs', import.meta.url));
await access(new URL('../src/contract.mjs', import.meta.url));
await import('../src/contract.mjs');
