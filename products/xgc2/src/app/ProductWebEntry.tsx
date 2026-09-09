import { Suspense,useEffect } from 'react';
import { App } from '../App';
import {
  ProductWebCompositionProvider,
  type ProductWebComposition,
} from '../shared/productWebComposition';

export function ProductWebEntry({ composition }: { composition: ProductWebComposition }) {
  const galleryRequested = new URLSearchParams(window.location.search).get('xgc-control-gallery') === '1';
  const ControlGallery = composition.developer.controlGallery;
  useEffect(() => {
    const preloaders = new Set([
      ...composition.routes.map((route) => route.preload),
      ...composition.routes.flatMap((route) => (
        Object.values(route.sectionRoutes ?? {}).map((section) => section.preload)
      )),
    ].filter((preload): preload is NonNullable<typeof preload> => Boolean(preload)));
    preloaders.forEach((preload) => { void preload().catch(() => undefined); });
  }, [composition]);

  return (
    <ProductWebCompositionProvider composition={composition}>
      {galleryRequested && ControlGallery ? (
        <Suspense fallback={null}><ControlGallery /></Suspense>
      ) : <App />}
    </ProductWebCompositionProvider>
  );
}
