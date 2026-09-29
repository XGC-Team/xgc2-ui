import { request,requestBlob,uploadRequest } from '../../api/http';
import { segment } from '../../shared/url';

export type RecordingStatus = 'starting' | 'recording' | 'finalized' | 'failed' | 'uncertain';

export type RecordingFile = {
  id: string;
  name: string;
  /** Owner-validated path relative to the user archive. */
  relativePath?: string;
  size: number;
  mediaType?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  experimentId?: string;
  sessionId?: string;
  createdAt: string;
  // Producer-derived facts (screen recording manifest). Archives from before
  // the producer existed carry none of these; they stay absent, never guessed.
  recordId?: string;
  workflowRunId?: string;
  targetId?: string;
  experimentName?: string;
  runMode?: string;
  status?: RecordingStatus;
  startedAt?: string;
  finishedAt?: string;
  hasPoster?: boolean;
};

/** Exact archive filters; each is matched literally by Core, never pattern-expanded. */
export type ListRecordingsInput = {
  experimentId?: string;
  workflowRunId?: string;
  recordId?: string;
  /** Only meaningful together with experimentId (Core rejects it otherwise). */
  sessionId?: string;
  signal?: AbortSignal;
};

export function listRecordings(input: ListRecordingsInput = {}): Promise<RecordingFile[]> {
  const { signal,...filters } = input;
  const params = new URLSearchParams();
  // Canonical order matches the Core handler's read order; caller key order never leaks in.
  for (const key of ['experimentId','sessionId','workflowRunId','recordId'] as const) {
    const value = filters[key];
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) params.set(key, trimmed);
  }
  const query = params.toString();
  return request<RecordingFile[]>(`/recordings${query ? `?${query}` : ''}`, signal ? { signal } : {});
}

export function getRecordingLocation(): Promise<{ path: string }> {
  return request<{ path: string }>('/recordings/location');
}

// Import an existing file, including one made with a system recorder.
export function uploadRecording(file: Blob, name: string): Promise<RecordingFile> {
  const data = new FormData();
  data.append('file', file, name);
  data.append('name', name);
  return uploadRequest<RecordingFile>('/recordings', data, { timeoutMs: 60_000 });
}

export function downloadRecording(id: string): Promise<Blob> {
  return requestBlob(`/recordings/${segment(id)}/download`);
}

export function fetchRecordingThumbnail(id: string): Promise<Blob> {
  return requestBlob(`/recordings/${segment(id)}/thumbnail`);
}

export function deleteRecording(id: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/recordings/${segment(id)}`, { method: 'DELETE' });
}
