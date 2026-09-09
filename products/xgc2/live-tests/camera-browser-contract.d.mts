export type CameraTarget = {
  caseId:string;
  experimentId:string;
  panelId:string;
  dashboardId:string;
  panelKind:'gazebo-world-camera'|'camera-intrinsic-calibration';
  runMode:'simulation'|'physical'|'hybrid';
};

export type CameraVideoContract = {
  readonly lifecycle:'ready';
  readonly state:'playing';
  readonly readyState:4;
  readonly videoWidth:number;
  readonly videoHeight:number;
  readonly minimumTimeDelta:0.2;
};

export type CameraVideoEvidence = {
  lifecycle:string;
  state:string;
  readyState:number;
  videoWidth:number;
  videoHeight:number;
  currentTime:number;
  paused:boolean;
  ended:boolean;
  trackReadyState?:string;
};

export declare const WORLD_CAMERA_VIDEO_CONTRACT: {
  readonly lifecycle:'ready';
  readonly state:'playing';
  readonly readyState:4;
  readonly videoWidth:3840;
  readonly videoHeight:2160;
  readonly minimumTimeDelta:0.2;
};

export declare const INTRINSIC_SIMULATION_VIDEO_CONTRACT: {
  readonly lifecycle:'ready';
  readonly state:'playing';
  readonly readyState:4;
  readonly videoWidth:3840;
  readonly videoHeight:2160;
  readonly minimumTimeDelta:0.2;
};

export declare const INTRINSIC_PHYSICAL_VIDEO_CONTRACT: {
  readonly lifecycle:'ready';
  readonly state:'playing';
  readonly readyState:4;
  readonly videoWidth:3840;
  readonly videoHeight:2160;
  readonly minimumTimeDelta:0.2;
};

export declare function readCameraTargets(env?:NodeJS.ProcessEnv): CameraTarget[];
export declare function cameraVideoContract(target:Pick<CameraTarget,'panelKind'|'runMode'>):CameraVideoContract;
export declare function assertCameraInitialEvidence(
  evidence:CameraVideoEvidence,
  target:Pick<CameraTarget,'panelKind'|'runMode'>,
  label?:string,
):CameraVideoEvidence;
export declare function assertWorldCameraInitialEvidence(evidence:CameraVideoEvidence,label?:string):CameraVideoEvidence;
export declare function assertCameraContinuity(input:{ sameVideoElement:boolean;before:Pick<CameraVideoEvidence,'currentTime'>;after:Pick<CameraVideoEvidence,'currentTime'> },label?:string):CameraVideoEvidence;
export declare function assertExclusiveCameraImageBranch(snapshot:{
  totalWorkspaceCount:number;
  visibleWorkspaceCount:number;
  imageViewCount:number;
  emptyStateCount:number;
  cameraPanelCount:number;
},label?:string):unknown;
export declare function assertRunStopMutualExclusion(snapshot:{
  runVisible:boolean;
  stopVisible:boolean;
  loadingVisible:boolean;
},label?:string):unknown;
export declare function assertNoCameraPromptOverlap(snapshot:{
  visibleVideoCount:number;
  visiblePromptCount:number;
  overlapArea:number;
},label?:string):unknown;
export declare function assertStopOwnershipClosure(snapshot:{
  runs:Array<{ id?:string;status?:string }>;
  sessions:unknown[];
  processes:Array<{ desiredState?:string;observedState?:string;handle?:unknown }>;
},label?:string):unknown;
export declare function assertNoPageFaults(faults:unknown[],label?:string):void;
