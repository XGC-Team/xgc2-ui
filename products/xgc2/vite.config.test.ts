import { createHash } from 'node:crypto';
import { mkdirSync,mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createServer } from 'vite';
import { describe,expect,it,vi } from 'vitest';
import config,{
  configureAPIProxy,
  forwardOriginalRequestAuthority,
  moduleHasSideEffects,
  parseXgcWebDevServerPort,
  parseXgcWebProductBuild,
  productWebCompositionModulePath,
} from './vite.config';

type ProxyListener = (
  proxyRequest: ReturnType<typeof headerRecorder>['request'],
  request: { headers: { host?: string };socket: object },
) => void;

function headerRecorder(initial: Record<string,string> = {}) {
  const headers = new Map(
    Object.entries(initial).map(([name,value]) => [name.toLowerCase(),value]),
  );
  return {
    headers,
    request: {
      setHeader(name: string,value: string) {
        headers.set(name.toLowerCase(), value);
      },
    },
  };
}

describe('Vite API proxy forwarding authority', () => {
  it('preserves the real Host for the native client route without changing other API routes', () => {
    for (const url of ['/api/experiments/experiment-a/native-agents/sessions','/api/experiments/experiment-a/native-agents/capabilities?view=brief']) {
      const recorder = headerRecorder();
      forwardOriginalRequestAuthority(recorder.request, { headers: { host: 'localhost:5174' },socket: {},url });
      expect(recorder.headers.get('host')).toBe('localhost:5174');
    }
    const ordinary = headerRecorder();
    forwardOriginalRequestAuthority(ordinary.request, { headers: { host: 'localhost:5174' },socket: {},url: '/api/experiments/experiment-a' });
    expect(ordinary.headers.has('host')).toBe(false);
  });

  it.each([
    { method: 'GET',url: '/api/native-agents/settings' },
    { method: 'POST',url: '/api/native-agents/settings' },
    { method: 'POST',url: '/api/native-agents/settings/refresh' },
    { method: 'GET',url: '/api/native-agents/attention' },
  ])('preserves the browser authority for $method $url', ({ method,url }) => {
    const recorder = headerRecorder({ host: '127.0.0.1:8787' });
    const request = { method,url,headers: { host: 'localhost:5174' },socket: {} };

    forwardOriginalRequestAuthority(recorder.request, request);

    expect(Object.fromEntries(recorder.headers)).toEqual({
      host: 'localhost:5174',
      'x-forwarded-host': 'localhost:5174',
      'x-forwarded-proto': 'http',
    });
  });

  it.each([
    '/api/native-agents/settings?view=brief',
    '/api/native-agents/settings/refresh?view=brief',
    '/api/native-agents/settings-other',
    '/api/native-agents/settings-other?view=brief',
    '/api/native-agents/settings/refresh-other',
    '/api/native-agents/settings/refresh/extra',
    '/api/native-agents/settings/sessions',
    '/api/native-agents/attention?view=brief',
    '/api/native-agents/attention-other',
    '/api/native-agents/attention/sessions',
    '/api/native-agents/sessions',
    '/api/native-agents/sessions?view=brief',
    '/api/native-agents',
    '/api/experiments/experiment-a/native-agents-other/sessions',
    '/api/experiments//native-agents/sessions',
  ])('keeps the proxy target Host outside the bounded native routes: %s', (url) => {
    const recorder = headerRecorder({ host: '127.0.0.1:8787' });

    forwardOriginalRequestAuthority(recorder.request, {
      headers: { host: 'localhost:5174' },socket: {},url,
    });

    expect(Object.fromEntries(recorder.headers)).toEqual({
      host: '127.0.0.1:8787',
      'x-forwarded-host': 'localhost:5174',
      'x-forwarded-proto': 'http',
    });
  });

  it('forwards the original HTTP and HTTPS request authority', () => {
    const plain = headerRecorder();
    forwardOriginalRequestAuthority(plain.request, {
      headers: { host: 'localhost:5173' },
      socket: {},
    });
    expect(Object.fromEntries(plain.headers)).toEqual({
      'x-forwarded-host': 'localhost:5173',
      'x-forwarded-proto': 'http',
    });

    const encrypted = headerRecorder();
    forwardOriginalRequestAuthority(encrypted.request, {
      headers: { host: 'xgc2.test:5443' },
      socket: { encrypted: true },
    });
    expect(Object.fromEntries(encrypted.headers)).toEqual({
      'x-forwarded-host': 'xgc2.test:5443',
      'x-forwarded-proto': 'https',
    });
  });

  it('preserves the LAN attention authority without rewriting its Origin', () => {
    const recorder = headerRecorder({ host: '127.0.0.1:8787',origin: 'http://192.168.51.251:5174' });
    forwardOriginalRequestAuthority(recorder.request, {
      headers: { host: '192.168.51.251:5174' },socket: {},url: '/api/native-agents/attention',
    });
    expect(Object.fromEntries(recorder.headers)).toEqual({
      host: '192.168.51.251:5174',origin: 'http://192.168.51.251:5174',
      'x-forwarded-host': '192.168.51.251:5174','x-forwarded-proto': 'http',
    });
  });

  it('overrides generated target authority for HTTP and WebSocket proxy requests', () => {
    const listeners = new Map<string,ProxyListener>();
    const proxy = {
      on: vi.fn((event: string,listener: ProxyListener) => {
        listeners.set(event, listener);
        return proxy;
      }),
    };
    configureAPIProxy(proxy as never, { target: 'http://127.0.0.1:8787' } as never);

    expect([...listeners.keys()]).toEqual(['proxyReq','proxyReqWs']);
    for (const event of ['proxyReq','proxyReqWs']) {
      const forwarded = headerRecorder({
        'x-forwarded-host': '127.0.0.1:8787',
        'x-forwarded-proto': event === 'proxyReqWs' ? 'ws' : 'http',
      });
      listeners.get(event)?.(forwarded.request, {
        headers: { host: 'localhost:5173' },
        socket: {},
      });
      expect(Object.fromEntries(forwarded.headers)).toEqual({
        'x-forwarded-host': 'localhost:5173',
        'x-forwarded-proto': 'http',
      });
    }
  });

  it('wires the authority forwarding hooks only into the WebSocket-capable API proxy', () => {
    expect(config).toMatchObject({
      server: {
        proxy: {
          '/api': {
            ws: true,
            rewriteWsOrigin: false,
            configure: configureAPIProxy,
          },
          '/assets': {
            changeOrigin: true,
          },
        },
      },
    });
  });
});

describe('Vite browser HMR authority', () => {
  it('builds valid HTTP/HTTPS and LAN/IPv6 socket URLs from the real Vite client with a concrete configured port', async () => {
    // Transform the installed Vite client without opening a listener or watching
    // the workspace. This verifies its actual null-host/protocol fallback.
    const server = await createServer({
      configFile: false,
      root: dirname(fileURLToPath(import.meta.url)),
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true,include: [] },
      server: { ...config.server,watch: null },
    });
    try {
      expect(server.httpServer?.listening).toBe(false);
      const client = await server.transformRequest('/@vite/client');
      expect(client).not.toBeNull();
      const start = client!.code.indexOf('const importMetaUrl =');
      const end = client!.code.indexOf('const transport =',start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const socketSetup = client!.code.slice(start,end).replaceAll('import.meta.url','moduleURL');
      const port = parseXgcWebDevServerPort();
      for (const [moduleURL,expected] of [
        ['http://localhost:5174/@vite/client',`ws://localhost:${port}/`],
        ['http://192.168.51.251:5174/@vite/client',`ws://192.168.51.251:${port}/`],
        ['https://station.test:5443/@vite/client',`wss://station.test:${port}/`],
        ['http://[fd00::10]:5174/@vite/client',`ws://[fd00::10]:${port}/`],
      ]) {
        const result = runInNewContext(`${socketSetup}\n({ url: new URL(socketProtocol + '://' + socketHost).href,port: hmrPort })`,{ moduleURL,URL }) as { url: string;port: number };
        expect(result).toEqual({ url: expected,port });
      }
    } finally {
      await server.close();
    }
  });
});

describe('Vite fixed product profile entry', () => {
  it('keeps the handwritten Core Dev entry only as an explicit non-product fallback', () => {
    const fallback = productWebCompositionModulePath(undefined,false);
    expect(fallback.replace(/\\/g,'/')).toMatch(/\/profiles\/core-dev\.tsx$/);
    expect(() => productWebCompositionModulePath(fallback,true))
      .toThrow(/fixed generated ProductWorkspace/);
  });

  it('accepts every fixed generated Core ProductWorkspace entry', () => {
    const root = mkdtempSync(join(tmpdir(), 'xgc-vite-product-'));
    try {
      for (const product of ['core-dev','core-local-swarm-dev','core-release','core-jg-dev','core-jg-release']) {
        const entry = writeGeneratedProductEntry(root,product);
        expect(productWebCompositionModulePath(entry,true)).toBe(entry);
      }
    } finally {
      rmSync(root, { recursive: true,force: true });
    }
  });

  it('rejects stale generated entries without a source graph lock or with edited content', () => {
    const root = mkdtempSync(join(tmpdir(), 'xgc-vite-product-stale-'));
    try {
      const missingMarker = join(
        root,'core-xgc','.xgc-products','core-dev','a'.repeat(64),'web','profile-entry.tsx',
      );
      mkdirSync(dirname(missingMarker),{ recursive:true });
      writeFileSync(missingMarker,'export {};\n');
      expect(() => productWebCompositionModulePath(missingMarker,true))
        .toThrow(/source graph lock does not exist/);

      const edited = writeGeneratedProductEntry(root,'core-release');
      writeFileSync(edited,'export const stale = true;\n');
      expect(() => productWebCompositionModulePath(edited,true))
        .toThrow(/Web entry does not match/);
    } finally {
      rmSync(root,{ recursive:true,force:true });
    }
  });

  it('rejects absolute modules that are not fixed generated Core product entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'xgc-vite-product-invalid-'));
    const arbitrary = join(root, 'composition.tsx');
    const agent = join(
      root,
      'core-xgc',
      '.xgc-products',
      'agent-dev',
      'a'.repeat(64),
      'web',
      'profile-entry.tsx',
    );
    const uppercaseDigest = join(
      root,
      'core-xgc',
      '.xgc-products',
      'core-dev',
      'A'.repeat(64),
      'web',
      'profile-entry.tsx',
    );
    try {
      for (const entry of [arbitrary,agent,uppercaseDigest]) {
        mkdirSync(dirname(entry), { recursive: true });
        writeFileSync(entry, 'export {};\n');
        expect(() => productWebCompositionModulePath(entry,true))
          .toThrow(/fixed generated ProductWorkspace/);
      }
    } finally {
      rmSync(root, { recursive: true,force: true });
    }
  });

  it('fails a product build without its generated absolute composition entry', () => {
    expect(() => productWebCompositionModulePath(undefined,true))
      .toThrow(/required when XGC_WEB_PRODUCT_BUILD=1/);
    expect(() => productWebCompositionModulePath('   ',true))
      .toThrow(/cannot fall back/);
  });

  it('parses only the closed unset-or-0-or-1 product-build marker', () => {
    expect(parseXgcWebProductBuild(undefined)).toBe(false);
    expect(parseXgcWebProductBuild('0')).toBe(false);
    expect(parseXgcWebProductBuild(' 1 ')).toBe(true);
    for (const invalid of ['true','false','yes','2']) {
      expect(() => parseXgcWebProductBuild(invalid)).toThrow(/unset, 0, or 1/);
    }
  });

  it('uses a strict configurable development port without changing the default', () => {
    expect(parseXgcWebDevServerPort(undefined)).toBe(5173);
    expect(parseXgcWebDevServerPort(' 5174 ')).toBe(5174);
    expect(parseXgcWebDevServerPort('65535')).toBe(65535);
    for (const invalid of ['0','05173','65536','1.5','5173/tcp','true']) {
      expect(() => parseXgcWebDevServerPort(invalid)).toThrow(/TCP port|between 1 and 65535/);
    }
  });
});

describe('Vite production tree-shaking', () => {
  it('lets Rollup drop unused agent runtime scripts but keeps every other module effect', () => {
    const agentRuntime = '/repo/web/node_modules/@xgc2/agent-runtime/dist';
    expect(moduleHasSideEffects(`${agentRuntime}/react.js`)).toBe(false);
    expect(moduleHasSideEffects(`${agentRuntime}/upstream/t3/MessagesTimeline.js`)).toBe(false);
    expect(moduleHasSideEffects('C:\\repo\\web\\node_modules\\@xgc2\\agent-runtime\\dist\\react.js')).toBe(false);
    expect(moduleHasSideEffects(`${agentRuntime}/agent-chat.css`)).toBe(true);
    expect(moduleHasSideEffects('/repo/web/node_modules/@xgc2/ui-react/dist/index.js')).toBe(true);
    expect(moduleHasSideEffects('/repo/web/src/domains/groundStationInteraction/GroundStationNotificationCenter.tsx')).toBe(true);
    expect(config.build?.rollupOptions?.treeshake).toEqual({ moduleSideEffects: moduleHasSideEffects });
  });
});

function writeGeneratedProductEntry(root:string,product:string) {
  const content = 'export {};\n';
  const entries = [{
    path:'@generated/web/profile-entry.tsx',sha256:sha256(content),size:Buffer.byteLength(content),
  }];
  const profileDigest = sha256('profile');
  const sourceGraphDigest = sha256(JSON.stringify({
    schemaVersion:'xgc2.product-source-graph/v1',entries,
  }));
  const workspaceDigest = sha256(JSON.stringify({ profileDigest,sourceGraphDigest }));
  const workspace = join(
    root,'core-xgc','.xgc-products',product,workspaceDigest.slice('sha256:'.length),
  );
  const entry = join(workspace,'web','profile-entry.tsx');
  mkdirSync(dirname(entry),{ recursive:true });
  writeFileSync(entry,content);
  mkdirSync(join(workspace,'profile'),{ recursive:true });
  writeFileSync(join(workspace,'profile','source-graph.json'),JSON.stringify({
    schemaVersion:'xgc2.product-source-graph/v1',
    productId:product,
    target:'core',
    profileDigest,
    sourceGraphDigest,
    workspaceDigest,
    entries,
  },null,2)+'\n');
  return entry;
}

function sha256(content:string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
