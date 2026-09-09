import { createPreloadableProductRoute } from '../../shared/productWebComposition';

export const loadAuditRoute = () => import('../audit/AuditRoute')
  .then((module) => ({ default: module.AuditRoute }));

export const auditRoute = createPreloadableProductRoute(loadAuditRoute);

// Audit is tiny and frequently opened from the operations rail. Preload it as
// the composition starts so the first click never enters the Suspense throttle.
void auditRoute.preload().catch(() => undefined);
