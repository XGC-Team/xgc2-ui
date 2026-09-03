import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = join(dirname(fileURLToPath(import.meta.url)), '../styles.css');

function ruleDeclarations(css: string, selector: string): Map<string, string> {
  const lineNeedle = `\n${selector} {`;
  const start = css.indexOf(lineNeedle);
  if (start < 0) throw new Error(`missing rule ${selector} in ${stylesPath}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`unclosed rule ${selector} in ${stylesPath}`);
  const declarations = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map(declarations.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return [];
    return [[declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()]];
  }));
}

describe('page-family visual geometry', () => {
  it('keeps the shared ListPage focus halo outside its clip edge', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const listHost = ruleDeclarations(css, '.xgc-list-page-host:has(> .xgc-list-page)');

    expect(listHost.get('overflow')).toBe('clip');
    expect(listHost.get('overflow-clip-margin')).toBe('var(--stroke-strong)');
  });

  it('keeps compact settings geometry independently owned from resource directories', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const configToggle = ruleDeclarations(css, '.xgc-config-section-toggle');
    const configTitle = ruleDeclarations(css, '.xgc-config-section-title');
    const configBody = ruleDeclarations(css, '.xgc-config-section-body');
    const configRow = ruleDeclarations(css, '.xgc-config-section-body > .xgc-form-field');
    const listFolder = ruleDeclarations(css, '.xgc-list-folder-title');
    const listFolderTitle = ruleDeclarations(css, '.xgc-list-folder-title strong');

    expect(configToggle.get('min-height')).toBe('var(--size-control-default)');
    expect(configToggle.get('padding')).toBe('0 var(--space-md)');
    expect(configTitle.get('font-size')).toBe('var(--font-base)');
    expect(configTitle.get('font-weight')).toBe('var(--weight-regular)');
    expect(configTitle.get('line-height')).toBe('var(--line-height-tight)');
    expect(configBody.get('padding')).toBe('0 var(--space-xl) var(--space-xs)');
    expect(configRow.get('padding')).toBe('var(--space-sm) 0');

    expect(listFolder.get('min-height')).toBe('30px');
    expect(listFolder.get('padding')).toBe('0 var(--xgc-list-folder-title-padding-inline, 0)');
    expect(listFolderTitle.get('font-size')).toBe('var(--font-base)');
    expect(listFolderTitle.get('font-weight')).toBe('var(--weight-regular)');
  });

  it('keeps Panel and WorkspacePanel headers regular with shared body inset', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const panelHeader = ruleDeclarations(css, '.xgc-panel-header');
    const panelTitle = ruleDeclarations(css, '.xgc-panel-heading h2');
    const workspaceHeader = ruleDeclarations(css, '.xgc-workspace-panel-header');
    const workspaceTitle = ruleDeclarations(css, '.xgc-workspace-panel-title');

    for (const header of [panelHeader, workspaceHeader]) {
      expect(header.get('padding')).toBe('0 var(--space-panel-padding)');
      expect(header.has('padding-bottom')).toBe(false);
      expect(header.get('height')).toBe('var(--size-header-panel)');
      expect(header.get('border-bottom')).toBe('var(--stroke-thin) solid var(--color-border-muted)');
    }
    expect(ruleDeclarations(
      css,
      ".xgc-panel:not([data-chrome='flat']):has(> .xgc-panel-header)[data-padding='default'] > .xgc-panel-body",
    ).get('padding')).toBe('var(--space-panel-padding)');
    expect(ruleDeclarations(css, '.xgc-panel[data-padding=\'default\'] > .xgc-panel-body').get('padding'))
      .toBe('var(--space-panel-padding)');
    expect(ruleDeclarations(css, '.xgc-workspace-panel-body[data-padding=\'default\']').get('padding'))
      .toBe('var(--space-xs)');
    for (const title of [panelTitle, workspaceTitle]) {
      expect(title.get('font-size')).toBe('var(--font-base)');
      expect(title.get('font-weight')).toBe('var(--weight-regular)');
      expect(title.get('line-height')).toBe('var(--size-control-panel-header)');
    }
  });

  it('keeps sidebar width motion while clipping a stable expanded inner track', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const sidebar = ruleDeclarations(css, '.xgc-app-sidebar');
    const collapsed = ruleDeclarations(css, ".xgc-app-sidebar[data-collapsed='true']");
    const inner = ruleDeclarations(css, '.xgc-sidebar-brand,\n.xgc-sidebar-body,\n.xgc-sidebar-footer');
    const collapsedFooter = ruleDeclarations(css, ".xgc-app-sidebar[data-collapsed='true'] .xgc-sidebar-footer");

    expect(sidebar.get('width')).toBe('var(--size-sidebar-expanded)');
    expect(sidebar.get('transition')).toBe('width var(--duration-fast) var(--easing-standard)');
    expect(collapsed.get('width')).toBe('var(--size-sidebar-collapsed)');
    expect(inner.get('min-width')).toBe('var(--size-sidebar-expanded)');
    expect(collapsedFooter.get('display')).toBeUndefined();
    expect(collapsedFooter.get('max-height')).toBe('0');
    expect(css).not.toMatch(/\[data-collapsed='true'\] \.xgc-sidebar-nav-label[^}]*opacity:\s*var\(--opacity-hidden\)/s);

    const nav = ruleDeclarations(css, '.xgc-sidebar-nav');
    const item = ruleDeclarations(css, '.xgc-sidebar-nav-item');
    const collapsedNav = ruleDeclarations(css, ".xgc-app-sidebar[data-collapsed='true'] .xgc-sidebar-nav");
    const collapsedItem = ruleDeclarations(css, ".xgc-app-sidebar[data-collapsed='true'] .xgc-sidebar-nav-item");
    expect(nav.get('transition')).toBe('padding-inline var(--duration-fast) var(--easing-standard)');
    expect(item.get('transition')).toBe('padding-inline var(--duration-fast) var(--easing-standard)');
    expect(item.get('justify-content')).toBe('flex-start');
    expect(collapsedNav.get('padding-inline')).toBe('0');
    expect(collapsedItem.get('padding-inline')).toBe(
      'calc((var(--size-sidebar-collapsed) - var(--xgc-sidebar-icon-size)) / 2)',
    );
    expect(collapsedItem.get('justify-content')).toBeUndefined();
  });

  it('keeps every field hint label on the FormSection specimen and textarea content on input type', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const field = ruleDeclarations(css, '.xgc-form-field');
    const label = ruleDeclarations(css, '.xgc-form-field-label');
    const textarea = ruleDeclarations(css, '.xgc-textarea');
    const inputValue = ruleDeclarations(css, '.xgc-input > input');
    const sectionLabel = ruleDeclarations(
      css,
      '.xgc-form-section-body :is(.xgc-form-field, .xgc-form-group) > .xgc-form-field-label',
    );

    expect(field.get('font-size')).toBeUndefined();
    expect(label.get('font-family')).toBe('var(--font-sans)');
    expect(label.get('font-size')).toBe('var(--font-base)');
    expect(label.get('font-weight')).toBe('var(--weight-regular)');
    expect(label.get('line-height')).toBe('var(--line-height-tight)');
    expect(label.get('color')).toBe('var(--color-text-muted)');
    expect(sectionLabel.get('font-size')).toBeUndefined();
    expect(sectionLabel.get('font-weight')).toBeUndefined();
    expect(textarea.get('font-size')).toBe(inputValue.get('font-size'));
    expect(textarea.get('font-size')).toBe('var(--font-base)');
    expect(textarea.get('font-family')).toBe('var(--font-sans)');
    expect(textarea.get('font-weight')).toBe('var(--weight-regular)');
  });

  it('keeps panel header actions and view switchers inside the compact control height', () => {
    const css = readFileSync(stylesPath, 'utf8');
    const viewSwitcher = ruleDeclarations(css, '.xgc-panel-view-switcher');
    const viewSwitcherButton = ruleDeclarations(css, '.xgc-panel-view-switcher-button');
    const panelActions = ruleDeclarations(css, '.xgc-panel-actions');
    const workspaceActions = ruleDeclarations(css, '.xgc-workspace-panel-actions');

    expect(viewSwitcher.get('height')).toBe('var(--size-control-panel-header)');
    expect(viewSwitcher.get('padding')).toBe('0 var(--space-2xs)');
    expect(viewSwitcherButton.get('height')).toBe('100%');
    expect(panelActions.get('height')).toBe('var(--size-control-panel-header)');
    expect(workspaceActions.get('height')).toBe('var(--size-control-panel-header)');
  });
});
