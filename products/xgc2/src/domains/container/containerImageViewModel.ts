import type { DockerImageInfo } from './containerModel';

export type ImageSortKey = 'id' | 'status' | 'repository' | 'tag' | 'size' | 'created';
export type ImageSortDir = 'asc' | 'desc';

export const IMAGE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function imageRef(image: DockerImageInfo): string {
  if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
    return `${image.repository}:${image.tag}`;
  }
  return image.id;
}

export function shortImageId(id: string): string {
  const value = id.replace(/^sha256:/, '');
  return value.length > 12 ? value.slice(0, 12) : value;
}

export function filterImages(images: DockerImageInfo[], query: string): DockerImageInfo[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return images;
  return images.filter((image) => {
    const haystack = [
      image.id,
      image.repository,
      image.tag,
      image.size,
      image.createdAt,
      image.inUse ? 'in use used' : 'unused',
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function sortImages(
  images: DockerImageInfo[],
  key: ImageSortKey,
  dir: ImageSortDir,
): DockerImageInfo[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...images].sort((left, right) => factor * compareImages(left, right, key));
}

export function paginateImages(
  images: DockerImageInfo[],
  page: number,
  pageSize: number,
): { rows: DockerImageInfo[]; page: number; pageCount: number; total: number } {
  const total = images.length;
  const safeSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * safeSize;
  return {
    rows: images.slice(start, start + safeSize),
    page: safePage,
    pageCount,
    total,
  };
}

export function nextSortDir(currentKey: ImageSortKey, nextKey: ImageSortKey, currentDir: ImageSortDir): ImageSortDir {
  if (currentKey !== nextKey) return 'asc';
  return currentDir === 'asc' ? 'desc' : 'asc';
}

function compareImages(left: DockerImageInfo, right: DockerImageInfo, key: ImageSortKey): number {
  switch (key) {
    case 'status':
      return Number(Boolean(left.inUse)) - Number(Boolean(right.inUse));
    case 'size':
      return parseDockerSizeBytes(left.size) - parseDockerSizeBytes(right.size);
    case 'created':
      return String(left.createdAt).localeCompare(String(right.createdAt));
    case 'id':
      return shortImageId(left.id).localeCompare(shortImageId(right.id));
    case 'tag':
      return String(left.tag).localeCompare(String(right.tag));
    case 'repository':
    default:
      return String(left.repository).localeCompare(String(right.repository));
  }
}

/** Best-effort parse of docker size strings like "762.38 MB", "1.2GB", "512kB". */
export function parseDockerSizeBytes(value: string): number {
  const match = String(value).trim().match(/^([\d.]+)\s*([kmgtpe]?i?b)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const unit = (match[2] || 'b').toLowerCase();
  const table: Record<string, number> = {
    b: 1,
    kb: 1e3,
    kib: 1024,
    mb: 1e6,
    mib: 1024 ** 2,
    gb: 1e9,
    gib: 1024 ** 3,
    tb: 1e12,
    tib: 1024 ** 4,
  };
  return amount * (table[unit] ?? 1);
}
