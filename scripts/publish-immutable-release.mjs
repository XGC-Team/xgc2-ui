import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { isAbsolute,join,relative,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseRepository = 'XGC-Team/xgc2-ui';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const packageFamilies = { package:['tokens','react','workflow'],policy:['policy'] };

export function parseReleaseArguments(args) {
  const options = { publish:false,executor:'local' };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--publish') { options.publish = true; continue; }
    const name = { '--family':'family','--source-sha':'sourceSha','--evidence-dir':'evidenceDir','--executor':'executor' }[argument];
    if (!name || !args[index + 1]) throw new Error('usage: publish-immutable-release --family package|policy --source-sha <40-hex> --evidence-dir <new-absolute-directory> [--publish] [--executor local|github-actions]');
    if (Object.hasOwn(options,name) && name !== 'executor') throw new Error(`duplicate argument ${argument}`);
    options[name] = args[++index];
  }
  if (!packageFamilies[options.family] || !/^[0-9a-f]{40}$/.test(options.sourceSha ?? '')
    || !isAbsolute(options.evidenceDir ?? '') || !['local','github-actions'].includes(options.executor)) {
    throw new Error('release family, exact source SHA, absolute evidence directory, and known executor are required');
  }
  return options;
}

function execute(command,args,{ cwd,binary = false } = {}) {
  const result = spawnSync(command,args,{ cwd,encoding:binary ? null : 'utf8',maxBuffer:128 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status:result.status,stdout:result.stdout ?? (binary ? Buffer.alloc(0) : ''),stderr:String(result.stderr ?? '') };
}

/** Both publishers execute this path. Local receipts identify themselves as local, never as CI. */
export function publishImmutableRelease(options,{ root = sourceRoot,run = execute,environment = process.env } = {}) {
  const rootPath = resolve(root);
  const evidenceDir = resolve(options.evidenceDir);
  const relativeEvidence = relative(rootPath,evidenceDir);
  if (!relativeEvidence.startsWith('..') && !isAbsolute(relativeEvidence)) throw new Error('evidence must be outside the source checkout');
  mkdirSync(evidenceDir,{ recursive:false });
  const artifactDir = join(evidenceDir,'assets');
  mkdirSync(artifactDir);
  const receipt = {
    schema:'xgc2.ui-release-evidence.v1',executor:options.executor,family:options.family,
    repository:releaseRepository,sourceSha:options.sourceSha,startedAt:new Date().toISOString(),
    checks:[],assets:[],outcome:'running',
  };
  const save = () => writeFileSync(join(evidenceDir,'evidence.json'),`${JSON.stringify(receipt,null,2)}\n`);
  const command = (program,args,{ binary = false,allowFailure = false,record = false } = {}) => {
    if (record) process.stdout.write(`Running ${program} ${args.join(' ')}\n`);
    const result = run(program,args,{ cwd:rootPath,binary });
    if (record) {
      const index = receipt.checks.length + 1;
      writeFileSync(join(evidenceDir,`check-${index}.stdout.log`),result.stdout);
      writeFileSync(join(evidenceDir,`check-${index}.stderr.log`),result.stderr);
      receipt.checks.push({ command:[program,...args],exitCode:result.status,stdoutSha256:sha256(result.stdout),stderrSha256:sha256(result.stderr) });
      save();
    }
    if (!allowFailure && result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed (${result.status}): ${result.stderr.trim()}`);
    return result;
  };
  const git = (...args) => String(command('git',args).stdout).trim();
  const api = (path) => JSON.parse(String(command('gh',['api',path]).stdout));
  const releases = () => JSON.parse(String(command('gh',['api','--paginate','--slurp',`repos/${releaseRepository}/releases?per_page=100`]).stdout)).flat();
  const assertClean = () => {
    if (git('status','--porcelain','--untracked-files=all')) throw new Error('release requires a clean source checkout, including untracked files');
    if (git('rev-parse','HEAD') !== options.sourceSha) throw new Error('HEAD differs from the exact approved source SHA');
  };
  const manifest = (name) => JSON.parse(readFileSync(join(rootPath,`packages/${name}/package.json`),'utf8'));
  const assetName = (name) => { const data = manifest(name); return `${data.name.replace(/^@/,'').replace('/','-')}-${data.version}.tgz`; };
  const assertNamespaceFree = () => {
    const current = releases();
    if (current.some((release) => release.tag_name === receipt.tag)) throw new Error(`release namespace already exists: ${receipt.tag}`);
    const names = new Set(current.flatMap((release) => (release.assets ?? []).map((asset) => asset.name)));
    for (const asset of receipt.assets) if (names.has(asset.name)) throw new Error(`asset namespace already exists: ${asset.name}`);
    return current;
  };
  const verifyTag = () => {
    const result = command('git',['ls-remote','--exit-code','--tags','origin',`refs/tags/${receipt.tag}`],{ allowFailure:true });
    if (result.status === 2) return false;
    if (result.status !== 0) throw new Error(`cannot establish remote tag identity: ${result.stderr.trim()}`);
    command('git',['fetch','--no-recurse-submodules','origin',`refs/tags/${receipt.tag}:refs/tags/${receipt.tag}`]);
    if (git('cat-file','-t',`refs/tags/${receipt.tag}`) !== 'tag') throw new Error('release tag must be annotated');
    if (git('rev-parse',`${receipt.tag}^{commit}`) !== options.sourceSha) throw new Error('release tag differs from the exact source SHA');
    return true;
  };

  try {
    assertClean();
    if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)XGC-Team\/xgc2-ui(?:\.git)?$/.test(git('remote','get-url','origin'))) {
      throw new Error('origin must be the canonical UI repository');
    }
    command('git',['fetch','--no-recurse-submodules','origin','main','--tags']);
    command('git',['merge-base','--is-ancestor',options.sourceSha,'origin/main']);
    const version = manifest(options.family === 'policy' ? 'policy' : 'react').version;
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('release version must be stable semver');
    receipt.tag = `${options.family === 'policy' ? 'policy-v' : 'v'}${version}`;
    receipt.sourceTree = git('rev-parse','HEAD^{tree}');
    receipt.toolchain = {
      node:String(command('node',['--version']).stdout).trim(),
      pnpm:String(command('pnpm',['--version']).stdout).trim(),
      git:git('--version'),
      tar:String(command('tar',['--version']).stdout).split('\n')[0],
      lockSha256:sha256(readFileSync(join(rootPath,'pnpm-lock.yaml'))),
      publisherSha256:sha256(readFileSync(join(rootPath,'scripts/publish-immutable-release.mjs'))),
      deltaValidatorSha256:sha256(readFileSync(join(rootPath,'scripts/validate-release-delta.mjs'))),
    };
    const workspace = JSON.parse(readFileSync(join(rootPath,'package.json'),'utf8'));
    if (workspace.packageManager !== `pnpm@${receipt.toolchain.pnpm}`
      || Number(/^v(\d+)\./.exec(receipt.toolchain.node)?.[1] ?? 0) < 22) {
      throw new Error('release requires Node >=22 and the exact committed pnpm toolchain');
    }
    if (options.executor === 'github-actions') {
      if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch'
        || environment.GITHUB_RUN_ATTEMPT !== '1' || environment.GITHUB_SHA !== options.sourceSha
        || environment.GITHUB_REF_NAME !== receipt.tag || environment.GITHUB_REPOSITORY !== releaseRepository) {
        throw new Error('hosted publisher requires the first explicit dispatch of this exact tag and source');
      }
      if (!verifyTag()) throw new Error('hosted publisher requires the reviewed annotated tag');
      receipt.githubRunId = environment.GITHUB_RUN_ID;
    } else if (options.publish) {
      // The local publisher does not disable or dispatch workflows. An operator
      // must explicitly stop automatic source CI before pushing this checkout.
      const workflows = api(`repos/${releaseRepository}/actions/workflows?per_page=100`).workflows;
      for (const path of ['.github/workflows/ci.yml','.github/workflows/ci-bootstrap-gate.yml']) {
        const workflow = Array.isArray(workflows) ? workflows.find((candidate) => candidate.path === path) : undefined;
        if (workflow?.state !== 'disabled_manually') throw new Error(`local publication requires automatic CI to be explicitly disabled: ${path}`);
      }
    }

    const releasesPath = join(evidenceDir,'releases-before.json');
    writeFileSync(releasesPath,JSON.stringify(assertNamespaceFree()));
    const deltaArgs = ['scripts/validate-release-delta.mjs','--releases',releasesPath,'--scope',options.family,'--require-changes'];
    if (options.family === 'policy') deltaArgs.push('--require-current-package');
    command('node',deltaArgs,{ record:true });
    command('pnpm',['install','--frozen-lockfile'],{ record:true });
    command('pnpm',['check'],{ record:true });
    assertClean();

    const base = String(command('node',['scripts/validate-release-delta.mjs','--releases',releasesPath,'--scope',options.family,'--print-base']).stdout).trim();
    receipt.previousTag = base;
    for (const name of packageFamilies[options.family]) {
      if (options.family === 'package') {
        const diff = command('git',['diff','--quiet',base,options.sourceSha,'--',`packages/${name}`,`:(exclude)packages/${name}/CHANGELOG.md`],{ allowFailure:true });
        if (diff.status === 0) continue;
        if (diff.status !== 1) throw new Error(`cannot establish changed package @xgc2/ui-${name}`);
      }
      command('pnpm',['--filter',`@xgc2/ui-${name}`,'pack','--pack-destination',artifactDir],{ record:true });
      const filename = assetName(name);
      const path = join(artifactDir,filename);
      const packed = JSON.parse(String(command('tar',['-xOf',path,'package/package.json']).stdout));
      const expected = manifest(name);
      if (packed.name !== expected.name || packed.version !== expected.version
        || JSON.stringify(packed.peerDependencies ?? {}) !== JSON.stringify(expected.peerDependencies ?? {})) {
        throw new Error(`packed manifest differs from the exact source: ${filename}`);
      }
      const bytes = readFileSync(path);
      receipt.assets.push({ name:filename,package:packed.name,version:packed.version,size:bytes.length,sha256:sha256(bytes) });
    }
    if (!receipt.assets.length) throw new Error('release has no changed package assets');
    if (JSON.stringify(readdirSync(artifactDir).sort()) !== JSON.stringify(receipt.assets.map((asset) => asset.name).sort())) {
      throw new Error('build output contains unexpected release assets');
    }
    assertClean();
    assertNamespaceFree();
    receipt.outcome = 'prepared';
    save();
    if (!options.publish) return receipt;

    // A previous attempt may have created only the annotated tag. Its exact
    // identity is reusable; an existing draft/release or asset namespace is not.
    if (!verifyTag()) {
      const localTag = command('git',['show-ref','--verify','--quiet',`refs/tags/${receipt.tag}`],{ allowFailure:true });
      if (localTag.status === 0) {
        if (git('cat-file','-t',receipt.tag) !== 'tag' || git('rev-parse',`${receipt.tag}^{commit}`) !== options.sourceSha) throw new Error('local release tag has a different identity');
      } else if (localTag.status === 1) {
        command('git',['tag','-a',receipt.tag,options.sourceSha,'-m',`Release ${receipt.tag}`]);
        receipt.localTagCreated = true;
        save();
      } else throw new Error('cannot establish local release tag identity');
      command('git',['push','origin',`refs/tags/${receipt.tag}`],{ record:true });
      if (!verifyTag()) throw new Error('new release tag is not observable remotely');
    }
    receipt.remoteTagVerified = true;
    assertNamespaceFree();
    const notesPath = join(evidenceDir,'release-notes.md');
    const checkLines = receipt.checks.map((check) => `- \`${check.command.join(' ')}\`: exit ${check.exitCode}; stdout SHA256 \`${check.stdoutSha256}\`.`);
    writeFileSync(notesPath,[
      `Source: [\`${options.sourceSha}\`](https://github.com/${releaseRepository}/commit/${options.sourceSha}).`,
      `Validation executor: ${options.executor}; Node ${receipt.toolchain.node}; pnpm ${receipt.toolchain.pnpm}.`,
      `Lock SHA256: \`${receipt.toolchain.lockSha256}\`; publisher SHA256: \`${receipt.toolchain.publisherSha256}\`.`,
      `Delta validator SHA256: \`${receipt.toolchain.deltaValidatorSha256}\`; source tree: \`${receipt.sourceTree}\`.`,
      '',...checkLines,'',...receipt.assets.map((asset) => `- \`${asset.name}\`: ${asset.size} bytes; SHA256 \`${asset.sha256}\`.`),'',
    ].join('\n'));
    receipt.releaseCreationAttempted = true;
    save();
    command('gh',['release','create',receipt.tag,...receipt.assets.map((asset) => join(artifactDir,asset.name)),
      '--repo',releaseRepository,'--verify-tag','--notes-file',notesPath],{ record:true });
    const published = api(`repos/${releaseRepository}/releases/tags/${receipt.tag}`);
    if (published.draft || published.prerelease || !published.published_at) throw new Error('published release is not a final immutable family');
    if ((published.assets ?? []).length !== receipt.assets.length) throw new Error('published asset set differs from the prepared family');
    for (const expected of receipt.assets) {
      const asset = published.assets.find((candidate) => candidate.name === expected.name);
      if (!asset || asset.size !== expected.size) throw new Error(`published asset is absent or has a different size: ${expected.name}`);
      const bytes = command('gh',['api',`repos/${releaseRepository}/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream'],{ binary:true }).stdout;
      if (sha256(bytes) !== expected.sha256) throw new Error(`downloaded release asset digest differs: ${expected.name}`);
      expected.githubAssetId = asset.id;
      expected.downloadVerified = true;
    }
    receipt.outcome = 'published';
    receipt.releaseUrl = published.html_url;
    receipt.finishedAt = new Date().toISOString();
    save();
    return receipt;
  } catch (cause) {
    receipt.outcome = 'failed';
    receipt.failure = cause instanceof Error ? cause.message : String(cause);
    receipt.finishedAt = new Date().toISOString();
    // Never delete a tag/release or overwrite assets after an ambiguous API
    // failure. The receipt preserves exactly how far publication progressed.
    save();
    throw cause;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = publishImmutableRelease(parseReleaseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
