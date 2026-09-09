import { describe,expect,it } from 'vitest';
import {
  filterImages,
  imageRef,
  nextSortDir,
  paginateImages,
  parseDockerSizeBytes,
  shortImageId,
  sortImages,
} from './containerImageViewModel';
import type { DockerImageInfo } from './containerModel';

const sample: DockerImageInfo[] = [
  {
    id: 'sha256:aaa111',
    repository: 'wordpress',
    tag: '7.0.1',
    size: '762.38 MB',
    createdAt: '2026-07-14',
    inUse: true,
  },
  {
    id: 'sha256:bbb222',
    repository: 'redis',
    tag: '7-alpine',
    size: '40 MB',
    createdAt: '2026-06-01',
    inUse: false,
  },
  {
    id: 'sha256:ccc333',
    repository: 'mysql',
    tag: '8.4',
    size: '1.2 GB',
    createdAt: '2026-05-01',
    inUse: true,
  },
];

describe('containerImageViewModel', () => {
  it('filters, sorts, and paginates image rows', () => {
    expect(filterImages(sample, 'redis')).toHaveLength(1);
    expect(sortImages(sample, 'size', 'asc')[0]?.repository).toBe('redis');
    expect(sortImages(sample, 'status', 'desc')[0]?.inUse).toBe(true);
    const page = paginateImages(sample, 2, 2);
    expect(page.pageCount).toBe(2);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.repository).toBe('mysql');
  });

  it('normalizes refs and size units', () => {
    expect(imageRef(sample[0]!)).toBe('wordpress:7.0.1');
    expect(shortImageId('sha256:abcdef1234567890')).toBe('abcdef123456');
    expect(parseDockerSizeBytes('1.5 GB')).toBe(1.5e9);
    expect(nextSortDir('repository', 'repository', 'asc')).toBe('desc');
    expect(nextSortDir('repository', 'size', 'asc')).toBe('asc');
  });
});
