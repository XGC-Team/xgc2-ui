import { describe,expect,it,vi } from 'vitest';
import { request,requestBlob } from '../../api/http';
import { deleteROSBagRecording,downloadROSBagRecording } from './rosbagRecordingService';

vi.mock('../../api/http',() => ({ request: vi.fn(),requestBlob: vi.fn() }));

describe('rosbag archive download',() => {
  it('uses the authenticated blob transport and encodes the artifact identifier',async () => {
    const blob = new Blob(['recorded data']);
    const controller = new AbortController();
    vi.mocked(requestBlob).mockResolvedValueOnce(blob);
    await expect(downloadROSBagRecording('bag /1',controller.signal)).resolves.toBe(blob);
    expect(requestBlob).toHaveBeenCalledWith('/recordings/rosbags/bag%20%2F1/download',{ signal: controller.signal });
  });
});

describe('rosbag archive delete',() => {
  it('DELETEs the encoded archive identity',async () => {
    const controller = new AbortController();
    vi.mocked(request).mockResolvedValueOnce({ deleted:'inner.bag' });
    await expect(deleteROSBagRecording('bag /1',controller.signal)).resolves.toEqual({ deleted:'inner.bag' });
    expect(request).toHaveBeenCalledWith('/recordings/rosbags/bag%20%2F1',{ method:'DELETE',signal: controller.signal });
  });
});
