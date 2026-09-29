import { request } from '../../api/http';
import { executionTargetPath } from '../execution/executionPublic';

export type RobotMotionIntent = {
  gear: 1 | 2 | 3;
  longitudinal: -1 | 0 | 1;
  lateral: -1 | 0 | 1;
  yaw: -1 | 0 | 1;
  release?: boolean;
  generation?: number;
  takeover?: boolean;
};

export async function postRobotMotionIntent(
  targetId: string,
  input: RobotMotionIntent & {
    experimentId: string;
    sessionId?: string;
    controllerId: string;
    robotIds: readonly string[];
  },
): Promise<{ generation: number }> {
  const payload = await request<unknown>(`${executionTargetPath(targetId)}/robot-motion-intent`, {
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
      release: input.release === true,
      generation: input.generation ?? 0,
      takeover: input.takeover === true,
    }),
  });
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const generation = record.generation;
  return {
    generation: typeof generation === 'number' && Number.isSafeInteger(generation) && generation > 0 ? generation : 0,
  };
}
