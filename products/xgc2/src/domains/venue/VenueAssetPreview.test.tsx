/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VenueAssetPreview } from './VenueAssetPreview';
import type { VenueAssetDetail } from './venueAssetService';

vi.mock('./venueMessages', () => ({ useVenueText: () => (value: string) => value }));
const detail: VenueAssetDetail = {
  name: 'selected-scene', kind: 'still', origin: 'user', note: '', createdAt: '2026-09-27T00:00:00Z',
  onSelect: 'legacy server copy', labels: [], fieldSite: false, revisions: [],
  media: { kind: 'still' }, camera: { width: 640, height: 480 },
  extrinsic: { parentFrame: 'world', childFrame: 'camera', translation: [0, 0, 4], heightMeters: 4 },
  obstacles: { frame: 'world', count: 1, shapes: { box: 1 }, boxes: [{ x: -1, y: 2, w: 3, h: 4 }] },
  parts: ['media', 'sceneDocument', 'cameraInfo', 'extrinsic']
    .map((role) => ({ role, bytes: 20, digestMatches: true, file: 'internal.yaml', sha256: 'internal-digest' })),
  replayable: true, replayIssues: [],
};
const mediaUrl = '/api/scenes/selected-scene/media';
const previewUrl = '/api/scenes/selected-scene/preview';

describe('VenueAssetPreview', () => {
  it('shows the real photo without adding a bounding-box drawing or internal metadata', () => {
    const { container } = render(<VenueAssetPreview detail={detail} mediaUrl={mediaUrl} previewUrl={previewUrl} />);
    const image = screen.getByRole('img', { name: 'Recorded camera frame' });
    expect(image).toHaveAttribute('src', mediaUrl);
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toContain('internal.yaml');
    expect(container.textContent).not.toContain('internal-digest');
  });

  it.each([
    { ...detail, kind: 'obstacle' as const, media: undefined },
    { ...detail, kind: 'loop' as const, media: { kind: 'loop' } },
  ])('uses a neutral placeholder when the asset has no photo', (asset) => {
    const { container } = render(<VenueAssetPreview detail={asset} mediaUrl={mediaUrl} previewUrl={previewUrl} />);
    expect(screen.getByText('No preview')).toBeInTheDocument();
    expect(container.querySelector('img, video, svg rect')).toBeNull();
    expect(container.querySelector('[data-xgc-role="venue-asset-photo-status"] svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the same media box for missing bytes and a failed image load', () => {
    const { container, rerender } = render(<VenueAssetPreview detail={detail} mediaUrl={mediaUrl} previewUrl={previewUrl} />);
    const box = container.querySelector('[data-xgc-role="venue-asset-preview"]');
    fireEvent.error(screen.getByRole('img', { name: 'Recorded camera frame' }));
    expect(container.querySelector('[data-xgc-role="venue-asset-preview"]')).toBe(box);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(container.querySelector('img, svg rect')).toBeNull();
    rerender(<VenueAssetPreview detail={{ ...detail, parts: [] }} mediaUrl={mediaUrl} previewUrl={previewUrl} />);
    expect(container.querySelector('[data-xgc-role="venue-asset-preview"]')).toBe(box);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('does not carry a load error into a different selected scene', () => {
    const { rerender } = render(<VenueAssetPreview detail={detail} mediaUrl={mediaUrl} previewUrl={previewUrl} />);
    fireEvent.error(screen.getByRole('img', { name: 'Recorded camera frame' }));
    rerender(<VenueAssetPreview detail={{ ...detail, name: 'other' }} mediaUrl="/api/scenes/other/media"
      previewUrl="/api/scenes/other/preview" />);
    expect(screen.getByRole('img', { name: 'Recorded camera frame' })).toHaveAttribute('src', '/api/scenes/other/media');
  });

  it('shows an independent directory preview without requiring a media part', () => {
    const asset = { ...detail, kind: 'obstacle' as const, media: undefined, parts: [],
      preview: { kind: 'still' as const, file: 'preview.png', width: 800, height: 600 } };
    render(<VenueAssetPreview detail={asset} mediaUrl={mediaUrl} previewUrl={previewUrl} />);
    expect(screen.getByRole('img', { name: 'Scene preview' })).toHaveAttribute('src', previewUrl);
    expect(screen.queryByRole('img', { name: 'Recorded camera frame' })).toBeNull();
    expect(screen.queryByText('No preview')).toBeNull();
  });

});
