import type { ExperimentDashboard,ExperimentDocument } from '../experimentModel';
import { normalizeExperimentDashboards } from '../experimentModel';

export function experimentWithDashboards(
  document: ExperimentDocument,
  dashboards: ExperimentDashboard[],
): ExperimentDocument {
  return {
    ...document,
    spec: {
      ...document.spec,
      dashboards: normalizeExperimentDashboards(dashboards),
    },
  };
}
