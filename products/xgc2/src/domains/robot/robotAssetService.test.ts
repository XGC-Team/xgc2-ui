import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { checkRobotAssetReachability } from './robotAssetService';

vi.mock('../../api/http',() => ({ request: vi.fn() }));

describe('robotAssetService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks the stored Robot management address through Core', async () => {
    vi.mocked(request).mockResolvedValue({
      address: '192.0.2.10',reachable: true,latencyMs: 12,
      detail: 'device responded',checkedAt: '2026-08-10T10:00:00Z',
    });

    await expect(checkRobotAssetReachability('robot/a')).resolves.toMatchObject({
      address: '192.0.2.10',reachable: true,latencyMs: 12,
    });
    expect(request).toHaveBeenCalledWith('/robot-assets/robot%2Fa/reachability',{ method: 'POST' },undefined);
    await checkRobotAssetReachability('robot/a',{ targetCoreId:'catalog-core' });
    expect(request).toHaveBeenLastCalledWith('/robot-assets/robot%2Fa/reachability',{ method:'POST' },{ targetCoreId:'catalog-core' });
  });

  it('rejects malformed reachability results', async () => {
    vi.mocked(request).mockResolvedValue({ online: 'yes' });
    await expect(checkRobotAssetReachability('robot-a')).rejects.toThrow(
      'Invalid Robot management reachability diagnostic response',
    );
  });
});
