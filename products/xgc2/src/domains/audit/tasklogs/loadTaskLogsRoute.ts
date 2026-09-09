import { createPreloadableProductRoute } from '../../../shared/productWebComposition';

export const loadTaskLogsRoute = () => import('./TaskLogsRoute')
  .then((module) => ({ default: module.TaskLogsRoute }));

export const taskLogsRoute = createPreloadableProductRoute(loadTaskLogsRoute);
