import type { ReactNode } from 'react';

type CameraCalibrationKind = 'intrinsic' | 'extrinsic';

const intrinsicWorkspaceContract = {
  workspaceRole: 'camera-intrinsic-workspace',
  workflowRole: 'camera-intrinsic-workflow-view',
} as const;

const runtimeContracts = {
  intrinsic: {
    runtimeRole: 'camera-intrinsic-runtime',
    controlsRole: 'camera-intrinsic-controls',
    layoutClass: 'panels-camera-intrinsic-layout',
    stageLayoutClass: 'panels-camera-intrinsic-stage-layout',
    inspectorClass: 'panels-camera-intrinsic-inspector',
  },
  extrinsic: {
    runtimeRole: 'camera-extrinsic-runtime',
    controlsRole: 'camera-calibration-controls',
    layoutClass: 'panels-camera-extrinsic-layout',
    stageLayoutClass: 'panels-camera-extrinsic-stage-layout',
    inspectorClass: 'panels-camera-extrinsic-inspector',
  },
} as const;

export function CameraIntrinsicCalibrationWorkspaceLayout({
  panelId,
  view,
  camera,
  workflow,
}: {
  panelId: string;
  view: 'camera' | 'workflow';
  camera: ReactNode;
  workflow: ReactNode;
}) {
  const contract = intrinsicWorkspaceContract;
  return (
    <section className="panels-camera-calibration-workspace" data-xgc-role={contract.workspaceRole} data-xgc-id={panelId}>
      {view === 'camera' ? (
        <div className="panels-camera-calibration-runtime">{camera}</div>
      ) : (
        <div className="panels-camera-calibration-workflow-view" data-xgc-role={contract.workflowRole} data-xgc-id={panelId}>
          {workflow}
        </div>
      )}
    </section>
  );
}

export function CameraCalibrationRuntimeLayout({
  kind,
  processInstanceId,
  dataState,
  dataMode,
  stage,
  frameMetadata,
  stageFooter,
  children,
}: {
  kind: CameraCalibrationKind;
  processInstanceId: string;
  dataState?: string;
  dataMode?: string;
  stage: ReactNode;
  frameMetadata?: ReactNode;
  stageFooter?: ReactNode;
  children: ReactNode;
}) {
  const contract = runtimeContracts[kind];
  return (
    <div
      className={`panels-camera-calibration-runtime ${contract.layoutClass}`}
      data-xgc-role={contract.runtimeRole}
      data-xgc-id={processInstanceId}
      data-state={dataState}
      data-mode={dataMode}
    >
      <div className={`panels-camera-calibration-stage-shell ${contract.stageLayoutClass}`}>
        {stage}
        {frameMetadata ? <div className="panels-camera-calibration-frame-meta">{frameMetadata}</div> : null}
        {stageFooter}
      </div>
      <aside
        className={`panels-camera-calibration-inspector ${contract.inspectorClass}`}
        data-xgc-role={contract.controlsRole}
        data-xgc-id={processInstanceId}
      >
        {children}
      </aside>
    </div>
  );
}
