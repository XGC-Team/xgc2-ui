import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const WHITE_THEAD_TOKENS = ['--color-bg-surface', '--color-bg-chrome', '--background-panel-header'];

function readDomainCss(relative: string): string {
  return readFileSync(join(srcRoot, relative), 'utf8');
}

function listCssFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...listCssFiles(fullPath));
    else if (stat.isFile() && entry.endsWith('.css')) files.push(fullPath);
  }
  return files;
}

function selectorTargetsTh(selector: string): boolean {
  return selector.split(',').some((part) => /(^|[\s>+~])th(:|[.\s>+~[#]|$)/.test(part.trim()));
}

function whiteTheadHits(css: string, file: string): string[] {
  const hits: string[] = [];
  const rules = css.matchAll(/([^{}]+)\{([^{}]+)\}/g);
  for (const match of rules) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const body = match[2];
    if (!selectorTargetsTh(selector)) continue;
    const fill = body.match(/(?:^|\n)\s*background\s*:\s*([^;]+);/);
    const value = fill?.[1] ?? '';
    if (WHITE_THEAD_TOKENS.some((token) => value.includes(token))) {
      hits.push(`${relative(srcRoot, file)} :: ${selector.split('\n').join(' ').trim()} { background: ${value.trim()} }`);
    }
  }
  return hits;
}

function ruleBody(css: string, selector: string): string {
  const needle = `${selector} {`;
  const start = css.indexOf(needle);
  if (start < 0) {
    throw new Error(`missing rule ${selector}`);
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('product list chrome forks', () => {
  it('paints paginated container footers with the shared recessed gray, not white chrome', () => {
    const css = readDomainCss('domains/container/container.css');
    const footer = ruleBody(css, '.container-image-footer');
    expect(footer).toMatch(/background:\s*var\(--color-bg-subtle\)/);
    expect(footer).not.toMatch(/--color-bg-chrome/);
  });

  it('does not force Audit LogTablePage headers or pagers back to white', () => {
    const css = readDomainCss('domains/audit/audit.css');
    expect(css).not.toMatch(/--background-panel-header/);
    expect(css).not.toMatch(/--color-bg-chrome/);
    expect(css).not.toMatch(/\.xgc-pagination/);
    expect(css).not.toMatch(/\.xgc-log-table-head/);
  });

  it('keeps System Overview process and NIC chrome on recessed gray (frozen reference)', () => {
    const css = readDomainCss('domains/host/HostOverview.css');
    expect(ruleBody(css, '.xgc-host-overview-pagination')).toMatch(/background:\s*var\(--color-bg-subtle\)/);
    expect(ruleBody(css, '.xgc-host-overview-table-head')).toMatch(/background:\s*var\(--color-bg-subtle/);
  });

  it('aligns Overview tables with the current header and lets the activity parent own its inset', () => {
    const css = readDomainCss('domains/host/HostOverview.css');
    const sharedCss = readFileSync(join(srcRoot, '..', 'node_modules/@xgc2/ui-react/dist/styles.css'), 'utf8');
    const sharedHeader = sharedCss.match(/(?:^|\})\s*\.xgc-panel-header\s*\{([^}]+)\}/)?.[1];
    const headerPadding = sharedHeader?.match(/(?:^|;)\s*padding:\s*([^;]+);/)?.[1].trim();
    expect(headerPadding).toBeTruthy();
    const domainRules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]+)\}/g)];
    for (const selector of [
      '.xgc-host-overview .info-table',
      '.xgc-host-overview-pagination',
      '.xgc-host-overview-table-head',
      '.xgc-host-overview-table-row',
      'button.xgc-host-overview-table-row.xgc-host-overview-process-link',
    ]) {
      const insetRule = domainRules.find((match) => (
        match[1].split(',').some((part) => part.trim() === selector)
        && /(?:^|;)\s*padding:/.test(match[2])
      ));
      const padding = insetRule?.[2].match(/padding:\s*([^;]+);/)?.[1].trim();
      expect(padding, selector).toBe(headerPadding);
    }
    expect(ruleBody(css, '.xgc-host-overview .resource-bar')).toMatch(/padding:\s*0;/);
    expect(css).toMatch(/\[data-xgc-role="system-overview-trend"\] \.xgc-system-io-chart \{[^}]*padding:\s*0;/s);
    expect(ruleBody(css, '[data-xgc-role="system-overview-trend"] .xgc-system-io-chart-legend')).toMatch(/padding-inline:\s*0;/);
  });

  it('lets Overview process PID fit 7-digit ids on a shared rem track', () => {
    const css = readDomainCss('domains/host/HostOverview.css');
    expect(css).toMatch(
      /grid-template-columns:\s*4rem minmax\(0, 1fr\) 4\.5rem 4\.5rem/,
    );
    expect(css).not.toMatch(/grid-template-columns:\s*3\.25rem minmax\(0, 1fr\) 3\.75rem 3\.75rem/);
  });

  it('leaves Host Files table chrome to the shared table without a pager bar', () => {
    const css = readDomainCss('domains/host/HostFileTable.css');
    expect(css).not.toMatch(/\.xgc-host-file-(?:head|row)\b/);
    expect(css).not.toMatch(/xgc-pagination/);
  });

  it('does not restyle Operations audit pager off the shared pagination fill', () => {
    const css = readDomainCss('styles/operations.css');
    const pager = ruleBody(css, '.operations-audit-pagination');
    expect(pager).not.toMatch(/--color-bg-chrome/);
    expect(pager).not.toMatch(/--background-panel-header/);
  });

  it('does not paint any product th with a white/chrome/panel-header fill', () => {
    const hits = listCssFiles(srcRoot).flatMap((file) => whiteTheadHits(readFileSync(file, 'utf8'), file));
    expect(hits).toEqual([]);
    const toolbox = readDomainCss('styles/toolbox.css');
    expect(ruleBody(toolbox, '.toolbox-table-region .toolbox-cleanup-table th')).toMatch(
      /background:\s*var\(--color-bg-subtle\)/,
    );
  });
});
