import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';

const styleDirectory = dirname(fileURLToPath(import.meta.url));
const dialogCss = readFileSync(join(styleDirectory,'automation-node-dialog.css'),'utf8');
const graphCss = readFileSync(join(styleDirectory,'automation-graph.css'),'utf8');
const parameterCss = readFileSync(join(styleDirectory,'automation-parameter-controls.css'),'utf8');
const triggerCss = readFileSync(join(styleDirectory,'automation-trigger-controls.css'),'utf8');
const workspaceCss = readFileSync(join(styleDirectory,'automation-workspace-shell.css'),'utf8');
const runtimeCss = readFileSync(join(styleDirectory,'automation-runtime-inspector.css'),'utf8');

describe('Automation node inspector focus geometry',() => {
  it('matches every node-dialog title to the product breadcrumb typography',() => {
    expect(dialogCss).toMatch(/\.automation-node-dialog :is\(\.automation-node-dialog-title, \.automation-node-pane-title\)\s*\{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-size:\s*var\(--xgc-shell-ui-font-size, var\(--font-base\)\);[^}]*font-weight:\s*var\(--weight-regular\);[^}]*line-height:\s*var\(--line-height-control\);/s);
  });

  it('keeps Input, Node properties, and Output tab strips on one geometry',() => {
    expect(workspaceCss).toMatch(/\.automation-pane-tabs\s*\{[^}]*width:\s*190px;[^}]*height:\s*var\(--size-control-default\);[^}]*flex:\s*0 0 190px;/s);
    expect(workspaceCss).toMatch(/\.automation-pane-tabs > button\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;[^}]*justify-content:\s*center;/s);
    expect(dialogCss).not.toMatch(/\.automation-node-pane-tabs\s*\{/);
    expect(runtimeCss).toContain('.automation-inspector > div > header > span');
    expect(runtimeCss).not.toMatch(/\.automation-inspector > div > header span/);
  });

  it('keeps focused parameter controls inside the scroll viewport on every edge',() => {
    expect(dialogCss).toMatch(/\.automation-node-property-panel\s*\{[^}]*padding:\s*var\(--space-xs\);[^}]*overflow:\s*auto;/s);
  });

  it('reserves visible focus space around the inline display-name input',() => {
    expect(graphCss).toMatch(/\.automation-node-heading\s*\{[^}]*padding:\s*var\(--space-md\) var\(--space-lg\);/s);
    for (const selector of ['automation-node-heading','automation-node-caption','automation-node-name-slot']) {
      const rule = graphCss.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1];
      expect(rule).toBeDefined();
      expect(rule).not.toMatch(/overflow(?:-x|-y)?:\s*(?:hidden|clip)/);
    }
    expect(graphCss).toMatch(/\.automation-node-name-input\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/s);
  });
});

describe('Automation editor form chrome',() => {
  it('gives rosMasterUri expressions the full parameter row',() => {
    expect(parameterCss).toMatch(/\[data-xgc-role="automation-node-parameter-binding"\]\[data-xgc-mode="expression"\]\[data-xgc-id\$="\/rosMasterUri"\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
  });

  it('keeps Wait for completion at the normal FormField label size',() => {
    expect(parameterCss).toMatch(/\[data-xgc-role="automation-call-wait"\]\s*\{[^}]*font-size:\s*var\(--font-sm\);/s);
  });

  it('uses the Settings label typography for Parameters fields',() => {
    expect(dialogCss).toMatch(/automation-node-property-panel[^}]*:parameters[^}]*\.automation-node-parameter-field\s*\{[^}]*font-size:\s*var\(--font-base\);/s);
    expect(dialogCss).toMatch(/automation-node-property-panel[^}]*:parameters[^}]*\.automation-node-parameter-field > label\s*\{[^}]*font-weight:\s*var\(--weight-regular\);[^}]*line-height:\s*var\(--line-height-tight\);/s);
    expect(dialogCss).not.toMatch(/\.xgc-form-(?:field|field-label)/);
  });

  it('does not draw an extra divider under Advanced',() => {
    const advancedRule = parameterCss.match(/\.automation-call-advanced\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(advancedRule).not.toMatch(/border|box-shadow|text-decoration/);
  });

  it('keeps the trigger dock transparent so the global target combobox remains the only target chrome',() => {
    expect(triggerCss).toMatch(/\.automation-trigger-controls-surface\.automation-trigger-controls-entrypoint-panel\[data-xgc-layout="shell"\]\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s);
  });
});
