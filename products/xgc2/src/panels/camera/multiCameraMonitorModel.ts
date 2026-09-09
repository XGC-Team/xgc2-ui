import { cameraVideoPanelRuntime } from './cameraVideoPanelModel';
import {
  cameraValidationIssueMessage,
  type CameraValidationIssue,
} from './cameraValidationIssue';

export const MULTI_CAMERA_MONITOR_MAX_STREAMS = 16;

export type MultiCameraMonitorStream = {
  id: string;
  name: string;
  edgeUrl: string;
  sourceId: string;
  enabled: boolean;
};

export type MultiCameraMonitorOptions = {
  streams: MultiCameraMonitorStream[];
  layoutColumns: 'auto' | '1' | '2' | '3' | '4';
  tileAspectRatio: 'fill' | '16:9' | '4:3';
  imageFit: 'contain' | 'cover';
  reconnectPolicy: 'automatic' | 'manual';
  showMetadata: boolean;
};

export const MULTI_CAMERA_MONITOR_DEFAULT_STREAMS: MultiCameraMonitorStream[] = [{
  id:'camera-1',
  name:'Camera 1',
  edgeUrl:'',
  sourceId:'usb_cam',
  enabled:true,
}];

export const MULTI_CAMERA_MONITOR_DEFAULTS = {
  streamsJson: JSON.stringify(MULTI_CAMERA_MONITOR_DEFAULT_STREAMS),
  layoutColumns: 'auto',
  tileAspectRatio: '16:9',
  imageFit: 'contain',
  reconnectPolicy: 'automatic',
  showMetadata: true,
} as const;

export function multiCameraMonitorOptions(
  options: Record<string,unknown>,
): MultiCameraMonitorOptions {
  const decoded = decodeMultiCameraMonitorStreams(options.streamsJson);
  return {
    streams: decoded.streams,
    layoutColumns: enumOption(options.layoutColumns, ['auto','1','2','3','4'], 'auto'),
    tileAspectRatio: enumOption(options.tileAspectRatio, ['fill','16:9','4:3'], '16:9'),
    imageFit: enumOption(options.imageFit, ['contain','cover'], 'contain'),
    reconnectPolicy: enumOption(options.reconnectPolicy, ['automatic','manual'], 'automatic'),
    showMetadata: typeof options.showMetadata === 'boolean' ? options.showMetadata : true,
  };
}

export function decodeMultiCameraMonitorStreams(value: unknown): {
  streams: MultiCameraMonitorStream[];
  error: string;
  issue?: CameraValidationIssue;
} {
  if (typeof value !== 'string') {
    const issue = { code:'camera-sources-missing' } as const;
    return { streams:[],error:cameraValidationIssueMessage(issue),issue };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    const issue = { code:'camera-sources-invalid-json' } as const;
    return { streams:[],error:cameraValidationIssueMessage(issue),issue };
  }
  if (!Array.isArray(parsed)) {
    const issue = { code:'camera-sources-not-list' } as const;
    return { streams:[],error:cameraValidationIssueMessage(issue),issue };
  }
  const streams: MultiCameraMonitorStream[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const candidate = parsed[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      const issue = { code:'camera-source-not-object',args:{ index:index + 1 } } as const;
      return { streams:[],error:cameraValidationIssueMessage(issue),issue };
    }
    const record = candidate as Record<string,unknown>;
    if (![record.id,record.name,record.edgeUrl,record.sourceId].every((entry) => typeof entry === 'string')
        || (record.enabled !== undefined && typeof record.enabled !== 'boolean')) {
      const issue = { code:'camera-source-invalid-field-types',args:{ index:index + 1 } } as const;
      return { streams:[],error:cameraValidationIssueMessage(issue),issue };
    }
    streams.push({
      id:record.id as string,
      name:record.name as string,
      edgeUrl:record.edgeUrl as string,
      sourceId:record.sourceId as string,
      enabled:record.enabled !== false,
    });
  }
  return { streams,error:'' };
}

export function encodeMultiCameraMonitorStreams(streams: MultiCameraMonitorStream[]) {
  return JSON.stringify(streams);
}

export function validateMultiCameraMonitorOptions(options: Record<string,unknown>) {
  const issue=validateMultiCameraMonitorOptionsIssue(options);
  return issue ? cameraValidationIssueMessage(issue) : '';
}

export function validateMultiCameraMonitorOptionsIssue(
  options: Record<string,unknown>,
): CameraValidationIssue | undefined {
  const decoded = decodeMultiCameraMonitorStreams(options.streamsJson);
  if (decoded.issue) return decoded.issue;
  if (decoded.streams.length === 0) return { code:'camera-sources-empty' };
  if (decoded.streams.length > MULTI_CAMERA_MONITOR_MAX_STREAMS) {
    return { code:'camera-sources-too-many',args:{ maximum:MULTI_CAMERA_MONITOR_MAX_STREAMS } };
  }
  const ids = new Set<string>();
  for (const [index,stream] of decoded.streams.entries()) {
    const label = stream.name.trim() || `Camera source ${index + 1}`;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stream.id)) {
      return { code:'camera-source-invalid-id',args:{ label } };
    }
    if (ids.has(stream.id)) return { code:'camera-source-duplicate-id',args:{ id:stream.id } };
    ids.add(stream.id);
    if (!stream.name.trim()) return { code:'camera-source-name-required',args:{ index:index + 1 } };
    if (!stream.enabled) continue;
    const runtime = cameraVideoPanelRuntime({
      requestedEdgeUrl:stream.edgeUrl,
      requestedSourceId:stream.sourceId,
    });
    if (runtime.kind !== 'ready') {
      return { code:'camera-source-runtime-invalid',args:{ label,issue:runtime.issue } };
    }
  }
  if (!decoded.streams.some((stream) => stream.enabled)) {
    return { code:'camera-sources-none-enabled' };
  }
  for (const [key,allowed] of [
    ['layoutColumns',['auto','1','2','3','4']],
    ['tileAspectRatio',['fill','16:9','4:3']],
    ['imageFit',['contain','cover']],
    ['reconnectPolicy',['automatic','manual']],
  ] as const) {
    const value = options[key] ?? MULTI_CAMERA_MONITOR_DEFAULTS[key];
    const allowedValues: readonly string[] = allowed;
    if (typeof value !== 'string' || !allowedValues.includes(value)) {
      return { code:'camera-option-unsupported',args:{ key } };
    }
  }
  if (options.showMetadata !== undefined && typeof options.showMetadata !== 'boolean') {
    return { code:'camera-show-metadata-invalid' };
  }
  return undefined;
}

export function nextMultiCameraMonitorStreamID(streams: MultiCameraMonitorStream[]) {
  const existing = new Set(streams.map((stream) => stream.id));
  for (let index = 1; index <= MULTI_CAMERA_MONITOR_MAX_STREAMS; index += 1) {
    const candidate = `camera-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `camera-${streams.length + 1}`;
}

function enumOption<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
) {
  return typeof value === 'string' && allowed.includes(value as Value) ? value as Value : fallback;
}
