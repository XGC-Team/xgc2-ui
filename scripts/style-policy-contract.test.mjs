import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_CONTROL_GEOMETRY_HOOKS,
  edgeMarkerViolations,
  forbiddenControlAppearanceDefinitions,
  rawFoundationValueViolations,
  sharedSelectorViolations,
  statusVisualContractViolations,
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

test('rejects left-edge selection and dialog markers without banning structural seams', () => {
  const fixture = `
    .item[data-selected='true'] { border-left: 3px solid red; }
    .nav-item.active::before { left: 0; width: 3px; background: red; }
    .dialog { box-shadow: inset 3px 0 0 red; }
    .selected-card { box-shadow: inset 0 0 0 1px var(--color-border-primary); }
    .inspector-column { border-left: var(--stroke-thin) solid var(--color-border); }
  `;

  assert.deepEqual(edgeMarkerViolations(fixture), [
    "left edge marker in .item[data-selected='true']",
    'pseudo-element edge marker in .nav-item.active::before',
    'inset edge marker in .dialog',
  ]);
});

test('rejects raw ordinary opacity and motion while allowing reduced-motion and measured linear motion', () => {
  const fixture = `
    .hidden { opacity: 0; }
    .enter { transition: opacity 180ms ease-in; }
    .busy { animation: spin 1.25s ease-in-out infinite; }
    .measured { transition: height var(--duration-quick) linear; }
    @media (prefers-reduced-motion: reduce) {
      .safe { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
  `;

  assert.deepEqual(rawFoundationValueViolations(fixture), [
    'raw opacity 0',
    'raw motion duration 180ms',
    'raw motion easing ease-in',
    'raw motion duration 1.25s',
    'raw motion easing ease-in-out',
  ]);
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

test('rejects product CSS that reaches into shared component classes', () => {
  const fixture = `
    .product-panel > .xgc-panel-body { min-height: 0; }
    .product-actions .xgc-button { width: 100%; }
    .product-owned-panel { min-height: 0; }
  `;

  assert.deepEqual(sharedSelectorViolations(fixture, new Set(['xgc-panel-body', 'xgc-button'])), [
    'shared selector .xgc-panel-body',
    'shared selector .xgc-button',
  ]);
});

test('allows plain status text and neutral structured feedback', () => {
  const fixture = `
    .product-runtime-status { color: var(--color-danger); background: transparent; border: 0; border-radius: 0; }
    .product-runtime-status-card { background: var(--color-bg-surface); border: var(--stroke-thin) solid var(--color-border); border-radius: var(--radius-surface); }
    .product-empty-state { background: var(--color-bg-surface); border: var(--stroke-thin) solid var(--color-border); }
  `;

  assert.deepEqual(statusVisualContractViolations(fixture), []);
});

test('rejects status capsules, marker names, glows, and semantic container fills', () => {
  const fixture = `
    .connection-status-pill { padding: 4px 8px; background: green; border: 1px solid green; border-radius: 999px; }
    .service-health-dot { box-shadow: 0 0 12px lime; }
    .runtime-status .dot { background: red; border-radius: 999px; }
    .connection-status { border-inline-start: 3px solid red; }
    .run-status-card { background: var(--color-success-soft); }
    .job-status-card { background: red; border: 1px solid green; }
    .task-status-panel { background: #ff0000; }
    .health-status-surface { background: rgb(12 220 30 / 20%); }
    .service-status-card[data-status='offline'] { background: #222; }
  `;

  assert.deepEqual(statusVisualContractViolations(fixture), [
    'status ornament selector .connection-status-pill (connection-status-pill)',
    'filled status background in .connection-status-pill',
    'status border or edge marker in .connection-status-pill',
    'rounded status shape in .connection-status-pill',
    'status ornament selector .service-health-dot (service-health-dot)',
    'status glow or shadow in .service-health-dot',
    'status ornament selector .runtime-status .dot (dot)',
    'filled status background in .runtime-status .dot',
    'rounded status shape in .runtime-status .dot',
    'status border or edge marker in .connection-status',
    'semantic status material in .run-status-card',
    'literal status material in .job-status-card',
    'literal status material in .task-status-panel',
    'literal status material in .health-status-surface',
    "state-dependent filled status background in .service-status-card[data-status='offline']",
  ]);
});
