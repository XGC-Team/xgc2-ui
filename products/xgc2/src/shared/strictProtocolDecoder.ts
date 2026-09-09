export type ProtocolObject = Record<string,unknown>;

export function protocolObject(value: unknown,path: string,allowedFields: readonly string[]): ProtocolObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Protocol error: ${path} must be an object.`);
  }
  const record = value as ProtocolObject;
  const unknownField = Object.keys(record).find((field) => !allowedFields.includes(field));
  if (unknownField) throw new Error(`Protocol error: ${path} contains unknown field "${unknownField}".`);
  return record;
}

export function protocolField(record: ProtocolObject,key: string,path: string): unknown {
  if (!Object.hasOwn(record,key)) throw new Error(`Protocol error: ${path}.${key} is required.`);
  return record[key];
}

export function protocolString(value: unknown,path: string): string {
  if (typeof value !== 'string') throw new Error(`Protocol error: ${path} must be a string.`);
  return value;
}

export function protocolRequiredString(record: ProtocolObject,key: string,path: string): string {
  return protocolString(protocolField(record,key,path),`${path}.${key}`);
}

export function protocolOptionalString(record: ProtocolObject,key: string,path: string): string | undefined {
  return Object.hasOwn(record,key) ? protocolString(record[key],`${path}.${key}`) : undefined;
}

export function protocolBoolean(value: unknown,path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Protocol error: ${path} must be a boolean.`);
  return value;
}

export function protocolRequiredBoolean(record: ProtocolObject,key: string,path: string): boolean {
  return protocolBoolean(protocolField(record,key,path),`${path}.${key}`);
}

export function protocolOptionalBoolean(record: ProtocolObject,key: string,path: string): boolean | undefined {
  return Object.hasOwn(record,key) ? protocolBoolean(record[key],`${path}.${key}`) : undefined;
}

export function protocolFiniteNumber(value: unknown,path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Protocol error: ${path} must be a finite number.`);
  }
  return value;
}

export function protocolRequiredNumber(record: ProtocolObject,key: string,path: string): number {
  return protocolFiniteNumber(protocolField(record,key,path),`${path}.${key}`);
}

export function protocolInteger(value: unknown,path: string): number {
  const number = protocolFiniteNumber(value,path);
  if (!Number.isInteger(number)) throw new Error(`Protocol error: ${path} must be an integer.`);
  return number;
}

export function protocolRequiredInteger(record: ProtocolObject,key: string,path: string): number {
  return protocolInteger(protocolField(record,key,path),`${path}.${key}`);
}

export function protocolArray(value: unknown,path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Protocol error: ${path} must be an array.`);
  return value;
}

export function protocolRequiredArray(record: ProtocolObject,key: string,path: string): unknown[] {
  return protocolArray(protocolField(record,key,path),`${path}.${key}`);
}

export function protocolStringArray(value: unknown,path: string): string[] {
  const values = protocolArray(value,path);
  const invalidIndex = values.findIndex((item) => typeof item !== 'string');
  if (invalidIndex >= 0) throw new Error(`Protocol error: ${path}[${invalidIndex}] must be a string.`);
  return values as string[];
}

export function protocolRequiredStringArray(record: ProtocolObject,key: string,path: string): string[] {
  return protocolStringArray(protocolField(record,key,path),`${path}.${key}`);
}

export function protocolEnum<const T extends string>(value: unknown,values: readonly T[],path: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`Protocol error: ${path} must be one of ${values.map((item) => `"${item}"`).join(', ')}.`);
  }
  return value as T;
}
