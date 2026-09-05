import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { parseReleaseArguments,publishImmutableRelease,releaseRepository } from './publish-immutable-release.mjs';

const actual = (program,args,{ cwd,binary = false } = {}) => {
  const value = spawnSync(program,args,{ cwd,encoding:binary ? null : 'utf8',maxBuffer:16 * 1024 * 1024 });
  if (value.error) throw value.error;
  return { status:value.status,stdout:value.stdout ?? '',stderr:String(value.stderr ?? '') };
};
const ok = (stdout = '') => ({ status:0,stdout,stderr:'' });
const fail = (stderr) => ({ status:1,stdout:'',stderr });

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(),'xgc-ui-publisher-'));
  t.after(() => rmSync(temporary,{ recursive:true,force:true }));
  const root = join(temporary,'source');
  const remote = join(temporary,'remote.git');
  mkdirSync(root);
  const git = (...args) => {
    const result = actual('git',args,{ cwd:root });
    assert.equal(result.status,0,result.stderr);
    return String(result.stdout).trim();
  };
  git('init');git('symbolic-ref','HEAD','refs/heads/main');
  git('config','user.email','release-test@example.invalid');
  git('config','user.name','Release contract test');
  const versions = { tokens:'0.16.0',react:'0.16.0',workflow:'0.4.0',policy:'0.16.0' };
  const manifest = (name,version = versions[name]) => ({
    name:`@xgc2/ui-${name}`,version,
    ...(name === 'policy' ? { peerDependencies:{ '@xgc2/ui-react':version } } : {}),
  });
  for (const name of Object.keys(versions)) {
    mkdirSync(join(root,`packages/${name}`),{ recursive:true });
    writeFileSync(join(root,`packages/${name}/package.json`),JSON.stringify(manifest(name)));
    writeFileSync(join(root,`packages/${name}/source.js`),'export const original = true;');
  }
  mkdirSync(join(root,'scripts'));
  for (const name of ['publish-immutable-release.mjs','validate-release-delta.mjs']) {
    copyFileSync(new URL(name,import.meta.url),join(root,'scripts',name));
  }
  writeFileSync(join(root,'pnpm-lock.yaml'),'lockfileVersion: 9\n');
  writeFileSync(join(root,'package.json'),JSON.stringify({ packageManager:'pnpm@11.21.0' }));
  git('add','.');git('commit','-m','Initial immutable package family');
  git('tag','-a','v0.16.0','-m','Package family');git('tag','-a','policy-v0.16.0','-m','Policy family');
  for (const name of ['react','policy']) writeFileSync(join(root,`packages/${name}/package.json`),JSON.stringify(manifest(name,'0.16.1')));
  writeFileSync(join(root,'packages/react/source.js'),'export const corrected = true;');
  git('add','.');git('commit','-m','Corrected source');
  const sourceSha = git('rev-parse','HEAD');
  assert.equal(actual('git',['init','--bare',remote],{ cwd:root }).status,0);
  git('remote','add','origin',remote);git('push','origin','main','--tags');
  const releases = [
    { tag_name:'v0.16.0',published_at:'2026-09-04T00:00:00Z',assets:['tokens-0.16.0','react-0.16.0','workflow-0.4.0'].map((value) => ({ name:`xgc2-ui-${value}.tgz` })) },
    { tag_name:'policy-v0.16.0',published_at:'2026-09-04T00:00:00Z',assets:[{ name:'xgc2-ui-policy-0.16.0.tgz' }] },
  ];
  const calls = [];
  const filesById = new Map();
  const state = { failCheck:false,failCreate:false,wrongDownload:false,activeCI:false,unexpectedAsset:false };
  const run = (program,args,options) => {
    calls.push([program,...args]);
    if (program === 'git' && args.join(' ') === 'remote get-url origin') return ok(`https://github.com/${releaseRepository}.git\n`);
    if (program === 'pnpm') {
      if (args[0] === '--version') return ok('11.21.0\n');
      if (args[0] === 'check') return state.failCheck ? fail('semantic check failed') : ok('all original checks passed\n');
      if (args[0] === 'install') return ok('frozen installation succeeded\n');
      assert.equal(args[0],'--filter');
      const name = args[1].replace('@xgc2/ui-','');
      const data = JSON.parse(readFileSync(join(root,`packages/${name}/package.json`),'utf8'));
      const stage = join(temporary,`pack-${calls.length}`);
      mkdirSync(join(stage,'package'),{ recursive:true });
      writeFileSync(join(stage,'package/package.json'),JSON.stringify(data));
      const output = join(args.at(-1),`xgc2-ui-${name}-${data.version}.tgz`);
      const packed = actual('tar',['-czf',output,'-C',stage,'package'],{ cwd:root });
      if (state.unexpectedAsset) writeFileSync(join(args.at(-1),'extra.tgz'),'unexpected');
      return packed;
    }
    if (program !== 'gh') return actual(program,args,options);
    if (args[0] === 'release') {
      assert.equal(args[1],'create');
      if (state.failCreate) return fail('API connection closed after tag creation');
      const tag = args[2];
      const assets = args.slice(3).filter((value) => value.endsWith('.tgz')).map((path,index) => {
        const bytes = readFileSync(path);const id = index + 1;filesById.set(id,bytes);
        return { id,name:path.split('/').at(-1),size:bytes.length };
      });
      releases.push({ tag_name:tag,assets,published_at:'2026-09-05T00:00:00Z',html_url:`https://github.com/${releaseRepository}/releases/tag/${tag}` });
      return ok('published\n');
    }
    assert.equal(args[0],'api');
    const path = args.find((value) => value.startsWith('repos/'));
    if (path.endsWith('/releases?per_page=100')) return ok(JSON.stringify([releases]));
    if (path.endsWith('/actions/workflows?per_page=100')) return ok(JSON.stringify({ workflows:['ci.yml','ci-bootstrap-gate.yml'].map((name) => ({ path:`.github/workflows/${name}`,state:state.activeCI ? 'active' : 'disabled_manually' })) }));
    if (path.includes('/releases/tags/')) return ok(JSON.stringify(releases.find((release) => release.tag_name === path.split('/').at(-1))));
    if (path.includes('/releases/assets/')) return ok(state.wrongDownload ? Buffer.from('wrong archive') : filesById.get(Number(path.split('/').at(-1))));
    throw new Error(`unexpected API ${path}`);
  };
  let receiptNumber = 0;
  const release = (overrides = {},environment = {}) => publishImmutableRelease({
    family:'package',sourceSha,executor:'local',publish:true,
    evidenceDir:join(temporary,`evidence-${++receiptNumber}`),...overrides,
  },{ root,run,environment });
  return { root,temporary,git,state,calls,releases,release,sourceSha,lastEvidence:() => JSON.parse(readFileSync(join(temporary,`evidence-${receiptNumber}/evidence.json`),'utf8')) };
}

test('requires an explicit exact source identity and a separate evidence path', () => {
  assert.throws(() => parseReleaseArguments(['--family','package']),/required/);
  assert.throws(() => parseReleaseArguments(['--family','package','--source-sha','main','--evidence-dir','/tmp/new']),/required/);
  assert.throws(() => parseReleaseArguments(['--family','package','--source-sha','a'.repeat(40),'--evidence-dir','relative']),/required/);
});

test('publishes only the changed package, runs every check, and verifies downloaded bytes', (t) => {
  const f = fixture(t);const receipt = f.release();
  assert.equal(receipt.outcome,'published');assert.equal(receipt.executor,'local');
  assert.deepEqual(receipt.assets.map((asset) => asset.name),['xgc2-ui-react-0.16.1.tgz']);
  assert.equal(receipt.assets[0].downloadVerified,true);
  assert.equal(f.git('cat-file','-t','v0.16.1'),'tag');
  assert.equal(f.git('rev-parse','v0.16.1^{commit}'),f.sourceSha);
  assert.ok(f.calls.some((call) => call.join(' ') === 'pnpm install --frozen-lockfile'));
  assert.ok(f.calls.some((call) => call.join(' ') === 'pnpm check'));
  assert.ok(receipt.checks.every((check) => check.exitCode === 0 && /^[0-9a-f]{64}$/.test(check.stdoutSha256)));
  assert.match(receipt.toolchain.publisherSha256,/^[0-9a-f]{64}$/);
});

test('preparation runs the full checks and produces evidence without creating a tag or release', (t) => {
  const f = fixture(t);const receipt = f.release({ publish:false });
  assert.equal(receipt.outcome,'prepared');
  assert.equal(f.releases.length,2);
  assert.ok(!f.git('tag').split('\n').includes('v0.16.1'));
});

test('rejects an unexpected source SHA or dirty source before packaging', (t) => {
  const f = fixture(t);
  assert.throws(() => f.release({ sourceSha:'a'.repeat(40) }),/HEAD differs/);
  writeFileSync(join(f.root,'untracked.txt'),'not reviewed');
  assert.throws(() => f.release(),/clean source/);
  assert.ok(!f.calls.some((call) => call[0] === 'pnpm'));
});

test('refuses a local publication while automatic hosted CI is still active', (t) => {
  const f = fixture(t);f.state.activeCI = true;
  assert.throws(() => f.release(),/explicitly disabled/);
  assert.ok(!f.calls.some((call) => call[0] === 'pnpm' && call[1] === 'check'));
});

test('semantic check failure cannot create tags or upload assets', (t) => {
  const f = fixture(t);f.state.failCheck = true;
  assert.throws(() => f.release(),/semantic check failed/);
  assert.equal(f.lastEvidence().outcome,'failed');
  assert.ok(!f.git('tag').split('\n').includes('v0.16.1'));
  assert.ok(!f.calls.some((call) => call[0] === 'gh' && call[1] === 'release'));
});

test('rejects an existing release, an asset name collision, and unexpected packed assets', (t) => {
  const f = fixture(t);f.releases.push({ tag_name:'v0.16.1',draft:true,assets:[] });
  assert.throws(() => f.release(),/namespace already exists/);
  f.releases.pop();f.releases[0].assets.push({ name:'xgc2-ui-react-0.16.1.tgz' });
  assert.throws(() => f.release(),/asset namespace already exists/);
  f.releases[0].assets.pop();f.state.unexpectedAsset = true;
  assert.throws(() => f.release(),/unexpected release assets/);
  assert.ok(!f.calls.some((call) => call[0] === 'gh' && call[1] === 'release'));
});

test('policy cannot publish before the exact matching package release exists', (t) => {
  const f = fixture(t);
  assert.throws(() => f.release({ family:'policy' }),/package|React/i);
  assert.ok(!f.git('tag').split('\n').includes('policy-v0.16.1'));
});

test('an ambiguous create failure retains its exact tag; a later attempt reruns all checks', (t) => {
  const f = fixture(t);f.state.failCreate = true;
  assert.throws(() => f.release(),/API connection closed/);
  assert.equal(f.git('rev-parse','v0.16.1^{commit}'),f.sourceSha);
  assert.equal(f.lastEvidence().releaseCreationAttempted,true);
  assert.equal(f.lastEvidence().remoteTagVerified,true);
  f.state.failCreate = false;
  assert.equal(f.release().outcome,'published');
  assert.equal(f.calls.filter((call) => call.join(' ') === 'pnpm check').length,2);
  assert.ok(!f.calls.some((call) => call.includes('--clobber') || call.includes('delete')));
});

test('a mismatched downloaded digest fails verification without deleting a published release', (t) => {
  const f = fixture(t);f.state.wrongDownload = true;
  assert.throws(() => f.release(),/downloaded release asset digest differs/);
  assert.equal(f.releases.length,3);
  assert.equal(f.lastEvidence().outcome,'failed');
  assert.throws(() => f.release(),/namespace already exists/);
  assert.ok(!f.calls.some((call) => call.includes('--clobber') || call.includes('delete')));
});

test('hosted publication refuses retries, push events, and an unannotated tag', (t) => {
  const f = fixture(t);
  assert.throws(() => f.release({ executor:'github-actions' }),/first explicit dispatch/);
  const environment = { GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:f.sourceSha,GITHUB_REF_NAME:'v0.16.1',GITHUB_REPOSITORY:releaseRepository };
  assert.throws(() => f.release({ executor:'github-actions' },{ ...environment,GITHUB_RUN_ATTEMPT:'2' }),/first explicit dispatch/);
  assert.throws(() => f.release({ executor:'github-actions' },{ ...environment,GITHUB_EVENT_NAME:'push' }),/first explicit dispatch/);
  f.git('tag','v0.16.1');f.git('push','origin','refs/tags/v0.16.1');
  assert.throws(() => f.release({ executor:'github-actions' },environment),/must be annotated/);
});
