const DEFAULT_MAX_DEPTH = 8;

/**
 * Value equality for immutable projection trees. Plain objects and arrays are
 * compared member by member; everything else (functions, class instances,
 * Maps) only by identity. Past maxDepth the answer is identity, so the result
 * can only err towards "changed": a consumer re-renders, it never keeps a
 * stale value.
 */
export function structuralEqual(left: unknown, right: unknown, maxDepth = DEFAULT_MAX_DEPTH): boolean {
  return equalAt(left, right, 0, maxDepth);
}

function equalAt(left: unknown, right: unknown, depth: number, maxDepth: number): boolean {
  if (Object.is(left, right)) return true;
  if (depth >= maxDepth || !isContainer(left) || !isContainer(right)) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!equalAt(left[index], right[index], depth + 1, maxDepth)) return false;
    }
    return true;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  if (keys.length !== Object.keys(rightRecord).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(rightRecord, key)) return false;
    if (!equalAt(leftRecord[key], rightRecord[key], depth + 1, maxDepth)) return false;
  }
  return true;
}

function isContainer(value: unknown): value is object {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
