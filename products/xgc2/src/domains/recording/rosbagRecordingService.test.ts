import { describe,expect,it,vi } from 'vitest';
import { requestBlob } from '../../api/http';
import { downloadROSBagRecording } from './rosbagRecordingService';

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
