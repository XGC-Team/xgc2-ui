import { canonicalJSON } from './canonicalJson';

const MAX_LISTED_CHANGES = 12;

/** Flat human-readable lines describing draft vs baseline (right-drawer discard lists). */
export function listObjectFieldChanges(
  baseline: unknown,
  draft: unknown,
  options?: { max?: number },
): string[] {
  const changes: string[] = [];
  collectObjectDiff('', baseline, draft, changes);
  const max = options?.max ?? MAX_LISTED_CHANGES;
  if (changes.length <= max) return changes;
  const hidden = changes.length - max;
  return [...changes.slice(0, max), `…and ${hidden} more`];
}

/** Shallow string map diff with optional labels (settings drawers, SSH, etc.). */
export function listLabeledFieldChanges(
  baseline: Record<string, string>,
  draft: Record<string, string>,
  labels?: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
  return [...keys]
    .sort()
    .filter((key) => (baseline[key] ?? '') !== (draft[key] ?? ''))
    .map((key) => {
      const label = labels?.[key] ?? humanizePath(key);
      return `${label}: ${formatValue(baseline[key] ?? '')} → ${formatValue(draft[key] ?? '')}`;
    });
}

function collectObjectDiff(
  path: string,
  left: unknown,
  right: unknown,
  out: string[],
): void {
  if (canonicalJSON(left) === canonicalJSON(right)) return;

  const leftObject = isPlainObject(left);
  const rightObject = isPlainObject(right);
  if (leftObject && rightObject) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const nextPath = path ? `${path}.${key}` : key;
      collectObjectDiff(nextPath, left[key], right[key], out);
    }
    return;
  }

  out.push(`${humanizePath(path)}: ${formatValue(left)} → ${formatValue(right)}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanizePath(path: string): string {
  if (!path) return 'Value';
  return path
    .split('.')
    .map((segment) => segment
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (char) => char.toUpperCase()))
    .join(' · ');
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value === '' ? '""' : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')) {
      const preview = value.map((item) => String(item)).join(', ');
      return preview.length <= 48 ? `[${preview}]` : `[${value.length} items]`;
    }
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') return '{…}';
  return String(value);
}
