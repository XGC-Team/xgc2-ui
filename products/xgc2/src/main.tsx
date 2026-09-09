import { initializeSkin } from '@xgc2/ui-react';
import { createElement } from 'react';
import './styles/vendor.css';
import './styles/app.css';
import './shared/WorkspaceBusyOverlay.css';
import type {
  ProductWebEntry as ProductWebEntryComponent,
  productWebComposition as productWebCompositionValue,
} from '#xgc-profile';
import { mountProductWebApp,PRODUCT_WEB_BOOTSTRAP_ROLE } from './app/productWebBootstrap';
import { xgcSkinStorageOptions } from './app/skin';
import { initializeTextSelectionPreference } from './shared/preferences/textSelectionPreference';

type ProductProfile = {
  ProductWebEntry: typeof ProductWebEntryComponent;
  productWebComposition: typeof productWebCompositionValue;
};
type ProductWebRootContainer = HTMLElement & {
  __xgcProductWebBootstrap?: ProductWebBootstrapState;
};
type ProductWebBootstrapState = {
  status: 'idle' | 'pending' | 'mounted' | 'failed';
  pending?: Promise<void>;
  error?: unknown;
};

initializeSkin(xgcSkinStorageOptions);
initializeTextSelectionPreference();

const container = document.getElementById('root') as ProductWebRootContainer | null;
if (!container) throw new Error('Product Web root container is missing.');
const rootContainer = container;

const bootstrapState = rootContainer.__xgcProductWebBootstrap ?? { status: 'idle' };
rootContainer.__xgcProductWebBootstrap = bootstrapState;

function startProductWebBootstrap(): Promise<void> {
  if (bootstrapState.status === 'mounted') return Promise.resolve();
  if (bootstrapState.pending) return bootstrapState.pending;

  bootstrapState.status = 'pending';
  bootstrapState.error = undefined;
  showBootstrapStatus('loading');

  const attempt = loadProductProfileWithRetry()
    .then(({ ProductWebEntry,productWebComposition }: ProductProfile) => {
      mountProductWebApp(rootContainer,createElement(ProductWebEntry,{ composition: productWebComposition }));
      bootstrapState.status = 'mounted';
    })
    .catch((error: unknown) => {
      bootstrapState.status = 'failed';
      bootstrapState.error = error;
      showBootstrapStatus('error',() => { void startProductWebBootstrap().catch(() => undefined); });
      throw error;
    })
    .finally(() => {
      if (bootstrapState.pending === attempt) bootstrapState.pending = undefined;
    });
  bootstrapState.pending = attempt;
  return attempt;
}

async function loadProductProfileWithRetry(): Promise<ProductProfile> {
  try {
    return await import('#xgc-profile');
  } catch (error) {
    if (!isRetryableModuleLoadError(error)) throw error;
    const failedModuleUrl = failedModuleUrlFromError(error);
    if (!failedModuleUrl) return import('#xgc-profile');
    return await import(/* @vite-ignore */ withRetryQuery(failedModuleUrl)) as ProductProfile;
  }
}

function isRetryableModuleLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return candidate.name === 'AbortError'
    || /ERR_ABORTED|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

function failedModuleUrlFromError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return undefined;
  const match = message.match(/https?:\/\/[^\s)]+/);
  if (!match) return undefined;
  try {
    const url = new URL(match[0],window.location.href);
    return url.origin === window.location.origin ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function withRetryQuery(moduleUrl: string): string {
  const url = new URL(moduleUrl,window.location.href);
  url.searchParams.set('xgc-bootstrap-retry',String(Date.now()));
  return url.href;
}

function showBootstrapStatus(kind: 'loading' | 'error',onRetry?: () => void) {
  let status = document.querySelector<HTMLElement>(`[data-xgc-role="${PRODUCT_WEB_BOOTSTRAP_ROLE}"]`);
  if (!status) {
    status = document.createElement('div');
    status.dataset.xgcRole = PRODUCT_WEB_BOOTSTRAP_ROLE;
    document.body.insertBefore(status,rootContainer);
  }
  status.replaceChildren();
  status.setAttribute('role',kind === 'error' ? 'alert' : 'status');
  status.setAttribute('aria-live','polite');
  if (kind === 'loading') {
    status.setAttribute('aria-busy', 'true');
    status.setAttribute('aria-label', 'Loading workspace');
    const ring = document.createElement('span');
    ring.className = 'xgc-workspace-busy-ring';
    ring.setAttribute('aria-hidden', 'true');
    status.append(ring);
    return;
  }
  const message = document.createElement('p');
  message.textContent = 'The application could not load this view.';
  status.append(message);
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.addEventListener('click',() => onRetry?.(),{ once: true });
  status.append(retry);
}

void startProductWebBootstrap().catch(() => undefined);
