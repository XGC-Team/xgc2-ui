import { LoaderCircle,Play } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import '../../styles/automation-runtime-inspector.css';
import { AutomationNodeConfigPanel } from './AutomationNodeConfigPanel';
import type { AutomationParameterOptions } from './AutomationParameterControls';
import { AutomationNodeDialogFrame,type AutomationNodeDialogPane } from './AutomationNodeDialogFrame';
import { AutomationNodeInputPanel,AutomationNodeOutputPanel,type AutomationRuntimeInputSource } from './AutomationRuntimePanels';
import { isAutomationTriggerKind } from './automationTriggerContracts';
import type {
  AutomationDocument,
  AutomationNode,
  AutomationNodeCatalogEntry,
} from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import {
  automationNodeEditorFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

export function AutomationNodeDialog({ node,sourceNodeId,title,catalog,parameterSchema,parameterPath,parameterOptions,automationDocuments,executionTargetId = 'local',nodeSummary,run,inputSources,runtimeLoading,runtimeError,editable,canRun,running,nodeComposition,onChange,onRunToNode,onClose,onError }: {
  node: AutomationNode;
  sourceNodeId: string;
  title?: string;
  catalog?: AutomationNodeCatalogEntry;
  parameterSchema?: Record<string,unknown>;
  parameterPath?: 'root' | 'parameters';
  parameterOptions?: AutomationParameterOptions;
  automationDocuments?: readonly AutomationDocument[];
  executionTargetId?: string;
  nodeSummary?: AutomationRunDetail['nodeSummaries'][number];
  run?: AutomationRun;
  inputSources: AutomationRuntimeInputSource[];
  runtimeLoading: boolean;
  runtimeError: string;
  editable: boolean;
  canRun: boolean;
  running: boolean;
  nodeComposition?: AutomationNodeWebComposition;
  onChange: (patch: Partial<AutomationNode>) => void;
  onRunToNode: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const isTrigger = isAutomationTriggerKind(node.kind);
  const editor = automationNodeEditorFromComposition(nodeComposition,node.kind,node.typeVersion);
  const readsRunParameters = editor?.showRunParameters?.(node) ?? false;
  const panes: AutomationNodeDialogPane[] = [
    ...(!isTrigger ? [{
      id: 'input' as const,
      content: (
        <AutomationNodeInputPanel
          nodeId={sourceNodeId}
          runId={run?.id}
          nodeSummary={nodeSummary}
          sources={inputSources}
          showRunParameters={readsRunParameters}
          runParameters={run?.parameters}
          loading={runtimeLoading}
          error={runtimeError}
        />
      ),
    }] : []),
    {
      id: 'configuration',
      content: (
        <section className="automation-inspector" data-xgc-role="automation-selection-inspector" data-xgc-id={sourceNodeId}>
          <AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={parameterSchema} parameterPath={parameterPath} parameterOptions={parameterOptions} automationDocuments={automationDocuments} inputSourceIds={inputSources.map((source) => source.id)} executionTargetId={executionTargetId} readOnly={!editable} nodeComposition={nodeComposition} onChange={onChange} onError={onError} />
        </section>
      ),
    },
    {
      id: 'output',
      content: <AutomationNodeOutputPanel nodeId={sourceNodeId} runId={run?.id} nodeSummary={nodeSummary} loading={runtimeLoading} error={runtimeError} trigger={isTrigger} />,
    },
  ];
  return (
    <AutomationNodeDialogFrame
      nodeId={sourceNodeId}
      title={title ?? catalog?.label ?? node.kind}
      actions={!isTrigger ? (
        <ControlButton tone="primary" type="button" data-xgc-role="automation-run-through-node" data-xgc-id={sourceNodeId} disabled={!canRun} onClick={onRunToNode}>
          {running ? <LoaderCircle data-xgc-spinning="true" size={14} /> : <Play size={14} />}Run to this node
        </ControlButton>
      ) : undefined}
      panes={panes}
      onClose={onClose}
    />
  );
}
