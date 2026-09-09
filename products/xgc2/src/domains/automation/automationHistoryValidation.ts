export function objectWithKnownKeys(value: unknown, keys: Set<string>, path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidHistory(path, 'must be an object');
  const object = value as Record<string,unknown>;
  const unknown = Object.keys(object).find((key) => !keys.has(key));
  if (unknown) throw invalidHistory(path, `contains unknown property "${unknown}"`);
  return object;
}

export function requiredCanonicalString(value: unknown, path: string) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw invalidHistory(path, 'must be a non-empty canonical string');
  }
  return value;
}

export function requiredTimestamp(value: unknown, path: string) {
  const timestamp = requiredCanonicalString(value, path);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(timestamp);
  const millisecondTimestamp = match
    ? `${match[1]}.${(match[2] ?? '').padEnd(3, '0').slice(0, 3)}Z`
    : '';
  const parsed = millisecondTimestamp ? new Date(millisecondTimestamp) : undefined;
  if (!match || !parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millisecondTimestamp) {
    throw invalidHistory(path, 'must be a canonical UTC RFC3339Nano timestamp');
  }
  return `${match[1]}.${(match[2] ?? '').padEnd(9, '0')}Z`;
}

export function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function requiredBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') throw invalidHistory(path, 'must be a boolean');
  return value;
}

export function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, path: string): T {
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw invalidHistory(path, `has unsupported value "${String(value ?? '')}"`);
  }
  return value as T;
}

export function nonNegativeInteger(value: unknown, path: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidHistory(path, 'must be a non-negative integer');
  return value as number;
}

export function positiveInteger(value: unknown, path: string) {
  const integer = nonNegativeInteger(value, path);
  if (integer === 0) throw invalidHistory(path, 'must be a positive integer');
  return integer;
}

export function optionalCanonicalString<T extends string>(
  value: Record<string,unknown>,
  key: T,
  path: string,
): Partial<Record<T,string>> {
  if (value[key] === undefined) return {};
  return { [key]: requiredCanonicalString(value[key], `${path}.${key}`) } as Partial<Record<T,string>>;
}

export function optionalTimestamp<T extends string>(
  value: Record<string,unknown>,
  key: T,
  path: string,
): Partial<Record<T,string>> {
  if (value[key] === undefined) return {};
  return { [key]: requiredTimestamp(value[key], `${path}.${key}`) } as Partial<Record<T,string>>;
}

export function optionalPositiveInteger<T extends string>(
  value: Record<string,unknown>,
  key: T,
  path: string,
): Partial<Record<T,number>> {
  if (value[key] === undefined) return {};
  return { [key]: positiveInteger(value[key], `${path}.${key}`) } as Partial<Record<T,number>>;
}

export function optionalNonNegativeInteger<T extends string>(
  value: Record<string,unknown>,
  key: T,
  path: string,
): Partial<Record<T,number>> {
  if (value[key] === undefined) return {};
  return { [key]: nonNegativeInteger(value[key], `${path}.${key}`) } as Partial<Record<T,number>>;
}

export function optionalUnavailableSources(value: unknown, path: string): 'agent'[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== 'agent') {
    throw invalidHistory(path, 'must contain only the unavailable agent source');
  }
  return ['agent'];
}

export function invalidHistory(path: string, message: string) {
  return new Error(`Invalid Automation execution history at ${path}: ${message}.`);
}
