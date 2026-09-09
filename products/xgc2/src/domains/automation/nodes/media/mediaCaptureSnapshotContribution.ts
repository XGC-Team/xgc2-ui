import { Camera } from 'lucide-react';
import type { AutomationNodeCatalogEntry } from '../../automationDefinitionContracts';
import {
  defineAutomationNodeContributionIdentity,
  type AutomationNodeWebContribution,
} from '../automationNodeWebComposition';

export const MEDIA_CAPTURE_SNAPSHOT_KIND = 'media.capture-snapshot';
export const MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION = 1;

const mediaCaptureSnapshotIdentity = defineAutomationNodeContributionIdentity(
  'automation.nodes.media.capture-snapshot',
);

/**
 * Validate that the authored catalog entry freezes a non-empty sourceId enum.
 * Selection remains schema-driven; this only fail-closes empty catalogs.
 */
export function validateMediaCaptureSnapshotCatalogEntry(
  entry: AutomationNodeCatalogEntry,
): string | null {
  if (entry.kind !== MEDIA_CAPTURE_SNAPSHOT_KIND) {
    return `expected kind ${MEDIA_CAPTURE_SNAPSHOT_KIND}, got ${entry.kind}`;
  }
  const properties = entry.parameterSchema?.properties as Record<string, unknown> | undefined;
  const sourceId = properties?.sourceId as { enum?: unknown } | undefined;
  const values = sourceId?.enum;
  if (!Array.isArray(values) || values.length === 0) {
    return 'media.capture-snapshot catalog sourceId.enum must be a non-empty array';
  }
  if (!values.every((value) => typeof value === 'string' && value.trim().length > 0)) {
    return 'media.capture-snapshot catalog sourceId.enum must contain non-empty strings';
  }
  return null;
}

/** Static Media capture-snapshot leaf owned inside Automation.nodes.media. */
export const mediaCaptureSnapshotContribution: AutomationNodeWebContribution = Object.freeze({
  identity: mediaCaptureSnapshotIdentity,
  kind: MEDIA_CAPTURE_SNAPSHOT_KIND,
  typeVersion: MEDIA_CAPTURE_SNAPSHOT_TYPE_VERSION,
  library: Object.freeze({
    label: 'Capture camera snapshot',
    description: 'Capture one owner-trusted camera snapshot and store an immutable evidence bundle.',
    category: 'media',
    categoryDescription: 'Capture owner-trusted camera snapshots as immutable evidence',
    keywords: Object.freeze([
      'media', 'camera', 'snapshot', 'capture', 'evidence', 'image', 'jpeg', 'png',
      '相机', '快照', '截图', '证据',
    ]),
  }),
  visual: Object.freeze({ icon: Camera }),
  editor: Object.freeze({
    validateCatalogEntry: validateMediaCaptureSnapshotCatalogEntry,
  }),
});
