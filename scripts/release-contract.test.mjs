import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const packages = await Promise.all(['tokens', 'react', 'workflow', 'policy'].map(async (name) => (
  JSON.parse(await readFile(new URL(`packages/${name}/package.json`, root), 'utf8'))
)));
const workflow = await readFile(new URL('.github/workflows/release.yml', root), 'utf8');
const policyWorkflow = await readFile(new URL('.github/workflows/release-policy.yml', root), 'utf8');
const ciWorkflow = await readFile(new URL('.github/workflows/ci.yml', root), 'utf8');

const workflowSources = new Map([
  ['CI', ciWorkflow],
  ['package release', workflow],
  ['policy release', policyWorkflow],
]);
const node24ActionPins = new Map([
  ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7'],
  ['actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'v7'],
  ['pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86', 'v6'],
]);

test('publishes only new package assets and refuses mutable release state', () => {
  assert.deepEqual(packages.map((manifest) => manifest.version), ['0.8.0', '0.14.1', '0.3.0', '0.14.1']);
  const reactCompatibilityFloor = packages[1].version.split('.').slice(0, 2).join('.');
  assert.match(packages[2].peerDependencies['@xgc2/ui-react'], new RegExp(`>=${reactCompatibilityFloor}\\s`));
  assert.equal(packages[3].peerDependencies['@xgc2/ui-react'], packages[1].version);
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

test('pins every workflow action to its reviewed Node 24 commit', () => {
  for (const [name, source] of workflowSources) {
    assert.doesNotMatch(source, /@v\d+\b/, `${name} must not use a floating major tag`);
    assert.doesNotMatch(source, /node20|#\s*v4\b/i, `${name} must not restore a Node 20 action generation`);

    const actionReferences = [...source.matchAll(/^\s*-\s+uses:\s*([^\s#]+)(?:\s+#\s*(v\d+))?\s*$/gm)]
      .map((match) => ({ reference: match[1], major: match[2] }));
    assert.equal(actionReferences.length, node24ActionPins.size, `${name} must declare the reviewed action set`);

    for (const { reference, major } of actionReferences) {
      assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/, `floating ${name} action: ${reference}`);
      assert.equal(node24ActionPins.get(reference), major, `unreviewed ${name} action or incorrect major comment: ${reference}`);
    }
    assert.deepEqual(
      [...new Set(actionReferences.map(({ reference }) => reference))].sort(),
      [...node24ActionPins.keys()].sort(),
      `${name} must use every reviewed Node 24 action exactly once`,
    );
  }
});

test('publishes policy under a separate immutable tag namespace', () => {
  assert.match(policyWorkflow, /tags:\s*\n\s*- 'policy-v\*'/);
  assert.match(policyWorkflow, /TAG_CREATED:\s*\$\{\{ github\.event\.created \}\}/);
  assert.match(policyWorkflow, /RUN_ATTEMPT:\s*\$\{\{ github\.run_attempt \}\}/);
  assert.match(policyWorkflow, /xgc2-ui-policy-\$\{version\}\.tgz/);
  assert.match(policyWorkflow, /gh release create/);
  assert.doesNotMatch(policyWorkflow, /--clobber|release\s+upload/);
});
