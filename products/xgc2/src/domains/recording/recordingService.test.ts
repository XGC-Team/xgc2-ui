import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { getRecordingLocation } from './recordingService';

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
});
