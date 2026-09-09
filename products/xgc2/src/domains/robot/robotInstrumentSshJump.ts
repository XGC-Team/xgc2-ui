type RobotInstrumentSshJump = (robotAssetId: string,assetTargetCoreId: string) => void;

let jump: RobotInstrumentSshJump | undefined;

export function bindRobotInstrumentSshJump(next: RobotInstrumentSshJump | undefined) {
  jump = next;
  return () => {
    if (jump === next) jump = undefined;
  };
}

export function requestRobotInstrumentSshJump(robotAssetId: string,assetTargetCoreId: string) {
  const id = robotAssetId.trim();
  if (!id) return;
  if (!assetTargetCoreId.trim()) return;
  jump?.(id,assetTargetCoreId.trim());
}
