import type { ROSBagRecording } from '../../../domains/recording/recordingPublic';

export function recordingTime(bag: ROSBagRecording): number | undefined {
  if (!bag.startedAt) return undefined;
  const value = Date.parse(bag.startedAt);
  return Number.isFinite(value) ? value : undefined;
}

/** Source identity is the recording's identity, never the open Experiment. */
export function groupVideoSources(bags: readonly ROSBagRecording[]) {
  const ordered = [...bags].sort((a,b) => {
    const first = recordingTime(a),second = recordingTime(b);
    if (first !== undefined || second !== undefined) {
      if (first === undefined) return 1;
      if (second === undefined) return -1;
      if (first !== second) return second - first;
    }
    return a.name.localeCompare(b.name);
  });
  const groups = new Map<string,{ key: string;name: string;items: ROSBagRecording[] }>();
  for (const bag of ordered) {
    const key = bag.experimentId ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { key,name: bag.experimentName?.trim() ?? '',items: [] };
      groups.set(key,group);
    }
    // A newer record may know the name even when an old record lacks it.
    // This only labels their shared group; per-record identity is unchanged.
    if (!group.name && bag.experimentName) group.name = bag.experimentName.trim();
    group.items.push(bag);
  }
  return [...groups.values()];
}

export function recordingModeLabel(mode?: string) {
  switch (mode) {
    case 'simulation': return 'Simulation';
    case 'hybrid': return 'Hybrid';
    case 'physical': return 'Physical';
    default: return mode?.trim() || 'Mode unknown';
  }
}
