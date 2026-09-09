import { request } from '../../api/http';
import { segment } from '../../shared/url';
import { executionTargetPath } from '../execution/executionPublic';
import {
  isRecord,
  nonEmptyString,
  safeInteger,
  validDateTime,
} from './robotContractPrimitives';
import { isRobotOperation } from './robotOperationContract';
import type { RunRobotProjection } from './robotRuntimeModel';
import { isRunRobot,runRobotWithDecodableChannels } from './robotTelemetryContract';

export async function getRunRobots(
  targetId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunRobotProjection> {
  const path = `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}/robots`;
  const projection = await (signal
    ? request<unknown>(path,{ signal })
    : request<unknown>(path));
  if (!isRunRobotProjection(projection, targetId, runId)) {
    throw new Error('Core returned an invalid run robot projection');
  }
  const robots = projection.robots.map(runRobotWithDecodableChannels);
  return robots.every((robot,index) => robot === projection.robots[index])
    ? projection
    : { ...projection,robots };
}

function isRunRobotProjection(
  value: unknown,
  targetId: string,
  runId: string,
): value is RunRobotProjection {
  if (!isRecord(value)) return false;
  const projection = value as Partial<RunRobotProjection>;
  const experimentResourceId = projection.experimentResourceId;
  const experimentCommitId = projection.experimentCommitId;
  const robotSelectionDigest = projection.robotSelectionDigest;
  const robots = projection.robots;
  const operations = projection.operations;
  const envelope = projection.targetId === targetId
    && projection.runId === runId
    && nonEmptyString(projection.streamId)
    && safeInteger(projection.projectionRevision, 0)
    && typeof projection.pending === 'boolean'
    && typeof experimentResourceId === 'string'
    && typeof experimentCommitId === 'string'
    && typeof robotSelectionDigest === 'string'
    && Array.isArray(robots)
    && Array.isArray(operations)
    && validDateTime(projection.updatedAt);
  if (!envelope) return false;
  if (projection.pending) {
    return experimentResourceId === ''
      && experimentCommitId === ''
      && robotSelectionDigest === ''
      && robots.length === 0
      && operations.length === 0;
  }
  return nonEmptyString(experimentResourceId)
    && nonEmptyString(experimentCommitId)
    && /^[a-f0-9]{64}$/.test(robotSelectionDigest)
    && robots.every(isRunRobot)
    && operations.every((operation) => isRobotOperation(operation, targetId, runId));
}
