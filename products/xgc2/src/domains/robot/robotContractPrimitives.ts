const canonicalRobotOperationID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const rfc3339DateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validRobotOperationID(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 128
    && canonicalRobotOperationID.test(value);
}

export function validDateTime(value: unknown): value is string {
  return typeof value === 'string'
    && rfc3339DateTime.test(value)
    && Number.isFinite(Date.parse(value));
}

export function safeInteger(value: unknown, minimum: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
