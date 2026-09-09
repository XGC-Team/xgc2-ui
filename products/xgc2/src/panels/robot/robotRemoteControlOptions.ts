export const ROBOT_REMOTE_SPRING_RETURN_OPTION = 'springReturn';

export function robotRemoteSpringReturn(options: Record<string, unknown> | undefined): boolean {
  return options?.[ROBOT_REMOTE_SPRING_RETURN_OPTION] === true;
}

export function withRobotRemoteSpringReturn(
  options: Record<string, unknown>,
  springReturn: boolean,
): Record<string, unknown> {
  const next = { ...options };
  if (springReturn) next[ROBOT_REMOTE_SPRING_RETURN_OPTION] = true;
  else delete next[ROBOT_REMOTE_SPRING_RETURN_OPTION];
  return next;
}
