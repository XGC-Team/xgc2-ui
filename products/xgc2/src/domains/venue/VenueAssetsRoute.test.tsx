/** @vitest-environment jsdom */
import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { VenueAssetsRoute } from './VenueAssetsRoute';

const listScenes = vi.hoisted(() => vi.fn());

vi.mock('../experiment/experimentPublic', () => ({
  listScenes,
}));

describe('VenueAssetsRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
    listScenes.mockReset();
  });

  it('shows the scene archive returned by Core', async () => {
    listScenes.mockResolvedValue([{
      name: 'workshop-evening-2026-09-18',
      path: '/scenes/workshop-evening-2026-09-18',
      relativePath: 'Shared/Scenes/workshop-evening-2026-09-18',
      kind: 'still',
      origin: 'user',
      createdAt: '2026-09-21T00:00:00Z',
    }]);
    const { container } = render(<VenueAssetsRoute />);
    await waitFor(() => {
      expect(container.querySelector('[data-xgc-role="venue-asset-row"][data-xgc-id="workshop-evening-2026-09-18"]')).toHaveAttribute('data-xgc-kind', 'still');
    });
  });

  it('carries the list preview from listScenes to the card image without changing scene kind', async () => {
    listScenes.mockResolvedValue([
      {
        name: 'gazebo-world-69', path: '/scenes/gazebo-world-69', relativePath: 'Shared/Scenes/gazebo-world-69',
        kind: 'obstacle', origin: 'platform', createdAt: '2026-09-28T00:00:00Z',
        preview: { kind: 'still', file: 'private/world.png', width: 1200, height: 700 },
      },
      {
        name: 'legacy-photo', path: '/scenes/legacy-photo', relativePath: 'Shared/Scenes/legacy-photo',
        kind: 'still', origin: 'user', createdAt: '2026-09-28T00:00:00Z',
      },
      {
        name: 'empty-obstacles', path: '/scenes/empty-obstacles', relativePath: 'Shared/Scenes/empty-obstacles',
        kind: 'obstacle', origin: 'platform', createdAt: '2026-09-28T00:00:00Z',
      },
    ]);
    const { container } = render(<VenueAssetsRoute />);
    const previewBox = await waitFor(() => {
      const row = container.querySelector('[data-xgc-role="venue-asset-row"][data-xgc-id="gazebo-world-69"]');
      expect(row).toHaveAttribute('data-xgc-kind', 'obstacle');
      return container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="gazebo-world-69"]');
    });
    const previewImage = within(previewBox as HTMLElement).getByRole('img', { name: 'Scene preview' });
    expect(previewImage).toHaveAttribute('src', '/api/scenes/gazebo-world-69/preview');
    expect(previewImage).toHaveAttribute('loading', 'lazy');
    expect(previewImage).toHaveAttribute('decoding', 'async');
    expect(container.textContent).not.toContain('private/world.png');

    const legacyBox = container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="legacy-photo"]')!;
    expect(within(legacyBox as HTMLElement).getByRole('img', { name: 'Recorded camera frame' })).toHaveAttribute(
      'src', '/api/scenes/legacy-photo/media');
    expect(container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="empty-obstacles"]'))
      .toHaveTextContent('No preview');

    fireEvent.error(previewImage);
    expect(container.querySelector('[data-xgc-role="venue-asset-row-preview"][data-xgc-id="gazebo-world-69"]'))
      .toBe(previewBox);
    expect(previewBox).toHaveTextContent('Preview unavailable');
  });

  it('keeps the catalog reachable when the archive cannot be read', async () => {
    listScenes.mockRejectedValue(new Error('archive offline'));
    const { container } = render(<VenueAssetsRoute />);
    expect(await screen.findByText('Unable to load venue assets')).toBeInTheDocument();
    expect(screen.getByText('archive offline')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="venue-asset-catalog-error"][data-xgc-id="venue"]')).toBeInTheDocument();
    listScenes.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Try loading venues again' }));
    await waitFor(() => expect(listScenes).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No venue assets')).toBeInTheDocument();
  });
});
