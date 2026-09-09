import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = dirname(fileURLToPath(import.meta.url));
const topbarCss = readFileSync(join(stylesDir, 'topbar.css'), 'utf8');
const require = createRequire(import.meta.url);
const sharedCss = readFileSync(
  require.resolve('@xgc2/ui-react/styles.css'),
  'utf8',
);

function roleRule(role: string, css = topbarCss): string {
  const marker = `[data-xgc-role="${role}"]`;
  const markerStart = css.indexOf(marker);
  if (markerStart < 0) throw new Error(`missing selector ${marker}`);
  const open = css.indexOf('{', markerStart);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`missing rule for ${marker}`);
  return css.slice(open + 1, close);
}

describe('topbar typography visual contract', () => {
  it('keeps breadcrumb ancestor and current item on one stable typography contract', () => {
    const root = roleRule('product-breadcrumbs');
    const items = topbarCss.slice(
      topbarCss.indexOf('[data-xgc-role="product-breadcrumbs"] [data-xgc-role="page-title-back"]'),
      topbarCss.indexOf('.topbar > :has', topbarCss.indexOf('[data-xgc-role="product-breadcrumbs"]')),
    );

    expect(root).toContain('font-family: var(--font-sans);');
    expect(root).toContain('font-size: var(--xgc-shell-ui-font-size, var(--font-base));');
    expect(root).toContain('font-weight: var(--weight-regular);');
    expect(root).toContain('line-height: var(--line-height-control);');
    expect(root).toContain('color: var(--color-text-muted);');
    expect(items).toContain('font-family: inherit;');
    expect(items).toContain('font-size: inherit;');
    expect(items).toContain('font-weight: inherit;');
    expect(items).toContain('line-height: inherit;');
    expect(items).toContain('color: inherit;');
    expect(items).toContain('min-height: var(--size-control-compact);');
    expect(items).toContain('height: auto;');
  });

  it('keeps standalone page titles on the same muted typography as breadcrumbs', () => {
    const titleStart = topbarCss.indexOf('.topbar h1,\n.topbar-page-title');
    const titleEnd = topbarCss.indexOf('.topbar-catalog-title {', titleStart);
    const title = topbarCss.slice(titleStart, titleEnd);

    expect(titleStart).toBeGreaterThan(-1);
    expect(title).toContain('font-family: var(--font-sans);');
    expect(title).toContain('font-size: var(--xgc-shell-ui-font-size, var(--font-base));');
    expect(title).toContain('font-weight: var(--weight-regular);');
    expect(title).toContain('line-height: var(--line-height-control);');
    expect(title).toContain('color: var(--color-text-muted);');
    expect(title).not.toContain('--color-text-strong');
    expect(title).not.toContain('--font-lg');
    expect(title).not.toContain('--weight-medium');
  });

  it('keeps Config, GCS, and run mode text readable without fixed pixel heights', () => {
    for (const role of [
      'experiment-dashboard-tabs',
      'experiment-gcs-mode',
      'experiment-run-mode',
      'experiment-run-mode-select',
    ]) {
      const rule = roleRule(role);
      expect(rule).toContain('font-family: var(--font-sans);');
      expect(rule).toContain('font-size: var(--xgc-shell-ui-font-size, var(--font-base));');
      expect(rule).toContain('font-weight: var(--weight-regular);');
      expect(rule).toContain('line-height: var(--line-height-control);');
    }

    const tabControl = roleRule('experiment-dashboard-tab-control');
    expect(tabControl).toContain('flex: 1 1 auto;');
    expect(tabControl).toContain('justify-content: center;');
    expect(tabControl).toContain('width: auto;');
    expect(tabControl).toContain('min-width: 0;');
    expect(tabControl).toContain('max-width: none;');
    expect(tabControl).not.toContain('--size-workspace-tab-input');
    const runModeTrigger = topbarCss.slice(
      topbarCss.indexOf('[data-xgc-role="experiment-run-mode-select"] [aria-haspopup="listbox"]'),
      topbarCss.indexOf('.experiment-run-mode-select,', topbarCss.indexOf('[data-xgc-role="experiment-run-mode-select"]')),
    );
    expect(tabControl).toContain('min-height: var(--size-control-default);');
    expect(tabControl).toContain('height: auto;');
    expect(tabControl).toContain('overflow: visible;');
    expect(runModeTrigger).toContain('min-height: var(--size-control-default);');
    expect(runModeTrigger).toContain('height: auto;');
    expect(runModeTrigger).toContain('line-height: inherit;');
    expect(topbarCss).not.toMatch(/\bheight:\s*\d+px/);
  });

  it('keeps the dashboard rename editor inside the tab and scroll clipping boundary', () => {
    const editorStart = topbarCss.indexOf(
      '[data-xgc-role="experiment-dashboard-tabs-scroll"] > [data-size="compact"]',
    );
    const editorEnd = topbarCss.indexOf('[data-xgc-role="experiment-dashboard-tab"]', editorStart);
    const editorRules = topbarCss.slice(editorStart, editorEnd);
    expect(editorStart).toBeGreaterThan(-1);
    expect(editorRules).toContain('--xgc-control-input-padding-inline: var(--space-md);');
    expect(editorRules).toContain('width: 100%;');
    expect(editorRules).toContain('max-width: none;');
    expect(editorRules).not.toContain('--size-workspace-tab-input');
    expect(editorRules).not.toMatch(/--xgc-control-(?:background|hover-background|color)\s*:/);
    const scroll = roleRule('experiment-dashboard-tabs-scroll');
    expect(scroll).toContain('display: inline-grid;');
    expect(scroll).toContain('grid-auto-columns: 1fr;');
    expect(scroll).toContain('min-height: var(--size-control-default);');
    expect(scroll).toContain('overflow-y: hidden;');
    expect(editorRules).not.toContain('outline:');
    expect(editorRules).not.toContain('box-shadow:');
  });

  it('makes the in-app topbar the frameless Electron drag handle without eating controls', () => {
    const handle = roleRule('app-topbar');
    expect(handle).toContain('-webkit-app-region: drag;');
    expect(handle).toContain('cursor: default;');
    expect(topbarCss).toMatch(
      /\[data-xgc-role="app-topbar"\] button[\s\S]*-webkit-app-region:\s*no-drag;/,
    );
    expect(topbarCss).toContain('[data-xgc-role="app-topbar"] button *');
    expect(topbarCss).toContain('[data-xgc-role="app-window-controls"] *');
    expect(topbarCss).toContain('[data-xgc-role="app-topbar"] .experiment-topbar-slot');
    expect(topbarCss).toContain('[data-xgc-role="app-topbar"] .page-topbar-actions');
    expect(topbarCss).toContain('[data-xgc-role="app-window-controls"]');
    expect(topbarCss).toContain('order: 100;');
    expect(topbarCss).toContain('-webkit-app-region: no-drag;');
    const caption = topbarCss.slice(
      topbarCss.indexOf('.topbar[data-xgc-role="app-topbar"] [data-xgc-role="app-window-minimize"]'),
    );
    expect(caption).toContain('border-radius: 0;');
    expect(caption).toContain('height: var(--size-header-page);');
  });

  it('composes shared primitives through stable roles and preserves theme ownership', () => {
    expect(topbarCss).not.toMatch(/\.xgc-(?:workspace|breadcrumb)[A-Za-z0-9_-]*/);
    expect(topbarCss).not.toMatch(/\.xgc-input\b/);
    expect(topbarCss).not.toMatch(/(?:color|background|border(?:-[a-z]+)?):\s*(?:#|rgb\(|hsl\()/i);

    expect(sharedCss).toMatch(
      /\.xgc-workspace-tab-select\s*\{[\s\S]*font-size:\s*var\(--font-base\);[\s\S]*line-height:\s*var\(--line-height-none\);/,
    );
    expect(sharedCss).toMatch(
      /\.xgc-breadcrumb-item\s*\{[\s\S]*font-size:\s*var\(--font-base\);[\s\S]*font-weight:\s*var\(--weight-regular\);[\s\S]*line-height:\s*var\(--line-height-none\);/,
    );

    const darkTokens = sharedCss.match(/:root,\s*:root\[data-skin=['"]?dark['"]?\]\s*\{[^}]*\}/)?.[0] ?? '';
    const lightTokens = sharedCss.match(/:root\[data-skin=['"]?light['"]?\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(sharedCss).toContain('--font-sans:');
    expect(darkTokens).toContain('--color-text-muted:');
    expect(lightTokens).toContain('--color-text-muted:');
    expect(darkTokens).toContain('--color-text-heading:');
    expect(lightTokens).toContain('--color-text-heading:');
  });
});
