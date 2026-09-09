export type WorldCameraIntrinsicSelection = {
  simulationIntrinsicFile: string;
  physicalIntrinsicFile: string;
  calibrationRoot: string;
  cameraName: string;
};

/** Read the operator-owned YAML paths from the world-camera Action schema. */
export function worldCameraIntrinsicSelection(inputs: Record<string, unknown>): WorldCameraIntrinsicSelection {
  return {
    simulationIntrinsicFile: typeof inputs.simulationIntrinsicFile === 'string' ? inputs.simulationIntrinsicFile : '',
    physicalIntrinsicFile: typeof inputs.physicalIntrinsicFile === 'string' ? inputs.physicalIntrinsicFile : '',
    calibrationRoot: typeof inputs.calibrationRoot === 'string' ? inputs.calibrationRoot : '',
    cameraName: typeof inputs.cameraName === 'string' && inputs.cameraName ? inputs.cameraName : 'usb_cam',
  };
}

/** Write the two optional timestamped YAML selections back to the flat Action schema. */
export function withWorldCameraIntrinsicSelection(
  inputs: Record<string, unknown>,
  next: { simulationIntrinsicFile: string; physicalIntrinsicFile: string },
): Record<string, unknown> {
  return {
    ...inputs,
    simulationIntrinsicFile: next.simulationIntrinsicFile,
    physicalIntrinsicFile: next.physicalIntrinsicFile,
  };
}

export function worldCameraIntrinsicPartitionPath(
  calibrationRoot: string,
  mode: 'sim' | 'phy',
  cameraName: string,
): string {
  const root = calibrationRoot.replace(/\/+$/, '');
  if (!root) return '';
  return `${root}/${mode}/${cameraName}`;
}

/** UI admission; the backend still resolves symlinks and enforces the partition. */
export function worldCameraIntrinsicPathMatches(path:string,root:string,mode:'sim'|'phy',cameraName:string):boolean {
  if (!path) return true;
  const directory=worldCameraIntrinsicPartitionPath(root,mode,cameraName);
  if (!directory.startsWith('/') || !path.startsWith(`${directory}/`)) return false;
  const leaf=path.slice(directory.length+1);
  return /^intrinsics-\d{8}T\d{6}(?:\.\d+)?Z(?:-\d{2})?\.yaml$/.test(leaf);
}
