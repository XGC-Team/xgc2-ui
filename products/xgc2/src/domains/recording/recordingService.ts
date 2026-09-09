import { request,requestBlob,uploadRequest } from '../../api/http';
import { segment } from '../../shared/url';

export type RecordingFile = {
  id: string;
  name: string;
  size: number;
  mediaType?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  experimentId?: string;
  sessionId?: string;
  createdAt: string;
};

export function listRecordings(): Promise<RecordingFile[]> {
  return request<RecordingFile[]>('/recordings');
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

export function deleteRecording(id: string): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/recordings/${segment(id)}`, { method: 'DELETE' });
}
