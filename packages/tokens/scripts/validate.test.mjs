import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const packageRoot = new URL('../', import.meta.url);
const validatorUrl = new URL('./validate.mjs', import.meta.url);
const tokenSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

async function validateMutation(from, to) {
  const directory = await mkdtemp(join(tmpdir(), 'xgc2-token-mutation-'));
  const mutated = tokenSource.replace(from, to);
  assert.notEqual(mutated, tokenSource, `mutation source was not found: ${from}`);
  const tokenPath = join(directory, 'index.css');
  await writeFile(tokenPath, mutated);
  return spawnSync(process.execPath, [validatorUrl.pathname, '--tokens', tokenPath], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

test('full validator rejects semantic color variables in light application material', async () => {
  const result = await validateMutation(
    'linear-gradient(135deg, #f7f7f7 0%, #f1f1f1 54%, #f6f6f6 100%)',
    'linear-gradient(135deg, var(--color-accent), var(--color-bg-danger))',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unapproved material variable: --color-accent/);
});

test('full validator confines the chromatic focus variable to the focus shadow', async () => {
  const result = await validateMutation(
    'linear-gradient(135deg, #f7f7f7 0%, #f1f1f1 54%, #f6f6f6 100%)',
    'linear-gradient(135deg, var(--color-border-focus), #ffffff)',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /light --background-app references an unapproved material variable: --color-border-focus/);
});

test('full validator rejects a warm light foundation regression', async () => {
  const result = await validateMutation('--color-bg-app: #f4f4f4;', '--color-bg-app: #f2eee7;');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /chromatically biased/);
});
