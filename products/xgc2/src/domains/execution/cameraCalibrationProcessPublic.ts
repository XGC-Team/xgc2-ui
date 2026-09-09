import type { ProcessInstance } from './executionModel';

export { cameraExtrinsicSolvePreflight } from './cameraExtrinsicCalibrationModel';

export {
  decodeCameraExtrinsicResult,
  decodeCameraExtrinsicState,
  freezeCameraExtrinsicFrame,
  loadCameraExtrinsicImage,
  loadCameraExtrinsicState,
  resumeCameraExtrinsicLive,
  saveCameraExtrinsicCandidate,
  solveCameraExtrinsic,
  type CameraExtrinsicMarker,
  type CameraExtrinsicPixel,
  type CameraExtrinsicPoint,
  type CameraExtrinsicProjection,
  type CameraExtrinsicResult,
  type CameraExtrinsicSolvePoint,
  type CameraExtrinsicState,
} from './cameraExtrinsicCalibrationService';

export {
  analyzeCameraIntrinsicCandidate,
  startCameraIntrinsicAnalysis,
  autoRunCameraIntrinsic,
  captureCameraIntrinsicValidation,
  commitCameraIntrinsicAsset,
  continueCameraIntrinsicCollection,
  decodeCameraIntrinsicCandidate,
  decodeCameraIntrinsicResult,
  decodeCameraIntrinsicState,
  decodeCameraIntrinsicValidationReport,
  gotoCameraIntrinsicTarget,
  loadCameraIntrinsicImage,
  loadCameraIntrinsicEvidence,
  loadCameraIntrinsicCalibrationFiles,
  loadCameraIntrinsicReference,
  loadCameraIntrinsicState,
  loadCameraIntrinsicValidationImage,
  openCameraIntrinsicStateStream,
  resetCameraIntrinsic,
  resetCameraIntrinsicPose,
  saveCameraIntrinsicCandidate,
  startCameraIntrinsicAutoCapture,
  stopCameraIntrinsicAutoCapture,
  type CameraIntrinsicAction,
  type CameraIntrinsicAutoCapture,
  type CameraIntrinsicAutoCaptureResult,
  type CameraCalibrationAssetPin,
  type CameraIntrinsicActionResult,
  type CameraIntrinsicAutoRunResult,
  type CameraIntrinsicCandidate,
  type CameraIntrinsicCandidatePool,
  type CameraIntrinsicCandidateQuality,
  type CameraIntrinsicCandidateQualityAssessment,
  type CameraIntrinsicCoverage,
  type CameraIntrinsicDetection,
  type CameraIntrinsicDetectionMetric,
  type CameraIntrinsicEvidence,
  type CameraIntrinsicGotoResult,
  type CameraIntrinsicGuidance,
  type CameraIntrinsicParameters,
  type CameraIntrinsicPose,
  type CameraIntrinsicRecovery,
  type CameraIntrinsicResult,
  type CameraIntrinsicState,
  type CameraIntrinsicTarget,
  type CameraIntrinsicCalibrationFile,
  type CameraIntrinsicValidationConfiguration,
  type CameraIntrinsicValidationReport,
  type CameraIntrinsicValidationRequest,
  type CameraIntrinsicValidationView,
} from './cameraIntrinsicCalibrationService';

export const CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID = 'xgc2-camera-intrinsic-calibrator-ros1';

export function cameraIntrinsicCalibrationProcessForRun(
  instances: readonly ProcessInstance[],
  runId: string,
) {
  return instances
    .filter((instance) => instance.definitionId === CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID
      && instance.ownerType === 'orchestration-run'
      && instance.ownerId === runId)
    .sort((left,right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}
