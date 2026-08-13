import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const packagePaths = ['packages/tokens', 'packages/react', 'packages/workflow'];
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseArguments(argumentsList) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--print-base' || argument === '--require-changes' || argument === '--require-current-package') {
      flags.add(argument);
      continue;
    }
    if (!['--releases', '--scope'].includes(argument) || !argumentsList[index + 1]) {
      throw new Error('usage: validate-release-delta --releases <releases.json> [--scope all|package|policy] [--print-base] [--require-current-package]');
    }
    values.set(argument, argumentsList[index + 1]);
    index += 1;
  }
  const scope = values.get('--scope') ?? 'all';
  if (!values.has('--releases') || !['all', 'package', 'policy'].includes(scope)) {
    throw new Error('a releases JSON file and a valid scope are required');
  }
  if (flags.has('--print-base') && scope === 'all') {
    throw new Error('--print-base requires package or policy scope');
  }
  return {
    printBase: flags.has('--print-base'),
    releasesFile: values.get('--releases'),
    requireChanges: flags.has('--require-changes'),
    requireCurrentPackage: flags.has('--require-current-package'),
    scope,
  };
}

function git(...argumentsList) {
  return spawnSync('git', argumentsList, {
    cwd: new URL('.', root),
    encoding: 'utf8',
  });
}

function gitOutput(label, ...argumentsList) {
  const result = git(...argumentsList);
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr.trim() || `git exited ${result.status}`}`);
  return result.stdout.trim();
}

function compareVersions(left, right) {
  const leftParts = stableVersion.exec(left);
  const rightParts = stableVersion.exec(right);
  if (!leftParts || !rightParts) throw new Error(`cannot compare non-stable versions ${left} and ${right}`);
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftParts[index]) - Number(rightParts[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function manifestAt(reference, path) {
  const source = gitOutput(`cannot read ${path}/package.json at ${reference}`, 'show', `${reference}:${path}/package.json`);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`invalid ${path}/package.json at ${reference}`);
  }
}

function isAncestor(reference) {
  const result = git('merge-base', '--is-ancestor', `${reference}^{commit}`, 'HEAD');
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`could not compare ${reference} with HEAD: ${result.stderr.trim() || `git exited ${result.status}`}`);
}

function changedSince(reference, path) {
  const result = git(
    'diff',
    '--quiet',
    reference,
    'HEAD',
    '--',
    path,
    `:(exclude)${path}/CHANGELOG.md`,
  );
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`could not diff ${path} from ${reference}: ${result.stderr.trim() || `git exited ${result.status}`}`);
}

function releaseAssetNames(release) {
  return new Set(Array.isArray(release.assets) ? release.assets.map((asset) => asset.name) : []);
}

function diffBetween(from, to, path) {
  const result = git(
    'diff',
    '--quiet',
    from,
    to,
    '--',
    path,
    `:(exclude)${path}/CHANGELOG.md`,
  );
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`could not diff ${path} between ${from} and ${to}: ${result.stderr.trim() || `git exited ${result.status}`}`);
}

function candidateForRelease(release, kind) {
  if (!release || release.draft || release.prerelease || !release.published_at) return null;
  const expression = kind === 'package'
    ? /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/
    : /^policy-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
  const match = expression.exec(release.tag_name ?? '');
  if (!match) return null;
  const version = match[1];
  const path = kind === 'package' ? 'packages/react' : 'packages/policy';
  let manifest;
  try {
    manifest = manifestAt(release.tag_name, path);
  } catch {
    return null;
  }
  const asset = kind === 'package'
    ? `xgc2-ui-react-${version}.tgz`
    : `xgc2-ui-policy-${version}.tgz`;
  if (manifest.version !== version || !releaseAssetNames(release).has(asset)) return null;
  return { release, tag: release.tag_name, version };
}

function completePackageCandidate(candidate, previousCandidate) {
  if (!previousCandidate) return true;
  const assets = releaseAssetNames(candidate.release);
  for (const path of packagePaths) {
    if (!diffBetween(previousCandidate.tag, candidate.tag, path)) continue;
    const manifest = manifestAt(candidate.tag, path);
    const asset = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
    if (!assets.has(asset)) return false;
  }
  return true;
}

function selectRelease(releases, kind) {
  const candidates = releases
    .map((release) => candidateForRelease(release, kind))
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version));
  const candidate = candidates.find((current, index) => {
    if (!isAncestor(current.tag)) return false;
    if (kind !== 'package') return true;
    const previous = candidates.slice(index + 1).find(({ tag }) => isAncestor(tag));
    return completePackageCandidate(current, previous);
  });
  if (!candidate) throw new Error(`no complete stable ${kind} release is an ancestor of HEAD`);
  return candidate;
}

async function currentManifest(path) {
  return JSON.parse(await readFile(new URL(`${path}/package.json`, root), 'utf8'));
}

async function validatePackage(reference, path) {
  const current = await currentManifest(path);
  const previous = manifestAt(reference, path);
  const comparison = compareVersions(current.version, previous.version);
  if (comparison < 0) {
    throw new Error(`${current.name} ${current.version} is older than ${reference} version ${previous.version}`);
  }
  if (!changedSince(reference, path)) return false;
  if (comparison === 0) {
    throw new Error(`${current.name} changed since ${reference} without a version bump (${current.version})`);
  }
  return true;
}

function flattenReleasePages(source) {
  const parsed = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error('releases JSON must be an array');
  return parsed.flatMap((page) => Array.isArray(page) ? page : [page]);
}

async function run() {
  const {
    printBase,
    releasesFile,
    requireChanges,
    requireCurrentPackage,
    scope,
  } = parseArguments(process.argv.slice(2));
  const releases = flattenReleasePages(await readFile(releasesFile, 'utf8'));
  const packageRelease = scope === 'policy' && !requireCurrentPackage ? null : selectRelease(releases, 'package');
  const policyRelease = scope === 'package' ? null : selectRelease(releases, 'policy');

  if (requireCurrentPackage) {
    const react = await currentManifest('packages/react');
    if (packageRelease.version !== react.version) {
      throw new Error(`policy ${react.version} requires a complete v${react.version} React release; latest complete package release is ${packageRelease.tag}`);
    }
  }

  const changedPackages = [];
  if (scope !== 'policy') {
    for (const path of packagePaths) {
      if (await validatePackage(packageRelease.tag, path)) changedPackages.push(path.split('/').at(-1));
    }
  }
  const policyChanged = scope === 'package'
    ? false
    : await validatePackage(policyRelease.tag, 'packages/policy');

  if (requireChanges && changedPackages.length === 0 && !policyChanged) {
    throw new Error(`${scope} release has no versioned package changes`);
  }

  if (printBase) {
    process.stdout.write(`${scope === 'package' ? packageRelease.tag : policyRelease.tag}\n`);
    return;
  }
  process.stdout.write(
    `Release delta: package base ${packageRelease?.tag ?? 'not checked'}; changed ${changedPackages.join(', ') || 'none'}; policy base ${policyRelease?.tag ?? 'not checked'}; policy ${scope === 'package' ? 'not checked' : policyChanged ? 'changed' : 'unchanged'}\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`Release delta contract error: ${error.message}\n`);
  process.exitCode = 1;
});
