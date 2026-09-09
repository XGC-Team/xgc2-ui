/**
 * Operator-facing summary for `docker volume inspect` JSON.
 */
import {
  dockerInspectRecord as asRecord,
  dockerInspectString as asString,
  dockerInspectTime as formatTime,
  parseDockerInspectDocument,
  pushDockerInspectFact as push,
  type DockerInspectFact,
} from './dockerInspectPrimitives';

export type VolumeInspectFact = DockerInspectFact;

export type VolumeInspectSummary = {
  structured: boolean;
  facts: VolumeInspectFact[];
};

export function summarizeVolumeInspect(content: string): VolumeInspectSummary {
  const trimmed = content.trim();
  if (!trimmed || trimmed === 'Loading inspect...') {
    return emptySummary();
  }
  const doc = parseDockerInspectDocument(trimmed);
  if (!doc) return emptySummary();

  const facts: VolumeInspectFact[] = [];
  push(facts, 'Name', asString(doc.Name));
  push(facts, 'Driver', asString(doc.Driver));
  push(facts, 'Mountpoint', asString(doc.Mountpoint));
  push(facts, 'Scope', asString(doc.Scope));
  push(facts, 'Created', formatTime(asString(doc.CreatedAt)));

  const options = asRecord(doc.Options) ?? {};
  const optionPairs = Object.entries(options).map(([key, value]) => (
    value === '' || value == null ? key : `${key}=${String(value)}`
  ));
  if (optionPairs.length) push(facts, 'Options', optionPairs.join(', '));

  const labels = asRecord(doc.Labels) ?? {};
  const labelPairs = Object.entries(labels).map(([key, value]) => (
    value === '' || value == null ? key : `${key}=${String(value)}`
  ));
  if (labelPairs.length) push(facts, 'Labels', labelPairs.join(', '));

  const status = asRecord(doc.Status);
  if (status && Object.keys(status).length) {
    const pairs = Object.entries(status).map(([key, value]) => `${key}=${String(value)}`);
    push(facts, 'Status', pairs.join(', '));
  }

  return { structured: facts.length > 0, facts };
}

function emptySummary(): VolumeInspectSummary {
  return { structured: false, facts: [] };
}
