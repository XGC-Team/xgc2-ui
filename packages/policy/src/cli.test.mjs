import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const policyVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

const cli = new URL('../dist/cli.mjs', import.meta.url);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'xgc2-ui-policy.'));
  const source = join(directory, 'src');
  await mkdir(source);
  await Promise.all([
    writeFile(join(directory, 'package.json'), '{"type":"module"}\n'),
    writeFile(join(directory, 'index.html'), '<!doctype html><html data-skin="light"><script type="module" src="/src/main.tsx"></script></html>\n'),
    writeFile(join(source, 'main.tsx'), "initializeSkin({ storageKey: 'fixture.skin' });\n"),
    writeFile(join(source, 'styles.css'), '.fixture { padding: var(--space-md); color: var(--color-text); }\n'),
  ]);
  return { directory, source };
}

function run(directory, ...argumentsList) {
  return spawnSync(process.execPath, [cli.pathname, ...argumentsList], {
    cwd: directory,
    encoding: 'utf8',
  });
}

test('scans a standalone consumer and reports exact coverage', async () => {
  const project = await fixture();
  try {
    const result = run(project.directory, '--root', 'src', '--html', 'index.html');
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`XGC2 UI policy ${policyVersion.replaceAll('.', '\\.')}: scanned 1 root\\(s\\), 1 CSS file\\(s\\), 2 production script\\/HTML file\\(s\\)`),
    );
  } finally {
    await rm(project.directory, { recursive: true, force: true });
  }
});

test('fails closed for missing roots and empty scans', async () => {
  const project = await fixture();
  try {
    const missing = run(project.directory, '--root', 'missing');
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /source root does not exist/);

    const empty = join(project.directory, 'empty');
    await mkdir(empty);
    const noCss = run(project.directory, '--root', 'empty');
    assert.equal(noCss.status, 2);
    assert.match(noCss.stderr, /no CSS files found/);

    const fakeHtml = run(project.directory, '--root', 'src', '--html', 'src/styles.css');
    assert.equal(fakeHtml.status, 2);
    assert.match(fakeHtml.stderr, /--html requires an \.html or \.htm entry/);
  } finally {
    await rm(project.directory, { recursive: true, force: true });
  }
});

test('rejects the full cross-product visual drift contract', async () => {
  const project = await fixture();
  try {
    await writeFile(join(project.source, 'main.tsx'), "document.documentElement.dataset.skin = localStorage.getItem('fixture.skin');\n");
    await writeFile(join(project.source, 'styles.css'), `
      .run-status-pill { background: red; border-radius: 999px; }
      .item[data-selected='true'] { border-left: 3px solid red; }
      .layout { width: calc(var(--space-lg) * 10); }
      .fork .xgc-button { --color-text: red; opacity: 0.5; }
    `);
    const result = run(project.directory, '--root', 'src', '--html', 'index.html');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /status ornament selector/);
    assert.match(result.stderr, /left edge marker/);
    assert.match(result.stderr, /width uses spacing rhythm as geometry/);
    assert.match(result.stderr, /shared selector \.xgc-button/);
    assert.match(result.stderr, /product redefines shared token --color-text/);
    assert.match(result.stderr, /raw opacity 0\.5/);
    assert.match(result.stderr, /direct documentElement skin dataset access/);
    assert.match(result.stderr, /direct localStorage getItem for skin\/theme key fixture\.skin/);
  } finally {
    await rm(project.directory, { recursive: true, force: true });
  }
});
