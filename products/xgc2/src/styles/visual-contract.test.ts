import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

const stylesDir = dirname(fileURLToPath(import.meta.url));
const readStyle = (name: string) => readFileSync(join(stylesDir, name), 'utf8');
const require = createRequire(import.meta.url);
const sharedStylePath = require.resolve('@xgc2/ui-react/styles.css');
const sharedFocusPath = require.resolve('@xgc2/ui-react/focus.css');
const sharedStyle = readFileSync(sharedStylePath, 'utf8');
const sharedFocus = readFileSync(sharedFocusPath, 'utf8');
const panelShells = [
  'lichtblick-panel.css',
  'gazebo-world-camera-panel.css',
  'camera-video-panel.css',
  'camera-calibration-panel.css',
  'camera-intrinsic-panel.css',
  'ros-panel.css',
  'automation-workflow-panel.css',
  'robot-instrument-board.css',
].map((name) => ({ name, css: readStyle(name) }));
const homeStyle = readStyle('home.css');

describe('shared visual contract integration', () => {
  it('imports shared chrome in the vendor layer and focus after all layered product styles', () => {
    expect(readStyle('vendor.css')).toContain("@import '@xgc2/ui-react/styles.css' layer(vendor);");
    expect(readStyle('app.css')).toMatch(
      /@import '\.\/shared-ui\.css' layer\(shared\);[\s\S]*@import '@xgc2\/ui-react\/focus\.css';/,
    );
    expect(sharedFocus).toContain(':focus-visible');
    expect(sharedFocus).toContain('var(--color-border-focus)');
    expect(sharedStyle).toContain('--font-display:');
    expect(sharedStyle).toContain('.xgc-resource-workbench');
    expect(sharedStyle).not.toMatch(/@import\s+['"]@xgc2\/ui-tokens/);
    expect(readStyle('shared-ui.css')).not.toContain('empty-state.css');
  });

  it('resolves shared JavaScript and CSS from the installed release family', async () => {
    const config = await resolveConfig({
      root: resolve(stylesDir, '../..'),
      configFile: resolve(stylesDir, '../../vite.config.ts'),
      logLevel: 'silent',
    }, 'build');
    const resolveImport = config.createResolver();
    for (const entry of ['@xgc2/ui-react/styles.css', '@xgc2/ui-react/focus.css', '@xgc2/ui-workflow/styles.css']) {
      expect(await resolveImport(entry, resolve(stylesDir, '../main.tsx'))).toBe(require.resolve(entry));
    }
    for (const entry of ['@xgc2/ui-react', '@xgc2/ui-workflow']) {
      const resolved = await resolveImport(entry, resolve(stylesDir, '../main.tsx'));
      expect(resolved).toMatch(/\/node_modules\/@xgc2\/ui-(?:react|workflow)\/dist\/index\.js$/);
    }
  });

  it('does not paint a recessed halo or fake black pad on experiment panel shells', () => {
    for (const { name, css } of panelShells) {
      expect(css, name).not.toMatch(/radial-gradient/);
    }
    const readPanel = (name: string) => panelShells.find((entry) => entry.name === name)?.css ?? '';
    expect(readPanel('lichtblick-panel.css')).toMatch(/\.lichtblick-workspace \{[^}]*background:\s*transparent/);
    expect(readPanel('robot-instrument-board.css')).toMatch(
      /\.robot-instruments-panel \{[^}]*background:\s*transparent/s,
    );
    expect(readPanel('gazebo-world-camera-panel.css')).toMatch(
      /\[data-xgc-role="gazebo-world-camera-workspace"\] \{[^}]*background:\s*transparent/,
    );
    expect(readPanel('ros-panel.css')).toMatch(/\.ros-panel-shell \{[^}]*background:\s*transparent/s);
    expect(readPanel('camera-calibration-panel.css')).toMatch(
      /\.panels-camera-calibration-panel \{[^}]*background:\s*transparent/s,
    );
    expect(readPanel('camera-calibration-panel.css')).toMatch(
      /\.panels-camera-calibration-workspace \{[^}]*background:\s*transparent/s,
    );
    expect(readPanel('automation-workflow-panel.css')).toMatch(
      /\.automation-workflow-panel \{[^}]*background:\s*transparent/s,
    );
    expect(readPanel('camera-video-panel.css')).toMatch(/\.camera-video-panel-root \{[^}]*background:\s*transparent/s);
    expect(readPanel('camera-video-panel.css')).toMatch(/\.camera-video-panel-state \{[^}]*background:\s*transparent/s);
    expect(readPanel('camera-video-panel.css')).toMatch(/\.camera-video-panel-stream \{[^}]*background:\s*transparent/s);
    expect(readPanel('camera-video-panel.css')).toMatch(
      /\.camera-video-panel-root:not\(\[data-state='playing'\]\):not\(\[data-has-frame='true'\]\) \.camera-video-panel-stream \{[^}]*opacity:\s*var\(--opacity-hidden\)/s,
    );
    expect(readPanel('camera-video-panel.css')).not.toMatch(/background:\s*#000/);
    expect(readPanel('camera-video-panel.css')).toMatch(
      /\.camera-video-panel-root\[data-image-fit='cover'\] \.camera-video-panel-stream \{[^}]*object-fit:\s*cover/s,
    );
    expect(readPanel('gazebo-world-camera-panel.css')).toMatch(
      /\.gazebo-world-camera-panel-image-view \.camera-video-panel-stream \{[^}]*object-fit:\s*cover/s,
    );
    expect(readPanel('gazebo-world-camera-panel.css')).not.toMatch(/object-fit:\s*contain/);
    expect(readPanel('camera-video-panel.css')).not.toMatch(
      /\.camera-video-panel-stream \{[^}]*background:\s*var\(--color-bg-canvas\)/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-layout \{[^}]*column-gap:\s*var\(--space-md\)/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-layout \{[^}]*background:\s*var\(--color-bg-surface\)/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-stage-layout \{[^}]*padding:\s*var\(--space-md\) 0 var\(--space-md\) var\(--space-md\)/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-inspector \{[^}]*padding:\s*var\(--space-md\) var\(--space-md\) var\(--space-md\) 0/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-live-preview \{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-inspector \{[^}]*border-left:\s*0/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).not.toMatch(
      /\.panels-camera-intrinsic-stage \{\n {2}background: var\(--color-bg-canvas\);\n\}/,
    );
    expect(readPanel('camera-intrinsic-panel.css')).not.toMatch(
      /\.panels-camera-intrinsic-detection-preview > header\s*\{/,
    );
    expect(readPanel('camera-intrinsic-panel.css')).not.toMatch(
      /\.panels-camera-intrinsic-detection-preview \{[^}]*padding:\s*0/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-detection-preview \{[^}]*flex:\s*0 0 auto/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-guide \{[^}]*--camera-intrinsic-guide-list-min-height:\s*64px;[^}]*min-height:\s*104px;[^}]*flex:\s*1 1 0;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*overflow:\s*hidden/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).toMatch(
      /\.panels-camera-intrinsic-guide ol \{[^}]*min-height:\s*var\(--camera-intrinsic-guide-list-min-height\);[^}]*max-height:\s*none/s,
    );
    expect(readPanel('camera-intrinsic-panel.css')).not.toMatch(/panels-camera-intrinsic-detection-metrics/);
  });

  it('uses the viewport outside product chrome for world-camera calibration', () => {
    const gazebo = readStyle('gazebo-world-camera-panel.css');
    expect(gazebo).toMatch(
      /\.gazebo-world-camera-calibration-backdrop \{[^}]*inset-block-start:\s*var\(--size-shell-chrome\);[^}]*inset-inline-start:\s*calc\(var\(--size-sidebar-expanded\) \+ var\(--stroke-thin\)\);/s,
    );
    expect(gazebo).toMatch(
      /\.gazebo-world-camera-calibration-dialog \{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*max-height:\s*none;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s,
    );
  });

  it('keeps one product-owned startup-graph chrome fence', () => {
    const startup = readStyle('experiment-startup-graph.css');
    const whiteboard = readStyle('ros-panel-whiteboard.css');
    const simulation = readStyle('robot-simulation.css');
    const lichtblick = panelShells.find((entry) => entry.name === 'lichtblick-panel.css')?.css ?? '';
    const gazebo = panelShells.find((entry) => entry.name === 'gazebo-world-camera-panel.css')?.css ?? '';
    expect(startup).toMatch(/\.experiment-startup-graph \.automation-canvas-controls/);
    expect(startup).toMatch(/\.experiment-startup-graph \.automation-edge-label/);
    expect(startup).not.toMatch(/panel-workflow-run-tree/);
    expect(whiteboard).not.toMatch(/ros-panel-whiteboard-canvas/);
    expect(whiteboard).not.toMatch(/ros-panel-whiteboard-zoom/);
    expect(simulation).not.toMatch(/robot-simulation-workflow > \.automation-graph/);
    expect(lichtblick).not.toMatch(/--color-bg-chrome/);
    expect(lichtblick).not.toMatch(/\.lichtblick-workflow-view > \.automation-graph/);
    expect(gazebo).not.toMatch(/gazebo-world-camera-panel-workflow \.automation-canvas-controls/);
    expect(panelShells.find((entry) => entry.name === 'camera-calibration-panel.css')?.css ?? '')
      .not.toMatch(/panels-camera-calibration-workflow-view > span/);
    expect(panelShells.find((entry) => entry.name === 'camera-calibration-panel.css')?.css ?? '')
      .not.toMatch(/panels-camera-calibration-empty-title/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline \{[^}]*place-items:\s*center/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline-frame \{[^}]*width:\s*max-content/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/workflow-startup-pipeline-sizer/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/content:\s*attr\(data-sample\)/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline-rail \{[^}]*width:\s*var\(--stroke-strong\)/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/--size-grid-column-wide/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline-mark \{[^}]*border-radius:\s*50%/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/data-current='true'\] \.workflow-startup-pipeline-mark/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/data-xgc-status='ready'\] \.workflow-startup-pipeline-mark[^}]*background:\s*var\(--color-text-heading\)/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/:not\(\[data-xgc-status='failed'\]\)\[data-current='true'\]/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/data-xgc-status='failed'\] \.workflow-startup-pipeline-mark[^}]*background:/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/data-xgc-status='failed'\] \.workflow-startup-pipeline-mark[^}]*color:\s*var\(--color-text-heading\)/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/data-xgc-status='failed'\] \.workflow-startup-pipeline-mark[^}]*--color-danger/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/data-xgc-status='active'\] \.workflow-startup-pipeline-mark/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/\.workflow-startup-pipeline-mark \{[^}]*--color-bg-primary/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/--workflow-startup-mark:\s*var\(--size-icon-lg\)/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/grid-template-columns:\s*subgrid/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline-mark \{[^}]*pointer-events:\s*none/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline-rail\[data-passed='true'\]/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/workflow-startup-send 1\.6s linear 1 forwards/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/workflow-startup-send[^;]*infinite/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .toMatch(/\.workflow-startup-pipeline-rail\[data-sending='true'\]/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/\.workflow-startup-pipeline-stage \{[^}]*pointer-events:\s*none/s);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/workflow-startup-pipeline-bars/);
    expect(readStyle('workflow-startup-pipeline.css'))
      .not.toMatch(/display:\s*contents/);
  });

  it('keeps intrinsic validation controls first with stable gallery and image navigation',() => {
    const intrinsic=panelShells.find((entry) => entry.name==='camera-intrinsic-panel.css')?.css ?? '';
    const validation = intrinsic.slice(intrinsic.indexOf('.panels-camera-intrinsic-validation {'));
    expect(validation).not.toMatch(/var\(--font-(?:xs|sm)\)/);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-layout\s*\{[^}]*font-size:\s*var\(--font-base\);[^}]*line-height:\s*var\(--line-height-normal\);/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation\s*\{[^}]*font-size:\s*var\(--font-base\);[^}]*line-height:\s*var\(--line-height-normal\);/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-side\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(180px, 1fr\);/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-heading dl > div\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*baseline;/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-heading dt,\s*\.panels-camera-intrinsic-validation-heading dd\s*\{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-size:\s*var\(--font-base\);[^}]*font-weight:\s*var\(--weight-regular\);[^}]*line-height:\s*var\(--line-height-normal\);/s);
    expect(intrinsic).not.toMatch(/panels-camera-intrinsic-validation-heading dd[^}]*font-mono/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-heading-title,\s*\.panels-camera-intrinsic-validation-controls > header\s*\{[^}]*color:\s*var\(--color-text-heading\);[^}]*font-size:\s*var\(--font-base\);[^}]*line-height:\s*var\(--line-height-normal\);/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-card > header > span \{[^}]*font-family:\s*var\(--font-mono\);[^}]*font-size:\s*var\(--font-base\);/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-guidance-instruction \{[^}]*font-size:\s*var\(--font-base\)/s);
    expect(intrinsic).not.toMatch(/\.panels-camera-intrinsic-guidance-instruction \{[^}]*font-size:\s*var\(--font-xs\)/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-card > header strong,\s*\.panels-camera-intrinsic-validation-heading-title strong,\s*\.panels-camera-intrinsic-validation-controls > header strong,\s*\.panels-camera-intrinsic-validation-gallery > header strong\s*\{[^}]*font-size:\s*var\(--font-base\);[^}]*font-weight:\s*var\(--weight-bold\);/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-field > label\s*\{[^}]*font-size:\s*var\(--font-base\);[^}]*line-height:\s*var\(--line-height-normal\);/s);
    expect(intrinsic).not.toMatch(/\.xgc-form-field-label\b/);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-target-label,\s*\.panels-camera-intrinsic-validation-view-label\s*\{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-size:\s*var\(--font-base\);[^}]*font-weight:\s*var\(--weight-regular\);[^}]*line-height:\s*var\(--line-height-normal\);/s);
    expect(intrinsic).toMatch(/button\[data-done="true"\] > \.panels-camera-intrinsic-target-icon\s*\{[^}]*color:\s*var\(--color-success\);/s);
    expect(intrinsic).not.toMatch(/button\[data-done="true"\] > span\s*\{/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-image-stage\s*\{[^}]*overflow:\s*hidden;[^}]*touch-action:\s*none;/s);
    expect(intrinsic).not.toMatch(/\.panels-camera-intrinsic-validation-image-stage\s*\{[^}]*overflow:\s*auto;/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-zoom-controls > \.xgc-control-button\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-width:\s*6rem;/s);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-gallery > div\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
    const validationShellRule = intrinsic.match(
      /\.panels-camera-intrinsic-validation-controls,\s*\.panels-camera-intrinsic-validation-live,\s*\.panels-camera-intrinsic-validation-gallery\s*\{([^}]*)\}/s,
    )?.[1] ?? '';
    expect(validationShellRule).not.toMatch(/(?:background|border(?:-radius)?):/);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-gallery button:disabled\s*\{[^}]*opacity:\s*var\(--opacity-full\);/s);
    expect(intrinsic.match(/\.panels-camera-intrinsic-validation-gallery > header\s*\{([^}]*)\}/s)?.[1] ?? '')
      .not.toMatch(/border/);
    expect(intrinsic).toMatch(/\.panels-camera-intrinsic-validation-live\s*\{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*16 \/ 9;[^}]*align-self:\s*start;/s);
    expect(intrinsic).not.toMatch(/panels-camera-intrinsic-validation-live[^}]*minmax\(220px, 1fr\)/s);
    expect(intrinsic).not.toMatch(/data-main-expanded/);
  });

  it('keeps the parked Experiment route out of every other page layout', () => {
    expect(readStyle('workspace-layout.css')).toMatch(
      /\[data-xgc-role="experiment-route-surface"\]\[hidden\]\s*\{[^}]*display:\s*none/s,
    );
  });

  it('keeps the visible dashboard tab in the remaining-height chain for Config and GCS', () => {
    const dashboard = readStyle('dashboard.css');
    expect(dashboard).toMatch(
      /\[data-xgc-role="experiment-dashboard-surface"\]:not\(\[hidden\]\) \[data-xgc-role="experiment-dashboard-tab-surface"\]:not\(\[hidden\]\) \{[^}]*height:\s*100%/s,
    );
    expect(dashboard).toMatch(
      /\[data-xgc-role="experiment-dashboard-tab-surface"\]\[hidden\] \{[^}]*display:\s*none/s,
    );
  });

  it('offers the Panel workflow deep link only from a visible workflow view',() => {
    const dashboard = readStyle('dashboard.css');
    expect(dashboard).toMatch(/\.xgc-panel-workflow-open \{[^}]*display:\s*none/s);
    expect(dashboard).toMatch(/\.xgc-panel-frame:has\(\[data-xgc-workflow-view-active="true"\]\) \.xgc-panel-workflow-open \{[^}]*display:\s*inline-flex/s);
    expect(dashboard).toMatch(/\.xgc-panel-frame:has\(\[data-xgc-workflow-view-active="true"\]\):hover \.xgc-panel-workflow-open/);
    expect(dashboard).not.toMatch(/\.xgc-panel-frame:hover \.xgc-panel-workflow-open/);
  });

  it('keeps the stable Home recording library on the shared regular Panel header', () => {
    expect(sharedStyle).toMatch(/\.xgc-panel-header\s*\{[^}]*padding:\s*0 var\(--space-panel-padding\)[;}]/s);
    expect(sharedStyle).toMatch(
      /\.xgc-panel:not\(\[data-chrome=['"]?flat['"]?\]\):has\(>\s*\.xgc-panel-header\)\[data-padding=['"]?default['"]?\]\s*>\s*\.xgc-panel-body\s*\{[^}]*padding:\s*var\(--space-panel-padding\)[;}]/s,
    );
    expect(sharedStyle).toMatch(/\.xgc-panel-heading h2\s*\{[^}]*font-size:\s*var\(--font-base\)[;}]/s);
    expect(sharedStyle).toMatch(/\.xgc-panel-heading h2\s*\{[^}]*font-weight:\s*var\(--weight-regular\)[;}]/s);
    expect(homeStyle).not.toContain('.home-library-head');
    expect(homeStyle).not.toContain('.home-section-title');
    expect(homeStyle).not.toMatch(/\.home-library-panel[^{}]*\.xgc-panel-(?:header|heading)/);
  });

  it('keeps Home recording rows and folder headers on one semantic geometry contract', () => {
    const galleryRule = homeStyle.match(/\.home-gallery\s*\{([^}]*)\}/s)?.[1] ?? '';
    const featureRule = homeStyle.match(/\.home-gallery-card\[data-xgc-rows="feature"\]\s*\{([^}]*)\}/s)?.[1] ?? '';
    const listRule = homeStyle.match(/\.home-recording-list\s*\{([^}]*)\}/s)?.[1] ?? '';
    const playerRule = homeStyle.match(/\.home-player\s*\{([^}]*)\}/s)?.[1] ?? '';
    const folderTitleRule = homeStyle.match(/\.home-recording-folder-title\s*\{([^}]*)\}/s)?.[1] ?? '';
    const rowRule = homeStyle.match(/\.home-recording-row\s*\{([^}]*)\}/s)?.[1] ?? '';
    const mainRule = homeStyle.match(/\.home-recording-main\s*\{([^}]*)\}/s)?.[1] ?? '';
    const nameRule = homeStyle.match(/\.home-recording-name\s*\{([^}]*)\}/s)?.[1] ?? '';
    const metaRule = homeStyle.match(/\.home-recording-meta\s*\{([^}]*)\}/s)?.[1] ?? '';

    expect(galleryRule).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(featureRule).toMatch(/grid-row:\s*1/);
    expect(listRule).toMatch(/--xgc-list-folder-gap:\s*var\(--space-xs\)/);
    expect(listRule).toMatch(/--xgc-list-folder-item-gap:\s*var\(--space-xs\)/);
    expect(listRule).not.toMatch(/--xgc-list-folder-title-padding-inline/);
    expect(listRule).toMatch(/--home-recording-row-indent:\s*var\(--space-lg\)/);
    expect(listRule).toMatch(/gap:\s*var\(--space-xs\)/);
    expect(listRule).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(playerRule).not.toMatch(/padding:/);
    expect(folderTitleRule).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(folderTitleRule).toMatch(/font-size:\s*var\(--font-base\)/);
    expect(folderTitleRule).toMatch(/font-weight:\s*var\(--weight-regular\)/);
    expect(rowRule).toMatch(/width:\s*calc\(100% - var\(--home-recording-row-indent\)\)/);
    expect(rowRule).toMatch(/margin-inline-start:\s*var\(--home-recording-row-indent\)/);
    expect(rowRule).toMatch(/min-height:\s*var\(--size-control-compact\)/);
    expect(rowRule).toMatch(/padding:\s*var\(--space-2xs\)\s+var\(--space-sm\)/);
    expect(rowRule).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(rowRule).toMatch(/font-size:\s*var\(--font-base\)/);
    expect(rowRule).toMatch(/font-weight:\s*var\(--weight-regular\)/);
    expect(rowRule).toMatch(/line-height:\s*var\(--line-height-tight\)/);
    expect(mainRule).toMatch(/flex:\s*1 1 0/);
    expect(mainRule).toMatch(/width:\s*100%/);
    expect(mainRule).toMatch(/min-width:\s*0/);
    expect(mainRule).not.toMatch(/overflow:\s*hidden/);
    expect(nameRule).toMatch(/display:\s*block/);
    expect(nameRule).toMatch(/min-width:\s*0/);
    expect(nameRule).toMatch(/width:\s*100%/);
    expect(nameRule).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(nameRule).toMatch(/font-size:\s*var\(--font-base\)/);
    expect(nameRule).toMatch(/font-weight:\s*var\(--weight-regular\)/);
    expect(nameRule).toMatch(/line-height:\s*var\(--line-height-tight\)/);
    expect(nameRule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(nameRule).toMatch(/white-space:\s*normal/);
    expect(nameRule).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(nameRule).not.toMatch(/overflow:\s*hidden/);
    expect(metaRule).toMatch(/flex:\s*0 0 auto/);
    expect(metaRule).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(metaRule).toMatch(/font-size:\s*var\(--font-sm\)/);
    expect(metaRule).toMatch(/font-weight:\s*var\(--weight-regular\)/);
    expect(metaRule).toMatch(/color:\s*var\(--color-text-muted\)/);
    expect(metaRule).toMatch(/line-height:\s*var\(--line-height-tight\)/);
    expect(metaRule).toMatch(/column-gap:\s*var\(--space-sm\)/);
    expect(metaRule).toMatch(/row-gap:\s*var\(--space-2xs\)/);
    expect(homeStyle).not.toMatch(/data-xgc-id/);
    expect(homeStyle).not.toMatch(/home-experiment-/);
  });

  it.each(['dark', 'light'])('keeps Home recording text tokenized for the %s skin', (skin) => {
    const skinBlock = skin === 'dark'
      ? sharedStyle.match(/:root,\s*:root\[data-skin=['"]?dark['"]?\]\s*\{[^}]*\}/)?.[0] ?? ''
      : sharedStyle.match(/:root\[data-skin=['"]?light['"]?\]\s*\{[^}]*\}/)?.[0] ?? '';

    expect(skinBlock).toMatch(/--color-text-heading:/);
    expect(skinBlock).toMatch(/--color-text-muted:/);
    expect(homeStyle).toContain('font-family: var(--font-sans)');
    expect(homeStyle).toContain('color: var(--color-text-heading)');
    expect(homeStyle).toContain('color: var(--color-text-muted)');
    expect(homeStyle).not.toMatch(/(?:color|background|border(?:-color)?):\s*(?:#|rgb\(|hsl\()/i);
  });

  it('keeps Automation runtime tables inside one bounded scroll chain', () => {
    const runtimeStyle = readStyle('automation-runtime-inspector.css');
    expect(runtimeStyle).toMatch(/\.automation-runtime-data-view \{[^}]*flex:\s*1 1 0[^}]*display:\s*flex/s);
    expect(runtimeStyle).toMatch(/\.automation-runtime-view-body \{[^}]*display:\s*flex[^}]*overflow:\s*hidden/s);
    expect(runtimeStyle).toMatch(/\.automation-runtime-table-layout \{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
    expect(runtimeStyle).toMatch(/\.automation-runtime-table-wrap \{[^}]*flex:\s*1 1 0/s);
    expect(runtimeStyle).toMatch(/\.automation-node-dialog-columns > \.automation-node-runtime-panel \{[^}]*overflow:\s*hidden/s);
    expect(runtimeStyle).not.toMatch(/background:\s*(?:#|rgb\(|hsl\()/i);
    expect(runtimeStyle).not.toMatch(/mask|margin\s*:\s*-/i);
  });
});
