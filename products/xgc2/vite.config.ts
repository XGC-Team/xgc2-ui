import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync,readFileSync } from 'node:fs';
import { basename,dirname,extname,isAbsolute,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig,type ProxyOptions } from 'vite';
import {
  finalModuleProvenancePlugin,
  parseXgcWebMetafilePath,
} from './finalModuleProvenancePlugin';
import { markPromptHerdrBridgePlugin } from './markPromptHerdrBridgePlugin';

type ForwardedHeaderRequest = {
  setHeader(name: string,value: string): unknown;
};

type IncomingProxyRequest = {
  headers: { host?: string };
  socket: object;
  url?: string;
};

export function forwardOriginalRequestAuthority(
  proxyRequest: ForwardedHeaderRequest,
  request: IncomingProxyRequest,
) {
  // http-proxy's WebSocket xfwd path omits the host and emits ws/wss as the
  // protocol. Core compares the browser Origin's HTTP authority, so preserve
  // the exact authority accepted by this development server.
  const host = request.headers.host?.trim();
  if (host) proxyRequest.setHeader('X-Forwarded-Host', host);
  // Native clients enforce Host/Origin themselves. Preserve the authority on
  // Experiment and exact Settings routes; the shared broker does not trust xfwd.
  const nativeRoute = /^\/api\/experiments\/[^/?]+\/native-agents(?:[/?]|$)/.test(request.url ?? '')
    || /^\/api\/native-agents\/settings(?:\/refresh)?$/.test(request.url ?? '');
  if (host && nativeRoute) {
    proxyRequest.setHeader('Host', host);
  }
  const encrypted = 'encrypted' in request.socket && request.socket.encrypted === true;
  proxyRequest.setHeader('X-Forwarded-Proto', encrypted ? 'https' : 'http');
}

export const configureAPIProxy: NonNullable<ProxyOptions['configure']> = (proxy) => {
  proxy.on('proxyReq', forwardOriginalRequestAuthority);
  proxy.on('proxyReqWs', forwardOriginalRequestAuthority);
};

export function parseXgcWebProductBuild(configured = process.env.XGC_WEB_PRODUCT_BUILD) {
  const selected = configured?.trim();
  if (!selected || selected === '0') return false;
  if (selected === '1') return true;
  throw new Error('XGC_WEB_PRODUCT_BUILD must be unset, 0, or 1.');
}

export function parseXgcWebDevServerPort(
  configured = process.env.XGC_WEB_DEV_SERVER_PORT,
) {
  const selected = configured?.trim();
  if (!selected) return 5173;
  if (!/^[1-9][0-9]{0,4}$/.test(selected)) {
    throw new Error('XGC_WEB_DEV_SERVER_PORT must be a canonical TCP port number.');
  }
  const port = Number(selected);
  if (port > 65535) {
    throw new Error('XGC_WEB_DEV_SERVER_PORT must be between 1 and 65535.');
  }
  return port;
}

export function productWebCompositionModulePath(
  configured = process.env.XGC_WEB_COMPOSITION_MODULE,
  productBuild = parseXgcWebProductBuild(),
) {
  const selected = configured?.trim();
  if (!selected) {
    if (productBuild) {
      throw new Error(
        'XGC_WEB_COMPOSITION_MODULE is required when XGC_WEB_PRODUCT_BUILD=1; '
        + 'product builds cannot fall back to profiles/core-dev.tsx.',
      );
    }
    return fileURLToPath(new URL('./profiles/core-dev.tsx', import.meta.url));
  }
  if (!isAbsolute(selected)) {
    throw new Error('XGC_WEB_COMPOSITION_MODULE must be an absolute path to a resolved module.');
  }
  if (!['.ts','.tsx'].includes(extname(selected))) {
    throw new Error('XGC_WEB_COMPOSITION_MODULE must select a .ts or .tsx module.');
  }
  const normalized = selected.replace(/\\/g, '/');
  const fixedProductEntry = /(?:^|\/)core-xgc\/\.xgc-products\/(?:core-dev|core-local-fleet-dev|core-release|core-jg-dev|core-jg-release)\/[0-9a-f]{64}\/web\/profile-entry\.tsx$/;
  if (productBuild && !fixedProductEntry.test(normalized)) {
    throw new Error(
      'XGC_WEB_COMPOSITION_MODULE must select the fixed generated ProductWorkspace '
      + 'core-xgc/.xgc-products/<fixed Core ProductID>/<64 lowercase hex>/web/profile-entry.tsx '
      + 'when XGC_WEB_PRODUCT_BUILD=1.',
    );
  }
  if (!existsSync(selected)) {
    throw new Error(`XGC_WEB_COMPOSITION_MODULE does not exist: ${selected}`);
  }
  if (productBuild) validateGeneratedProductEntry(selected);
  return selected;
}

export function validateGeneratedProductEntry(entryPath: string) {
  const workspace = dirname(dirname(entryPath));
  const markerPath = resolve(workspace,'profile/source-graph.json');
  if (!existsSync(markerPath)) {
    throw new Error(`generated ProductWorkspace source graph lock does not exist: ${markerPath}`);
  }
  let marker:unknown;
  try {
    marker = JSON.parse(readFileSync(markerPath,'utf8'));
  } catch (error) {
    throw new Error(`generated ProductWorkspace source graph lock is invalid: ${String(error)}`,{ cause:error });
  }
  if (!isSourceGraphLock(marker)) {
    throw new Error('generated ProductWorkspace source graph lock has an invalid field contract.');
  }
  const digestPattern = /^sha256:[0-9a-f]{64}$/;
  if (!digestPattern.test(marker.profileDigest)
    || !digestPattern.test(marker.sourceGraphDigest)
    || !digestPattern.test(marker.workspaceDigest)) {
    throw new Error('generated ProductWorkspace source graph lock has an invalid digest.');
  }
  const canonicalEntries = marker.entries.map((entry) => ({
    path:entry.path,sha256:entry.sha256,size:entry.size,
  }));
  const sourceGraphDigest = sha256(JSON.stringify({
    schemaVersion:marker.schemaVersion,entries:canonicalEntries,
  }));
  if (sourceGraphDigest !== marker.sourceGraphDigest) {
    throw new Error('generated ProductWorkspace source graph digest does not match its entries.');
  }
  const workspaceDigest = sha256(JSON.stringify({
    profileDigest:marker.profileDigest,sourceGraphDigest:marker.sourceGraphDigest,
  }));
  if (workspaceDigest !== marker.workspaceDigest
    || basename(workspace) !== marker.workspaceDigest.slice('sha256:'.length)
    || basename(dirname(workspace)) !== marker.productId) {
    throw new Error('generated ProductWorkspace path does not match its workspace digest.');
  }
  const generatedEntry = marker.entries.find((entry) => entry.path === '@generated/web/profile-entry.tsx');
  const entryContent = readFileSync(entryPath);
  if (!generatedEntry || generatedEntry.size !== entryContent.byteLength
    || generatedEntry.sha256 !== sha256(entryContent)) {
    throw new Error('generated ProductWorkspace Web entry does not match its source graph lock.');
  }
}

type SourceGraphLock = {
  schemaVersion:'xgc2.product-source-graph/v1';
  productId:string;
  target:'core';
  profileDigest:string;
  sourceGraphDigest:string;
  workspaceDigest:string;
  entries:{ path:string;sha256:string;size:number }[];
};

function isSourceGraphLock(value:unknown):value is SourceGraphLock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string,unknown>;
  if (Object.keys(record).sort().join(',') !== [
    'entries','productId','profileDigest','schemaVersion','sourceGraphDigest','target','workspaceDigest',
  ].sort().join(',')) return false;
  return record.schemaVersion === 'xgc2.product-source-graph/v1'
    && typeof record.productId === 'string'
    && record.target === 'core'
    && typeof record.profileDigest === 'string'
    && typeof record.sourceGraphDigest === 'string'
    && typeof record.workspaceDigest === 'string'
    && Array.isArray(record.entries)
    && record.entries.length > 0
    && record.entries.every((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const item = entry as Record<string,unknown>;
      return Object.keys(item).sort().join(',') === 'path,sha256,size'
        && typeof item.path === 'string'
        && typeof item.sha256 === 'string'
        && Number.isSafeInteger(item.size)
        && Number(item.size) >= 0;
    });
}

function sha256(content:string|NodeJS.ArrayBufferView) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

const webMetafilePath = parseXgcWebMetafilePath();
const webDevServerPort = parseXgcWebDevServerPort();

export default defineConfig({
  plugins: [
    react(),
    markPromptHerdrBridgePlugin(),
    ...(webMetafilePath ? [finalModuleProvenancePlugin(webMetafilePath)] : []),
  ],
  resolve: {
    // Product profile entries live under core-xgc/.xgc-products rather than
    // beneath web/. Resolve their JSX runtime and icon imports from this Web
    // project root instead of searching the generated workspace ancestors.
    dedupe: ['react','react-dom','lucide-react'],
    alias: [
      { find: '#xgc-profile', replacement: productWebCompositionModulePath() },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: webDevServerPort,
    strictPort: true,
    fs: {
      // Generated product profiles live alongside the Web workspace.
      allow: ['..'],
    },
    // Pin HMR so the browser always gets a valid ws://127.0.0.1:5173 URL.
    // Without this, Vite 7 can inject null host/port and the client throws
    // TypeError: Invalid URL in transformWebSocketUrl / createConnection.
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: webDevServerPort,
      clientPort: webDevServerPort,
    },
    watch: {
      // Avoid ENOSPC when fs.inotify.max_user_watches is low (common on hosts
      // without raised sysctl). Opt out with VITE_USE_POLLING=0.
      usePolling: process.env.VITE_USE_POLLING !== '0',
      ignored: ['**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
        xfwd: true,
        ws: true,
        rewriteWsOrigin: false,
        configure: configureAPIProxy,
      },
      '/assets': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: webDevServerPort,
    strictPort: true,
  },
});
