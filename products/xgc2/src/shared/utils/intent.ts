export function createUserIntentId(scope: string, sourceId = 'global') {
  const suffix = randomIntentSuffix();
  const prefix = deriveIntentKey(safeIntentPart(scope),safeIntentPart(sourceId));
  // Core request IDs are bounded to 128 ASCII bytes. Keep the complete random
  // suffix so shortening the descriptive prefix cannot merge user intents.
  return `${prefix.slice(0,127 - suffix.length)}:${suffix}`;
}

// Mutation identifiers are HTTP header values, so they must stay short and
// ASCII-safe. User-authored names, descriptions, and tags belong in the UTF-8
// JSON body and must never be copied into these opaque transport identifiers.
export function createMutationIdentity(operation: string) {
  const requestId = createUserIntentId(operation, 'mutation');
  return { requestId,idempotencyKey: requestId };
}

export function deriveIntentKey(intentId: string, ...parts: string[]) {
  return [safeIntentPart(intentId), ...parts.map(safeIntentPart)].filter(Boolean).join(':');
}

function safeIntentPart(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function randomIntentSuffix() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
