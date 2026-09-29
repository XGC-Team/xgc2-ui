import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request,requestBlob } from '../../api/http';
import { fetchRecordingThumbnail,getRecordingLocation,listRecordings } from './recordingService';

vi.mock('../../api/http', () => ({
  request: vi.fn(() => Promise.resolve({ path: '/recordings' })),
  requestBlob: vi.fn(),
  uploadRequest: vi.fn(),
}));

describe('recordingService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the trusted local recording directory without downloading a file', async () => {
    await expect(getRecordingLocation()).resolves.toEqual({ path: '/recordings' });
    expect(request).toHaveBeenCalledWith('/recordings/location');
  });

  it('keeps the unfiltered archive listing for existing no-input callers', async () => {
    await listRecordings();
    expect(request).toHaveBeenCalledWith('/recordings', {});
  });

  it('passes only the supplied exact filters as the recordings query', async () => {
    await listRecordings({ experimentId: 'exp-a', workflowRunId: 'run-1' });
    expect(request).toHaveBeenCalledWith('/recordings?experimentId=exp-a&workflowRunId=run-1', {});
    await listRecordings({ recordId: ' rec-9 ', sessionId: 'session-2', experimentId: 'exp-b' });
    expect(request).toHaveBeenCalledWith(
      '/recordings?experimentId=exp-b&sessionId=session-2&recordId=rec-9',
      {},
    );
  });

  it('forwards the caller AbortSignal into the request init', async () => {
    const controller = new AbortController();
    await listRecordings({ workflowRunId: 'run-1', signal: controller.signal });
    expect(request).toHaveBeenCalledWith('/recordings?workflowRunId=run-1', { signal: controller.signal });
  });

  it('fetches the issued recording JPEG sidecar, not the MP4', async () => {
    await fetchRecordingThumbnail('screen.bash-record.ab');
    expect(requestBlob).toHaveBeenCalledWith('/recordings/screen.bash-record.ab/thumbnail');
  });
});
