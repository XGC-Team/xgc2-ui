import { useMemo,useState } from 'react';
import {
  ExperimentStartupGraphView,
  experimentProcessRuntimeProjection,
  panelWorkflowRunTreeSelectorOptions,
  projectPanelWorkflowRunTrees,
} from '../../domains/experiment/experimentPublic';
import { useGroundStationErrorNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import type { PanelActionPortRuntime,PanelPluginProps } from '../types';
import { usePanelFrameControl } from '../usePanelFrameControl';
import { RosBasicServicesControlsView,type RosBasicServiceControlAction } from './RosBasicServicesControlsView';
import { rosBasicServicesLayoutOptions } from './rosBasicServicesPanelLayout';
import {
  rosBasicServicesShownFromActionPorts,
} from './rosBasicServicesPanelModel';
import { useRosBasicServicesPanelFrame } from './rosBasicServicesPanelFrameContext';
import { projectRosBasicServices } from './rosBasicServicesPanelProjection';
import '../../styles/ros-panel.css';
import '../../styles/ros-panel-whiteboard.css';
import { useRosPanelText } from './rosMessages';

export function RosBasicServicesPanel({ panel,context }: PanelPluginProps<readonly ['automation','experiment']>) {
  const t = useRosPanelText();
  const frame = useRosBasicServicesPanelFrame(panel.id);
  const layout = useMemo(() => rosBasicServicesLayoutOptions(panel.options),[panel.options]);
  const runtimeValue = context.ports.data['service-health']?.value;
  const runtime = useMemo(() => experimentProcessRuntimeProjection(runtimeValue),[runtimeValue]);
  const [busy,setBusy] = useState<Record<string,boolean>>({});
  const [error,setError] = useState('');
  const [selectedWorkflowRunId,setSelectedWorkflowRunId] = useState('');
  const targetId = context.executionTargetId || 'local';
  useGroundStationErrorNotification(targetId,error,{
    title:t('ROS Control'),source:panel.id,dedupeKey:`${panel.id}:ros-control-action-error`,
  });

  async function toggle(port:PanelActionPortRuntime|undefined) {
    if (!port || busy[port.id]) return;
    setBusy((current) => ({ ...current,[port.id]:true }));
    setError('');
    try {
      if (port.activeInvocation) {
        await port.control(port.activeInvocation,'stop',`Stop ${port.label} Panel Workflow Action`);
      } else {
        await port.invoke({},`Start ${port.label} Panel Workflow Action`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => ({ ...current,[port.id]:false }));
    }
  }

  const shown = useMemo(
    () => rosBasicServicesShownFromActionPorts(layout.shown,context.ports.actions),
    [context.ports.actions,layout.shown],
  );
  const serviceBindings = useMemo(() => Object.fromEntries(shown.map((id) => {
    const port = context.ports.actions[id];
    return [id,{
      automationResourceId:port?.trace.automationResourceId,
      actionId:port?.trace.actionId,
      activeRunId:port?.activeInvocation?.id,
      activeStatus:port?.activeInvocation?.status,
    }];
  })),[context.ports.actions,shown]);
  const services = useMemo(
    () => projectRosBasicServices(runtime,shown,serviceBindings),
    [runtime,serviceBindings,shown],
  );
  const actions = useMemo(() => Object.fromEntries(services.map((projection) => {
    const port = context.ports.actions[projection.service.id];
    const serviceLabel = t(projection.service.label);
    return [projection.service.id,{
      busy:busy[projection.service.id] === true,
      disabledReason:port?.disabledReason
        || (!port?.connected ? t('{name} Action is not connected.',{ name:serviceLabel }) : ''),
      titleAttr:port?.activeInvocation
        ? t('Stop {name} Panel Workflow Action.',{ name:serviceLabel })
        : t('Start {name} Panel Workflow Action.',{ name:serviceLabel }),
      running:Boolean(port?.activeInvocation),
      activate:async () => { await toggle(port); },
    } satisfies RosBasicServiceControlAction];
    // toggle deliberately reads the current lifecycle port and busy state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })),[busy,context.ports.actions,services,t]);

  const workflowResourceIds = useMemo(() => {
    const resourceIds = [...new Set(Object.values(context.ports.actions)
      .flatMap((port) => port.trace.automationResourceId ? [port.trace.automationResourceId] : []))];
    return resourceIds.length === 1 ? resourceIds : [];
  },[context.ports.actions]);
  const workflowRunTrees = useMemo(
    () => projectPanelWorkflowRunTrees(runtime,workflowResourceIds),
    [runtime,workflowResourceIds],
  );
  const workflowOptions = useMemo(
    () => panelWorkflowRunTreeSelectorOptions(workflowRunTrees),
    [workflowRunTrees],
  );
  const selectedWorkflow = workflowOptions.find((option) => option.runId === selectedWorkflowRunId)
    ?? workflowOptions[0];
  const whiteboardOptions = useMemo(() => workflowOptions.length > 0 ? workflowOptions : [{
    value:'',label:t('ROS Control Panel Run · stopped'),disabled:true,
  }],[t,workflowOptions]);
  const whiteboardControl = useMemo(() => ({
    options:whiteboardOptions,
    selectedWorkflowId:selectedWorkflow?.runId ?? '',
    selectWorkflow:setSelectedWorkflowRunId,
  }),[selectedWorkflow?.runId,whiteboardOptions]);
  usePanelFrameControl(frame.setWhiteboardControl,whiteboardControl);

  return (
    <section className="ros-panel-shell" data-xgc-role="ros-basic-services-panel" data-xgc-id={panel.id}>
      {frame.view === 'controls' ? (
        <RosBasicServicesControlsView actions={actions} buttonsPerRow={layout.buttonsPerRow}
          panelId={panel.id} services={services} />
      ) : (
        <div className="ros-panel-whiteboard-view" data-xgc-role="ros-basic-services-whiteboard-view" data-xgc-id={panel.id}>
          <ExperimentStartupGraphView
            panelId={panel.id}
            runtime={runtime}
            runSelection={{
              runId:selectedWorkflow?.runId ?? '',
              automationResourceId:selectedWorkflow?.automationResourceId ?? workflowResourceIds[0],
            }}
          />
        </div>
      )}
    </section>
  );
}
