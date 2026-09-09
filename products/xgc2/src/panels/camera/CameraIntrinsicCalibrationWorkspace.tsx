import { EmptyState } from '@xgc2/ui-react';
import { useLayoutEffect,useReducer,useRef,useState } from 'react';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { useExecutionTarget } from '../../domains/execution/executionPublic';
import type { PanelPluginHeaderActionsProps,PanelPluginProps } from '../types';
import { CameraCalibrationLifecyclePipeline } from './CameraCalibrationLifecyclePipeline';
import { CameraCalibrationWorkflowView } from './CameraCalibrationWorkflowView';
import { CameraIntrinsicCalibrationRuntimePanel } from './CameraIntrinsicCalibrationRuntimePanel';
import { CameraVideoPanel,type CameraVideoPlaybackMetrics } from './CameraVideoPanel';
import {
  CameraIntrinsicCalibrationFrameBinding,
  CameraIntrinsicCalibrationHeaderActions as IntrinsicHeaderActions,
} from './CameraIntrinsicCalibrationWorkspaceFrame';
import { CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT } from './cameraIntrinsicPanelModel';
import {
  intrinsicLiveCameraOptions,
  intrinsicWorkflowDocument,
  intrinsicWorkflowDetail,
  intrinsicWorkflowRunMode,
  intrinsicWorkflowRuntime,
  projectIntrinsicLifecyclePipeline,
  resolveIntrinsicCalibratorProcess,
  resolveIntrinsicCalibratorOwnerProcess,
  resolveIntrinsicCameraSourceOwnerProcess,
  resolveIntrinsicMediaEdgeOwnerProcess,
} from './cameraIntrinsicWorkspaceModel';
import { useCameraText } from './cameraMessages';

export function CameraIntrinsicCalibrationHeaderActions(props: PanelPluginHeaderActionsProps) {
  return <IntrinsicHeaderActions {...props} />;
}

export function CameraIntrinsicCalibrationWorkspace({
  panel,context,
}: PanelPluginProps<readonly ['visualization','experiment','execution','automation']>) {
  const t = useCameraText();
  const port = context.ports.actions[CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT];
  const runtime = intrinsicWorkflowRuntime(context.ports.data.video?.value);
  const document = intrinsicWorkflowDocument(runtime, port);
  const active = port?.activeInvocation;
  const lifecycleStopping = active?.status === 'stopping';
  const targetId = context.executionTargetId || runtime?.targetId || 'local';
  const execution = useExecutionTarget(targetId, false, Boolean(targetId));
  const calibrator = resolveIntrinsicCalibratorProcess(
    execution.processInstances,
    active?.id ?? '',
    runtime,
  );
  const calibratorOwner = resolveIntrinsicCalibratorOwnerProcess(
    execution.processInstances,active?.id??'',runtime,
  );
  const mediaEdgeOwner = resolveIntrinsicMediaEdgeOwnerProcess(
    execution.processInstances,active?.id??'',runtime,
  );
  const cameraSource = resolveIntrinsicCameraSourceOwnerProcess(
    execution.processInstances,active?.id??'',runtime,
  );
  const [livePlaybackMetrics,setLivePlaybackMetrics] = useState<CameraVideoPlaybackMetrics>();
  const viewerReady = Boolean(active && calibrator && processReady(mediaEdgeOwner));
  const viewerWasMountedRef = useRef(false);
  const mountedOwnerIdRef = useRef('');
  const mountedMediaEdgeIdRef = useRef('');
  const [,finishTeardown] = useReducer((revision:number) => revision + 1,0);
  if (viewerReady && !viewerWasMountedRef.current) {
    viewerWasMountedRef.current = true;
    mountedOwnerIdRef.current = calibratorOwner?.id ?? '';
    mountedMediaEdgeIdRef.current = mediaEdgeOwner?.id ?? '';
  }
  const teardownPass = !active && viewerWasMountedRef.current;
  const ownerStopping = lifecycleStopping || teardownPass
    || Boolean(viewerWasMountedRef.current && (
      calibratorOwner?.id !== mountedOwnerIdRef.current || !calibrator
      || mediaEdgeOwner?.id !== mountedMediaEdgeIdRef.current || !processReady(mediaEdgeOwner)
    ));
  const calibratorProcessId = viewerWasMountedRef.current
    ? mountedOwnerIdRef.current : calibratorOwner?.id ?? '';
  const viewerMounted = Boolean(active || teardownPass) && viewerWasMountedRef.current;
  useLayoutEffect(() => {
    if (active || !viewerWasMountedRef.current) return;
    viewerWasMountedRef.current = false;
    mountedOwnerIdRef.current = '';
    mountedMediaEdgeIdRef.current = '';
    // Commit one disabled/stopping pass so stream cleanup sees owner-stopping,
    // then deterministically replace the retained Runtime with the stopped UI.
    finishTeardown();
  },[active]);
  const detail = intrinsicWorkflowDetail(runtime,active?.id ?? '');
  const runMode = intrinsicWorkflowRunMode(runtime,active?.id ?? '');
  const videoPanel: PanelInstance = {
    ...panel,
    options:{ ...panel.options,...intrinsicLiveCameraOptions(panel.options) },
  };

  return <CameraIntrinsicCalibrationFrameBinding panelId={panel.id}>
    {(view) => <section className="panels-camera-calibration-panel" data-xgc-role="camera-calibration-panel" data-xgc-id={panel.id}>
      {view === 'workflow' ? (
        document ? (
          <CameraCalibrationWorkflowView
            kind="intrinsic"
            panelId={panel.id}
            workflow={document}
            detail={detail}
            catalog={runtime?.catalog ?? []}
          />
        ) : (
          <EmptyState
            appearance="plain"
            density="compact"
            fill
            title={t('Calibration workflow is unavailable')}
          />
        )
      ) : viewerMounted ? (
        calibratorProcessId ? (
          <CameraIntrinsicCalibrationRuntimePanel
            processInstanceId={calibratorProcessId}
            targetId={targetId}
            panelId={panel.id}
            runMode={runMode}
            enabled={viewerReady && !ownerStopping}
            livePlaybackMetrics={livePlaybackMetrics}
            liveStage={<CameraVideoPanel panel={videoPanel} context={context}
              expectedSourceSize={{ width:3840,height:2160 }}
              connectionEnabled={viewerReady && !ownerStopping}
              ownerLifecycle={ownerStopping ? 'stopping' : 'running'}
              surfaceVisible={viewerReady && !ownerStopping}
              onPlaybackMetricsChange={setLivePlaybackMetrics} />}
          />
        ) : (
          <CameraCalibrationLifecyclePipeline
            panelId={panel.id}
            {...intrinsicLifecyclePipeline(
              ownerStopping ? 'stopping' : 'starting',
              Boolean(active),
              cameraSource,
              mediaEdgeOwner,
              calibratorOwner,
              panel.options,
            )}
          />
        )
      ) : (
        <CameraCalibrationLifecyclePipeline
          panelId={panel.id}
          {...intrinsicLifecyclePipeline(
            active ? (ownerStopping ? 'stopping' : 'starting') : 'stopped',
            Boolean(active),
            cameraSource,
            mediaEdgeOwner,
            calibratorOwner,
            videoPanel.options,
          )}
        />
      )}
    </section>}
  </CameraIntrinsicCalibrationFrameBinding>;
}

function processReady(process: ReturnType<typeof resolveIntrinsicMediaEdgeOwnerProcess>) {
  return Boolean(process && process.desiredState === 'running'
    && process.observedState === 'running' && process.readiness.status === 'passing');
}

function intrinsicLifecyclePipeline(
  phase: 'stopped' | 'starting' | 'stopping',
  runActive: boolean,
  camera: ReturnType<typeof resolveIntrinsicCameraSourceOwnerProcess>,
  media: ReturnType<typeof resolveIntrinsicMediaEdgeOwnerProcess>,
  calibrator: ReturnType<typeof resolveIntrinsicCalibratorOwnerProcess>,
  options: Record<string, unknown>,
) {
  const live = intrinsicLiveCameraOptions(options);
  return projectIntrinsicLifecyclePipeline({
    phase,runActive,camera,media,calibrator,
    sourceId: live.sourceId,edgeUrl: live.edgeUrl,
  });
}
