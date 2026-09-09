import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import {
  initialAutomationPickerPath,
  initialGazeboWorldPickerPath,
  matchesAutomationFileExtensions,
  type AutomationPathKind,
  type AutomationPathPickerVariant,
} from './automationPathPickerModel';
import type {
  AutomationTargetFile,
  AutomationTargetFileList,
  AutomationWorldPreview,
} from './automationTargetContracts';
import { getAutomationWorldPreview,listAutomationTargetFiles } from './automationTargetService';

export function useAutomationPathBrowser({
  targetId,
  kind,
  fileExtensions,
  value,
  variant = 'path',
}: {
  targetId: string;
  kind: AutomationPathKind;
  fileExtensions?: readonly string[];
  value: string;
  variant?: AutomationPathPickerVariant;
}) {
  const worldPicker = variant === 'world';
  const initialPath = worldPicker
    ? initialGazeboWorldPickerPath(targetId, value)
    : initialAutomationPickerPath(targetId, kind, value);
  const [path, setPath] = useState(initialPath);
  const [files, setFiles] = useState<AutomationTargetFileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<AutomationTargetFile | null>(null);
  const [preview, setPreview] = useState<AutomationWorldPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const directoryRequest = useRef(0);
  const previewRequest = useRef(0);

  const load = useCallback(async (nextPath: string) => {
    const requestId = directoryRequest.current + 1;
    directoryRequest.current = requestId;
    setLoading(true);
    setError('');
    try {
      const next = await listAutomationTargetFiles(targetId, nextPath);
      if (directoryRequest.current !== requestId) return;
      setFiles(next);
      setPath(next.path);
      setSelectedFile(null);
      setPreview(null);
      setPreviewLoading(false);
      previewRequest.current += 1;
    } catch (cause) {
      if (directoryRequest.current === requestId) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (directoryRequest.current === requestId) setLoading(false);
    }
  }, [targetId]);

  const selectFile = useCallback(async (entry: AutomationTargetFile) => {
    setSelectedFile(entry);
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    // Scene preview is Gazebo-world-only; generic path picks never hit the world preview API.
    if (!worldPicker || !entry.name.toLowerCase().endsWith('.world')) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    setPreview(null);
    setPreviewLoading(true);
    try {
      const next = await getAutomationWorldPreview(targetId, entry.path);
      if (previewRequest.current === requestId) setPreview(next);
    } catch {
      if (previewRequest.current === requestId) setPreview({ worldPath: entry.path });
    } finally {
      if (previewRequest.current === requestId) setPreviewLoading(false);
    }
  }, [targetId,worldPicker]);

  useEffect(() => {
    setPath(initialPath);
    void load(initialPath);
    return () => {
      directoryRequest.current += 1;
      previewRequest.current += 1;
    };
  }, [initialPath,load]);

  const visibleEntries = useMemo(
    () => (files?.entries ?? []).filter((entry) => (
      entry.isDir || kind !== 'file' || matchesAutomationFileExtensions(entry.name, fileExtensions)
    )),
    [fileExtensions,files?.entries,kind],
  );

  return {
    error,
    files,
    load,
    loading,
    path,
    preview,
    previewLoading,
    selectedFile,
    selectFile,
    setPath,
    visibleEntries,
    worldPicker,
  };
}
