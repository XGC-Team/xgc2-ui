import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,requestBlob } from '../../api/http';
import {
  fetchROSBagFigure,
  listROSBagFigures,
  preferVectorGalleryFigures,
  rosbagFigureFilePath,
  type ImageGalleryFile,
} from './scientificGalleryService';

vi.mock('../../api/http', () => ({
  request: vi.fn(),
  requestBlob: vi.fn(),
  uploadRequest: vi.fn(),
}));

function file(name: string, mediaType: string): ImageGalleryFile {
  return { name, size: 12, mediaType, createdAt: '2026-01-01T00:00:00Z' };
}

describe('preferVectorGalleryFigures',() => {
  it('keeps one tile per stem and prefers SVG over a raster twin',() => {
    expect(preferVectorGalleryFigures([
      file('overview.png','image/png'),
      file('overview.svg','image/svg+xml'),
      file('still.png','image/png'),
      file('photo.jpg','image/jpeg'),
    ]).map((item) => item.name)).toEqual(['overview.svg','photo.jpg','still.png']);
  });

  it('keeps raster-only figures when there is no vector carrier',() => {
    expect(preferVectorGalleryFigures([
      file('trail.png','image/png'),
    ]).map((item) => item.name)).toEqual(['trail.png']);
  });
});

describe('listROSBagFigures',() => {
  beforeEach(() => vi.clearAllMocks());

  it('reads bag-keyed figures from the record tree, not a Job UUID gallery', async () => {
    vi.mocked(request).mockResolvedValue({
      galleryId: 'bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0',
      files: [
        file('overview.png', 'image/png'),
        file('overview.svg', 'image/svg+xml'),
      ],
    });
    await expect(listROSBagFigures('bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0')).resolves.toEqual({
      galleryId: 'bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0',
      files: [file('overview.svg', 'image/svg+xml')],
    });
    expect(request).toHaveBeenCalledWith(
      '/recordings/rosbags/bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0/figures',
      { signal: undefined },
    );
    expect(rosbagFigureFilePath('bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0', 'overview.svg'))
      .toBe('/recordings/rosbags/bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0/figures/overview.svg');
    await fetchROSBagFigure('bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0', 'overview.svg');
    expect(requestBlob).toHaveBeenCalledWith(
      '/recordings/rosbags/bag.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.0/figures/overview.svg',
      { signal: undefined },
    );
  });
});
