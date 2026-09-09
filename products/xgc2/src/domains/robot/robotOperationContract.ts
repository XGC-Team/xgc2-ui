import {
  isRecord,
  nonEmptyString,
  safeInteger,
  validDateTime,
  validRobotOperationID,
} from './robotContractPrimitives';
import type { RobotOperation } from './robotRuntimeModel';

export function isRobotOperation(
  value: unknown,
  targetId: string,
  runId: string,
): value is RobotOperation {
  if (!isRecord(value)) return false;
  const operation = value as Partial<RobotOperation>;
  return nonEmptyString(operation.id)
    && operation.targetId === targetId
    && operation.runId === runId
    && nonEmptyString(operation.experimentId)
    && nonEmptyString(operation.robotId)
    && validRobotOperationID(operation.operation)
    && isRecord(operation.parameters)
    && isRobotOperationPhase(operation.phase)
    && validRobotOperationAttempts(operation.attempt, operation.maxAttempts)
    && validRobotOperationFailure(operation.phase, operation.failureClass)
    && (operation.resultCode === undefined || typeof operation.resultCode === 'string')
    && (operation.detail === undefined || typeof operation.detail === 'string')
    && safeInteger(operation.connectionEpoch, 1)
    && safeInteger(operation.revision, 1)
    && validDateTime(operation.createdAt)
    && validDateTime(operation.updatedAt);
}

function isRobotOperationPhase(value: unknown): value is RobotOperation['phase'] {
  return value === 'accepted'
    || value === 'started'
    || value === 'retry_pending'
    || value === 'succeeded'
    || value === 'rejected'
    || value === 'failed'
    || value === 'expired'
    || value === 'uncertain';
}

function validRobotOperationAttempts(attempt: unknown, maxAttempts: unknown) {
  return typeof attempt === 'number'
    && typeof maxAttempts === 'number'
    && Number.isSafeInteger(attempt)
    && Number.isSafeInteger(maxAttempts)
    && attempt >= 1
    && maxAttempts >= attempt
    && maxAttempts <= 32;
}

function validRobotOperationFailure(phase: unknown, failureClass: unknown) {
  switch (phase) {
    case 'accepted':
    case 'started':
    case 'succeeded':
      return failureClass === undefined;
    case 'retry_pending':
      return failureClass === 'transient' || failureClass === 'resource-exhausted';
    case 'rejected':
      return failureClass === 'rejected' || failureClass === 'canceled';
    case 'failed':
      return failureClass === 'permanent' || failureClass === 'transient'
        || failureClass === 'resource-exhausted';
    case 'expired':
      return failureClass === 'deadline';
    case 'uncertain':
      return failureClass === 'uncertain' || failureClass === 'canceled';
    default:
      return false;
  }
}
