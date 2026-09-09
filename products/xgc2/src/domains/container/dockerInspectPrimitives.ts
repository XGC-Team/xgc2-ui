export type DockerInspectRecord = Record<string,unknown>;

export type DockerInspectFact = {
  label: string;
  value: string;
};

export function parseDockerInspectDocument(content: string): DockerInspectRecord | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    const root: unknown = JSON.parse(trimmed);
    return dockerInspectRecord(Array.isArray(root) ? root[0] : root);
  } catch {
    return null;
  }
}

export function dockerInspectRecord(value: unknown): DockerInspectRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as DockerInspectRecord
    : null;
}

export function dockerInspectString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function dockerInspectTime(value: string): string {
  if (!value || value.startsWith('0001-01-01')) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function shortDockerInspectId(value: string): string {
  return value.length > 12 ? value.slice(0, 12) : value;
}

export function pushDockerInspectFact(
  facts: DockerInspectFact[],
  label: string,
  value: string,
) {
  if (value.trim()) facts.push({ label,value });
}

export function prettyDockerInspectJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
