import { describe, expect, it } from 'vitest';
import { venueAssetMediaUrl, venueAssetPreviewUrl } from './venueAssetService';
import { venueAssetPreview, venuePartAvailable } from './venueAssetPreview';

const parts = ['sceneDocument', 'media', 'cameraInfo', 'extrinsic']
  .map((role) => ({ role, bytes: 100, digestMatches: true }));
const asset = {
  media: { kind: 'still' }, camera: { width: 640, height: 480 },
  extrinsic: { parentFrame: 'world', childFrame: 'camera_optical' },
  obstacles: { frame: 'world', count: 1, boxes: [{ x: -1, y: 2, w: 3, h: 4 }] },
  parts, replayable: true, replayIssues: [],
};

describe('venueAssetPreview', () => {
  it('keeps image and geometry available from the same scene', () => {
    const result = venueAssetPreview(asset);
    expect(result.imagePrerequisitesMet).toBe(true);
    expect(result.displayImageSource).toBe('media');
    expect(result.issues).toEqual([]);
  });

  it('uses a directory preview independently of media, camera calibration and replay readiness', () => {
    const result = venueAssetPreview({
      ...asset,
      media: undefined,
      camera: undefined,
      extrinsic: undefined,
      parts: [],
      preview: { kind: 'still', file: 'preview.png', width: 800, height: 600 },
      replayable: false,
    });
    expect(result.directoryPreview).toBe(true);
    expect(result.displayImageSource).toBe('preview');
    expect(result.displayImageDimensions).toEqual({ width: 800, height: 600 });
    expect(result.photoExpected).toBe(true);
    expect(result.mediaAvailable).toBe(false);
    expect(result.cameraAvailable).toBe(false);
    expect(result.imagePrerequisitesMet).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it('keeps the original video source separate when a directory preview is present', () => {
    const result = venueAssetPreview({
      ...asset,
      media: { kind: 'loop' },
      preview: { kind: 'still', file: 'preview.png' },
    });
    expect(result.originalVideo).toBe(true);
    expect(result.directoryPreview).toBe(true);
    expect(result.displayImageSource).toBe('preview');
    expect(result.displayImageDimensions).toEqual({ width: undefined, height: undefined });
    expect(result.imagePrerequisitesMet).toBe(false);
  });

  it.each(['media', 'cameraInfo', 'extrinsic', 'sceneDocument'])('does not infer readiness with missing %s', (role) => {
    const result = venueAssetPreview({ ...asset, parts: parts.filter((part) => part.role !== role) });
    expect(result.imagePrerequisitesMet).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it.each(['media', 'cameraInfo', 'extrinsic', 'sceneDocument'])('rejects changed %s', (role) => {
    const changed = parts.map((part) => ({ ...part, digestMatches: part.role !== role }));
    const result = venueAssetPreview({ ...asset, parts: changed, replayIssues: ['sealed part changed'] });
    expect(result.imagePrerequisitesMet).toBe(false);
  });

  it('checks camera dimensions and coordinate frames as well as the server flag', () => {
    expect(venueAssetPreview({ ...asset, camera: { width: NaN, height: 480 } }).imagePrerequisitesMet).toBe(false);
    const result = venueAssetPreview({ ...asset, extrinsic: { parentFrame: 'map', childFrame: 'camera' } });
    expect(result.imagePrerequisitesMet).toBe(false);
    expect(result.issues).toContain('Camera pose and obstacle geometry use different coordinate frames.');
    expect(venueAssetPreview({ ...asset, replayable: false }).imagePrerequisitesMet).toBe(false);
  });

  it('keeps a video source downloadable without making it an image source', () => {
    const result = venueAssetPreview({ ...asset, media: { kind: 'loop' } });
    expect(result.originalVideo).toBe(true);
    expect(result.mediaAvailable).toBe(true);
    expect(result.imagePrerequisitesMet).toBe(false);
    expect(result.image).toBe(false);
  });

  it('does not verify a world merely because the manifest declares it', () => {
    const world = { ...asset, gazeboWorld: { file: 'selected.world' } };
    expect(venueAssetPreview(world).worldDeclared).toBe(true);
    expect(venueAssetPreview(world).worldAvailable).toBe(false);
    expect(venueAssetPreview({ ...world, parts: [...parts, { role: 'gazeboWorld', bytes: 30, digestMatches: true }] }).worldAvailable).toBe(true);
  });

  it('never borrows a photo or map from another scene', () => {
    venueAssetPreview(asset);
    const result = venueAssetPreview({ parts: [], replayable: false, replayIssues: [] });
    expect(result.mediaAvailable).toBe(false);
    expect(result.issues).toEqual(['No site image is attached.']);
  });
});

describe('venue asset image URLs', () => {
  it('keeps directory preview separate from the existing media URL', () => {
    expect(venueAssetPreviewUrl('yard / north')).toBe('/api/scenes/yard%20%2F%20north/preview');
    expect(venueAssetMediaUrl('yard / north')).toBe('/api/scenes/yard%20%2F%20north/media');
  });
});

describe('venue geometry and parts', () => {
  it.each([0, -1, NaN, Infinity])('rejects unusable byte size %s', (bytes) => {
    expect(venuePartAvailable([{ role: 'media', bytes }], 'media')).toBe(false);
  });
  it('allows a readable legacy part without claiming a digest was checked', () => {
    expect(venuePartAvailable([{ role: 'media', bytes: 10 }], 'media')).toBe(true);
    expect(venuePartAvailable([{ role: 'media', bytes: 10 }, { role: 'media', bytes: 10 }], 'media')).toBe(false);
  });
});
