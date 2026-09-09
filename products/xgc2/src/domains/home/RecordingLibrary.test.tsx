// @vitest-environment jsdom
import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { RecordingFile } from '../recording/recordingPublic';
import { RouteReadyProvider } from '../../shared/routeReady';
import {
  RecordingLibrary,
  type RecordingLibraryActionContribution,
} from './RecordingLibrary';
import type { RecordingLibrary as RecordingLibraryState } from './useRecordingLibrary';

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

const openFolderAction: RecordingLibraryActionContribution = {
  id: 'recording-open-folder',
  component: () => (
    <button
      type="button"
      data-xgc-role="recording-open-folder"
      data-xgc-id="recording-open-folder"
    >
      Open folder
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
    const recordings = [file('xgc-screen-refresh.webm')];
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

  it('lists recordings in System and XGC folders and selects one on click', () => {
    const system = file('xscreen-2026-08-19.mp4');
    const xgc = file('xgc-screen-flight.webm');
    const recordings = [system, xgc];
    const state = library({ recordings, filtered: recordings });
    const { container } = renderLibrary(state);
    expect(container.querySelector('[data-xgc-role="recording-folder"][data-xgc-id="system"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-folder"][data-xgc-id="xgc"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /System recordings/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /XGC recordings/ })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-row"][data-xgc-id="xscreen-2026-08-19.mp4"]')).toBeNull();
    const xgcFolder = container.querySelector('[data-xgc-role="recording-folder"][data-xgc-id="xgc"]');
    const xgcList = xgcFolder?.querySelector('ul');
    const xgcRow = xgcFolder?.querySelector('[data-xgc-role="recording-row"][data-xgc-id="xgc-screen-flight.webm"]');
    if (!(xgcList instanceof HTMLUListElement) || !(xgcRow instanceof HTMLElement)) {
      throw new Error('expected a semantic list and recording row under the XGC folder');
    }
    expect(xgcRow.closest('li')).not.toBeNull();
    expect(xgcList.contains(xgcRow)).toBe(true);
    expect(xgcRow.querySelector('.home-recording-name')).toHaveTextContent('xgc-screen-flight.webm');
    expect(xgcRow.querySelector('[data-xgc-role="recording-row-name"][data-xgc-id="xgc-screen-flight.webm"]'))
      .toHaveTextContent('xgc-screen-flight.webm');
    expect(xgcRow.querySelector('[data-xgc-role="recording-row-meta"][data-xgc-id="xgc-screen-flight.webm"]'))
      .toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-folder-title"][data-xgc-id="xgc"]'))
      .toHaveTextContent('XGC recordings');
    expect(container.querySelector('[data-xgc-role="recording-folder-count"][data-xgc-id="xgc"]'))
      .toHaveTextContent('1');
    expect(container.querySelector('[data-xgc-role="recording-list"]')).toHaveAttribute('aria-label', 'Recording folders');
    expect(container.querySelector('.home-recording-icon')).toBeNull();
    fireEvent.click(xgcRow);
    expect(state.select).toHaveBeenCalledWith('xgc-screen-flight.webm');
  });

  it('uses one folder-header geometry and gives long filenames the row width', () => {
    const longName = 'xscreen-2026-08-19-ground-station-flight-recording-with-a-long-name.mp4';
    const recordings = [file(longName), file('xgc-screen-flight.webm')];
    const { container } = renderLibrary(library({ recordings, filtered: recordings }));
    const toggles = [...container.querySelectorAll<HTMLButtonElement>('[data-xgc-role="recording-folder-toggle"]')];

    expect(toggles).toHaveLength(2);
    expect(toggles.map((toggle) => toggle.className)).toEqual([
      'xgc-list-folder-title',
      'xgc-list-folder-title',
    ]);
    expect(toggles.map((toggle) => toggle.closest('[data-xgc-role="recording-folder"]')?.getAttribute('data-xgc-id')))
      .toEqual(['system', 'xgc']);

    fireEvent.click(screen.getByRole('button', { name: /System recordings/ }));
    const name = screen.getByText(longName);
    const row = name.closest('[data-xgc-role="recording-row"]');
    expect(row).toBe(container.querySelector(
      `[data-xgc-role="recording-row"][data-xgc-id="${longName}"]`,
    ));
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass('home-recording-row');
    expect(row?.querySelector('.home-recording-main')).toContainElement(name);
    expect(row?.querySelector('.home-recording-main')).toHaveClass('home-recording-main');
    expect(row?.querySelector('.home-recording-name')).toBe(name);
    expect(row?.querySelector('.home-recording-meta')).toBeInTheDocument();
    expect(row?.querySelector('.home-recording-meta')?.parentElement).toBe(row?.querySelector('.home-recording-main'));
  });

  it('starts System collapsed so both folder headers stay visible', () => {
    const recordings = [file('xscreen-a.mp4'), file('xgc-screen-b.webm')];
    const { container } = renderLibrary(library({ recordings, filtered: recordings }));
    expect(container.querySelector('[data-xgc-role="recording-folder"][data-xgc-id="system"]')).toHaveAttribute('data-xgc-collapsed', 'true');
    expect(container.querySelector('[data-xgc-role="recording-row"][data-xgc-id="xscreen-a.mp4"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-row"][data-xgc-id="xgc-screen-b.webm"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /System recordings/ }));
    expect(container.querySelector('[data-xgc-role="recording-folder"][data-xgc-id="system"]')).not.toHaveAttribute('data-xgc-collapsed');
    expect(container.querySelector('[data-xgc-role="recording-row"][data-xgc-id="xscreen-a.mp4"]')).toBeInTheDocument();
    expect(container.querySelector('.home-recording-list .xgc-list-folder')).not.toHaveClass('xgc-panel');
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

  it('forwards search input to the library query', () => {
    const state = library();
    renderLibrary(state);
    fireEvent.change(screen.getByLabelText('Search recordings by name'), { target: { value: 'flight' } });
    expect(state.setQuery).toHaveBeenCalledWith('flight');
  });

  it('plays, stops, renders contributed open-folder action, and deletes a selected recording', () => {
    const selected = file('a.webm', { durationMs: 134_000, width: 1920, height: 1080 });
    const state = library({ selectedId: 'a.webm', selected, playbackUrl: 'blob:playback' });
    const { container } = renderLibrary(state, [openFolderAction]);

    const video = container.querySelector('[data-xgc-role="recording-video"]');
    expect(video).toHaveAttribute('src', 'blob:playback');
    expect(container.querySelector('[data-xgc-role="recording-download"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="recording-actions"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-open-folder"][data-xgc-id="recording-open-folder"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeInTheDocument();
    expect(screen.queryByText('Recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Size')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolution')).not.toBeInTheDocument();
    expect(screen.queryByText('1920×1080')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(state.stopPlayback).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(state.remove).toHaveBeenCalledWith('a.webm');
  });

  it('keeps a selected recording usable when no actions are contributed', () => {
    const selected = file('a.webm');
    const state = library({ selectedId: 'a.webm', selected, playbackUrl: 'blob:playback' });
    const { container } = renderLibrary(state, []);

    expect(container.querySelector('[data-xgc-role="recording-library"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-video"]')).toHaveAttribute('src', 'blob:playback');
    expect(container.querySelector('[data-xgc-role="recording-actions"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="recording-open-folder"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open folder' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(state.stopPlayback).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(state.remove).toHaveBeenCalledWith('a.webm');
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

  it('gives the retry and confirm-cancel buttons markable identities', () => {
    const error = library({ error: 'boom', recordings: [], filtered: [] });
    const { container, rerender } = renderLibrary(error);
    expect(container.querySelector('[data-xgc-role="recording-retry"][data-xgc-id="recording-retry"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    const selected = file('a.webm');
    const state = library({ selectedId: 'a.webm', selected });
    rerender(<RecordingLibrary library={state} runtime={runtime} actions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const cancel = container.querySelector('[data-xgc-role="recording-remove-cancel"][data-xgc-id="a.webm"]');
    expect(cancel).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(container.querySelector('[data-xgc-role="recording-remove-cancel"]')).toBeNull();
  });
});
