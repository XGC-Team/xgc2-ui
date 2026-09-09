import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { postUgvChassisHold } from './ugvChassisHoldService';

vi.mock('../../api/http',() => ({ request:vi.fn(() => Promise.resolve({ held:true,applied:['scout-01'],failed:[],skipped:0 })) }));

describe('postUgvChassisHold',() => {
  beforeEach(() => vi.clearAllMocks());

  it('posts held to the execution-target short path',async () => {
    await postUgvChassisHold('local',{ experimentId:'experiment-a',held:true });
    expect(request).toHaveBeenCalledWith('/execution-targets/local/ugv-chassis-hold',{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        experimentId:'experiment-a',
        workflowInstanceId:'panel-robot-instruments',
        held:true,
      }),
    });
  });
});
