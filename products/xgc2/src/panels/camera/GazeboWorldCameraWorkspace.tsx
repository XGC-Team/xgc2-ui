import { useEffect,useMemo,useRef,useState } from 'react';
import { Modal } from '../../components/Modal';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { useGroundStationErrorNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import {
  experimentProcessRuntimeProjection,
} from '../../domains/experiment/experimentPublic';
import type { PanelPluginProps } from '../types';
import { usePanelFrameControl } from '../usePanelFrameControl';
import { CameraExtrinsicCalibrationRuntimePanel } from './CameraExtrinsicCalibrationRuntimePanel';
import { CameraVideoPanel } from './CameraVideoPanel';
import { GazeboWorldCameraFrameBinding } from './GazeboWorldCameraPanelFrame';
import { GazeboWorldCameraPoseEditor } from './GazeboWorldCameraPoseEditor';
import { GazeboWorldCameraWorkflowView } from './GazeboWorldCameraWorkflowView';
import { useGazeboWorldCameraFrame } from './gazeboWorldCameraPanelFrameContext';
import { gazeboWorldCameraOptions } from './gazeboWorldCameraPanelModel';
import { gazeboWorldCameraPoseParameters,type GazeboWorldCameraPose } from './gazeboWorldCameraPoseModel';
import { CameraCalibrationLifecyclePipeline } from './CameraCalibrationLifecyclePipeline';
import {
  calibrationCameraEmptyState,
  calibrationCameraSourceError,
  calibrationCameraViewerProjection,
  projectWorldCameraStartup,
  type CalibrationCameraViewerMemory,
} from './gazeboWorldCameraWorkspaceModel';
import '../../styles/gazebo-world-camera-panel.css';
import { useCameraText } from './cameraMessages';

export function GazeboWorldCameraWorkspace({
  panel,context,
}: PanelPluginProps<readonly ['visualization','experiment','execution','automation']>) {
  return <GazeboWorldCameraFrameBinding panelId={panel.id}>
    {(view) => <WorldCameraSurface panel={panel} context={context} view={view} />}
  </GazeboWorldCameraFrameBinding>;
}

function WorldCameraSurface({ panel,context,view }: PanelPluginProps<readonly ['visualization','experiment','execution','automation']> & {
  view:'image'|'workflow';
}) {
  const t = useCameraText();
  const frame = useGazeboWorldCameraFrame(panel.id);
  const service = context.ports.actions['camera-service'];
  const setPose = context.ports.actions['set-pose'];
  const video = context.ports.data.video;
  const configured = gazeboWorldCameraOptions(panel.options);
  const workflowRuntime = experimentProcessRuntimeProjection(video?.value);
  const viewerMemoryRef=useRef<CalibrationCameraViewerMemory | undefined>(undefined);
  const calibratorProcessIdRef=useRef('');
  const activeInvocation=service?.activeInvocation;
  const viewer = calibrationCameraViewerProjection(
    workflowRuntime,service?.trace.automationResourceId ?? '',activeInvocation,viewerMemoryRef.current,
  );
  const { owned,selectedRun } = viewer;
  const sourceError = calibrationCameraSourceError(workflowRuntime,selectedRun,owned.camera);
  const mediaReady = owned.mediaReady;
  const calibratorReady = owned.calibratorReady;
  const calibrator = owned.calibrator;
  const [pose,setRuntimePose] = useState<GazeboWorldCameraPose>({
    x:configured.x,y:configured.y,z:configured.z,
    rollDegrees:configured.rollDegrees,pitchDegrees:configured.pitchDegrees,yawDegrees:configured.yawDegrees,
  });
  const [posePending,setPosePending] = useState(false);
  const [poseError,setPoseError] = useState('');
  if (frame.calibrationOpen && activeInvocation && calibratorReady && calibrator
    && !calibratorProcessIdRef.current) calibratorProcessIdRef.current=calibrator.id;
  const lifecycleStopping = viewer.stopping;
  useEffect(() => {
    viewerMemoryRef.current=viewer.memory;
  },[viewer.memory]);
  useEffect(() => {
    if (!frame.calibrationOpen) calibratorProcessIdRef.current='';
  },[frame.calibrationOpen]);
  const viewerKey = `${panel.id}:${viewer.ownerRunId || 'stopped'}`;
  const showVideo = viewer.viewerVisible;
  const viewerMounted = viewer.viewerMounted;
  const calibrationProcessId=calibratorProcessIdRef.current || (calibratorReady ? calibrator?.id : '');
  const calibrationOwnerStopping=!viewer.running || Boolean(calibratorProcessIdRef.current
    && (!calibratorReady || calibrator?.id!==calibratorProcessIdRef.current));
  const emptyState = calibrationCameraEmptyState({
    stopping:lifecycleStopping,
    running:viewer.running,
    cameraReady:owned.cameraReady,
    mediaReady,
    runFailed:selectedRun?.status === 'failed',
    sourceError,
    disabledReason:service?.disabledReason || '',
  });
  useGroundStationErrorNotification(
    workflowRuntime?.targetId || context.executionTargetId || 'local',
    showVideo ? '' : sourceError,
    { title:t('Calibration camera'),source:panel.id,dedupeKey:`${panel.id}:camera-source` },
  );
  const poseRefusal = setPose?.disabledReason
    || (!setPose?.connected ? t('Connect the Set camera pose Action port.') : '')
    || (!viewer.running ? t('Start the world camera first.') : '');
  const calibrationRefusal = !viewer.running
    ? t('Start the calibration camera first.')
    : !calibratorReady ? t('Waiting for the selected provider calibration service.') : '';
  const poseAccess = useMemo(() => ({ canOpen:!poseRefusal,disabledReason:poseRefusal }),[poseRefusal]);
  const calibrationAccess = useMemo(() => ({ canOpen:!calibrationRefusal,disabledReason:calibrationRefusal }),[calibrationRefusal]);
  usePanelFrameControl(frame.setPoseAccess,poseAccess);
  usePanelFrameControl(frame.setCalibrationAccess,calibrationAccess);
  const videoPanel:PanelInstance = {
    ...panel,
    options:{
      ...panel.options,
      edgeUrl:configured.edgeUrl,
      sourceId:configured.sourceId,
      imageFit:'cover',showMetadata:false,reconnectPolicy:'automatic',
    },
  };

  async function applyPose(next: GazeboWorldCameraPose) {
    if (!setPose) return;
    setPosePending(true);setPoseError('');
    try {
      await setPose.invoke(gazeboWorldCameraPoseParameters(next),'Apply Gazebo world-camera pose from its panel Action port');
      setRuntimePose(next);
    } catch (cause) {
      setPoseError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally { setPosePending(false); }
  }

  return <>
    <section
      className="gazebo-world-camera-panel-workspace"
      data-xgc-role="gazebo-world-camera-workspace"
      data-xgc-id={panel.id}
      data-xgc-camera-lifecycle={showVideo ? 'ready' : emptyState.lifecycle}
    >
      {view === 'workflow' ? (
        <GazeboWorldCameraWorkflowView
          panelId={panel.id}
          runtime={workflowRuntime}
          workflowResourceId={service?.trace.automationResourceId ?? ''}
        />
      ) : (
        <div
          className="gazebo-world-camera-panel-image-view"
          data-xgc-role="gazebo-world-camera-image-view"
          data-xgc-id={panel.id}
        >
          {viewerMounted && (
            <CameraVideoPanel key={viewerKey} panel={videoPanel} context={context}
              connectionEnabled={showVideo && !viewer.stopRequested && video?.connected !== false}
              ownerLifecycle={viewer.stopRequested ? 'stopping' : 'running'}
              surfaceVisible={showVideo} />
          )}
          {!showVideo && (
            <CameraCalibrationLifecyclePipeline
              panelId={panel.id}
              role="gazebo-world-camera-empty-state"
              title={t('Calibration camera')}
              {...projectWorldCameraStartup({
                lifecycle: emptyState.lifecycle,
                running: viewer.running,
                camera: owned.camera,
                media: owned.mediaEdge,
                sourceId: configured.sourceId,
                edgeUrl: configured.edgeUrl,
              })}
            />
          )}
          {frame.poseOpen && <GazeboWorldCameraPoseEditor
              id={`gazebo-world-camera-pose-editor-${panel.id}`}
              panelId={panel.id}
              initialPose={pose}
              pending={posePending}
              error={poseError}
              disabledReason={poseRefusal}
              onApply={applyPose}
              onClose={() => frame.setPoseOpen(false)} />}
        </div>
      )}
    </section>
    <Modal open={frame.calibrationOpen} onClose={() => frame.setCalibrationOpen(false)} title={t('Extrinsic calibration')}
      backdropClassName="gazebo-world-camera-calibration-backdrop"
      className="gazebo-world-camera-calibration-dialog"
      closeLabel={t('Close extrinsic calibration')} size="large" dataXgcRole="gazebo-world-camera-calibration-dialog" dataXgcId={panel.id}>
      {calibrationProcessId ? (
        <CameraExtrinsicCalibrationRuntimePanel
          processInstanceId={calibrationProcessId}
          targetId={workflowRuntime?.targetId || context.executionTargetId || 'local'}
          panelId={panel.id}
          liveStage={<CameraVideoPanel key={`calibration:${viewerKey}`} panel={videoPanel} context={context}
            connectionEnabled={calibratorReady && !calibrationOwnerStopping && video?.connected !== false}
            ownerLifecycle={calibrationOwnerStopping ? 'stopping' : 'running'}
            surfaceVisible={calibratorReady && !calibrationOwnerStopping} />}
        />
      ) : (
        <CameraCalibrationLifecyclePipeline
          panelId={panel.id}
          title={t('Extrinsic calibration')}
          {...projectWorldCameraStartup({
            lifecycle: emptyState.lifecycle === 'stopped' ? 'source-preparing' : emptyState.lifecycle,
            running: viewer.running,
            camera: owned.camera,
            media: owned.mediaEdge,
            calibrator: owned.calibrator,
            includeCalibrator: true,
            sourceId: configured.sourceId,
            edgeUrl: configured.edgeUrl,
          })}
        />
      )}
    </Modal>
  </>;
}
