import { describe,expect,it } from 'vitest';

declare const process: { cwd: () => string };
declare const require: (module: string) => unknown;

const { resolve } = require('path') as {
  resolve: (...paths: string[]) => string;
};
const { pathToFileURL } = require('url') as {
  pathToFileURL: (path: string) => { href: string };
};

type RollupOutput = {
  output: Array<
    | { type: 'chunk';modules: Record<string,unknown> }
    | { type: 'asset' }
  >;
};

type ViteBuild = (options: Record<string,unknown>) => Promise<RollupOutput | RollupOutput[]>;

const webRoot = process.cwd();
const fixturesDir = resolve(webRoot,'test-fixtures/home-profiles');

const fixturePaths = {
  recording: resolve(fixturesDir,'home-only-recording.tsx'),
  none: resolve(fixturesDir,'home-none.tsx'),
} as const;

function normalizeModuleId(id: string) {
  return id.split('?')[0]!.replace(/\\/g,'/');
}

function moduleIdsContain(ids: readonly string[], fragment: string) {
  return ids.some((id) => normalizeModuleId(id).includes(fragment));
}

async function collectViteInputModuleIds(profileModule: string): Promise<string[]> {
  const { build } = await import('vite') as { build: ViteBuild };
  // Dynamic import keeps plugin-react out of the project TS resolution graph.
  const reactPluginModule = await import(
    pathToFileURL(resolve(webRoot,'node_modules/@vitejs/plugin-react/dist/index.js')).href
  ) as { default: () => unknown };
  const react = reactPluginModule.default;

  const result = await build({
    configFile: false,
    root: webRoot,
    plugins: [react()],
    resolve: {
      alias: {
        '#xgc-profile': profileModule,
      },
    },
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      cssCodeSplit: true,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(webRoot,'index.html'),
      },
    },
  });

  const bundles = Array.isArray(result) ? result : [result];
  const ids = new Set<string>();
  for (const bundle of bundles) {
    for (const item of bundle.output) {
      if (item.type !== 'chunk') continue;
      for (const moduleId of Object.keys(item.modules)) {
        ids.add(moduleId);
      }
    }
  }
  return [...ids];
}

describe('home profile Vite input module graphs', () => {
  it('home-only-recording includes Home + recording owner modules and excludes removed spotlight/action/host Files from Home', async () => {
    const ids = await collectViteInputModuleIds(fixturePaths.recording);

    expect(moduleIdsContain(ids,'/domains/home/HomeRoute')).toBe(true);
    expect(moduleIdsContain(ids,'/app/home/createHomePageAdapter')).toBe(true);
    expect(moduleIdsContain(ids,'/domains/home/RecordingLibraryCardContribution')).toBe(true);
    expect(moduleIdsContain(ids,'/domains/home/RecordingLibrary')).toBe(true);
    expect(moduleIdsContain(ids,'/domains/home/useRecordingLibrary')).toBe(true);
    expect(moduleIdsContain(ids,'/styles/home.css')).toBe(true);

    expect(moduleIdsContain(ids,'/domains/home/ExperimentSpotlightCardContribution')).toBe(false);
    expect(moduleIdsContain(ids,'/domains/home/ExperimentSpotlightCard.tsx')).toBe(false);
    expect(moduleIdsContain(ids,'/domains/home/HomeExperimentCard')).toBe(false);
    expect(moduleIdsContain(ids,'/domains/home/useHomeExperimentSpotlight')).toBe(false);
    expect(moduleIdsContain(ids,'/domains/home/homeExperimentSpotlightModel')).toBe(false);
    expect(moduleIdsContain(ids,'/domains/home/experimentSpotlightCopy')).toBe(false);
    // Zero-action recording card must not pull the Files open-folder app adapter.
    expect(moduleIdsContain(ids,'/app/home/RecordingOpenFolderActionContribution')).toBe(false);
    expect(moduleIdsContain(ids,'/app/home/RecordingOpenFolderAction.tsx')).toBe(false);
    expect(moduleIdsContain(ids,'/domains/host/')).toBe(false);
  }, 180_000);

  it('home-none excludes Home modules/styles and keeps a deterministic non-Home default route', async () => {
    const ids = await collectViteInputModuleIds(fixturePaths.none);
    const { productWebComposition } = await import('../../../test-fixtures/home-profiles/home-none');

    expect(moduleIdsContain(ids,'/domains/home/')).toBe(false);
    expect(moduleIdsContain(ids,'/app/home/')).toBe(false);
    expect(moduleIdsContain(ids,'/styles/home.css')).toBe(false);

    expect(productWebComposition.home).toBeUndefined();
    expect(productWebComposition.routes.some((route) => route.page === 'home')).toBe(false);
    expect(productWebComposition.navigation.primary.some((item) => item.id === 'home')).toBe(false);
    expect(productWebComposition.navigation.defaultPage).toBe('experiment');
    expect(productWebComposition.routes[0]?.page).toBe('experiment');
  }, 180_000);
});
