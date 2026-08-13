import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const packages = await Promise.all(['tokens', 'react', 'workflow'].map(async (name) => (
  JSON.parse(await readFile(new URL(`packages/${name}/package.json`, root), 'utf8'))
)));
const workflow = await readFile(new URL('.github/workflows/release.yml', root), 'utf8');

test('publishes only new package assets and refuses mutable release state', () => {
  assert.deepEqual(packages.map((manifest) => manifest.version), ['0.8.0', '0.14.0', '0.3.0']);
  assert.match(packages[2].peerDependencies['@xgc2/ui-react'], new RegExp(`>=${packages[1].version.replace(/\.0$/, '')}\\s`));
  assert.doesNotMatch(workflow, /--clobber|release\s+upload/);
  assert.match(workflow, /TAG_CREATED:\s*\$\{\{ github\.event\.created \}\}/);
  assert.match(workflow, /RUN_ATTEMPT:\s*\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /"\$\{RUN_ATTEMPT\}" != "1"/);
  assert.match(workflow, /releases\/tags\/\$\{GITHUB_REF_NAME\}/);
  assert.match(workflow, /\.assets\[\]\? \| \.name/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /tag .* does not match package version/);
  assert.match(workflow, /require\('\.\/packages\/\$\{package\}\/package\.json'\)\.version/);
});
