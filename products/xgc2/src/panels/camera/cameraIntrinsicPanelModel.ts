import { mediaSourceID,normalizeMediaEdgeURL } from '../../domains/execution/executionPublic';
import { DEFAULT_LOCAL_MEDIA_EDGE_URL } from '../../config/urls';
import {
  cameraValidationIssueMessage,
  type CameraValidationIssue,
} from './cameraValidationIssue';

/** The required Panel Workflow Action port for this calibration view. */
export const CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT = 'camera-intrinsic-calibration';

export type CameraIntrinsicPanelOptions = {
  edgeUrl: string;
  sourceId: string;
};

export const CAMERA_INTRINSIC_PANEL_DEFAULTS: CameraIntrinsicPanelOptions = {
  edgeUrl:DEFAULT_LOCAL_MEDIA_EDGE_URL,
  sourceId:'usb_cam',
};

export function cameraIntrinsicPanelOptions(
  options: Record<string,unknown>,
): CameraIntrinsicPanelOptions {
  const source = options;
  return {
    edgeUrl:stringOption(source.edgeUrl, CAMERA_INTRINSIC_PANEL_DEFAULTS.edgeUrl),
    sourceId:stringOption(source.sourceId, CAMERA_INTRINSIC_PANEL_DEFAULTS.sourceId),
  };
}

export function validateCameraIntrinsicPanelOptions(
  options: Record<string,unknown>,
) {
  const issue=validateCameraIntrinsicPanelOptionsIssue(options);
  return issue ? cameraValidationIssueMessage(issue) : '';
}

export function validateCameraIntrinsicPanelOptionsIssue(
  options: Record<string,unknown>,
): CameraValidationIssue | undefined {
  const value = cameraIntrinsicPanelOptions(options);
  let normalized:string;
  try {
    normalized=normalizeMediaEdgeURL(value.edgeUrl);
  } catch {
    return { code:'media-edge-url-invalid' };
  }
  const url=new URL(normalized);
  if (url.protocol !== 'http:') return { code:'managed-intrinsic-media-edge-http-required' };
  if (!url.port) return { code:'media-edge-explicit-port-required' };
  const port=Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { code:'media-edge-port-invalid' };
  }
  if (mediaSourceID(value.sourceId) !== value.sourceId) {
    return { code:'calibration-camera-source-id-invalid' };
  }
  return undefined;
}

function stringOption(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}
