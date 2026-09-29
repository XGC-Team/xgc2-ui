import { lazy,Suspense,useEffect } from 'react';
import {
  ProductWebCompositionProvider,
  type ProductWebComposition,
} from '../shared/productWebComposition';
import { RouteReadyProvider } from '../shared/routeReady';
import { probeOperatorControlSession } from '../domains/operatorAccess/operatorAccessPublic';
import { dismissProductWebBootstrapStatus } from './productWebBootstrap';

const AccessEntryPage = lazy(() => import('../domains/access/entry/AccessEntryPage').then((module) => ({ default: module.AccessEntryPage })));
const App = lazy(() => import('../App').then((module) => ({ default: module.App })));
const OperatorPairPage = lazy(() => import('../domains/operatorAccess/operatorAccessPublic').then((module) => ({ default: module.OperatorPairPage })));

export function ProductWebEntry({ composition }: { composition: ProductWebComposition }) {
  // A new operator device pairing through a one-time link keeps its own page.
  // Every other path mounts the station directly: viewing never requires an
  // operator session; only robot motion/control verifies one, inline.
  return <Suspense fallback={null}>
    <RouteReadyProvider onReady={dismissProductWebBootstrapStatus}>
      {window.location.pathname === '/operator-pair' ? <OperatorPairPage />
        : <StationProductWebEntry composition={composition} />}
    </RouteReadyProvider>
  </Suspense>;
}

function StationProductWebEntry({ composition }: { composition: ProductWebComposition }) {
  const galleryRequested = new URLSearchParams(window.location.search).get('xgc-control-gallery') === '1';
  // Shared access listeners serve this SPA under /access-entry; credentials
  // arrive in the URL fragment (the listener ingress rejects query strings).
  const accessEntryRequested = window.location.pathname === '/access-entry';
  const ControlGallery = composition.developer.controlGallery;
  useEffect(() => {
    if (accessEntryRequested) return;
    // Confirm the request transport in the background for an already signed-in
    // browser; a failure here is 'unknown' and never affects the shell.
    probeOperatorControlSession();
    const preloaders = new Set([
      ...composition.routes.map((route) => route.preload),
      ...composition.routes.flatMap((route) => (
        Object.values(route.sectionRoutes ?? {}).map((section) => section.preload)
      )),
    ].filter((preload): preload is NonNullable<typeof preload> => Boolean(preload)));
    preloaders.forEach((preload) => { void preload().catch(() => undefined); });
  }, [composition,accessEntryRequested]);

  return (
    <ProductWebCompositionProvider composition={composition}>
      {accessEntryRequested ? (
        <AccessEntryPage />
      ) : galleryRequested && ControlGallery ? (
        <Suspense fallback={null}><ControlGallery /></Suspense>
      ) : <App />}
    </ProductWebCompositionProvider>
  );
}
