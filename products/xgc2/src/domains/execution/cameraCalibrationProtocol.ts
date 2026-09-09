/** Shared response primitives for the intrinsic and extrinsic calibration APIs. */
export function createCameraCalibrationProtocol(responseName: string) {
  function invalid(message: string): never {
    throw new Error(`Invalid ${responseName} response: ${message}`);
  }

  function record(value: unknown, path: string): Record<string,unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${path} must be an object`);
    return value as Record<string,unknown>;
  }

  function array(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) invalid(`${path} must be an array`);
    return value;
  }

  function string(value: unknown, path: string): string {
    if (typeof value !== 'string') invalid(`${path} must be a string`);
    return value;
  }

  function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') invalid(`${path} must be a boolean`);
    return value;
  }

  function number(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${path} must be a finite number`);
    return value;
  }

  function integer(value: unknown, path: string): number {
    const result = number(value, path);
    if (!Number.isInteger(result)) invalid(`${path} must be an integer`);
    return result;
  }

  function nonNegativeInteger(value: unknown, path: string): number {
    const result = integer(value, path);
    if (result < 0) invalid(`${path} must be non-negative`);
    return result;
  }

  function positiveInteger(value: unknown, path: string): number {
    const result = integer(value, path);
    if (result <= 0) invalid(`${path} must be positive`);
    return result;
  }

  function tuple3(value: unknown, path: string): readonly [number,number,number] {
    const values = array(value, path);
    if (values.length !== 3) invalid(`${path} must contain three numbers`);
    return [number(values[0], `${path}[0]`),number(values[1], `${path}[1]`),number(values[2], `${path}[2]`)];
  }

  return {
    array,
    boolean,
    integer,
    invalid,
    nonNegativeInteger,
    number,
    positiveInteger,
    record,
    string,
    tuple3,
  };
}
