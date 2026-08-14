import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!['--package-base', '--policy-base'].includes(flag) || value === undefined) {
      throw new Error('usage: validate-release-delta --package-base <vX.Y.Z> --policy-base <policy-vX.Y.Z>');
    }
    values.set(flag, value);
  }
  if (!values.has('--package-base') || !values.has('--policy-base')) {
    throw new Error('both package and policy release bases are required');
  }
  return {
    packageBase: values.get('--package-base'),
    policyBase: values.get('--policy-base'),
  };
}

function git(...argumentsList) {
  const result = spawnSync('git', argumentsList, {
    cwd: new URL('.', root),
    encoding: 'utf8',
  });
  return result;
}

function requireReleaseRef(reference, label) {
  if (!reference) throw new Error(`no successful ${label} release is available as a comparison base`);
  const result = git('rev-parse', '--verify', '--quiet', `${reference}^{commit}`);
  if (result.status !== 0) throw new Error(`${label} release ref is unavailable locally: ${reference}`);
}

function changedSince(reference, path) {
  return git(
    'diff',
    '--quiet',
    reference,
    'HEAD',
    '--',
    path,
    `:(exclude)${path}/CHANGELOG.md`,
  ).status !== 0;
}

function manifestAt(reference, path) {
  const result = git('show', `${reference}:${path}/package.json`);
  if (result.status !== 0) throw new Error(`cannot read ${path}/package.json at ${reference}`);
  return JSON.parse(result.stdout);
}

async function validatePackage(reference, path) {
  if (!changedSince(reference, path)) return false;
  const current = JSON.parse(await readFile(new URL(`${path}/package.json`, root), 'utf8'));
  const previous = manifestAt(reference, path);
  if (current.version === previous.version) {
    throw new Error(`${current.name} changed since ${reference} without a version bump (${current.version})`);
  }
  return true;
}

async function run() {
  const { packageBase, policyBase } = parseArguments(process.argv.slice(2));
  requireReleaseRef(packageBase, 'package');
  requireReleaseRef(policyBase, 'policy');

  const changedPackages = [];
  for (const path of ['packages/tokens', 'packages/react', 'packages/workflow']) {
    if (await validatePackage(packageBase, path)) changedPackages.push(path.split('/').at(-1));
  }
  const policyChanged = await validatePackage(policyBase, 'packages/policy');
  process.stdout.write(
    `Release delta: package base ${packageBase}; changed ${changedPackages.join(', ') || 'none'}; policy base ${policyBase}; policy ${policyChanged ? 'changed' : 'unchanged'}\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`Release delta contract error: ${error.message}\n`);
  process.exitCode = 1;
});
