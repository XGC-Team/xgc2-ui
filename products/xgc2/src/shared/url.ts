export type QueryValue = string | number | boolean | null | undefined;

export function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }

  const text = search.toString();
  return text ? `?${text}` : '';
}

export function clampLimit(value: number | undefined, fallback = 200, max = 5000): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}
