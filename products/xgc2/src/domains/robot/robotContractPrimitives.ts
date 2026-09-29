const canonicalRobotOperationID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const rfc3339DateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validRobotOperationID(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 128
    && canonicalRobotOperationID.test(value);
}

// A coalesced telemetry patch repeats the same instants: every changed channel
// of a robot carries that robot's authority deadlines, and each channel's own
// times are read by validation, staging and freshness. Parse each distinct
// string once; the bounded table is dropped whole when it fills.
type ParsedInstant = { rfc3339: boolean;time: number };
const parsedInstants = new Map<string,ParsedInstant>();
const parsedInstantLimit = 4096;

function parsedInstant(value: string) {
  let parsed = parsedInstants.get(value);
  if (!parsed) {
    parsed = { rfc3339: rfc3339DateTime.test(value),time: Date.parse(value) };
    if (parsedInstants.size >= parsedInstantLimit) parsedInstants.clear();
    parsedInstants.set(value, parsed);
  }
  return parsed;
}

/** Date.parse(value), memoized per distinct string. */
export function parseInstant(value: string) {
  return parsedInstant(value).time;
}

export function validDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = parsedInstant(value);
  return parsed.rfc3339 && Number.isFinite(parsed.time);
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
