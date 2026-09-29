// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { RecordingFile } from '../recording/recordingPublic';
import { RouteReadyProvider } from '../../shared/routeReady';
import {
  RecordingLibrary,
  type RecordingLibraryActionContribution,
} from './RecordingLibrary';
import type { RecordingLibrary as RecordingLibraryState } from './useRecordingLibrary';

const thumbnails = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../recording/recordingPublic', () => ({
  fetchRecordingThumbnail: thumbnails.fetch,
}));

function file(id: string, extra: Partial<RecordingFile> = {}): RecordingFile {
  return { id, name: id, size: 2048, createdAt: '2026-07-18T02:14:00.000Z', ...extra };
}

function library(overrides: Partial<RecordingLibraryState> = {}): RecordingLibraryState {
  const recordings = overrides.recordings ?? [file('a.webm'), file('b.webm')];
  return {
    recordings,
    loading: false,
    error: '',
    query: '',
    setQuery: vi.fn(),
    filtered: overrides.filtered ?? recordings,
    selectedId: '',
    selected: undefined,
    select: vi.fn(),
    stopPlayback: vi.fn(),
    playbackUrl: '',
    playbackLoading: false,
    playbackError: '',
    removingId: '',
    remove: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

const extraPlayerAction: RecordingLibraryActionContribution = {
  id: 'recording-extra',
  component: () => (
    <button
      type="button"
      data-xgc-role="recording-extra"
      data-xgc-id="recording-extra"
    >
      Extra
    </button>
  ),
};

const runtime = { language: 'en-US' as const };

function renderLibrary(
  state: RecordingLibraryState,
  actions?: readonly RecordingLibraryActionContribution[],
) {
  return render(
    <RecordingLibrary library={state} runtime={runtime} actions={actions} />,
  );
}

describe('RecordingLibrary', () => {
  beforeEach(() => {
    thumbnails.fetch.mockReset();
    thumbnails.fetch.mockRejectedValue(new Error('thumbnail fetch should be skipped'));
  });
  it('embeds into Figures without a nested Panel heading or route-ready gate', () => {
    const onReady = vi.fn();
    const { container } = render(
      <RouteReadyProvider onReady={onReady}>
        <RecordingLibrary
          embedded
          library={library({ loading: true, recordings: [], filtered: [] })}
          runtime={runtime}
        />
      </RouteReadyProvider>,
    );
    const root = container.querySelector('[data-xgc-role="recording-library"][data-xgc-id="recording-library"]');
    expect(root).toHaveClass('scientific-gallery-recordings');
    expect(root).not.toHaveClass('xgc-panel', 'home-gallery-card');
    expect(screen.queryByRole('heading', { level: 2, name: 'Screen recordings' })).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-library-header"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-search"]')).toBeNull();
    expect(container.querySelector('.scientific-gallery-recordings-toolbar')).toBeNull();
    expect(onReady).toHaveBeenCalled();
  });

  it('gives an embedded player host the Stop and Delete actions instead of keeping them under the video', () => {
    const onProvidePlayback = vi.fn();
    const selected = file('screen.webm');
    const { container } = render(
      <RecordingLibrary
        embedded
        library={library({ selectedId: selected.id, selected, playbackUrl: 'blob:playback' })}
        runtime={runtime}
        onProvidePlayback={onProvidePlayback}
      />,
    );
    expect(container.querySelector('[data-xgc-role="recording-stop"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-remove"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-video"]')).toHaveAttribute('src', 'blob:playback');
    expect(onProvidePlayback).toHaveBeenCalledWith(expect.objectContaining({
      recordingId: 'screen.webm',
      stopLabel: 'Stop',
      removeLabel: 'Delete',
    }));
  });

  it('defers the first screen to the workspace loading owner until recordings settle', () => {
    const onReady = vi.fn();
    const view = (loading: boolean) => (
      <RouteReadyProvider onReady={onReady}>
        <RecordingLibrary library={library({ loading, recordings: [], filtered: [] })} runtime={runtime} />
      </RouteReadyProvider>
    );
    const { container,rerender } = render(view(true));
    const panel = container.querySelector('[data-xgc-role="recording-library"]');
    expect(panel).toHaveAttribute('aria-busy', 'true');
    expect(onReady).not.toHaveBeenCalled();
    expect(panel).not.toHaveTextContent('Loading recordings');
    expect(panel?.querySelector('[role="status"]')).toBeNull();

    rerender(view(false));
    expect(panel).toHaveAttribute('aria-busy', 'false');
    expect(onReady).toHaveBeenCalled();
    expect(panel).toHaveTextContent('No archived recordings');
  });

  it('retains loaded rows while refreshing and preserves a real initial error with Retry', () => {
    const recordings = [file('xgc-screen-refresh.webm', { name: 'flight.mp4', relativePath: 'Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/flight.mp4' })];
    const initial = library({ recordings,filtered:recordings });
    const { container,rerender } = renderLibrary(initial);
    const row = container.querySelector('[data-xgc-role="recording-row"]');
    expect(row).toBeInTheDocument();
    rerender(<RecordingLibrary library={{ ...initial,loading:true }} runtime={runtime} />);
    expect(container.querySelector('[data-xgc-role="recording-row"]')).toBe(row);
    expect(container.querySelector('[data-xgc-role="recording-library"]')).toHaveAttribute('aria-busy', 'true');

    const onReady = vi.fn();
    const failed = library({ recordings:[],filtered:[],error:'Recording storage unavailable' });
    rerender(<RouteReadyProvider onReady={onReady}>
      <RecordingLibrary library={failed} runtime={runtime} />
    </RouteReadyProvider>);
    expect(onReady).toHaveBeenCalled();
    expect(screen.getByText('Recording storage unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name:'Retry' }));
    expect(failed.refresh).toHaveBeenCalledOnce();
  });

  it('presents the video archive as the Home workspace with an accurate empty state', () => {
    const { container } = renderLibrary(library({ recordings: [], filtered: [] }));
    const panel = container.querySelector(
      '[data-xgc-role="recording-library"][data-xgc-id="recording-library"]',
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Screen recordings' });
    expect(panel).toHaveClass('xgc-panel', 'home-gallery-card');
    expect(panel).toHaveAttribute('data-padding', 'default');
    expect(panel?.firstElementChild).toHaveClass('xgc-panel-header');
    expect(panel?.querySelector('.xgc-panel-heading > h2')).toBe(heading);
    const titleLeaf = heading.querySelector('[data-xgc-role="recording-library-title"][data-xgc-id="recording-library"]');
    expect(titleLeaf).toHaveTextContent('Screen recordings');
    expect(panel?.querySelector('.xgc-panel-header')).toHaveAttribute('data-xgc-role', 'recording-library-header');
    expect(panel?.querySelector('.xgc-panel-header')).toHaveAttribute('data-xgc-id', 'recording-library');
    expect(screen.queryByText('Find a previous ground-station recording and play it back.')).not.toBeInTheDocument();
    expect(panel).toHaveAttribute('data-xgc-columns', 'full');
    expect(panel).toHaveAttribute('data-xgc-rows', 'feature');
    expect(container.querySelector('[data-xgc-role="recording-search"]')).toHaveClass('xgc-search-control');
    const empty = container.querySelector('[data-xgc-role="recording-library-empty"]');
    expect(empty).toHaveAttribute('data-appearance', 'plain');
    expect(empty?.querySelector('.xgc-empty-state-actions')).toBeNull();
    expect(empty?.querySelector('svg')).toBeNull();
    expect(screen.getByText('No archived recordings')).toBeInTheDocument();
    expect(screen.getByText('This library displays previously saved videos.')).toBeInTheDocument();
    expect(empty?.querySelector('[data-xgc-role="recording-library-empty-title"][data-xgc-id="recording-library-empty"]'))
      .toHaveTextContent('No archived recordings');
    expect(empty?.querySelector('[data-xgc-role="recording-library-empty-description"][data-xgc-id="recording-library-empty"]'))
      .toHaveTextContent('This library displays previously saved videos.');
  });

  it('shows the real archive ancestry, folds runs, and selects by issued file ID', () => {
    const recordings = [file('issued-1', { name: 'flight.mp4', relativePath: 'Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/flight.mp4' })];
    const state = library({ recordings });
    const { container,rerender } = renderLibrary(state);
    const runId = 'Experiments/TASE-4UGVs/Runs/2026-09-20_simulation';
    const toggle = container.querySelector(`[data-xgc-role="recording-folder-toggle"][data-xgc-id="${runId}"]`)!;
    const row = () => container.querySelector('[data-xgc-role="recording-row"][data-xgc-id="issued-1"]');
    expect(container.querySelector('[data-xgc-role="recording-folder-title"][data-xgc-id="Experiments"]')).toHaveTextContent('Experiments');
    expect(container.querySelector('[data-xgc-role="recording-folder-title"][data-xgc-id="Experiments/TASE-4UGVs"]')).toHaveTextContent('TASE-4UGVs');
    expect(row()?.closest('li')).not.toBeNull();
    expect(row()?.querySelector('[data-xgc-role="recording-row-name"]')).toHaveTextContent('flight.mp4');
    expect(row()?.querySelector('[data-xgc-role="recording-row-meta"]')).toBeInTheDocument();
    fireEvent.click(row()!);
    expect(state.select).toHaveBeenCalledWith('issued-1');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(row()).toBeNull();
    // Search reveals a match under a folded directory, preserving fold state afterwards.
    rerender(<RecordingLibrary library={{ ...state, query:'TASE', filtered:[recordings[0]!] }} runtime={runtime} />);
    expect(row()).toBeInTheDocument();
    rerender(<RecordingLibrary library={state} runtime={runtime} />);
    expect(row()).toBeNull();
    fireEvent.click(toggle);
    expect(row()).toBeInTheDocument();
    expect(container.querySelector('.home-recording-list .xgc-list-folder')).not.toHaveClass('xgc-panel');
  });

  it('does not keep unmanaged files in a second home folder', () => {
    const recordings = [file('xscreen-2026-08-19-ground-station-flight-recording-with-a-long-name.mp4'), file('xgc-screen-flight.webm')];
    const { container } = renderLibrary(library({ recordings }));
    expect(container.querySelector('[data-xgc-role="recording-folder"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-row"]')).toBeNull();
    expect(screen.getByText('No matching recordings')).toBeInTheDocument();
  });

  it('shows an empty search without discarding the selected video', () => {
    const selected = file('selected.mp4');
    renderLibrary(library({ query:'missing', filtered:[], selectedId:selected.id, selected, playbackUrl:'blob:current' }));
    expect(screen.getByText('No matching recordings')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="recording-video"]')).toHaveAttribute('src', 'blob:current');
  });

  it('asks the operator to select a recording with two centered lines and no film icon', () => {
    const { container } = renderLibrary(library());
    const player = container.querySelector('[data-xgc-role="recording-player"]');
    expect(player).toHaveAttribute('data-appearance', 'plain');
    expect(player?.querySelector('svg')).toBeNull();
    expect(player?.querySelector('.xgc-empty-state-actions')).toBeNull();
    expect(screen.getByText('No recording selected')).toBeInTheDocument();
    expect(screen.getByText('Select a recording on the left to play it here.')).toBeInTheDocument();
    expect(player?.querySelector('[data-xgc-role="recording-player-title"][data-xgc-id="recording-player"]'))
      .toHaveTextContent('No recording selected');
    expect(player?.querySelector('[data-xgc-role="recording-player-description"][data-xgc-id="recording-player"]'))
      .toHaveTextContent('Select a recording on the left to play it here.');
  });

  it('shows a recent nine-cell grid of archived recordings when none is selected', async () => {
    const recordings = [
      ...Array.from({ length: 10 }, (_, index) => file(`issued-${index}`, {
        name: `clip-${index}.mp4`,
        relativePath: `Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/clip-${index}.mp4`,
      })),
      file('loose.webm'),
    ];
    const state = library({ recordings });
    const { container } = renderLibrary(state);
    const player = container.querySelector('[data-xgc-role="recording-player"][data-xgc-id="recording-player"]');
    const tiles = [...container.querySelectorAll('[data-xgc-role="recording-recent-tile"]')];
    expect(player?.querySelector('[data-xgc-role="recording-recent-grid"][data-xgc-id="recording-player"]')).toBeInTheDocument();
    expect(player?.querySelector('[data-xgc-role="recording-player-title"]')).toBeNull();
    expect(player).not.toHaveTextContent('Recent recordings');
    expect(tiles).toHaveLength(9);
    expect(tiles.map((tile) => tile.getAttribute('data-xgc-id'))).toEqual(
      Array.from({ length: 9 }, (_, index) => `issued-${index}`),
    );
    expect(tiles[0]?.querySelector('[data-xgc-role="recording-recent-tile-name"][data-xgc-id="issued-0"]'))
      .toHaveTextContent('clip-0.mp4');
    expect(player?.querySelector('svg')).toBeNull();
    expect(screen.queryByText('No recording selected')).not.toBeInTheDocument();
    fireEvent.click(tiles[0]!);
    expect(state.select).toHaveBeenCalledWith('issued-0');
    await waitFor(() => expect(thumbnails.fetch).toHaveBeenCalledTimes(9));
  });

  it('loads issued JPEG posters into recent tiles without fetching the MP4', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:poster') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    thumbnails.fetch.mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }));
    const recordings = [
      file('issued-0', {
        name: 'clip-0.mp4',
        relativePath: 'Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/clip-0.mp4',
        hasPoster: true,
      }),
      file('issued-1', {
        name: 'clip-1.mp4',
        relativePath: 'Experiments/TASE-4UGVs/Runs/2026-09-20_simulation/ScreenRecording/clip-1.mp4',
      }),
    ];
    const { container } = renderLibrary(library({ recordings }));
    await waitFor(() => {
      expect(container.querySelector('.home-player-recent-poster-image')).toHaveAttribute('src', 'blob:poster');
    });
    await waitFor(() => expect(thumbnails.fetch).toHaveBeenCalledTimes(2));
    expect(thumbnails.fetch).toHaveBeenCalledWith('issued-0');
    expect(thumbnails.fetch).toHaveBeenCalledWith('issued-1');
    expect(container.querySelectorAll('.home-player-recent-poster-image')).toHaveLength(2);
  });

  it('forwards search input to the library query', () => {
    const state = library();
    renderLibrary(state);
    fireEvent.change(screen.getByLabelText('Search recordings by name'), { target: { value: 'flight' } });
    expect(state.setQuery).toHaveBeenCalledWith('flight');
  });

  it('plays, stops, and deletes a selected recording through the shared confirmation dialog', async () => {
    const selected = file('a.webm', { durationMs: 134_000, width: 1920, height: 1080 });
    const state = library({ selectedId: 'a.webm', selected, playbackUrl: 'blob:playback' });
    const { container } = renderLibrary(state);

    const video = container.querySelector('[data-xgc-role="recording-video"]');
    expect(video).toHaveAttribute('src', 'blob:playback');
    expect(video).toHaveAttribute('controls');
    expect(container.querySelector('[data-xgc-role="recording-download"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-actions"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-open-folder"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open folder' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Size')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolution')).not.toBeInTheDocument();
    expect(screen.queryByText('1920×1080')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(state.stopPlayback).toHaveBeenCalledOnce();

    const remove = container.querySelector('[data-xgc-role="recording-remove"][data-xgc-id="a.webm"]')!;
    expect(remove).toHaveTextContent('Delete');
    fireEvent.click(remove);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete recording' });
    expect(dialog).toHaveTextContent('Delete a.webm?');
    expect(remove).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('a.webm'));
  });

  it('still renders contributed player actions next to Stop and Delete', () => {
    const selected = file('a.webm');
    const state = library({ selectedId: 'a.webm', selected, playbackUrl: 'blob:playback' });
    const { container } = renderLibrary(state, [extraPlayerAction]);

    expect(container.querySelector('[data-xgc-role="recording-video"]')).toHaveAttribute('src', 'blob:playback');
    expect(container.querySelector('[data-xgc-role="recording-extra"][data-xgc-id="recording-extra"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-open-folder"]')).toBeNull();
  });

  it('keeps playback loading wordless inside the existing stage and retains its actions', () => {
    const selected = file('a.webm');
    const state = library({ selectedId: 'a.webm',selected,playbackLoading: true });
    const { container,rerender } = renderLibrary(state);
    const player = container.querySelector('[data-xgc-role="recording-player"]')!;
    const stage = player.querySelector('.home-player-stage');
    const actions = player.querySelector('[data-xgc-role="recording-actions"]');
    const pending = player.querySelector('[data-xgc-role="workspace-busy-overlay"]');
    expect(pending).toHaveTextContent('');
    expect(pending).toHaveAttribute('aria-label','Loading video…');
    expect(player).not.toHaveTextContent('Loading video');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    rerender(<RecordingLibrary library={{ ...state,playbackLoading:false,playbackUrl:'blob:playback' }} runtime={runtime} />);
    expect(player.querySelector('.home-player-stage')).toBe(stage);
    expect(player.querySelector('[data-xgc-role="recording-actions"]')).toBe(actions);
    expect(player.querySelector('[data-xgc-role="workspace-busy-overlay"]')).toBeNull();
    expect(player.querySelector('[data-xgc-role="recording-video"]')).toHaveAttribute('src','blob:playback');
  });

  it('shows a playback error instead of the video when the download failed', () => {
    const selected = file('a.webm');
    const state = library({ selectedId: 'a.webm', selected, playbackError: 'nope' });
    const { container } = renderLibrary(state);
    expect(container.querySelector('[data-xgc-role="recording-video"]')).toBeNull();
    expect(screen.getByText('Could not load this recording.')).toBeInTheDocument();
  });

  it('gives retry a markable identity and keeps Delete after cancelling the shared dialog', () => {
    const error = library({ error: 'boom', recordings: [], filtered: [] });
    const { container, rerender } = renderLibrary(error);
    expect(container.querySelector('[data-xgc-role="recording-retry"][data-xgc-id="recording-retry"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    const selected = file('a.webm');
    const state = library({ selectedId: 'a.webm', selected });
    rerender(<RecordingLibrary library={state} runtime={runtime} />);
    const remove = container.querySelector('[data-xgc-role="recording-remove"][data-xgc-id="a.webm"]')!;
    fireEvent.click(remove);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete recording' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-remove"][data-xgc-id="a.webm"]')).toBe(remove);
    expect(state.remove).not.toHaveBeenCalled();
  });
});
