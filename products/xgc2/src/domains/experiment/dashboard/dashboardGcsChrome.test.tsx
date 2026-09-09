// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach,describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const styles = join(here, '../../../styles');

describe('Experiment Config vs GCS dashboard chrome', () => {
  afterEach(() => {
    document.head.querySelector('[data-xgc-test="gcs-chrome"]')?.remove();
  });

  it('does not stack a GCS-only layout border under the shared topbar', () => {
    installChromeCss();
    const config = renderChrome('config');
    const gcs = renderChrome('gcs');
    const configTopbar = chromeBox(config, '[data-xgc-role="app-topbar"]');
    const gcsTopbar = chromeBox(gcs, '[data-xgc-role="app-topbar"]');
    const configLayout = chromeBox(config, '[data-xgc-role="experiment-dashboard-canvas"] .dashboard-layout');
    const gcsLayout = chromeBox(gcs, '[data-xgc-role="experiment-dashboard-canvas"] .dashboard-layout');
    const configPanel = chromeBox(config, '[data-xgc-role="experiment-panel"]');
    const gcsPanel = chromeBox(gcs, '[data-xgc-role="experiment-panel"]');

    expect(config.shell.getAttribute('data-xgc-mode')).toBeNull();
    expect(gcs.shell.getAttribute('data-xgc-mode')).toBe('ground-station');
    expect(configPanel.el).toHaveAttribute('data-chrome', 'framed');
    expect(gcsPanel.el).toHaveAttribute('data-chrome', 'seamed');

    expect(configTopbar.borderBottom).toBe(gcsTopbar.borderBottom);
    expect(configTopbar.background).toBe(gcsTopbar.background);
    expect(configTopbar.boxShadow).toBe(gcsTopbar.boxShadow);
    expect(configTopbar.height).toBe(gcsTopbar.height);

    expect(usedBorderPx(gcsLayout.borderTopWidth)).toBe(0);
    expect(usedBorderPx(configLayout.borderTopWidth)).toBe(0);
    expect(gcsLayout.background).toBe('rgba(0, 0, 0, 0)');
    expect(usedBorderPx(configLayout.borderLeftWidth)).toBe(0);

    config.unmount();
    gcs.unmount();
  });

  it('interpolates GCS sidebar width instead of display:none', () => {
    const shellCss = readFileSync(join(styles, 'shell.css'), 'utf8');
    expect(shellCss).not.toMatch(/\[data-xgc-mode=["']ground-station["']\][^{]*\{[^}]*grid-template-columns:\s*1fr/);
    expect(shellCss).not.toMatch(/\[data-xgc-mode=["']ground-station["']\] \.sidebar \{\s*display:\s*none/);
    expect(shellCss).toMatch(/\[data-xgc-mode=["']ground-station["']\] \.sidebar[\s\S]*width:\s*0/);

    installChromeCss();
    const view = render(
      <div className="app-shell" data-xgc-role="app-shell" data-xgc-mode="ground-station">
        <aside className="sidebar xgc-app-sidebar" data-xgc-role="app-sidebar" data-xgc-id="app-sidebar" />
      </div>,
    );
    const sidebar = view.container.querySelector<HTMLElement>('[data-xgc-role="app-sidebar"]');
    if (!sidebar) throw new Error('app-sidebar missing');
    const style = getComputedStyle(sidebar);
    expect(style.display).not.toBe('none');
    expect(style.width).toBe('0px');
    expect(style.pointerEvents).toBe('none');
    view.unmount();
  });

  it('keeps default tile transitions off and arms them only during GCS layout motion', () => {
    const dashboardCss = readFileSync(join(styles, 'dashboard.css'), 'utf8');
    expect(dashboardCss).toMatch(/\.dashboard-layout > \.dashboard-layout-item \{[\s\S]*transition:\s*none;/);
    expect(dashboardCss).toMatch(
      /\.dashboard-layout-shell\[data-xgc-layout-motion=["']true["']\] \.dashboard-layout-item/,
    );
    expect(dashboardCss).toMatch(/left var\(--duration-fast\) var\(--easing-standard\)/);
  });

  it('puts the visible Config tab in the height chain so the grid can mount on first paint', () => {
    const dashboardCss = readFileSync(join(styles, 'dashboard.css'), 'utf8');
    expect(dashboardCss).toMatch(
      /\[data-xgc-role=["']experiment-dashboard-surface["']\]:not\(\[hidden\]\) \[data-xgc-role=["']experiment-dashboard-tab-surface["']\]:not\(\[hidden\]\)[\s\S]*?height:\s*100%/,
    );
    expect(dashboardCss).not.toMatch(
      /\[data-xgc-mode=["']ground-station["']\][^{]*\[data-xgc-role=["']experiment-dashboard-tab-surface["']\]:not\(\[hidden\]\)/,
    );
  });
});

function installChromeCss() {
  const style = document.createElement('style');
  style.setAttribute('data-xgc-test', 'gcs-chrome');
  style.textContent = [
    ':root { --stroke-thin: 1px; --color-border-muted: #c8c2bb; --color-border-strong: #756a60; --xgc-gcs-panel-seam: var(--color-border-muted); --size-header-page: 36px; --background-chrome: #f4f1ee; --color-bg-chrome: #f4f1ee; }',
    '.xgc-topbar { height: var(--size-header-page); background: var(--background-chrome); border-bottom: var(--stroke-thin) solid var(--color-border-muted); }',
    readFileSync(join(styles, 'shell.css'), 'utf8'),
    readFileSync(join(styles, 'dashboard.css'), 'utf8'),
    '.xgc-workspace-panel[data-chrome="framed"] { border: var(--stroke-thin) solid var(--color-border-muted); }',
    '.xgc-workspace-panel[data-chrome="seamed"] { border: 0; border-right: var(--stroke-thin) solid var(--color-border-muted); border-bottom: var(--stroke-thin) solid var(--color-border-muted); }',
  ].join('\n');
  document.head.appendChild(style);
}

function renderChrome(mode: 'config' | 'gcs') {
  const view = render(
    <div
      className="app-shell"
      data-xgc-role="app-shell"
      data-xgc-mode={mode === 'gcs' ? 'ground-station' : undefined}
    >
      <header className="xgc-topbar" data-xgc-role="app-topbar" />
      <div
        className="experiment-grid dashboard-grid"
        data-xgc-role="experiment-dashboard-canvas"
        data-xgc-id={mode === 'gcs' ? 'gcs' : 'config'}
      >
        <div className="dashboard-layout-shell">
          <div className="dashboard-layout">
            <div className="dashboard-layout-item">
              <section
                className="xgc-panel-frame xgc-workspace-panel"
                data-xgc-role="experiment-panel"
                data-chrome={mode === 'gcs' ? 'seamed' : 'framed'}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
  );
  const shell = view.container.querySelector('[data-xgc-role="app-shell"]');
  if (!shell) throw new Error('app-shell missing');
  return { ...view, shell };
}

function chromeBox(view: { container: HTMLElement }, selector: string) {
  const el = view.container.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`${selector} missing`);
  const style = getComputedStyle(el);
  return {
    el,
    borderTop: style.borderTop,
    borderTopWidth: style.borderTopWidth,
    borderBottom: style.borderBottom,
    borderLeft: style.borderLeft,
    borderLeftWidth: style.borderLeftWidth,
    background: style.backgroundColor,
    boxShadow: style.boxShadow,
    height: style.height,
  };
}

function usedBorderPx(value: string) {
  const px = Number.parseFloat(value);
  return Number.isFinite(px) ? px : 0;
}
