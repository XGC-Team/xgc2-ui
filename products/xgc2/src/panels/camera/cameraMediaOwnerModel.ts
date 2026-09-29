import type { ProcessInstance } from '../../domains/execution/executionPublic';
import { processReady } from '../../domains/experiment/experimentPublic';
import type { PanelWorkflowRuntimeProjection } from '../types';
import { cameraWorkflowDescendantRunIds } from './cameraIntrinsicWorkspaceModel';

/** Public Process identity joined to the exact workflow's published roster. */
export function cameraMediaOwnerCandidates(
  instances: readonly ProcessInstance[],runtime: PanelWorkflowRuntimeProjection | undefined,anchorRunId: string,
) {
  if (!runtime || !anchorRunId) return [];
  const owners = cameraWorkflowDescendantRunIds(runtime,anchorRunId);
  return instances.filter((instance) => instance.targetId === runtime.targetId
    && instance.ownerType === 'orchestration-run' && owners.has(instance.ownerId)
    && instance.definitionId === 'xgc-media-edge' && processReady(instance));
}

export function cameraMediaOwnerForSource(
  candidates: readonly ProcessInstance[],runtime: PanelWorkflowRuntimeProjection | undefined,sourceId: string,
) {
  if (!runtime || !sourceId) return undefined;
  const matches = candidates.filter((instance) => {
    const detail = runtime.runDetailsById[instance.ownerId];
    if (detail?.run?.id !== instance.ownerId || detail.error) return false;
    const ref = instance.parameters.sourceRosterArtifactRef;
    const digest = instance.parameters.sourceRosterDigest;
    if (typeof ref !== 'string' || !ref || typeof digest !== 'string' || !digest) return false;
    return detail.invocations.some((invocation) => invocation.runId === instance.ownerId
      && invocation.kind === 'media.materialize-source-roster'
      && invocation.outputRefs.some((output) => {
        if (output.runId !== instance.ownerId || output.invocationId !== invocation.id) return false;
        const value = record(output.value);
        if (value?.sourceRosterArtifactRef !== ref || value.sourceRosterDigest !== digest
          || typeof value.sourceRosterContent !== 'string' || value.sourceRosterContent.length > (1 << 20)) return false;
        try {
          const roster = record(JSON.parse(value.sourceRosterContent));
          return Array.isArray(roster?.sources)
            && roster.sources.some((source: unknown) => record(source)?.id === sourceId);
        } catch { return false; }
      }));
  });
  // A URL, timestamp or first array item cannot disambiguate two owners.
  return matches.length === 1 ? matches[0] : undefined;
}

function record(value: unknown): Record<string,unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string,unknown> : undefined;
}
