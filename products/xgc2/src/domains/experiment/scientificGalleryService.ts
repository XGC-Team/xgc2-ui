import { request,requestBlob } from '../../api/http';
import { queryString } from '../../shared/url';

export type ExperimentDataFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  createdAt: string;
  experimentId: string;
  sessionId: string;
  bindingId: string;
  startedAt?: string;
  endedAt?: string;
};

export type ExperimentDataFilePage = {
  items: ExperimentDataFile[];
  truncated?: boolean;
};

export type ImageGalleryFile = {
  name: string;
  size: number;
  mediaType: string;
  createdAt: string;
};

export type ImageGalleryListing = {
  galleryId: string;
  files: ImageGalleryFile[];
  truncated?: boolean;
};

export function listExperimentDataFiles(
  experimentId: string,
  signal?: AbortSignal,
): Promise<ExperimentDataFilePage> {
  return request<ExperimentDataFilePage>(
    `/recordings/data-files${queryString({ experimentId })}`,
    { signal },
  );
}

const GALLERY_CARRIER_RANK: Record<string, number> = {
  '.svg': 0,
  '.png': 1,
  '.webp': 2,
  '.jpg': 3,
  '.jpeg': 3,
};

function galleryFileStem(name: string) {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
}

function galleryCarrierRank(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = dot < 0 ? '' : name.slice(dot).toLowerCase();
  return GALLERY_CARRIER_RANK[ext] ?? 4;
}

/** One gallery tile per figure stem. SVG wins over a raster twin of the same name. */
export function preferVectorGalleryFigures(files: readonly ImageGalleryFile[]): ImageGalleryFile[] {
  const best = new Map<string, ImageGalleryFile>();
  for (const file of files) {
    const stem = galleryFileStem(file.name);
    const current = best.get(stem);
    if (!current || galleryCarrierRank(file.name) < galleryCarrierRank(current.name)) {
      best.set(stem, file);
    }
  }
  return [...best.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function listImageGallery(
  galleryId: string,
  signal?: AbortSignal,
): Promise<ImageGalleryListing> {
  return request<ImageGalleryListing>(`/image-galleries/${encodeURIComponent(galleryId)}`,{ signal })
    .then((listing) => ({ ...listing, files: preferVectorGalleryFigures(listing.files) }));
}

export function imageGalleryFilePath(galleryId: string,name: string) {
  return `/image-galleries/${encodeURIComponent(galleryId)}/files/${encodeURIComponent(name)}`;
}

export function fetchImageGalleryFile(
  galleryId: string,
  name: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return requestBlob(imageGalleryFilePath(galleryId,name),{ signal });
}

export function listROSBagFigures(
  bagId: string,
  signal?: AbortSignal,
): Promise<ImageGalleryListing> {
  return request<ImageGalleryListing>(
    `/recordings/rosbags/${encodeURIComponent(bagId)}/figures`,
    { signal },
  ).then((listing) => ({ ...listing, files: preferVectorGalleryFigures(listing.files) }));
}

export function rosbagFigureFilePath(bagId: string, name: string) {
  return `/recordings/rosbags/${encodeURIComponent(bagId)}/figures/${encodeURIComponent(name)}`;
}

export function fetchROSBagFigure(
  bagId: string,
  name: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return requestBlob(rosbagFigureFilePath(bagId, name), { signal });
}
