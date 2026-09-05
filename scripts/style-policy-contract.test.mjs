import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_CONTROL_GEOMETRY_HOOKS,
  edgeMarkerViolations,
  forbiddenControlAppearanceDefinitions,
  pageFamilySelectorCouplingViolations,
  rawFoundationValueViolations,
  semanticGeometryViolations,
  sharedSelectorViolations,
  isProductProductionSource,
  skinLifecycleViolations,
  statusVisualContractViolations,
} from './style-policy-contract.mjs';

test('keeps resource-directory geometry separate from form and operator geometry', () => {
  const fixture = `
    .xgc-list-folder-title,
    .xgc-config-section-toggle { min-height: var(--size-control-default); }
    .xgc-list-page .xgc-operator-workspace { padding: var(--space-page-padding); }
    .xgc-list-row, .xgc-config-section { color: var(--color-text); }
    .xgc-list-row, .xgc-list-folder-title { min-width: 0; }
    .xgc-config-section .xgc-form-field, .xgc-settings-list { min-width: 0; }
  `;

  assert.deepEqual(pageFamilySelectorCouplingViolations(fixture), [
    'page-family selector couples resource-directory and form-settings-operator in .xgc-list-folder-title,\n    .xgc-config-section-toggle',
    'page-family selector couples resource-directory and form-settings-operator in .xgc-list-page .xgc-operator-workspace',
  ]);
});

test('requires semantic tokens for component dimensions and interaction geometry', () => {
  const fixture = `
    .swatch { width: var(--space-xl); height: var(--size-color-swatch); }
    .oversized { min-width: calc(var(--space-lg) * 12 + 2px); max-height: calc(4 * var(--space-xl)); }
    .bounded { width: min(100%, calc(var(--space-lg) * 52)); height: max(var(--size-control-default), calc(var(--space-xl) * 3)); }
    .nested { max-inline-size: calc(100% - min(var(--space-xl), calc(var(--space-lg) * 2))); }
    .toolbar { --xgc-control-height: calc(var(--size-control-default) + var(--space-sm)); }
    .meter { --xgc-meter-track-height: calc(var(--space-xs) * 2); }
    .typography { --xgc-tracking-offset: var(--space-xs); }
    .node { --xgc-node-handle-size: var(--space-md); }
    .node::after { inset: calc(-1 * var(--space-sm)); }
    .viewport { max-width: calc(100vw - var(--space-page-padding) * 2); }
    .workspace { height: calc(100dvh - var(--space-xl) * 2); }
    .panel { width: calc(var(--size-shell-sidebar) + var(--space-lg)); }
    .role { inline-size: calc(var(--xgc-control-height) + var(--space-lg)); }
    .responsive { width: min(calc(100% - var(--space-lg)), calc(100vw - var(--space-xl))); }
    .sized { min-height: clamp(var(--size-control-compact), calc(100dvh - var(--space-lg)), var(--size-panel-min)); }
    .layout { --space-panel-padding: var(--space-lg); padding: var(--space-panel-padding); }
  `;

  assert.deepEqual(semanticGeometryViolations(fixture), [
    'width uses spacing rhythm as geometry',
    'min-width uses spacing rhythm as geometry',
    'max-height uses spacing rhythm as geometry',
    'height uses spacing rhythm as geometry',
    'max-inline-size uses spacing rhythm as geometry',
    '--xgc-control-height derives geometry from spacing rhythm',
    '--xgc-meter-track-height derives geometry from spacing rhythm',
    '--xgc-node-handle-size derives geometry from spacing rhythm',
    'inset derives a hit target from spacing rhythm',
  ]);
});

test('does not let arbitrary variables launder spacing-derived geometry', () => {
  const fixture = `
    .legacy { width: calc(var(--legacy-width) + var(--space-lg)); }
    .relative-legacy { max-width: calc(100% - var(--legacy-width) + var(--space-lg)); }
    .sized { height: calc(var(--size-control-default) + var(--space-sm)); }
    .role { inline-size: calc(var(--xgc-control-height) + var(--space-sm)); }
  `;

  assert.deepEqual(semanticGeometryViolations(fixture), [
    'width uses spacing rhythm as geometry',
    'max-width uses spacing rhythm as geometry',
  ]);
});

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

test('allows shared skin lifecycle APIs and unrelated product persistence', () => {
  const fixture = `
    initializeSkin({ storageKey: 'xgc2-product.skin' });
    const [skin, setSkin] = useSkin({ storageKey: SKIN_STORAGE_KEY });
    localStorage.getItem('xgc2-stt.endpoint');
    window.localStorage.setItem(SECTION_STORAGE_KEY, value);
    widget.dataset.skin = previewSkin;
    document.body.dataset.domainTheme = domainTheme;
    // document.documentElement.dataset.skin = 'dark';
    /* window.localStorage.setItem('xgc2-product.theme', 'dark'); */
    const documentation = "document.documentElement.dataset.skin = 'dark'";
    const example = "localStorage.setItem('xgc2-product.theme', 'dark')";
  `;

  assert.deepEqual(skinLifecycleViolations(fixture), []);
});

test('rejects product-owned document skin mutation and theme persistence', () => {
  const fixture = `
    document.documentElement.dataset.skin = skin;
    delete document.documentElement.dataset['skin'];
    document.documentElement.setAttribute('data-skin', nextSkin);
    localStorage.getItem('xgc2-product.skin');
    window.localStorage.setItem("xgc2-product.theme", nextSkin);
    localStorage.removeItem(SKIN_STORAGE_KEY);
    localStorage.getItem(settings.themeKey);
    const preferenceKey = 'xgc2-product.skin';
    localStorage.getItem(preferenceKey);
  `;

  assert.deepEqual(skinLifecycleViolations(fixture), [
    'direct documentElement skin dataset access',
    'direct documentElement data-skin mutation',
    'direct localStorage getItem for skin/theme key xgc2-product.skin',
    'direct localStorage setItem for skin/theme key xgc2-product.theme',
    'direct localStorage removeItem for skin/theme key SKIN_STORAGE_KEY',
    'direct localStorage getItem for skin/theme key settings.themeKey',
    'direct localStorage getItem for skin/theme key preferenceKey',
  ]);
});

test('scans executable HTML while ignoring static skin markup and inert scripts', () => {
  const safeFixture = `<!doctype html>
    <html data-skin="light">
      <script type="application/json">
        {"example":"document.documentElement.dataset.skin = 'dark'"}
      </script>
      <script type=text/template>document.documentElement.dataset.skin = 'dark'</script>
      <script type="module" src="/src/main.tsx"></script>
      <script src="/skin-example.js">document.documentElement.dataset.skin = 'dark'</script>
      <script data-src="documentation">const harmless = true;</script>
    </html>`;
  assert.deepEqual(skinLifecycleViolations(safeFixture, { sourceType: 'html' }), []);

  assert.deepEqual(skinLifecycleViolations(`
    <script data-src="documentation">document.documentElement.dataset.skin = 'dark'</script>
  `, { sourceType: 'html' }), ['direct documentElement skin dataset access']);

  const unsafeFixture = `<!doctype html>
    <html data-skin="light">
      <script>
        const skin = localStorage.getItem('xgc.skin');
        document.documentElement.dataset.skin = skin;
      </script>
    </html>`;
  assert.deepEqual(skinLifecycleViolations(unsafeFixture, { sourceType: 'html' }), [
    'direct documentElement skin dataset access',
    'direct localStorage getItem for skin/theme key xgc.skin',
  ]);

  const bypassFixture = `<!doctype html>
    <body onload="window.document?.documentElement?.setAttribute('data-skin', 'dark')">
      <button onclick="document?.documentElement?.removeAttribute('data-skin')">Reset</button>
      <script type=text/javascript>
        window.document.documentElement.dataset['skin'] = 'dark';
      </script>
    </body>`;
  assert.deepEqual(skinLifecycleViolations(bypassFixture, { sourceType: 'html' }), [
    'direct documentElement skin dataset access',
    'direct documentElement data-skin mutation',
  ]);
});

test('production source filter excludes tests and stories without hiding application modules', () => {
  assert.equal(isProductProductionSource('src/App.tsx'), true);
  assert.equal(isProductProductionSource('index.html'), true);
  assert.equal(isProductProductionSource('src/theme.test.ts'), false);
  assert.equal(isProductProductionSource('src/theme.spec.tsx'), false);
  assert.equal(isProductProductionSource('src/__tests__/theme.ts'), false);
  assert.equal(isProductProductionSource('src/tests/theme.tsx'), false);
  assert.equal(isProductProductionSource('src/Theme.stories.tsx'), false);
  assert.equal(isProductProductionSource('theme.test.html'), false);
  assert.equal(isProductProductionSource('src/theme.css'), false);
});

test('allows plain status text and neutral structured feedback', () => {
  const fixture = `
    .product-runtime-status { color: var(--color-danger); background: transparent; border: 0; border-radius: 0; }
    .product-runtime-status-card { background: var(--color-bg-surface); border: var(--stroke-thin) solid var(--color-border); border-radius: var(--radius-surface); }
    .product-empty-state { background: var(--color-bg-surface); border: var(--stroke-thin) solid var(--color-border); }
  `;

  assert.deepEqual(statusVisualContractViolations(fixture), []);
});

test('allows solid danger material only for explicitly opted-in command tiles', () => {
  const command = "button.xgc-workflow-status-card[data-xgc-layout='tile'][data-xgc-appearance='solid'][data-xgc-tone='danger']";
  for (const state of ['',':hover:not(:disabled)',':active:not(:disabled)',"[aria-pressed='true']"]) {
    assert.deepEqual(statusVisualContractViolations(`${command}${state} { background: var(--color-danger); }`), []);
  }
  assert.deepEqual(statusVisualContractViolations(`.xgc-button[data-tone='danger'], ${command} { background: var(--color-danger); }`), []);
  for (const selector of [
    command.replace('button.', 'article.'),
    command.replace('button.', '.'),
    command.replace("[data-xgc-layout='tile']", ''),
    command.replace("[data-xgc-appearance='solid']", ''),
    command.replace("[data-xgc-appearance='solid']", "[data-xgc-status='failed']"),
    command.replace("[data-xgc-appearance='solid']", "[data-xgc-appearance='default']"),
    command.replace("[data-xgc-tone='danger']", "[data-xgc-tone='success']"),
    `${command} .workflow-status-card`,
    `${command}::before`,
    `${command}, article.workflow-status-card`,
  ]) {
    assert.notDeepEqual(statusVisualContractViolations(`${selector} { background: var(--color-danger); }`), [], selector);
  }
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
