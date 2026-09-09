import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const settingsCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'settings.css'), 'utf8');

function ruleDeclarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing rule ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`unclosed rule ${selector}`);
  return new Map(css.slice(open + 1, close).split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return [];
    return [[declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()]];
  }));
}

describe('settings form geometry', () => {
  it('centers the parked Settings route surface at the 800px reading width', () => {
    const surface = ruleDeclarations(
      settingsCss,
      '.xgc-workspace-content > .settings-page.xgc-workspace-full-span,\n.xgc-workspace-content > [data-xgc-route-page="settings"]:not([hidden])',
    );

    expect(surface.get('width')).toBe('min(100%, 800px)');
    expect(surface.get('justify-self')).toBe('center');
  });

  it('removes the shared ConfigSection body block-end spacing for every form-settings section', () => {
    const body = ruleDeclarations(
      settingsCss,
      ".settings-layout > [data-xgc-layout-family='form-settings'] > [data-xgc-role='config-section-body']",
    );

    expect(body.get('padding-block-end')).toBe('0');
    expect(settingsCss).not.toMatch(/data-xgc-role=["']station-skin-settings["']/);
    expect(settingsCss).not.toMatch(/data-xgc-id=["']appearance["']/);
  });

  it('lets ConfigSection body host nested fold labels instead of a fake select', () => {
    const disclosure = ruleDeclarations(
      settingsCss,
      ".settings-layout > [data-xgc-layout-family='form-settings'] > [data-xgc-role='config-section-body'] > [data-xgc-role='config-section-disclosure']",
    );
    const toggle = ruleDeclarations(settingsCss, '.config-section-disclosure-toggle');
    const status = ruleDeclarations(settingsCss, '.config-section-disclosure-status');
    const nested = ruleDeclarations(
      settingsCss,
      ".settings-layout > [data-xgc-layout-family='form-settings'] > [data-xgc-role='config-section-body']:has(> [data-xgc-role='config-section-disclosure']) > .xgc-form-field",
    );
    const actions = ruleDeclarations(
      settingsCss,
      ".settings-layout > [data-xgc-layout-family='form-settings'] > [data-xgc-role='config-section-body'] > [data-xgc-role='native-provider-config-actions']",
    );
    const actionButtons = ruleDeclarations(
      settingsCss,
      ".settings-layout > [data-xgc-layout-family='form-settings'] > [data-xgc-role='config-section-body'] > [data-xgc-role='native-provider-config-actions'] > [data-xgc-role]",
    );
    expect(disclosure.get('display')).toBe('grid');
    expect(disclosure.get('grid-template-columns')).toBe('minmax(0, 1fr) minmax(200px, 320px)');
    expect(toggle.get('display')).toBe('flex');
    expect(toggle.get('gap')).toBe('var(--space-md)');
    expect(status.get('background')).toBe('transparent');
    expect(status.get('max-width')).toBe('320px');
    expect(status.get('width')).toBe('100%');
    expect(status.get('justify-content')).toBe('flex-start');
    expect(nested.get('padding-inline-start')).toBe('calc(14px + var(--space-md))');
    expect(actions.get('max-width')).toBe('320px');
    expect(actions.get('width')).toBe('100%');
    expect(actions.get('justify-self')).toBe('end');
    expect(actions.get('display')).toBe('grid');
    expect(actions.get('grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))');
    expect(actions.get('gap')).toBe('var(--space-md)');
    expect(actionButtons.get('width')).toBe('100%');
    expect(actionButtons.get('min-width')).toBe('0');
    expect(settingsCss).not.toMatch(/:has\(> \[data-xgc-role='config-section-disclosure'\]\) > \.xgc-form-actions \{/);
    expect(settingsCss).toContain("[aria-expanded='false'] .config-section-disclosure-chevron");
    expect(settingsCss).not.toMatch(/config-section-disclosure:hover/);
    expect(settingsCss).not.toMatch(/config-section-disclosure-value/);
    expect(settingsCss).not.toMatch(/station-native-provider-settings-body/);
    expect(settingsCss).not.toMatch(/xgc-native-chat/);
  });
});
