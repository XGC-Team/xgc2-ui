import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach,describe,expect,it } from 'vitest';
import type { OutputBundle } from 'rollup';
import type { Plugin,PluginOption } from 'vite';
import {
  collectFinalModuleIds,
  finalModuleProvenancePlugin,
  formatFinalModuleEvidence,
  parseXgcWebMetafilePath,
} from './finalModuleProvenancePlugin';

const scratchRoots: string[] = [];

function scratchDir(label: string) {
  const root = join(tmpdir(), `xgc-metafile-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  scratchRoots.push(root);
  return root;
}

afterEach(() => {
  while (scratchRoots.length > 0) {
    const root = scratchRoots.pop();
    if (root) rmSync(root, { recursive: true,force: true });
  }
});

function asPluginHooks(plugin: Plugin) {
  const handler = (name: keyof Plugin) => {
    const hook = plugin[name];
    const resolved = typeof hook === 'function'
      ? hook
      : hook && typeof hook === 'object' && 'handler' in hook
        ? hook.handler
        : undefined;
    if (typeof resolved !== 'function') throw new Error(`missing plugin hook: ${String(name)}`);
    return resolved as (...args: unknown[]) => unknown;
  };
  return {
    buildStart: () => Reflect.apply(handler('buildStart'), plugin, []),
    generateBundle: (options: unknown,bundle: OutputBundle) => (
      Reflect.apply(handler('generateBundle'), plugin, [options,bundle])
    ),
    closeBundle: () => Reflect.apply(handler('closeBundle'), plugin, []),
    buildEnd: (error?: Error) => Reflect.apply(handler('buildEnd'), plugin, [error]),
    renderError: (error?: Error) => Reflect.apply(handler('renderError'), plugin, [error]),
  };
}

function chunkBundle(modulesByFile: Record<string,Record<string,unknown>>): OutputBundle {
  const bundle: OutputBundle = {};
  for (const [fileName,modules] of Object.entries(modulesByFile)) {
    bundle[fileName] = {
      type: 'chunk',
      name: fileName,
      fileName,
      modules: Object.fromEntries(
        Object.keys(modules).map((id) => [
          id,
          {
            code: null,
            originalLength: 0,
            removedExports: [],
            renderedExports: [],
            renderedLength: 0,
          },
        ]),
      ),
      imports: [],
      dynamicImports: [],
      exports: [],
      isEntry: false,
      isDynamicEntry: false,
      facadeModuleId: null,
      code: '',
      map: null,
      sourcemapFileName: null,
      preliminaryFileName: fileName,
      referencedFiles: [],
      implicitlyLoadedBefore: [],
      importedBindings: {},
      isImplicitEntry: false,
      moduleIds: Object.keys(modules),
    } as OutputBundle[string];
  }
  return bundle;
}

describe('parseXgcWebMetafilePath', () => {
  it('returns null for unset and blank values', () => {
    expect(parseXgcWebMetafilePath(undefined)).toBeNull();
    expect(parseXgcWebMetafilePath('')).toBeNull();
    expect(parseXgcWebMetafilePath('   ')).toBeNull();
  });

  it('rejects relative paths and non-.json extensions during config resolution', () => {
    expect(() => parseXgcWebMetafilePath('relative/meta.json')).toThrow(/absolute path/);
    expect(() => parseXgcWebMetafilePath('./meta.json')).toThrow(/absolute path/);
    expect(() => parseXgcWebMetafilePath('/tmp/meta.txt')).toThrow(/\.json/);
    expect(() => parseXgcWebMetafilePath('/tmp/meta.JSON')).toThrow(/\.json/);
    expect(() => parseXgcWebMetafilePath('/tmp/meta.json.bak')).toThrow(/\.json/);
  });

  it('accepts an absolute .json path', () => {
    expect(parseXgcWebMetafilePath('/var/xgc/web-metafile.json')).toBe('/var/xgc/web-metafile.json');
    expect(parseXgcWebMetafilePath('  /var/xgc/web-metafile.json  ')).toBe('/var/xgc/web-metafile.json');
  });
});

describe('formatFinalModuleEvidence / collectFinalModuleIds', () => {
  it('dedupes and lexicographically sorts raw Rollup module ids including query/virtual/node_modules', () => {
    const bundle = chunkBundle({
      'b.js': {
        '\0virtual:polyfill': {},
        '/app/src/main.tsx': {},
        '/app/node_modules/react/index.js': {},
      },
      'a.js': {
        '/app/src/main.tsx?v=1': {},
        '/app/src/profile.tsx': {},
        '/app/src/main.tsx': {},
      },
    });

    const ids = collectFinalModuleIds(bundle);
    const evidence = formatFinalModuleEvidence(ids);
    const parsed = JSON.parse(evidence) as { inputs: Record<string,Record<string,never>> };

    expect(evidence.endsWith('\n')).toBe(true);
    expect(evidence.slice(0,-1)).toBe(JSON.stringify(parsed));
    expect(Object.keys(parsed.inputs)).toEqual([
      '\0virtual:polyfill',
      '/app/node_modules/react/index.js',
      '/app/src/main.tsx',
      '/app/src/main.tsx?v=1',
      '/app/src/profile.tsx',
    ]);
    for (const value of Object.values(parsed.inputs)) {
      expect(value).toEqual({});
    }
  });

  it('preserves object-sensitive raw ids without adding metadata', () => {
    const evidence = formatFinalModuleEvidence(['constructor','__proto__','constructor']);
    expect(evidence).toBe('{"inputs":{"__proto__":{},"constructor":{}}}\n');
  });
});

describe('finalModuleProvenancePlugin atomic lifecycle', () => {
  it('removes stale target at build start and does not leave it after simulated failure', () => {
    const dir = scratchDir('fail');
    const target = join(dir, 'metafile.json');
    writeFileSync(target, '{"inputs":{"stale":{}}}\n', 'utf8');

    const hooks = asPluginHooks(finalModuleProvenancePlugin(target));
    hooks.buildStart();
    expect(existsSync(target)).toBe(false);

    hooks.buildEnd(new Error('simulated render failure'));
    expect(existsSync(target)).toBe(false);
    expect(dirEntries(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('fails closed on empty final graph and cleans target/temp', () => {
    const dir = scratchDir('empty');
    const target = join(dir, 'metafile.json');
    writeFileSync(target, '{"inputs":{"stale":{}}}\n', 'utf8');

    const hooks = asPluginHooks(finalModuleProvenancePlugin(target));
    hooks.buildStart();
    hooks.generateBundle({}, {
      'empty.js': {
        type: 'asset',
        fileName: 'empty.js',
        name: undefined,
        needsCodeReference: false,
        source: '',
      } as OutputBundle[string],
    });
    expect(() => hooks.closeBundle()).toThrow(/empty/);
    expect(existsSync(target)).toBe(false);
    expect(dirEntries(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('fails build start when a stale target cannot be removed', () => {
    const dir = scratchDir('stale-remove-fail');
    const target = join(dir, 'metafile.json');
    mkdirSync(target);

    const hooks = asPluginHooks(finalModuleProvenancePlugin(target));
    expect(() => hooks.buildStart()).toThrow();
    expect(existsSync(target)).toBe(true);
    expect(dirEntries(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('creates a nested evidence directory and writes atomically after a successful final graph', () => {
    const dir = scratchDir('ok');
    const target = join(dir, 'digest', 'core-dev', 'metafile.json');
    const hooks = asPluginHooks(finalModuleProvenancePlugin(target));
    hooks.buildStart();
    hooks.generateBundle({}, chunkBundle({
      'out.js': {
        '/repo/web/src/main.tsx': {},
        '\0vite/modulepreload-polyfill.js': {},
        '/repo/web/node_modules/react/index.js': {},
      },
    }));
    hooks.closeBundle();
    hooks.buildEnd();

    const body = readFileSync(target, 'utf8');
    expect(body.endsWith('\n')).toBe(true);
    expect(JSON.parse(body)).toEqual({
      inputs: {
        '\0vite/modulepreload-polyfill.js': {},
        '/repo/web/node_modules/react/index.js': {},
        '/repo/web/src/main.tsx': {},
      },
    });
    expect(dirEntries(dirname(target)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('fails through closeBundle and leaves no target/temp when the parent becomes a file', () => {
    const dir = scratchDir('write-fail');
    const evidenceParent = join(dir, 'evidence');
    const target = join(evidenceParent, 'metafile.json');
    const hooks = asPluginHooks(finalModuleProvenancePlugin(target));
    hooks.buildStart();
    hooks.generateBundle({}, chunkBundle({
      'out.js': { '/repo/web/src/main.tsx': {} },
    }));

    rmSync(evidenceParent, { recursive: true,force: true });
    writeFileSync(evidenceParent, 'not a directory', 'utf8');

    expect(() => hooks.closeBundle()).toThrow();
    expect(existsSync(target)).toBe(false);
    expect(dirEntries(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('renderError cleans target and run temp', () => {
    const dir = scratchDir('render-error');
    const target = join(dir, 'metafile.json');
    writeFileSync(target, '{"inputs":{"stale":{}}}\n', 'utf8');
    const hooks = asPluginHooks(finalModuleProvenancePlugin(target));
    hooks.buildStart();
    expect(existsSync(target)).toBe(false);
    hooks.renderError(new Error('render boom'));
    expect(existsSync(target)).toBe(false);
  });
});

describe('finalModuleProvenancePlugin programmatic Vite build (write:false)', () => {
  it('emits real src/main.tsx, profile, and client modules without scanning dist', async () => {
    const dir = scratchDir('vite-build');
    const target = join(dir, 'metafile.json');
    const webRoot = process.cwd();
    const profileModule = join(webRoot, 'profiles/core-dev.tsx');

    const { build } = await import('vite');
    const reactPluginModule = await import(
      pathToFileURL(join(webRoot, 'node_modules/@vitejs/plugin-react/dist/index.js')).href
    ) as { default: () => PluginOption };
    const react = reactPluginModule.default;

    await build({
      configFile: false,
      root: webRoot,
      plugins: [react(), finalModuleProvenancePlugin(target)],
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
          input: join(webRoot, 'index.html'),
        },
      },
    });

    expect(existsSync(target)).toBe(true);
    const body = readFileSync(target, 'utf8');
    expect(body.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(body) as { inputs: Record<string,Record<string,never>> };
    const keys = Object.keys(parsed.inputs);
    expect(keys.length).toBeGreaterThan(0);
    // Sorted deterministic keys
    expect(keys).toEqual([...keys].sort((a,b) => (a < b ? -1 : a > b ? 1 : 0)));

    const normalized = keys.map((id) => id.split('?')[0]!.replace(/\\/g, '/'));
    expect(normalized.some((id) => id.endsWith('/src/main.tsx'))).toBe(true);
    expect(normalized.some((id) => id.includes('/profiles/core-dev.tsx'))).toBe(true);
    expect(
      normalized.some((id) => id.includes('/src/app/ProductWebEntry') || id.includes('/src/App.tsx')),
    ).toBe(true);
    // Must not invent keys solely from dist scanning; dist asset names are not module ids.
    expect(keys.some((id) => id.includes('/dist/assets/'))).toBe(false);
  }, 180_000);
});

function dirEntries(dir: string) {
  return readdirSync(dir);
}
