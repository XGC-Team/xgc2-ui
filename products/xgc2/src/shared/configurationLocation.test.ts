import { describe,expect,it } from 'vitest';
import {
  configurationDetailHash,
  configurationListHash,
  configurationLocationFromHash,
  configurationResourceIdFromHash,
  type ConfigurationLocationDomain,
} from './configurationLocation';

describe('configuration resource locations', () => {
  it.each<[ConfigurationLocationDomain,string]>([
    ['experiment', '#/experiments'],
    ['robotAsset', '#/assets/robots'],
  ])('round-trips a stable %s resource ID', (domain, listHash) => {
    const detailHash = configurationDetailHash(domain, 'resource/field test');

    expect(configurationListHash(domain)).toBe(listHash);
    expect(detailHash).toBe(`${listHash}/resource%2Ffield%20test`);
    expect(configurationResourceIdFromHash(detailHash, domain)).toBe('resource/field test');
  });

  it('keeps malformed IDs in their own collection list', () => {
    expect(configurationLocationFromHash('#/assets/usernode/script-a')).toBeUndefined();
    expect(configurationLocationFromHash('#/assets/robots/scout-mini/extra')).toEqual({ domain: 'robotAsset',resourceId: '' });
    expect(configurationLocationFromHash('#/unrelated/resource')).toBeUndefined();
  });

  it('keeps an Experiment detail resource when a dashboard segment is present', () => {
    expect(configurationLocationFromHash('#/experiments/exp-1/gcs')).toEqual({
      domain: 'experiment',resourceId: 'exp-1',
    });
    expect(configurationResourceIdFromHash('#/experiments/exp-1/gcs', 'experiment')).toBe('exp-1');
  });
});
