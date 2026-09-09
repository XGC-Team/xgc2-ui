import { EmptyState } from '@xgc2/ui-react';
import { useLayoutEffect,useReducer,useRef,useState } from 'react';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { useExecutionTarget } from '../../domains/execution/executionPublic';
import type { PanelPluginProps } from '../types';
import { CameraCalibrationWorkflowView } from './CameraCalibrationWorkflowView';
import { CameraIntrinsicCalibrationFrameBinding } from './CameraIntrinsicCalibrationWorkspaceFrame';
import { CameraVideoPanel,type CameraVideoPlaybackMetrics } from './CameraVideoPanel';
import { CameraIntrinsicValidationRuntimePanel } from './CameraIntrinsicValidationRuntimePanel';
import { CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT } from './cameraIntrinsicPanelModel';
import { CameraCalibrationLifecyclePipeline } from './CameraCalibrationLifecyclePipeline';
import {
  intrinsicLiveCameraOptions,
  intrinsicWorkflowDetail,
  intrinsicWorkflowDocument,
  intrinsicWorkflowRuntime,
  projectIntrinsicLifecyclePipeline,
  resolveIntrinsicCalibratorOwnerProcess,
  resolveIntrinsicCalibratorOwnerProcessFromRuntime,
  resolveIntrinsicCalibratorProcess,
  resolveIntrinsicCameraSourceOwnerProcess,
  resolveIntrinsicMediaEdgeOwnerProcess,
  resolveIntrinsicMediaEdgeOwnerProcessFromRuntime,
} from './cameraIntrinsicWorkspaceModel';
import { useCameraText } from './cameraMessages';

export function CameraIntrinsicValidationWorkspace({
  panel,context,
}:PanelPluginProps<readonly ['visualization','experiment','execution','automation']>) {
  const t=useCameraText();
  const port=context.ports.actions[CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT];
  const runtime=intrinsicWorkflowRuntime(context.ports.data.video?.value);
  const document=intrinsicWorkflowDocument(runtime,port);
  const active=port?.activeInvocation;
  const targetId=context.executionTargetId || runtime?.targetId || 'local';
  const execution=useExecutionTarget(targetId,false,Boolean(targetId));
  const exactCalibrator=resolveIntrinsicCalibratorProcess(execution.processInstances,active?.id ?? '',runtime);
  const calibratorOwner=active
    ? resolveIntrinsicCalibratorOwnerProcess(execution.processInstances,active.id,runtime)
    : resolveIntrinsicCalibratorOwnerProcessFromRuntime(execution.processInstances,runtime);
  const calibrator=exactCalibrator ?? (calibratorOwner && processReady(calibratorOwner) ? calibratorOwner : undefined);
  const mediaEdgeOwner=active
    ? resolveIntrinsicMediaEdgeOwnerProcess(execution.processInstances,active.id,runtime)
    : resolveIntrinsicMediaEdgeOwnerProcessFromRuntime(execution.processInstances,runtime);
  const cameraSource=active
    ? resolveIntrinsicCameraSourceOwnerProcess(execution.processInstances,active.id,runtime)
    : undefined;
  const viewerReady=Boolean(active && calibrator && processReady(mediaEdgeOwner));
  const viewerWasMountedRef=useRef(false);
  const mountedOwnerIdRef=useRef('');
  const mountedMediaEdgeIdRef=useRef('');
  const [,finishTeardown]=useReducer((revision:number) => revision+1,0);
  const [,setLivePlaybackMetrics]=useState<CameraVideoPlaybackMetrics>();
  if (viewerReady && !viewerWasMountedRef.current) {
    viewerWasMountedRef.current=true;
    mountedOwnerIdRef.current=calibratorOwner?.id ?? '';
    mountedMediaEdgeIdRef.current=mediaEdgeOwner?.id ?? '';
  }
  const runtimePresent=Boolean(active || calibratorOwner || mediaEdgeOwner);
  const teardownPass=!runtimePresent && viewerWasMountedRef.current;
  const ownerStopping=active?.status==='stopping' || teardownPass || Boolean(
    viewerWasMountedRef.current && (
      calibratorOwner?.id!==mountedOwnerIdRef.current || !calibrator
      || mediaEdgeOwner?.id!==mountedMediaEdgeIdRef.current || !processReady(mediaEdgeOwner)
    )
  );
  const processInstanceId=viewerWasMountedRef.current
    ? mountedOwnerIdRef.current : calibratorOwner?.id ?? '';
  const viewerMounted=Boolean(runtimePresent || teardownPass) && viewerWasMountedRef.current;
  useLayoutEffect(() => {
    if (runtimePresent || !viewerWasMountedRef.current) return;
    viewerWasMountedRef.current=false;
    mountedOwnerIdRef.current='';mountedMediaEdgeIdRef.current='';
    finishTeardown();
  },[runtimePresent]);

  const videoPanel:PanelInstance={
    ...panel,
    options:{ ...panel.options,...intrinsicLiveCameraOptions(panel.options) },
  };
  const enabled=viewerReady && !ownerStopping;
  const cameraView=!viewerMounted || !processInstanceId ? (
    <CameraCalibrationLifecyclePipeline
      panelId={panel.id}
      title={t('Camera intrinsic validation')}
      {...projectIntrinsicLifecyclePipeline({
        phase: ownerStopping ? 'stopping' : runtimePresent ? 'starting' : 'stopped',
        runActive: Boolean(active || runtimePresent),
        camera: cameraSource,
        media: mediaEdgeOwner,
        calibrator: calibratorOwner,
        sourceId: intrinsicLiveCameraOptions(panel.options).sourceId,
        edgeUrl: intrinsicLiveCameraOptions(panel.options).edgeUrl,
      })}
    />
  ) : (
    <CameraIntrinsicValidationRuntimePanel
      targetId={targetId} processInstanceId={processInstanceId} panelId={panel.id} enabled={enabled}
      liveStage={<CameraVideoPanel panel={videoPanel} context={context}
        expectedSourceSize={{ width:3840,height:2160 }}
        connectionEnabled={enabled} ownerLifecycle={ownerStopping ? 'stopping' : 'running'}
        surfaceVisible={enabled} onPlaybackMetricsChange={setLivePlaybackMetrics} />}
    />
  );
  return <CameraIntrinsicCalibrationFrameBinding panelId={panel.id}>
    {(view) => <section className="panels-camera-calibration-panel"
      data-xgc-role="camera-calibration-panel" data-xgc-id={panel.id}>
      {view==='workflow' ? document ? (
        <CameraCalibrationWorkflowView kind="intrinsic" panelId={panel.id}
          workflow={document} detail={intrinsicWorkflowDetail(runtime,active?.id ?? '')}
          catalog={runtime?.catalog ?? []} />
      ) : (
        <EmptyState appearance="plain" density="compact" fill title={t('Calibration workflow is unavailable')} />
      ) : cameraView}
    </section>}
  </CameraIntrinsicCalibrationFrameBinding>;
}

function processReady(process:ReturnType<typeof resolveIntrinsicMediaEdgeOwnerProcess>) {
  return Boolean(process && process.desiredState==='running'
    && process.observedState==='running' && process.readiness.status==='passing');
}
