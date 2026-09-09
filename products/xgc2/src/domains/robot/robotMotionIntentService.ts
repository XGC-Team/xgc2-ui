import { request } from '../../api/http';
import { executionTargetPath } from '../execution/executionPublic';

export type RobotMotionIntent = {
  gear: 1 | 2 | 3;
  longitudinal: -1 | 0 | 1;
  lateral: -1 | 0 | 1;
  yaw: -1 | 0 | 1;
};

export async function postRobotMotionIntent(
  targetId: string,
  input: RobotMotionIntent & {
    experimentId: string;
    sessionId?: string;
    controllerId: string;
    robotIds: readonly string[];
  },
): Promise<void> {
  await request(`${executionTargetPath(targetId)}/robot-motion-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      experimentId: input.experimentId,
      sessionId: input.sessionId,
      workflowInstanceId: 'panel-robot-instruments',
      controllerId: input.controllerId,
      robotIds: [...input.robotIds],
      gear: input.gear,
      longitudinal: input.longitudinal,
      lateral: input.lateral,
      yaw: input.yaw,
    }),
  });
}
