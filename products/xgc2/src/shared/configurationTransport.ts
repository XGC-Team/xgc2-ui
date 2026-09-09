type IntentIdentity = {
  requestId?: string;
  idempotencyKey?: string;
};

export async function configurationCollection<T>(response: Promise<unknown>, path: string): Promise<T[]> {
  const value = await response;
  if (!Array.isArray(value)) throw new Error(`Expected an array from ${path}`);
  return value as T[];
}

export function configurationMutationInit<T extends IntentIdentity & object>(input: T) {
  const requestId = input.requestId?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  return {
    headers: {
      ...(requestId ? { 'X-Request-ID': requestId } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(input),
  };
}
