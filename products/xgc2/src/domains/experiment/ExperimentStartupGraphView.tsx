import { Maximize,ZoomIn,ZoomOut } from 'lucide-react';
import { useCallback,useRef,useState } from 'react';
import { AutomationGraph } from '../automation/automationPublic';
import { ControlButton } from '../../components/controls/ControlButton';
import '../../styles/experiment-startup-graph.css';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';
import {
  EXPERIMENT_STARTUP_GRAPH_ALL,
  projectExperimentRunGraph,
  projectExperimentStartupGraph,
  type ExperimentRunGraphSelection,
} from './experimentStartupGraphModel';

type GraphInstance = Parameters<NonNullable<Parameters<typeof AutomationGraph>[0]['onReady']>>[0];

export function ExperimentStartupGraphView({
  panelId,
  runtime,
  selectedId = EXPERIMENT_STARTUP_GRAPH_ALL,
  workflowResourceIds = [],
  runSelection,
  className,
  dataXgcRole = 'experiment-startup-graph',
  dataXgcId,
}: {
  panelId:string;
  runtime:ExperimentProcessRuntimeProjection|undefined;
  selectedId?:string;
  workflowResourceIds?:readonly string[];
  runSelection?:ExperimentRunGraphSelection;
  className?:string;
  dataXgcRole?:string;
  dataXgcId?:string;
}) {
  const graph = runSelection
    ? projectExperimentRunGraph(runtime,runSelection)
    : projectExperimentStartupGraph(runtime,selectedId,workflowResourceIds);
  const graphRef = useRef<GraphInstance | null>(null);
  const [graphReady,setGraphReady] = useState(false);
  const handleReady = useCallback((instance:GraphInstance) => {
    graphRef.current = instance;
    setGraphReady(true);
    void instance.fitView({ padding:0.18,maxZoom:1.25,duration:0 });
  },[]);
  return (
    <section
      className={`experiment-startup-graph${className ? ` ${className}` : ''}`}
      data-xgc-role={dataXgcRole}
      data-xgc-id={dataXgcId ?? panelId}
      data-xgc-selected={graph.selectedId}
      data-state={graph.empty ? 'empty' : 'ready'}
    >
      {!graph.empty && (
        <AutomationGraph
          definition={{ nodes:graph.nodes,edges:graph.edges,stickyNotes:[] }}
          catalog={graph.catalog}
          nodeSummaries={graph.nodeSummaries}
          nodeRuntimeFacts={graph.nodeRuntimeFacts}
          activeRuntimeNodeIds={graph.activeRuntimeNodeIds}
          editable={false}
          autoLayout
          onReady={handleReady}
          controlsId={`experiment-startup-graph-${panelId}`}
        />
      )}
      {graph.empty && (
        <div
          className="experiment-startup-graph-state"
          data-xgc-role="experiment-startup-graph-state"
          data-xgc-id={panelId}
          data-state={graph.degraded ? 'degraded' : 'empty'}
        >{graph.degradedReason}</div>
      )}
      <div
        className="experiment-startup-graph-zoom"
        role="toolbar"
        aria-label="Startup sequence zoom"
        data-xgc-role="experiment-startup-graph-zoom"
        data-xgc-id={panelId}
      >
        <ControlButton
          iconOnly type="button" aria-label="Zoom to fit" title="Zoom the startup sequence to fit"
          dataXgcRole="experiment-startup-graph-zoom-to-fit" dataXgcId={panelId}
          disabled={!graphReady || graph.empty}
          onClick={(event) => { event.stopPropagation();void graphRef.current?.fitView({ padding:0.18,maxZoom:1.25,duration:180 }); }}
        ><Maximize size={13} aria-hidden="true" /></ControlButton>
        <ControlButton
          iconOnly type="button" aria-label="Zoom in" title="Zoom in"
          dataXgcRole="experiment-startup-graph-zoom-in" dataXgcId={panelId}
          disabled={!graphReady || graph.empty}
          onClick={(event) => { event.stopPropagation();void graphRef.current?.zoomIn({ duration:140 }); }}
        ><ZoomIn size={13} aria-hidden="true" /></ControlButton>
        <ControlButton
          iconOnly type="button" aria-label="Zoom out" title="Zoom out"
          dataXgcRole="experiment-startup-graph-zoom-out" dataXgcId={panelId}
          disabled={!graphReady || graph.empty}
          onClick={(event) => { event.stopPropagation();void graphRef.current?.zoomOut({ duration:140 }); }}
        ><ZoomOut size={13} aria-hidden="true" /></ControlButton>
      </div>
    </section>
  );
}
