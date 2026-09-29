/** @vitest-environment jsdom */
import { fireEvent,render,screen,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import { VenueAssetsPage } from './VenueAssetsPage';
import type { VenueAssetDetail } from './venueAssetService';

// The asset page reads generated contents from Core (GET /scenes/{name}).
vi.mock('./useVenueAssetDetail', () => ({
  useVenueAssetDetail: (name: string) => ({
    mediaUrl: `/api/scenes/${name}/media`,
    previewUrl: `/api/scenes/${name}/preview`,
    error: '',
    detail: {
      name, kind: name === 'empty-yard' || name === 'zero-obstacles' ? 'obstacle' : name.startsWith('workshop') ? 'still' : 'loop', origin: name === 'empty-yard' || name === 'zero-obstacles' ? 'platform' : 'user',
      note: '', createdAt: '2026-09-21T00:00:00Z',
      onSelect: 'Legacy server description of a looping recorded clip.',
      labels: name === 'empty-yard' ? ['geometry-only'] : ['replay', 'from-recording'],
      obstacles: name === 'empty-yard' ? undefined : name === 'zero-obstacles'
        ? { frame: 'world', count: 0, shapes: {}, extent: { unit: 'm', minX: 0, minY: 0, maxX: 0, maxY: 0 } }
        : { frame: 'world', count: 4, shapes: { box: 4 }, extent: { unit: 'm', minX: -3, minY: -2, maxX: 5, maxY: 4 } },
      media: name === 'empty-yard' || name === 'zero-obstacles' ? undefined : name.startsWith('workshop')
        ? { kind: 'still', width: 1920, height: 1080 } : { kind: 'loop', width: 1920, height: 1080, durationSec: 12 },
      preview: name === 'four-scout-evening-2026-09-18'
        ? { kind: 'still' as const, file: 'scene-preview.png', width: 800, height: 600 } : undefined,
      camera: name.startsWith('workshop') ? { width: 640, height: 480 } : undefined,
      simulators: name.startsWith('workshop') ? { gazebo: { geometry: 'document' as const }, lightweight: { geometry: 'native' as const } } : undefined,
      source: name === 'empty-yard' ? undefined : { recordingId: 'rec-0918' },
      fieldSite: false,
      parts: name === 'empty-yard' ? [] : name === 'zero-obstacles' ? [
        { role: 'sceneDocument', file: 'scene.yaml', sha256: 'private-digest', bytes: 100, digestMatches: true },
      ] : [
        { role: 'media', file: name.startsWith('workshop') ? 'frame.png' : 'original.mp4', sha256: 'private-digest', bytes: 100, digestMatches: true },
        { role: 'sceneDocument', file: 'scene.yaml', sha256: 'private-digest', bytes: 100, digestMatches: true },
      ],
      replayable: name !== 'empty-yard',
      replayIssues: [],
      revisions: [{ name, createdAt: '2026-09-21T00:00:00Z', origin: 'user', note: '', current: true }],
    } satisfies VenueAssetDetail,
  }),
}));
import type { VenueAssetRow } from './venueAssetCatalog';

const venues: VenueAssetRow[] = [
  { name: 'empty-yard', kind: 'obstacle', origin: 'platform', createdAt: '2026-09-18T00:00:00Z', note: 'Empty yard with no photo.' },
  { name: 'zero-obstacles', kind: 'obstacle', origin: 'platform', createdAt: '2026-09-18T00:00:00Z' },
  { name: 'four-scout-evening-2026-09-18', kind: 'loop', origin: 'user', hasPreview: true, createdAt: '2026-09-21T00:00:00Z', note: 'Scouts parked at the left edge.' },
  { name: 'workshop-evening-2026-09-18', kind: 'still', origin: 'user', createdAt: '2026-09-21T15:00:00Z' },
];

describe('VenueAssetsPage', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('lists sources without storage paths, looping video players or runtime promises', () => {
    const { container } = render(<VenueAssetsPage assets={venues} />);
    expect(container.querySelector('[data-xgc-role="venue-assets-page"][data-xgc-id="venue"]')).toBeInTheDocument();
    const loop = container.querySelector('[data-xgc-role="venue-asset-row"][data-xgc-id="four-scout-evening-2026-09-18"]');
    expect(loop).toHaveAttribute('data-xgc-kind', 'loop');
    expect(loop).toHaveAttribute('data-xgc-origin', 'user');
    expect(container.querySelector('[data-xgc-role="venue-asset-row-open"][data-xgc-id="four-scout-evening-2026-09-18"]')).toBeInTheDocument();
    expect(loop).toHaveTextContent('Video source');
    expect(container.querySelector('[data-xgc-role="venue-asset-row-description"][data-xgc-id="workshop-evening-2026-09-18"]'))
      .toHaveTextContent('Site photo');
    expect(container.querySelector('[data-xgc-role="venue-asset-row-description"][data-xgc-id="empty-yard"]'))
      .toHaveTextContent('Obstacle layout or simulator world');
    expect(container.querySelector('video')).toBeNull();
    expect(container.textContent).not.toContain('Shared/Scenes/');
    expect(container.querySelector('[data-xgc-role="venue-folder"][data-xgc-id="platform"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
  });

  it('opens the selected scene without internal summaries and retains its original video', () => {
    const { container } = render(<VenueAssetsPage assets={venues} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open scene four-scout-evening-2026-09-18' }));
    const detail = container.querySelector('[data-xgc-role="venue-asset-detail"][data-xgc-id="four-scout-evening-2026-09-18"]');
    expect(detail).toHaveAttribute('data-xgc-kind', 'loop');
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('link', { name: 'Download original video' })).toHaveAttribute('href', '/api/scenes/four-scout-evening-2026-09-18/media');
    expect(container.querySelector('[data-xgc-role="venue-asset-photo"]')).toHaveAttribute(
      'src', '/api/scenes/four-scout-evening-2026-09-18/preview');
    const videoFacts = container.querySelector('[data-xgc-role="venue-asset-facts"]');
    expect(videoFacts).not.toHaveTextContent('Image dimensions');
    expect(videoFacts).not.toHaveTextContent('800 × 600 px');
    expect(videoFacts).not.toHaveTextContent('1920 × 1080 px');
    expect(videoFacts?.querySelector('[data-xgc-role="venue-asset-calibration"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="venue-asset-detail-purpose"]')).toBeInTheDocument();
    expect(container.textContent).not.toContain('Legacy server description');
    expect(container.textContent).not.toContain('Ready for camera replay');
    expect(detail).not.toHaveTextContent('rec-0918');
    expect(detail).not.toHaveTextContent('Scouts parked at the left edge.');
    expect(detail).not.toHaveTextContent('four-scout-evening-2026-09-18');
    expect(container.querySelector('[data-xgc-role="venue-asset-detail-back"]')).toBeNull();
    expect(container.textContent).not.toContain('Shared/Scenes/');
    expect(container.textContent).not.toContain('private-digest');
    fireEvent(window, new Event('xgc:venue-list'));
    expect(container.querySelector('[data-xgc-role="venue-asset-row"][data-xgc-id="empty-yard"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="venue-asset-detail"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open scene workshop-evening-2026-09-18' }));
    const facts = container.querySelector('[data-xgc-role="venue-asset-facts"]');
    expect(facts).toHaveTextContent('Site photo');
    expect(facts).toHaveTextContent('8 × 6 m');
    expect(facts).toHaveTextContent('Box × 4');
    expect(facts).toHaveTextContent('Image dimensions');
    expect(facts).toHaveTextContent('1920 × 1080 px');
    expect(facts).not.toHaveTextContent('640 × 480');
    expect(facts).toHaveTextContent('Incomplete');
    expect(container.querySelector('[data-xgc-role="venue-asset-simulators"][data-xgc-id="workshop-evening-2026-09-18"]'))
      .toHaveTextContent('Gazebo · Lightweight simulator');
  });

  it('closes an open scene when the catalog asks for the list', () => {
    const { container } = render(<VenueAssetsPage assets={venues} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open scene empty-yard' }));
    expect(container.querySelector('[data-xgc-role="venue-asset-detail-note"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="venue-asset-detail-purpose"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="venue-asset-preview"]')).toHaveTextContent('No preview');
    const facts = container.querySelector('[data-xgc-role="venue-asset-facts"]')!;
    expect(facts.querySelector('[data-xgc-role="venue-asset-obstacles"]')).toBeNull();
    expect(facts.querySelector('[data-xgc-role="venue-asset-simulators"]')).toBeNull();
    expect(Array.from(facts.querySelectorAll('dt'), (label) => label.textContent)).not.toContain('Scene range');
    fireEvent(window, new Event('xgc:venue-list'));
    expect(container.querySelector('[data-xgc-role="venue-assets-page"]')).toBeInTheDocument();
    expect(sessionStorage.getItem('xgc.venue.user.lastOpen')).toBeNull();
  });

  it('shows real zero-count obstacle data and omits absent native-only scene facts', () => {
    const { container } = render(<VenueAssetsPage assets={venues} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open scene empty-yard' }));
    let facts = container.querySelector('[data-xgc-role="venue-asset-facts"]')!;
    expect(facts.querySelector('[data-xgc-role="venue-asset-obstacles"]')).toBeNull();
    expect(Array.from(facts.querySelectorAll('dt'), (label) => label.textContent)).not.toContain('Scene range');

    fireEvent(window, new Event('xgc:venue-list'));
    fireEvent.click(screen.getByRole('button', { name: 'Open scene zero-obstacles' }));
    facts = container.querySelector('[data-xgc-role="venue-asset-facts"]')!;
    expect(facts.querySelector('[data-xgc-role="venue-asset-obstacles"]')).toHaveTextContent('0');
    expect(facts).toHaveTextContent('0 × 0 m');
  });

  it('uses one media box per row and keeps the same box on image failure', () => {
    const { container } = render(<VenueAssetsPage assets={venues} />);
    const boxes = container.querySelectorAll('[data-xgc-role="venue-asset-row-preview"]');
    expect(boxes).toHaveLength(4);
    expect(new Set(Array.from(boxes, (box) => box.className)).size).toBe(1);
    const directoryPreview = container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="four-scout-evening-2026-09-18"]')!;
    expect(within(directoryPreview as HTMLElement).getByRole('img', { name: 'Scene preview' })).toHaveAttribute(
      'src', '/api/scenes/four-scout-evening-2026-09-18/preview');
    const oldMedia = container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="workshop-evening-2026-09-18"]')!;
    expect(within(oldMedia as HTMLElement).getByRole('img', { name: 'Recorded camera frame' })).toHaveAttribute(
      'src', '/api/scenes/workshop-evening-2026-09-18/media');
    const directoryBox = directoryPreview;
    fireEvent.error(within(directoryPreview as HTMLElement).getByRole('img', { name: 'Scene preview' }));
    expect(container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="four-scout-evening-2026-09-18"]'))
      .toBe(directoryBox);
    expect(directoryPreview).toHaveTextContent('Preview unavailable');
    const photo = container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="workshop-evening-2026-09-18"]')!;
    fireEvent.error(within(photo as HTMLElement).getByRole('img'));
    expect(photo).toHaveTextContent('Preview unavailable');
    expect(photo.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="empty-yard"]')).toHaveTextContent('No preview');
  });

  it('preserves list scroll and filters across detail, and isolates breadcrumb/return while parked', () => {
    const breadcrumb = vi.fn();
    window.addEventListener('xgc:venue-breadcrumb', breadcrumb);
    const surface = (visible: boolean) => <ProductRouteVisibilityProvider visible={visible}>
      <VenueAssetsPage assets={venues} />
    </ProductRouteVisibilityProvider>;
    const view = render(surface(true));
    fireEvent.change(screen.getByPlaceholderText('Search venues'), { target: { value: 'empty' } });
    const scroller = view.container.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]')!;
    scroller.scrollTop = 240;
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole('button', { name: 'Open scene empty-yard' }));
    const detail = view.container.querySelector<HTMLElement>('[data-xgc-role="venue-asset-detail"]')!;
    detail.scrollTop = 120;
    expect(breadcrumb.mock.lastCall?.[0].detail).toEqual({ view: 'detail', name: 'empty-yard' });
    const published = breadcrumb.mock.calls.length;
    view.rerender(surface(false));
    fireEvent(window, new Event('xgc:venue-list'));
    expect(view.container.querySelector('[data-xgc-role="venue-asset-detail"]')).toBe(detail);
    expect(detail.scrollTop).toBe(120);
    expect(breadcrumb).toHaveBeenCalledTimes(published);
    view.rerender(surface(true));
    expect(view.container.querySelector('[data-xgc-role="venue-asset-detail"]')).toBe(detail);
    fireEvent(window, new Event('xgc:venue-list'));
    expect(breadcrumb.mock.lastCall?.[0].detail).toEqual({ view: 'list' });
    expect(view.container.querySelector('[data-xgc-role="list-page-items-scroll"]')).toBe(scroller);
    expect(scroller.scrollTop).toBe(240);
    expect(screen.getByPlaceholderText('Search venues')).toHaveValue('empty');
    window.removeEventListener('xgc:venue-breadcrumb', breadcrumb);
  });

  it('filters the catalog by name', () => {
    render(<VenueAssetsPage assets={venues} />);
    fireEvent.change(screen.getByPlaceholderText('Search venues'), { target: { value: 'empty-yard' } });
    expect(screen.getByText('empty-yard')).toBeInTheDocument();
    expect(screen.queryByText('four-scout-evening-2026-09-18')).toBeNull();
  });

  it('says when the catalog has no venues', () => {
    render(<VenueAssetsPage assets={[]} />);
    expect(screen.getByText('No venue assets')).toBeInTheDocument();
  });
});
