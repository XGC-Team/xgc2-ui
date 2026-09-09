export function objectWithKnownKeys(value: unknown, keys: Set<string>, path: string): Record<string,unknown> {
  if (!isObject(value)) throw invalidExecution(path, 'must be an object');
  const unknown = Object.keys(value).find((key) => !keys.has(key));
  if (unknown) throw invalidExecution(path, `contains unknown property "${unknown}"`);
  return value;
}

export function optionalStringField<T extends string>(value: Record<string,unknown>, key: T, path: string): Partial<Record<T,string>> {
  if (value[key] === undefined) return {};
  return { [key]: requiredString(value[key], `${path}.${key}`) } as Partial<Record<T,string>>;
}

export function optionalNonNegativeIntegerField<T extends string>(
  value: Record<string,unknown>, key: T, path: string,
): Partial<Record<T,number>> {
  if (value[key] === undefined) return {};
  return { [key]: nonNegativeInteger(value[key], `${path}.${key}`) } as Partial<Record<T,number>>;
}

export function optionalString(value: Record<string,unknown>, key: string, path: string) {
  return value[key] === undefined ? undefined : requiredString(value[key], `${path}.${key}`);
}

export function optionalBoundedString(
  value: Record<string,unknown>,
  key: string,
  path: string,
  maximumBytes: number,
) {
  return value[key] === undefined ? undefined : boundedString(value[key], `${path}.${key}`, maximumBytes);
}

export function optionalPositiveInteger(value: Record<string,unknown>, key: string, path: string) {
  return value[key] === undefined ? undefined : positiveInteger(value[key], `${path}.${key}`);
}

export function optionalNonNegativeIntegerValue(value: Record<string,unknown>, key: string, path: string) {
  return value[key] === undefined ? undefined : nonNegativeInteger(value[key], `${path}.${key}`);
}

export function optionalTimestampValue(value: Record<string,unknown>, key: string, path: string) {
  return value[key] === undefined ? undefined : requiredTimestamp(value[key], `${path}.${key}`);
}

export function optionalDefined<T extends string,V>(key: T, value: V | undefined): Partial<Record<T,V>> {
  return value === undefined ? {} : { [key]: value } as Partial<Record<T,V>>;
}

export function digest(value: unknown, path: string, prefixed: boolean) {
  const result = requiredString(value, path);
  const pattern = prefixed ? /^sha256:[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/;
  if (!pattern.test(result)) throw invalidExecution(path, 'must be a canonical SHA-256 digest');
  return result;
}

export function enumField<T extends string>(value: unknown, values: ReadonlySet<T>, path: string): T {
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw invalidExecution(path, `has unsupported value "${String(value ?? '')}"`);
  }
  return value as T;
}

export function boundedString(value: unknown, path: string, maximumBytes: number) {
  const result = requiredString(value, path);
  if (new TextEncoder().encode(result).length > maximumBytes) {
    throw invalidExecution(path, `must not exceed ${maximumBytes} UTF-8 bytes`);
  }
  return result;
}

export function requiredTimestamp(value: unknown, path: string) {
  const timestamp = requiredString(value, path);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(timestamp);
  const millisecondTimestamp = match
    ? `${match[1]}.${(match[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`
    : '';
  const parsed = millisecondTimestamp ? new Date(millisecondTimestamp) : undefined;
  if (!match || !parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millisecondTimestamp) {
    throw invalidExecution(path, 'must be a canonical UTC RFC3339Nano timestamp');
  }
  return timestamp;
}

export function compareTimestamps(left: string, right: string) {
  return timestampSortKey(left).localeCompare(timestampSortKey(right));
}

export function timestampSortKey(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value)!;
  return `${match[1]}.${(match[2] ?? '').padEnd(9, '0')}Z`;
}

export function requiredString(value: unknown, path: string) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw invalidExecution(path, 'must be a non-empty canonical string');
  }
  return value;
}

export function positiveInteger(value: unknown, path: string) {
  const number = nonNegativeInteger(value, path);
  if (number < 1) throw invalidExecution(path, 'must be a positive integer');
  return number;
}

export function nonNegativeInteger(value: unknown, path: string) {
  if (!Number.isInteger(value) || (value as number) < 0) throw invalidExecution(path, 'must be a non-negative integer');
  return value as number;
}

export function isObject(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function invalidExecution(path: string, reason: string) {
  return new Error(`Invalid Automation execution response at ${path}: ${reason}.`);
}
