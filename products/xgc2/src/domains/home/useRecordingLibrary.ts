import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import { deleteRecording,downloadRecording,listRecordings,type RecordingFile } from '../recording/recordingPublic';

export type RecordingLibrary = {
  recordings: RecordingFile[];
  loading: boolean;
  error: string;
  query: string;
  setQuery: (value: string) => void;
  filtered: RecordingFile[];
  selectedId: string;
  selected: RecordingFile | undefined;
  select: (id: string) => void;
  stopPlayback: () => void;
  playbackUrl: string;
  playbackLoading: boolean;
  playbackError: string;
  removingId: string;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useRecordingLibrary(): RecordingLibrary {
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [removingId, setRemovingId] = useState('');

  const playbackUrlRef = useRef('');
  const playbackTokenRef = useRef(0);
  const removeInFlightRef = useRef(false);
  const beginRefreshRequest = useLatestAsyncRequest('recording-library');
  const beginRemoveRequest = useLatestAsyncRequest('recording-library-remove');

  const revokePlayback = useCallback(() => {
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = '';
    }
  }, []);

  const refresh = useCallback(async () => {
    const isCurrent = beginRefreshRequest();
    setLoading(true);
    try {
      const items = await listRecordings();
      if (!isCurrent()) return;
      setRecordings(items);
      setError('');
    } catch (cause) {
      if (isCurrent()) setError(messageOf(cause));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [beginRefreshRequest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Release the last object URL when the library unmounts.
  useEffect(() => () => {
    playbackTokenRef.current += 1;
    revokePlayback();
  }, [revokePlayback]);

  const select = useCallback((id: string) => setSelectedId(id), []);

  const stopPlayback = useCallback(() => {
    playbackTokenRef.current += 1;
    setSelectedId('');
    revokePlayback();
    setPlaybackUrl('');
    setPlaybackError('');
    setPlaybackLoading(false);
  }, [revokePlayback]);

  useEffect(() => {
    if (!selectedId) {
      playbackTokenRef.current += 1;
      revokePlayback();
      setPlaybackUrl('');
      setPlaybackError('');
      setPlaybackLoading(false);
      return;
    }
    const token = ++playbackTokenRef.current;
    revokePlayback();
    setPlaybackUrl('');
    setPlaybackLoading(true);
    setPlaybackError('');
    void (async () => {
      try {
        const blob = await downloadRecording(selectedId);
        if (token !== playbackTokenRef.current) return;
        revokePlayback();
        const url = URL.createObjectURL(blob);
        playbackUrlRef.current = url;
        setPlaybackUrl(url);
      } catch (cause) {
        if (token !== playbackTokenRef.current) return;
        setPlaybackUrl('');
        setPlaybackError(messageOf(cause));
      } finally {
        if (token === playbackTokenRef.current) setPlaybackLoading(false);
      }
    })();
  }, [selectedId, revokePlayback]);

  const remove = useCallback(async (id: string) => {
    if (removeInFlightRef.current) return;
    removeInFlightRef.current = true;
    const isCurrent = beginRemoveRequest();
    setRemovingId(id);
    try {
      await deleteRecording(id);
      if (!isCurrent()) return;
      setSelectedId((current) => (current === id ? '' : current));
      await refresh();
    } catch (cause) {
      if (isCurrent()) setError(messageOf(cause));
    } finally {
      removeInFlightRef.current = false;
      if (isCurrent()) setRemovingId('');
    }
  }, [beginRemoveRequest,refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recordings;
    return recordings.filter((item) => item.name.toLowerCase().includes(needle));
  }, [query, recordings]);

  const selected = useMemo(
    () => recordings.find((item) => item.id === selectedId),
    [recordings, selectedId],
  );

  return {
    recordings,
    loading,
    error,
    query,
    setQuery,
    filtered,
    selectedId,
    selected,
    select,
    stopPlayback,
    playbackUrl,
    playbackLoading,
    playbackError,
    removingId,
    remove,
    refresh,
  };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
