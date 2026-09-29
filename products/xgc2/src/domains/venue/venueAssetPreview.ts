/** Read-only presentation of existing scene parts, not a deployment/readiness contract. */
type PreviewPart = { role: string; bytes: number; digestMatches?: boolean };
type PreviewAsset = {
  preview?: { kind: 'still'; file: string; width?: number; height?: number };
  media?: { kind: string; width?: number; height?: number };
  camera?: { width: number; height: number };
  extrinsic?: { parentFrame: string; childFrame: string };
  obstacles?: { frame: string; count: number };
  gazeboWorld?: { file: string };
  parts: readonly PreviewPart[];
  replayable: boolean;
  replayIssues: readonly string[];
};

export function venuePartAvailable(parts: readonly PreviewPart[], role: string): boolean {
  const matches = parts.filter((part) => part.role === role);
  return matches.length === 1 && Number.isFinite(matches[0].bytes)
    && matches[0].bytes > 0 && matches[0].digestMatches !== false;
}

/** Uses the selected asset only. A manifest declaration is not proof that its attachment is readable. */
export function venueAssetPreview(asset: PreviewAsset) {
  const directoryPreview = asset.preview?.kind === 'still';
  const image = asset.media?.kind === 'still';
  const originalVideo = asset.media?.kind === 'loop';
  const mediaAvailable = venuePartAvailable(asset.parts, 'media');
  const displayImageSource = directoryPreview ? 'preview' : image && mediaAvailable ? 'media' : undefined;
  const displayImageDimensions = displayImageSource === 'preview' ? {
    width: asset.preview?.width,
    height: asset.preview?.height,
  }
    : displayImageSource === 'media' ? asset.media : undefined;
  const photoExpected = directoryPreview || image;
  const geometryAvailable = venuePartAvailable(asset.parts, 'sceneDocument') && Boolean(asset.obstacles
    && Number.isInteger(asset.obstacles.count) && asset.obstacles.count >= 0 && asset.obstacles.frame.trim());
  const cameraAvailable = venuePartAvailable(asset.parts, 'cameraInfo') && Boolean(asset.camera
    && Number.isInteger(asset.camera.width) && asset.camera.width > 0
    && Number.isInteger(asset.camera.height) && asset.camera.height > 0);
  const poseAvailable = venuePartAvailable(asset.parts, 'extrinsic') && Boolean(asset.extrinsic
    && asset.extrinsic.parentFrame.trim() && asset.extrinsic.childFrame.trim());
  const frameMismatch = Boolean(asset.obstacles?.frame && asset.extrinsic?.parentFrame
    && asset.obstacles.frame !== asset.extrinsic.parentFrame);
  const issues: string[] = [];
  if (!image && !directoryPreview) issues.push(originalVideo
    ? 'Original video is retained as source material. Select a still frame in Tools before using an image scene.'
    : 'No site image is attached.');
  if ((image || originalVideo) && !mediaAvailable) issues.push('Source media is missing, empty or changed.');
  if (image && !geometryAvailable) issues.push('Obstacle geometry is missing, unreadable or changed.');
  if (image && !cameraAvailable) issues.push('Camera calibration is missing, unreadable or changed.');
  if (image && !poseAvailable) issues.push('Camera pose is missing, unreadable or changed.');
  if (image && frameMismatch) issues.push('Camera pose and obstacle geometry use different coordinate frames.');
  if (image && mediaAvailable && geometryAvailable && cameraAvailable && poseAvailable && !frameMismatch
    && (!asset.replayable || asset.replayIssues.length > 0)) {
    issues.push('Image replay has unresolved source or calibration checks. Repair the asset in Tools.');
  }
  return {
    image, originalVideo, directoryPreview, displayImageSource, displayImageDimensions, photoExpected,
    mediaAvailable, geometryAvailable, cameraAvailable, poseAvailable, frameMismatch, issues,
    imagePrerequisitesMet: image && mediaAvailable && geometryAvailable && cameraAvailable && poseAvailable && !frameMismatch
      && asset.replayable && asset.replayIssues.length === 0,
    worldDeclared: Boolean(asset.gazeboWorld?.file),
    worldAvailable: Boolean(asset.gazeboWorld?.file) && venuePartAvailable(asset.parts, 'gazeboWorld'),
  };
}
