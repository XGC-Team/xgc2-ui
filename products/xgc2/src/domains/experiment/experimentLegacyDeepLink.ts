import type { ExperimentDocument } from './experimentModel';

// These UUIDs identify the last pre-v93 local-fleet development epoch. They
// are navigation aliases only: Core reads, writes, and Runs always use the
// current ordinary Experiment resource identity.
const LEGACY_DEV_FIXTURE_NAMES: Readonly<Record<string,string>> = Object.freeze({
  '11e9d34e-a4b7-442c-8743-f62b26df3f24': '6 PX4 multirotors experiment',
  '25dddbed-7185-4966-8a87-f732766f9d1b': '4 Scout Mini vehicles experiment',
  'e9d9e48d-c75d-43c5-a5c3-2bac91b1cc96': '5 PX4 multirotors + 2 Mecanum UGVs experiment',
  'c3c91076-e743-49f8-a088-871bbb272f3c': '6 PX4 multirotors + 4 Scout Mini vehicles experiment',
  '853c85fa-cbb1-41d9-b7d6-cdbb87e28977': 'Camera intrinsic calibration experiment',
});

export function resolveLegacyDevFixtureDeepLink(
  legacyResourceId: string,
  dashboardId: string,
  experiments: readonly ExperimentDocument[],
) {
  const expectedName = LEGACY_DEV_FIXTURE_NAMES[legacyResourceId];
  if (!expectedName || experiments.some((item) => item.head.resourceId === legacyResourceId)) return '';
  const matches = experiments.filter((item) => (
    item.head.system !== true
    && !item.head.systemKey
    && !item.head.originResourceId
    && item.spec.name === expectedName
    && item.spec.tags.includes('devfixture')
    && item.spec.dashboards.some((dashboard) => dashboard.id === dashboardId)
  ));
  return matches.length === 1 ? matches[0].head.resourceId : '';
}
