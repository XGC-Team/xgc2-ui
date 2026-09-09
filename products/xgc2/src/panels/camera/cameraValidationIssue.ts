export type CameraValidationIssue =
  | { code:'camera-sources-missing';args?: undefined }
  | { code:'camera-sources-invalid-json';args?: undefined }
  | { code:'camera-sources-not-list';args?: undefined }
  | { code:'camera-source-not-object';args:{ index:number } }
  | { code:'camera-source-invalid-field-types';args:{ index:number } }
  | { code:'camera-sources-empty';args?: undefined }
  | { code:'camera-sources-too-many';args:{ maximum:number } }
  | { code:'camera-source-invalid-id';args:{ label:string } }
  | { code:'camera-source-duplicate-id';args:{ id:string } }
  | { code:'camera-source-name-required';args:{ index:number } }
  | { code:'camera-source-runtime-invalid';args:{ label:string;issue:CameraValidationIssue } }
  | { code:'camera-sources-none-enabled';args?: undefined }
  | { code:'camera-option-unsupported';args:{ key:string } }
  | { code:'camera-show-metadata-invalid';args?: undefined }
  | { code:'media-edge-required';args?: undefined }
  | { code:'media-edge-url-invalid';args?: undefined }
  | { code:'media-source-required';args?: undefined }
  | { code:'media-source-id-invalid';args?: undefined }
  | { code:'media-binding-id-invalid';args?: undefined }
  | { code:'camera-image-fit-invalid';args?: undefined }
  | { code:'camera-reconnect-policy-invalid';args?: undefined }
  | { code:'camera-boolean-option-invalid';args:{ field:string } }
  | { code:'managed-direct-media-edge-http-required';args?: undefined }
  | { code:'managed-intrinsic-media-edge-http-required';args?: undefined }
  | { code:'media-edge-explicit-port-required';args?: undefined }
  | { code:'media-edge-port-invalid';args?: undefined }
  | { code:'world-camera-source-id-invalid';args?: undefined }
  | { code:'calibration-camera-source-id-invalid';args?: undefined }
  | { code:'world-coordinate-out-of-range';args:{ axis:'X' | 'Y' | 'Z' } }
  | { code:'world-angle-out-of-range';args:{ angle:'Roll' | 'Pitch' | 'Yaw' } };

export function cameraValidationIssueMessage(issue: CameraValidationIssue): string {
  switch (issue.code) {
    case 'camera-sources-missing': return 'Camera source configuration is missing.';
    case 'camera-sources-invalid-json': return 'Camera source configuration is not valid JSON.';
    case 'camera-sources-not-list': return 'Camera source configuration must be a list.';
    case 'camera-source-not-object': return `Camera source ${issue.args.index} must be an object.`;
    case 'camera-source-invalid-field-types': return `Camera source ${issue.args.index} has invalid field types.`;
    case 'camera-sources-empty': return 'Add at least one camera source.';
    case 'camera-sources-too-many':
      return `A multi-camera monitor supports at most ${issue.args.maximum} sources.`;
    case 'camera-source-invalid-id': return `${issue.args.label} has an invalid stable ID.`;
    case 'camera-source-duplicate-id': return `Camera source ID "${issue.args.id}" is duplicated.`;
    case 'camera-source-name-required': return `Camera source ${issue.args.index} requires a display name.`;
    case 'camera-source-runtime-invalid':
      return `${issue.args.label}: ${cameraValidationIssueMessage(issue.args.issue)}`;
    case 'camera-sources-none-enabled': return 'Enable at least one camera source.';
    case 'camera-option-unsupported': return `Unsupported ${issue.args.key} value.`;
    case 'camera-show-metadata-invalid': return 'Show metadata must be a boolean.';
    case 'media-edge-required': return 'Set the camera Media Edge URL in the panel settings.';
    case 'media-edge-url-invalid': return 'Media Edge URL must be an absolute HTTP or HTTPS origin.';
    case 'media-source-required': return 'Set the stable Media Edge source ID in the panel settings.';
    case 'media-source-id-invalid':
      return 'Media source must be a stable ID containing only letters, numbers, dots, underscores, and hyphens.';
    case 'media-binding-id-invalid': return 'Camera media workflow binding must be a stable binding ID.';
    case 'camera-image-fit-invalid': return 'Camera image fit must be contain or cover.';
    case 'camera-reconnect-policy-invalid': return 'Camera reconnect policy must be automatic or manual.';
    case 'camera-boolean-option-invalid': return `${issue.args.field} must be a boolean.`;
    case 'managed-direct-media-edge-http-required':
      return 'Managed direct Media Edge URL must use HTTP; place HTTPS termination in front of a separately configured Edge.';
    case 'managed-intrinsic-media-edge-http-required': return 'Managed intrinsic Media Edge URL must use HTTP.';
    case 'media-edge-explicit-port-required': return 'Media Edge URL must include its explicit control port.';
    case 'media-edge-port-invalid': return 'Media Edge URL contains an invalid port.';
    case 'world-camera-source-id-invalid': return 'World camera source must be a stable Media Edge source ID.';
    case 'calibration-camera-source-id-invalid':
      return 'Calibration camera source must be a stable Media Edge source ID.';
    case 'world-coordinate-out-of-range':
      return `World ${issue.args.axis} must be finite and within ±100000 metres.`;
    case 'world-angle-out-of-range':
      return `${issue.args.angle} must be between -360 and 360 degrees.`;
  }
}
