import { describe, expect, it } from 'vitest';
import { summarizeVolumeInspect } from './volumeInspectViewModel';

const sample = JSON.stringify([{
  CreatedAt: '2026-07-09T22:28:21+08:00',
  Driver: 'local',
  Labels: { env: 'lab', team: 'xgc' },
  Mountpoint: '/var/lib/docker/volumes/app-data/_data',
  Name: 'app-data',
  Options: {
    type: 'nfs4',
    device: ':/export/data',
    o: 'addr=10.0.0.5,rw',
  },
  Scope: 'local',
}]);

describe('summarizeVolumeInspect', () => {
  it('parses volume inspect array into operator facts', () => {
    const summary = summarizeVolumeInspect(sample);
    expect(summary.structured).toBe(true);
    expect(summary.facts.map((f) => f.label)).toEqual([
      'Name',
      'Driver',
      'Mountpoint',
      'Scope',
      'Created',
      'Options',
      'Labels',
    ]);
    expect(summary.facts.find((f) => f.label === 'Name')?.value).toBe('app-data');
    expect(summary.facts.find((f) => f.label === 'Options')?.value).toContain('type=nfs4');
    expect(summary.facts.find((f) => f.label === 'Labels')?.value).toContain('env=lab');
  });

  it('returns unstructured for loading and invalid JSON', () => {
    expect(summarizeVolumeInspect('Loading inspect...').structured).toBe(false);
    expect(summarizeVolumeInspect('not-json').structured).toBe(false);
    expect(summarizeVolumeInspect('').structured).toBe(false);
  });
});
