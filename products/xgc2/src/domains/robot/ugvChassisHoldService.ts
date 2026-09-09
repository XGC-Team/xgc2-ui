import { request } from '../../api/http';
import { executionTargetPath } from '../execution/executionPublic';

export type UgvChassisHoldResult = {
  held: boolean;
  applied: string[];
  failed: string[];
  skipped: number;
};

export async function postUgvChassisHold(
  targetId: string,
  input: { experimentId: string; held: boolean },
): Promise<UgvChassisHoldResult> {
  return request(`${executionTargetPath(targetId)}/ugv-chassis-hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      experimentId: input.experimentId,
      workflowInstanceId: 'panel-robot-instruments',
      held: input.held,
    }),
  });
}
