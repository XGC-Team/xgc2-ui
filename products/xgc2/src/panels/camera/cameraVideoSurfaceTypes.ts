import type {
  CreateMediaEdgeSessionOptions,MediaEdgeSessionHandle,
} from '../../domains/execution/executionPublic';

export type CameraVideoDimensions = { width:number;height:number };
export type CameraVideoPlaybackState = 'connecting'|'disconnected'|'failed'|'playing'|'waiting';
export type CameraVideoPlaybackMetrics = CameraVideoDimensions & { fps?:number };

/** Metadata belongs to the canvas actually displayed, never to a later video frame. */
export type CameraVideoDisplayObservation = CameraVideoDimensions & {
  id:string;sourceId:string;sourceEpoch:string;clockDomain:'browser-performance';presentedAtMs:number;
  timeOriginMs?:number;mediaTimeSec?:number;presentedFrames?:number;
  captureTimeMs?:number;receiveTimeMs?:number;rtpTimestamp?:number;
};
export type CameraVideoLatchedFrame = {
  display:CameraVideoDisplayObservation;
  pixel:readonly [number,number];
  encode:() => Promise<Blob>;
  release:() => void;
};
export type CameraVideoObservationPort = {
  sourceId:string;sourceEpoch:string;
  /** Copies the displayed native buffer synchronously. Letterbox clicks return undefined. */
  latch:(clientX:number,clientY:number) => CameraVideoLatchedFrame|undefined;
};

/** The host binds exact source + signaling. It is called only while the matching source binding is ready. */
export type CameraVideoSessionFactory = (
  callbacks:Pick<CreateMediaEdgeSessionOptions,'signal'|'onTrack'|'onStateChange'>,
) => Promise<MediaEdgeSessionHandle>;

/** sessionKey includes authority + exact owner + source; change it whenever that binding changes. */
export type CameraVideoSource = (
  | { kind:'ready';id:string;sessionKey:string;openSession:CameraVideoSessionFactory }
  | { kind:'waiting'|'failed';id?:string;title:string;description:string }
) & { label?:string };

export type CameraVideoPresentation = {
  imageFit:'contain'|'cover';
  showMetadata:boolean;
  reconnectPolicy:'automatic'|'manual';
};

export type CameraVideoSurfaceProps = {
  id:string;
  source:CameraVideoSource;
  presentation:CameraVideoPresentation;
  connectionEnabled?:boolean;
  connectionAttempt?:number;
  automaticReconnectEnabled?:boolean;
  lifecycleStatus?:{ media:string;source:string;viewer:string };
  ownerLifecycle?:'running'|'stopping';
  surfaceVisible?:boolean;
  onPlaybackStateChange?:(state:CameraVideoPlaybackState) => void;
  onPlaybackMetricsChange?:(metrics:CameraVideoPlaybackMetrics|undefined) => void;
  expectedSourceSize?:CameraVideoDimensions;
  /** Only calibration opts in; ordinary viewers keep the zero-copy video presentation. */
  onObservationPortChange?:(port:CameraVideoObservationPort|undefined) => void;
};
