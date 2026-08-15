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
const prepareWorkflow = await readFile(new URL('.github/workflows/prepare-release.yml', root), 'utf8');
const readme = await readFile(new URL('README.md', root), 'utf8');
const tokensChangelog = await readFile(new URL('packages/tokens/CHANGELOG.md', root), 'utf8');
const reactChangelog = await readFile(new URL('packages/react/CHANGELOG.md', root), 'utf8');
const workflowChangelog = await readFile(new URL('packages/workflow/CHANGELOG.md', root), 'utf8');
const releaseDelta = await readFile(new URL('scripts/validate-release-delta.mjs', root), 'utf8');

const workflowSources = new Map([
  ['CI', ciWorkflow],
  ['release preparation', prepareWorkflow],
  ['package release', workflow],
  ['policy release', policyWorkflow],
]);
const reviewedActionPins = new Map([
  ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7'],
]);

function currentChangelogVersion(source, name) {
  const match = source.match(/^## (\d+\.\d+\.\d+)$/m);
  assert.ok(match, `${name} changelog must start with a semver release heading`);
  return match[1];
}

test('keeps the prepared package family internally coherent', () => {
  for (const manifest of packages) {
    assert.match(manifest.version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, `${manifest.name} must use a stable semver version`);
  }
  const reactCompatibilityFloor = packages[1].version.split('.').slice(0, 2).join('.');
  assert.equal(packages[2].peerDependencies['@xgc2/ui-react'], `>=${reactCompatibilityFloor} <1`);
  assert.equal(packages[3].version, packages[1].version);
  assert.equal(packages[3].peerDependencies['@xgc2/ui-react'], packages[1].version);
  assert.equal(currentChangelogVersion(tokensChangelog, packages[0].name), packages[0].version);
  assert.equal(currentChangelogVersion(reactChangelog, packages[1].name), packages[1].version);
  assert.equal(currentChangelogVersion(workflowChangelog, packages[2].name), packages[2].version);
  assert.match(
    readme,
    new RegExp(`https://github\\.com/XGC-Team/xgc2-ui/releases/download/v${packages[1].version.replaceAll('.', '\\.')}\/xgc2-ui-react-${packages[1].version.replaceAll('.', '\\.')}\\.tgz`),
  );
});

test('publishes only new package assets and refuses mutable release state', () => {
  assert.doesNotMatch(workflow, /--clobber|release\s+upload/);
  assert.doesNotMatch(workflow, /git describe/);
  assert.match(workflow, /gh api --paginate --slurp/);
  assert.match(workflow, /validate-release-delta\.mjs --releases .* --scope package --print-base/);
  assert.match(workflow, /\(exclude\)packages\/\$\{package\}\/CHANGELOG\.md/);
  assert.match(workflow, /git cat-file -e "\$\{GITHUB_REF_NAME\}\^\{tag\}"/);
  assert.match(workflow, /git merge-base --is-ancestor .* origin\/main/);
  assert.match(workflow, /diff_status="\$\?"/);
  assert.match(workflow, /TAG_CREATED:\s*\$\{\{ github\.event\.created \}\}/);
  assert.match(workflow, /RUN_ATTEMPT:\s*\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /"\$\{RUN_ATTEMPT\}" != "1"/);
  assert.match(workflow, /releases\/tags\/\$\{GITHUB_REF_NAME\}/);
  assert.match(workflow, /\.assets\[\]\? \| \.name/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /tag .* does not match package version/);
  assert.match(workflow, /require\('\.\/packages\/\$\{package\}\/package\.json'\)\.version/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /git diff --quiet "\$\{previous_tag\}" "\$\{GITHUB_REF_NAME\}" --/);
  assert.match(workflow, /release has no changed package assets/);
});

test('pins every workflow action to its reviewed commit and uses the XGC2 build image', () => {
  for (const [name, source] of workflowSources) {
    assert.match(source, /ghcr\.io\/xgc-team\/xgc2-images\/xgc2-build-noble-dev:1\.0\.0/, `${name} must run inside the XGC2 build image`);
    assert.match(source, /safe\.directory/, `${name} must mark the workspace as a Git safe directory`);
    assert.doesNotMatch(source, /@v\d+\b/, `${name} must not use a floating major tag`);
    assert.doesNotMatch(source, /node20|#\s*v4\b/i, `${name} must not restore a Node 20 action generation`);
    assert.doesNotMatch(source, /actions\/setup-node|pnpm\/action-setup/, `${name} must take Node and pnpm from the build image`);

    const actionReferences = [...source.matchAll(/^\s*-\s+uses:\s*([^\s#]+)(?:\s+#\s*(v\d+))?\s*$/gm)]
      .map((match) => ({ reference: match[1], major: match[2] }));
    assert.equal(actionReferences.length, reviewedActionPins.size, `${name} must declare the reviewed action set`);

    for (const { reference, major } of actionReferences) {
      assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/, `floating ${name} action: ${reference}`);
      assert.equal(reviewedActionPins.get(reference), major, `unreviewed ${name} action or incorrect major comment: ${reference}`);
    }
    assert.deepEqual(
      [...new Set(actionReferences.map(({ reference }) => reference))].sort(),
      [...reviewedActionPins.keys()].sort(),
      `${name} must use every reviewed action exactly once`,
    );
  }
});

test('publishes policy under a separate immutable tag namespace', () => {
  assert.match(policyWorkflow, /tags:\s*\n\s*- 'policy-v\*'/);
  assert.match(policyWorkflow, /TAG_CREATED:\s*\$\{\{ github\.event\.created \}\}/);
  assert.match(policyWorkflow, /RUN_ATTEMPT:\s*\$\{\{ github\.run_attempt \}\}/);
  assert.match(policyWorkflow, /xgc2-ui-policy-\$\{version\}\.tgz/);
  assert.match(policyWorkflow, /git cat-file -e "\$\{GITHUB_REF_NAME\}\^\{tag\}"/);
  assert.match(policyWorkflow, /git merge-base --is-ancestor .* origin\/main/);
  assert.match(policyWorkflow, /--scope policy --require-current-package/);
  assert.match(policyWorkflow, /gh release create/);
  assert.doesNotMatch(policyWorkflow, /--clobber|release\s+upload/);
});

test('CI rejects package drift against the latest successful release families', () => {
  assert.match(ciWorkflow, /fetch-depth:\s*0/);
  assert.match(ciWorkflow, /gh api --paginate --slurp/);
  assert.match(ciWorkflow, /validate-release-delta\.mjs --releases releases\.json/);
  assert.match(releaseDelta, /release\.draft \|\| release\.prerelease \|\| !release\.published_at/);
  assert.match(releaseDelta, /xgc2-ui-react-\$\{version\}\.tgz/);
  assert.match(releaseDelta, /xgc2-ui-policy-\$\{version\}\.tgz/);
  assert.match(releaseDelta, /merge-base', '--is-ancestor'/);
  assert.match(releaseDelta, /if \(comparison < 0\)/);
  assert.match(releaseDelta, /if \(result\.status === 1\) return true/);
});

test('prepares release tags through a reviewed annotated main-only path', () => {
  assert.match(prepareWorkflow, /workflow_dispatch:/);
  assert.match(prepareWorkflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(prepareWorkflow, /validate-release-delta\.mjs --releases releases\.json --scope package --require-changes/);
  assert.match(prepareWorkflow, /--scope policy --require-current-package --require-changes/);
  assert.match(prepareWorkflow, /git tag -a "\$\{TAG\}"/);
  assert.match(prepareWorkflow, /git push origin "refs\/tags\/\$\{TAG\}"/);
  assert.match(prepareWorkflow, /gh workflow run "\$\{workflow\}" .* --ref "\$\{TAG\}"/);
});
