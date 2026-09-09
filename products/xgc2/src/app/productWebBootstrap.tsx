import { createRoot,type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

export const PRODUCT_WEB_BOOTSTRAP_ROLE = 'product-web-bootstrap-status';

type ProductWebRootContainer = HTMLElement & {
  __xgcProductWebRoot?: Root;
};

export function mountProductWebApp(container: HTMLElement, application: ReactNode) {
  const ownedContainer = container as ProductWebRootContainer;
  const root = ownedContainer.__xgcProductWebRoot ?? createRoot(container);
  ownedContainer.__xgcProductWebRoot = root;
  root.render(application);
  return root;
}

/** True while the full-page bootstrap ring is still covering the first paint. */
export function productWebBootstrapIsLoading(): boolean {
  if (typeof document === 'undefined') return false;
  const node = document.querySelector(`[data-xgc-role="${PRODUCT_WEB_BOOTSTRAP_ROLE}"]`);
  return node?.getAttribute('role') === 'status';
}

export function dismissProductWebBootstrapStatus(): void {
  document.querySelector(`[data-xgc-role="${PRODUCT_WEB_BOOTSTRAP_ROLE}"]`)?.remove();
}
