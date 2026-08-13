import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const packages = await Promise.all(['tokens', 'react', 'workflow'].map(async (name) => (
  JSON.parse(await readFile(new URL(`packages/${name}/package.json`, root), 'utf8'))
)));
const workflow = await readFile(new URL('.github/workflows/release.yml', root), 'utf8');

test('publishes only new package assets and refuses mutable release state', () => {
  assert.deepEqual(packages.map((manifest) => manifest.version), ['0.8.0', '0.14.1', '0.3.0']);
  const reactCompatibilityFloor = packages[1].version.split('.').slice(0, 2).join('.');
  assert.match(packages[2].peerDependencies['@xgc2/ui-react'], new RegExp(`>=${reactCompatibilityFloor}\\s`));
  assert.doesNotMatch(workflow, /--clobber|release\s+upload/);
  assert.match(workflow, /TAG_CREATED:\s*\$\{\{ github\.event\.created \}\}/);
  assert.match(workflow, /RUN_ATTEMPT:\s*\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /"\$\{RUN_ATTEMPT\}" != "1"/);
  assert.match(workflow, /releases\/tags\/\$\{GITHUB_REF_NAME\}/);
  assert.match(workflow, /\.assets\[\]\? \| \.name/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /tag .* does not match package version/);
  assert.match(workflow, /require\('\.\/packages\/\$\{package\}\/package\.json'\)\.version/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /git diff --quiet "\$\{previous_tag\}" "\$\{GITHUB_REF_NAME\}" -- "packages\/\$\{package\}"/);
  assert.match(workflow, /release has no changed package assets/);
});

test('pins every release action to an immutable full commit', () => {
  const actionReferences = [...workflow.matchAll(/^\s*-\s+uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(actionReferences.length > 0, 'release workflow must declare its actions');
  for (const reference of actionReferences) {
    assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/, `floating release action: ${reference}`);
  }
});
