import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import { postRobotMotionIntent } from './robotMotionIntentService';

vi.mock('../../api/http',() => ({ request:vi.fn(() => Promise.resolve({ applied:1 })) }));

describe('postRobotMotionIntent',() => {
  beforeEach(() => vi.clearAllMocks());

  it('posts one discrete intent to the execution-target short path',async () => {
    await postRobotMotionIntent('local',{
      experimentId:'experiment-a',
      sessionId:'session-a',
      controllerId:'window-1',
      robotIds:['scout-01','mecanum-01'],
      gear:2,
      longitudinal:1,
      lateral:-1,
      yaw:0,
    });
    expect(request).toHaveBeenCalledWith('/execution-targets/local/robot-motion-intent',{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        experimentId:'experiment-a',
      sessionId:'session-a',
        workflowInstanceId:'panel-robot-instruments',
        controllerId:'window-1',
        robotIds:['scout-01','mecanum-01'],
        gear:2,
        longitudinal:1,
        lateral:-1,
        yaw:0,
        release:false,
        generation:0,
        takeover:false,
      }),
    });
  });

  it('posts release when the remote window closes',async () => {
    await postRobotMotionIntent('local',{
      experimentId:'experiment-a',
      sessionId:'session-a',
      controllerId:'window-1',
      robotIds:['scout-01'],
      gear:1,
      longitudinal:0,
      lateral:0,
      yaw:0,
      release:true,
    });
    expect(JSON.parse(String((request as ReturnType<typeof vi.fn>).mock.calls[0][1].body))).toMatchObject({
      release:true,
    });
  });
});
