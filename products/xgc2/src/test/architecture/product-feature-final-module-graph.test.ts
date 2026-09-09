import { afterAll,describe,expect,it } from 'vitest';
import { finalModuleProvenancePlugin } from '../../../finalModuleProvenancePlugin';

declare const process: { cwd: () => string;pid: number };
declare const require: (module: string) => unknown;

const { mkdirSync,readFileSync,rmSync } = require('fs') as {
  mkdirSync: (path: string,options: { recursive: true }) => void;
  readFileSync: (path: string,encoding: 'utf8') => string;
  rmSync: (path: string,options: { recursive: true;force: true }) => void;
};
const { tmpdir } = require('os') as { tmpdir: () => string };
const { join,resolve } = require('path') as {
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
};
const { pathToFileURL } = require('url') as {
  pathToFileURL: (path: string) => { href: string };
};

type ViteBuild = (options: Record<string,unknown>) => Promise<unknown>;

const webRoot = process.cwd();
const scratchRoot = join(tmpdir(),`xgc-product-graph-${process.pid}-${Date.now()}`);
mkdirSync(scratchRoot,{ recursive: true });

afterAll(() => {
  rmSync(scratchRoot,{ recursive: true,force: true });
});

describe('product feature final Rollup module graphs', () => {
  it('proves Docker/AppStore false roots and statically composes Automation Media only in its true roots', async () => {
    const profiles = {
      coreDev: resolve(webRoot,'profiles/core-dev.tsx'),
      coreRelease: resolve(webRoot,'profiles/core-release.tsx'),
      positive: resolve(webRoot,'test-fixtures/core-with-docker-appstore.tsx'),
      mediaFalse: resolve(webRoot,'test-fixtures/core-without-automation-media.tsx'),
    } as const;

    const coreDev = await buildFinalModuleGraph('core-dev',profiles.coreDev);
    const coreRelease = await buildFinalModuleGraph('core-release',profiles.coreRelease);
    const positive = await buildFinalModuleGraph('positive',profiles.positive);
    const mediaFalse = await buildFinalModuleGraph('media-false',profiles.mediaFalse);

    for (const [name,ids] of [['core-dev',coreDev],['core-release',coreRelease]] as const) {
      expect(hasOwnerModule(ids,'appstore'),`${name} AppStore closure`).toBe(false);
      expect(hasOwnerModule(ids,'container'),`${name} Docker closure`).toBe(false);
      expect(hasAutomationMediaLeaf(ids),`${name} Automation.Nodes.Media leaf`).toBe(true);
    }
    expect(hasOwnerModule(positive,'appstore')).toBe(true);
    expect(hasOwnerModule(positive,'container')).toBe(true);
    expect(hasAutomationMediaSource(mediaFalse),'Media=false source closure').toBe(false);
  },240_000);
});

async function buildFinalModuleGraph(label: string,profileModule: string) {
  const evidencePath = join(scratchRoot,label,'final-modules.json');
  const { build } = await import('vite') as { build: ViteBuild };
  const reactPluginModule = await import(
    pathToFileURL(resolve(webRoot,'node_modules/@vitejs/plugin-react/dist/index.js')).href
  ) as { default: () => unknown };

  await build({
    configFile: false,
    root: webRoot,
    plugins: [reactPluginModule.default(),finalModuleProvenancePlugin(evidencePath)],
    resolve: { alias: { '#xgc-profile': profileModule } },
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      cssCodeSplit: true,
      emptyOutDir: false,
      rollupOptions: { input: resolve(webRoot,'index.html') },
    },
  });

  const parsed = JSON.parse(readFileSync(evidencePath,'utf8')) as {
    inputs: Record<string,Record<string,never>>;
  };
  return Object.keys(parsed.inputs).map((id) => id.split('?')[0]!.replace(/\\/g,'/'));
}

function hasOwnerModule(ids: readonly string[],owner: 'appstore' | 'container') {
  return ids.some((id) => id.includes(`/src/domains/${owner}/`));
}

function hasAutomationMediaSource(ids: readonly string[]) {
  return ids.some((id) => id.includes('/src/domains/automation/nodes/media/'));
}

function hasAutomationMediaLeaf(ids: readonly string[]) {
  return ids.some((id) => id.endsWith(
    '/src/domains/automation/nodes/media/mediaCaptureSnapshotContribution.ts',
  ));
}
