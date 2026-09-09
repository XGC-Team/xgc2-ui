import {
  mediaSourceID,
  normalizeMediaEdgeURL,
} from '../../domains/execution/executionPublic';
import {
  cameraValidationIssueMessage,
  type CameraValidationIssue,
} from './cameraValidationIssue';

export const CAMERA_VIDEO_MEDIA_WORKFLOW_SLOT = 'b2-onboard-media';

export const CAMERA_VIDEO_PANEL_DEFAULTS = {
  mediaBindingId: CAMERA_VIDEO_MEDIA_WORKFLOW_SLOT,
  imageFit: 'contain',
  reconnectPolicy: 'automatic',
  showMetadata: true,
  autoConnect: true,
  autoConnectOnExperimentRun: true,
} as const;

export type CameraVideoPanelOptions = {
  mediaBindingId: string;
  imageFit: 'contain' | 'cover';
  reconnectPolicy: 'automatic' | 'manual';
  showMetadata: boolean;
  autoConnect: boolean;
  autoConnectOnExperimentRun: boolean;
};

export function cameraVideoPanelOptions(options: Record<string,unknown>): CameraVideoPanelOptions {
  return {
    mediaBindingId:typeof options.mediaBindingId === 'string'
      ? options.mediaBindingId
      : CAMERA_VIDEO_PANEL_DEFAULTS.mediaBindingId,
    imageFit:options.imageFit === 'cover' ? 'cover' : 'contain',
    reconnectPolicy:options.reconnectPolicy === 'manual' ? 'manual' : 'automatic',
    showMetadata:options.showMetadata !== false,
    autoConnect:options.autoConnect !== false,
    autoConnectOnExperimentRun:options.autoConnectOnExperimentRun !== false,
  };
}

export type CameraVideoPanelRuntime =
  | { kind: 'failed' | 'waiting';title: string;description: string;issue:CameraValidationIssue }
  | { kind: 'ready';title: string;description: '';edgeUrl: string;sourceId: string };

export function containedVideoSize({
  containerWidth,
  containerHeight,
  sourceWidth,
  sourceHeight,
}: {
  containerWidth: number;
  containerHeight: number;
  sourceWidth: number;
  sourceHeight: number;
}) {
  if (![containerWidth,containerHeight,sourceWidth,sourceHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  )) return undefined;

  const sourceAspectRatio = sourceWidth / sourceHeight;
  const containerAspectRatio = containerWidth / containerHeight;
  if (containerAspectRatio > sourceAspectRatio) {
    return {
      width:containerHeight * sourceAspectRatio,
      height:containerHeight,
    };
  }
  return {
    width:containerWidth,
    height:containerWidth / sourceAspectRatio,
  };
}

export function cameraVideoPanelRuntime({
  requestedEdgeUrl,
  requestedSourceId,
}: {
  requestedEdgeUrl: unknown;
  requestedSourceId: unknown;
}): CameraVideoPanelRuntime {
  if (requestedEdgeUrl === undefined || requestedEdgeUrl === '') {
    const issue = { code:'media-edge-required' } as const;
    return {
      kind: 'waiting',
      title: 'Configure Media Edge',
      description: cameraValidationIssueMessage(issue),
      issue,
    };
  }
  let edgeUrl: string;
  try {
    edgeUrl = normalizeMediaEdgeURL(requestedEdgeUrl);
  } catch {
    const issue = { code:'media-edge-url-invalid' } as const;
    return {
      kind: 'failed',
      title: 'Invalid Media Edge URL',
      description: cameraValidationIssueMessage(issue),
      issue,
    };
  }
  if (requestedSourceId === undefined || requestedSourceId === '') {
    const issue = { code:'media-source-required' } as const;
    return {
      kind: 'waiting',
      title: 'Configure camera source',
      description: cameraValidationIssueMessage(issue),
      issue,
    };
  }
  const sourceId = mediaSourceID(requestedSourceId);
  if (typeof requestedSourceId !== 'string' || sourceId !== requestedSourceId) {
    const issue = { code:'media-source-id-invalid' } as const;
    return {
      kind: 'failed',
      title: 'Invalid camera source',
      description: cameraValidationIssueMessage(issue),
      issue,
    };
  }
  return { kind: 'ready',title: sourceId,description: '',edgeUrl,sourceId };
}

export function validateCameraVideoPanelOptions(options: Record<string,unknown>) {
  const issue=validateCameraVideoPanelOptionsIssue(options);
  return issue ? cameraValidationIssueMessage(issue) : '';
}

export function validateCameraVideoPanelOptionsIssue(
  options: Record<string,unknown>,
): CameraValidationIssue | undefined {
  if (options.mediaBindingId !== undefined && (
    typeof options.mediaBindingId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(options.mediaBindingId)
  )) {
    return { code:'media-binding-id-invalid' };
  }
  if (options.imageFit !== undefined && !['contain','cover'].includes(String(options.imageFit))) {
    return { code:'camera-image-fit-invalid' };
  }
  if (options.reconnectPolicy !== undefined && !['automatic','manual'].includes(String(options.reconnectPolicy))) {
    return { code:'camera-reconnect-policy-invalid' };
  }
  for (const field of ['showMetadata','autoConnect','autoConnectOnExperimentRun']) {
    if (options[field] !== undefined && typeof options[field] !== 'boolean') {
      return { code:'camera-boolean-option-invalid',args:{ field } };
    }
  }
  return undefined;
}
