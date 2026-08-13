import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_CONTROL_GEOMETRY_HOOKS,
  forbiddenControlAppearanceDefinitions,
} from './style-policy-contract.mjs';

test('allows only the finite product control geometry contract', () => {
  const fixture = `.product-toolbar {
    --xgc-control-button-padding: var(--space-md);
    --xgc-control-button-padding-block: var(--space-xs);
    --xgc-control-button-padding-inline: var(--space-lg);
    --xgc-control-height: var(--size-control-compact);
    --xgc-control-input-padding-inline: var(--space-lg);
    --xgc-domain-column-count: 3;
    /* Historical note: --xgc-control-background: red was removed. */
  }`;

  assert.equal(PRODUCT_CONTROL_GEOMETRY_HOOKS.size, 5);
  assert.deepEqual(forbiddenControlAppearanceDefinitions(fixture), []);
});

test('rejects product control appearance forks', () => {
  const fixture = `.product-toolbar {
    --xgc-control-background: hotpink;
    --xgc-control-border-color: red;
    --xgc-control-border-radius: 999px;
    --xgc-control-hover-color: yellow;
  }`;

  assert.deepEqual(forbiddenControlAppearanceDefinitions(fixture), [
    '--xgc-control-background',
    '--xgc-control-border-color',
    '--xgc-control-border-radius',
    '--xgc-control-hover-color',
  ]);
});
