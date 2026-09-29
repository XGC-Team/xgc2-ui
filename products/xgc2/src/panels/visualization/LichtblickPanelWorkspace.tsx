import { useEffect,useRef } from 'react';
import {
  experimentDescendantRunIds,
  experimentOwnedProcessInstances,
  experimentProcessRuntimeProjection,
  useExperimentSurfaceVisible,
} from '../../domains/experiment/experimentPublic';
import { useProductRouteVisible } from '../../shared/routeReady';
import type { PanelPluginProps } from '../types';
import { LichtblickPanelFrameBinding,LichtblickSceneHostBinding } from './LichtblickPanelFrame';
import { LichtblickStartupPipeline } from './LichtblickStartupPipeline';
import { useWorkflowStartupPresentation,workflowStartupGeneration } from '../../components/useWorkflowStartupPresentation';
import { LichtblickWorkflowView } from './LichtblickWorkflowView';
import {
  lichtblickLayoutWasBootstrapped,
  markLichtblickLayoutBootstrapped,
} from './lichtblickLayoutBootstrap';
import {
  lichtblickLayoutOptions,
  lichtblickLayoutPresentation,
} from './lichtblickLayoutOptions';
import { lichtblickProxyUrl } from './lichtblickProxyUrl';
import { resolveLichtblickSceneHost } from './lichtblickSceneBridge';
import {
  LICHTBLICK_BRIDGE_PROCESS_DEFINITION_ID,
  LICHTBLICK_WEB_PROCESS_DEFINITION_ID,
} from './lichtblickStartupPipeline';
import {
  EMPTY_LICHTBLICK_RUN_IDS,
  lichtblickProcessStillLive,
  lichtblickWorkspaceStartupPhase,
  nextHeldLichtblickActionRunIds,
  nextHeldLichtblickEmbed,
  type HeldLichtblickEmbed,
} from './lichtblickWorkspaceHold';

export function LichtblickWorkspacePanel({
  panel,context,
}: PanelPluginProps<readonly ['visualization','experiment','execution','automation']>) {
  const dashboardVisible = useExperimentSurfaceVisible();
  const routeVisible = useProductRouteVisible();
  const surfaceVisible = dashboardVisible && routeVisible;
  const action = context.ports.actions['lichtblick'];
  const runtimePort = context.ports.data.visualization;
  const runtime = experimentProcessRuntimeProjection(runtimePort?.value);
  const active = action?.activeInvocation;
  const lifecycleStopping = active?.status === 'stopping';
  const liveActionRunIds = active
    ? experimentDescendantRunIds(runtime,[active.id])
    : EMPTY_LICHTBLICK_RUN_IDS;
  const heldRunIdsRef = useRef<ReadonlySet<string>>(EMPTY_LICHTBLICK_RUN_IDS);
  const previousOwnedStillLive = experimentOwnedProcessInstances(runtime,heldRunIdsRef.current)
    .some(lichtblickProcessStillLive);
  const actionRunIds = nextHeldLichtblickActionRunIds({
    stopping:lifecycleStopping,
    connected:Boolean(runtimePort?.connected),
    liveRunIds:liveActionRunIds,
    previousRunIds:heldRunIdsRef.current,
    previousOwnedStillLive,
  });
  heldRunIdsRef.current = actionRunIds;
  const ownedProcesses = experimentOwnedProcessInstances(runtime,actionRunIds);
  const webProcess = ownedProcesses
    .find((process) => process.definitionId === LICHTBLICK_WEB_PROCESS_DEFINITION_ID);
  const bridgeProcess = ownedProcesses
    .find((process) => process.definitionId === LICHTBLICK_BRIDGE_PROCESS_DEFINITION_ID);
  const webReady = webProcess?.desiredState === 'running'
    && webProcess.observedState === 'running'
    && webProcess.readiness.status === 'passing';
  const bridgeReady = bridgeProcess?.desiredState === 'running'
    && bridgeProcess.observedState === 'running'
    && bridgeProcess.readiness.status === 'passing';
  const runtimeReady = Boolean(webReady && bridgeReady);
  const layoutDecision = useRef<{ processId:string;bootstrap:boolean } | null>(null);
  // Lock the layoutUrl decision for this process so marking bootstrap-complete
  // cannot rewrite iframe src and force a second Lichtblick load.
  if (webProcess && runtime && layoutDecision.current?.processId !== webProcess.id) {
    layoutDecision.current = {
      processId: webProcess.id,
      bootstrap: !lichtblickLayoutWasBootstrapped(runtime.targetId, webProcess.id),
    };
  }
  const bootstrapLayout = layoutDecision.current?.bootstrap ?? false;
  const liveEmbed: HeldLichtblickEmbed | null = !lifecycleStopping && runtimeReady && webProcess && runtime
    ? {
      url: lichtblickProxyUrl(runtime.targetId,webProcess.id,{ bootstrapLayout,embedded:true }),
      targetId: runtime.targetId,
      processId: webProcess.id,
    }
    : null;
  const heldEmbedRef = useRef<HeldLichtblickEmbed | null>(null);
  const heldEmbed = nextHeldLichtblickEmbed({
    stopping:lifecycleStopping,
    keepHold:actionRunIds.size > 0,
    targetId:runtime?.targetId ?? '',
    liveProcessId:webProcess?.id ?? '',
    live:liveEmbed,
    previous:heldEmbedRef.current,
  });
  heldEmbedRef.current = heldEmbed;
  const embedUrl = heldEmbed?.url ?? '';
  const layout = lichtblickLayoutOptions(panel.options);
  const layoutPresentation = lichtblickLayoutPresentation(layout.layoutMode);
  const failedRun = !active && action?.latestInvocation?.status === 'failed' ? action.latestInvocation : undefined;
  const runtimeError = runtime?.error.trim()
    || (failedRun ? runtime?.runDetailsById[failedRun.id]?.run?.primaryError?.trim() || 'Lichtblick workflow failed.' : '');
  const hasOwnedLiveProcess = ownedProcesses.some(lichtblickProcessStillLive);
  const startupPhase = lichtblickWorkspaceStartupPhase({
    stopping:lifecycleStopping,
    runtimeError,
    active:Boolean(active) && !lifecycleStopping,
    hasOwnedLiveProcess,
    hasEmbed:Boolean(embedUrl),
  });
  const startupGeneration = workflowStartupGeneration(
    active?.id || heldEmbed?.processId || '',
    panel.id,
  );
  const { presented,onPresentationComplete } = useWorkflowStartupPresentation(
    startupGeneration,
    startupPhase === 'stopped',
  );

  return <LichtblickPanelFrameBinding panelId={panel.id}>
    {(view,embedBridge) => {
      const showWorkflow = view === 'workflow';
      const contentVisible = presented && Boolean(embedUrl) && !showWorkflow && !lifecycleStopping;
      const keepPipelineMounted = !presented || lifecycleStopping || !embedUrl;
      const showEmbedBusy = contentVisible && surfaceVisible && !embedBridge.ready;
      return <div
        className="lichtblick-workspace"
      data-xgc-role="lichtblick-workspace"
      data-xgc-id={panel.id}
      data-xgc-view={view}
      data-xgc-visible-surface={showWorkflow ? 'workflow' : contentVisible ? 'lichtblick' : 'empty'}
      data-xgc-startup-presented={presented ? 'true' : 'false'}
      data-xgc-parked={surfaceVisible ? 'false' : 'true'}
      data-xgc-embed-held={embedUrl && !liveEmbed ? 'true' : 'false'}
      data-xgc-layout-mode={layout.layoutMode}
      data-xgc-layout-arrangement={layoutPresentation.arrangement}
      data-xgc-layout-first-pane={layoutPresentation.firstPane}
      data-xgc-layout-second-pane={layoutPresentation.secondPane}
      data-xgc-layout-third-pane={layoutPresentation.thirdPane}
      data-xgc-layout-runtime-owner="provisioning-core"
      data-xgc-active-run-id={active?.id ?? ''}
      data-xgc-runtime-target={runtime?.targetId ?? ''}
      data-xgc-runtime-error={runtimeError}
      data-xgc-runtime-run-count={runtime?.runSummaries.length ?? 0}
      data-xgc-runtime-process-count={runtime?.processInstances.length ?? 0}
      data-xgc-action-run-count={actionRunIds.size}
      data-xgc-web-process-id={webProcess?.id ?? ''}
      data-xgc-web-ready={webReady ? 'true' : 'false'}
      data-xgc-bridge-process-id={bridgeProcess?.id ?? ''}
      data-xgc-bridge-ready={bridgeReady ? 'true' : 'false'}
    >
      <LichtblickSceneHostBinding panelId={panel.id} host={resolveLichtblickSceneHost({
        panelId:panel.id,
        sceneNamespace:layout.sceneNamespace,
        action:context.ports.actions['scene-command'],
        targetId:runtime?.targetId,
        webReady,
        bridgeReady,
        lifecycleStopping,
        disabledReason:context.disabledReason,
        editing:context.editing,
      })} />
      {webProcess && runtime && (
        <MarkLichtblickLayoutBootstrapped
          ready={embedBridge.ready}
          targetId={runtime.targetId}
          processInstanceId={webProcess.id}
        />
      )}
      {embedUrl && (
        <iframe ref={embedBridge.iframeRef}
          className="lichtblick-frame" title={panel.title || 'Lichtblick'}
          hidden={showWorkflow}
          aria-hidden={showWorkflow || undefined}
          src={embedUrl} sandbox="allow-scripts allow-same-origin allow-forms"
          allow="clipboard-read; clipboard-write; fullscreen" data-xgc-role="lichtblick-frame" data-xgc-id={panel.id} />
      )}
      {showWorkflow && (
        <div className="lichtblick-workflow-slot" data-xgc-role="lichtblick-workflow-slot" data-xgc-id={panel.id}>
          <LichtblickWorkflowView panelId={panel.id} runtime={runtime}
            workflowResourceId={action?.trace.automationResourceId ?? ''} />
        </div>
      )}
      {showEmbedBusy && (
        <div className="lichtblick-embed-busy" role="status" aria-busy="true"
          aria-label="Preparing Lichtblick runtime"
          data-xgc-role="lichtblick-embed-busy" data-xgc-id={panel.id} data-xgc-busy="true">
          <span className="xgc-workspace-busy-ring" aria-hidden="true" />
        </div>
      )}
      {keepPipelineMounted && (
        <LichtblickStartupPipeline
          panelId={panel.id}
          generation={startupGeneration}
          onPresentationComplete={onPresentationComplete}
          phase={startupPhase}
          paused={!surfaceVisible || showWorkflow}
          hidden={showWorkflow}
          runActive={!lifecycleStopping && (Boolean(active) || hasOwnedLiveProcess)}
          runtimeError={runtimeError}
          viewer={webProcess}
          bridge={bridgeProcess}
        />
      )}
      </div>;
    }}
  </LichtblickPanelFrameBinding>;
}

function MarkLichtblickLayoutBootstrapped({
  ready,targetId,processInstanceId,
}: {
  ready:boolean;
  targetId:string;
  processInstanceId:string;
}) {
  useEffect(() => {
    if (ready) markLichtblickLayoutBootstrapped(targetId, processInstanceId);
  }, [processInstanceId,ready,targetId]);
  return null;
}
