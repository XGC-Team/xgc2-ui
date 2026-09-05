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

test('hosted publishers share the immutable release executor and require an explicit dispatch', () => {
  for (const [family, source] of [['package', workflow], ['policy', policyWorkflow]]) {
    assert.match(source, /workflow_dispatch:/);
    assert.doesNotMatch(source, /^  push:/m);
    assert.match(source, /node scripts\/publish-immutable-release\.mjs/);
    assert.ok(source.includes(`--family ${family}`));
    assert.match(source, /--source-sha "\$GITHUB_SHA"/);
    assert.match(source, /--evidence-dir "\$RUNNER_TEMP\//);
    assert.match(source, /--executor github-actions/);
    assert.match(source, /--publish/);
    assert.match(source, /fetch-depth:\s*0/);
    assert.doesNotMatch(source, /--clobber|release\s+upload/);
  }
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
