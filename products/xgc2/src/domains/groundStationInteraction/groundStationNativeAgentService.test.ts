import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { getGroundStationNativeCapabilities } from './groundStationNativeAgentService';

vi.mock('../../api/http',() => ({ request: vi.fn() }));
vi.mock('../../api/nativeAgent',() => ({ fetchNativeAgent: vi.fn(),openNativeAgentStream: vi.fn() }));

describe('native Experiment capabilities',() => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the exact Experiment capabilities route and abort signal',async () => {
    const capabilities = { available: false,detail: 'No reviewed workspace is configured.',profiles: [],workspaces: [],workspaceBinding:null,executionTargetId: 'local' };
    const controller = new AbortController();
    vi.mocked(request).mockResolvedValueOnce({ data: capabilities });
    await expect(getGroundStationNativeCapabilities('experiment-a',controller.signal)).resolves.toEqual({...capabilities,experimentServices:false});
    expect(request).toHaveBeenCalledExactlyOnceWith('/experiments/experiment-a/native-agents/capabilities',{ signal: controller.signal });
  });

  it.each(['','../experiment-a','experiment-a/elsewhere','experiment-a?target=remote'])('rejects an inexact resource ID %j before transport',async (id) => {
    await expect(getGroundStationNativeCapabilities(id)).rejects.toThrow('exact Experiment resource ID');
    expect(request).not.toHaveBeenCalled();
  });
});
