import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const validator = new URL('./validate-release-delta.mjs', import.meta.url);
const baseVersions = { policy: '0.14.1', react: '0.14.1', tokens: '0.8.0', workflow: '0.3.0' };

function command(directory, executable, ...argumentsList) {
  const result = spawnSync(executable, argumentsList, { cwd: directory, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${executable} ${argumentsList.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function writePackages(directory, versions) {
  for (const [name, version] of Object.entries(versions)) {
    const packageDirectory = join(directory, 'packages', name);
    await mkdir(join(packageDirectory, 'src'), { recursive: true });
    await Promise.all([
      writeFile(join(packageDirectory, 'package.json'), `${JSON.stringify({ name: `@xgc2/ui-${name}`, version }, null, 2)}\n`),
      writeFile(join(packageDirectory, 'src', 'index.js'), `export const version = '${version}';\n`),
    ]);
  }
}

async function fixture({ orphanHead = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'xgc2-release-delta.'));
  await mkdir(join(directory, 'scripts'));
  await cp(validator, join(directory, 'scripts', 'validate-release-delta.mjs'));
  command(directory, 'git', 'init');
  command(directory, 'git', 'symbolic-ref', 'HEAD', 'refs/heads/main');
  command(directory, 'git', 'config', 'user.name', 'Contract Test');
  command(directory, 'git', 'config', 'user.email', 'contract@example.test');
  await writePackages(directory, baseVersions);
  command(directory, 'git', 'add', '.');
  command(directory, 'git', 'commit', '-m', 'base releases');
  command(directory, 'git', 'tag', 'v0.14.1');
  command(directory, 'git', 'tag', 'policy-v0.14.1');

  const releases = [[
    {
      assets: [{ name: 'xgc2-ui-react-0.14.1.tgz' }],
      draft: false,
      prerelease: false,
      published_at: '2026-01-02T00:00:00Z',
      tag_name: 'v0.14.1',
    },
    {
      assets: [{ name: 'xgc2-ui-policy-0.14.1.tgz' }],
      draft: false,
      prerelease: false,
      published_at: '2026-01-01T00:00:00Z',
      tag_name: 'policy-v0.14.1',
    },
  ]];
  await writeFile(join(directory, 'releases.json'), `${JSON.stringify(releases)}\n`);

  if (orphanHead) {
    command(directory, 'git', 'checkout', '--orphan', 'divergent');
    await rm(join(directory, 'packages'), { recursive: true });
    await writePackages(directory, baseVersions);
    command(directory, 'git', 'add', '.');
    command(directory, 'git', 'commit', '-m', 'divergent head');
  }
  return directory;
}

function run(directory, ...argumentsList) {
  return spawnSync(
    process.execPath,
    [join(directory, 'scripts', 'validate-release-delta.mjs'), '--releases', 'releases.json', ...argumentsList],
    { cwd: directory, encoding: 'utf8' },
  );
}

test('accepts unchanged packages at complete stable release bases', async () => {
  const directory = await fixture();
  try {
    const result = run(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /package base v0\.14\.1; changed none; policy base policy-v0\.14\.1; policy unchanged/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('accepts strictly newer changed packages and policy', async () => {
  const directory = await fixture();
  try {
    await writePackages(directory, { policy: '0.15.2', react: '0.15.2', tokens: '0.8.0', workflow: '0.3.1' });
    command(directory, 'git', 'add', '.');
    command(directory, 'git', 'commit', '-m', 'new family');
    const result = run(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /changed react, workflow/);
    assert.match(result.stdout, /policy changed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects source changes without a version bump', async () => {
  const directory = await fixture();
  try {
    await writeFile(join(directory, 'packages', 'react', 'src', 'speech.js'), 'export const speech = true;\n');
    command(directory, 'git', 'add', '.');
    command(directory, 'git', 'commit', '-m', 'unversioned source');
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /changed since v0\.14\.1 without a version bump \(0\.14\.1\)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects package downgrades', async () => {
  const directory = await fixture();
  try {
    await writePackages(directory, { ...baseVersions, react: '0.13.0' });
    command(directory, 'git', 'add', '.');
    command(directory, 'git', 'commit', '-m', 'downgrade');
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /0\.13\.0 is older than v0\.14\.1 version 0\.14\.1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects release bases that are not ancestors of HEAD', async () => {
  const directory = await fixture({ orphanHead: true });
  try {
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no complete stable package release is an ancestor of HEAD/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects missing or incomplete release metadata', async () => {
  const directory = await fixture();
  try {
    const releases = JSON.parse(await readFile(join(directory, 'releases.json'), 'utf8'));
    releases[0][0].assets = [];
    await writeFile(join(directory, 'releases.json'), JSON.stringify(releases));
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no complete stable package release is an ancestor of HEAD/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('does not select a package release missing an asset for a changed package', async () => {
  const directory = await fixture();
  try {
    await writePackages(directory, { policy: '0.15.2', react: '0.15.2', tokens: '0.8.0', workflow: '0.3.1' });
    command(directory, 'git', 'add', '.');
    command(directory, 'git', 'commit', '-m', 'new package family');
    command(directory, 'git', 'tag', 'v0.15.2');
    const releases = JSON.parse(await readFile(join(directory, 'releases.json'), 'utf8'));
    releases[0].unshift({
      assets: [{ name: 'xgc2-ui-react-0.15.2.tgz' }],
      draft: false,
      prerelease: false,
      published_at: '2026-01-03T00:00:00Z',
      tag_name: 'v0.15.2',
    });
    await writeFile(join(directory, 'releases.json'), JSON.stringify(releases));
    const result = run(directory, '--scope', 'package', '--print-base');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'v0.14.1');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('requires the official React family before preparing a policy release', async () => {
  const directory = await fixture();
  try {
    await writePackages(directory, { ...baseVersions, policy: '0.15.2', react: '0.15.2' });
    command(directory, 'git', 'add', '.');
    command(directory, 'git', 'commit', '-m', 'policy ahead of React release');
    const result = run(directory, '--scope', 'policy', '--require-current-package');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /policy 0\.15\.2 requires a complete v0\.15\.2 React release/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
