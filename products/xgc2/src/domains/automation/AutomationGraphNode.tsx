import { StatusText } from '@xgc2/ui-react';
import { WorkflowNodeSurface,WorkflowNodeToolbar } from '@xgc2/ui-workflow';
import { Handle,Position,type Node,type NodeProps } from '@xyflow/react';
import { Check,Copy,Play,Plus,Settings2,Trash2,X } from 'lucide-react';
import { useEffect,useState,type CSSProperties } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { useAutomationCanvasText } from './automationCanvasMessages';
import { isAutomationTriggerKind } from './automationTriggerContracts';
import { limitAutomationNodeDisplayName } from './automationSpecModel';
import type { GraphCanvasNodeData,GraphNodeData,GraphPoint } from './automationGraphTypes';
import { automationNodeCategory,automationNodeIcon } from './automationNodeVisuals';
import { AUTOMATION_GRAPH_NODE_HEADER_HEIGHT,AUTOMATION_GRAPH_NODE_WIDTH,AUTOMATION_GRAPH_PORT_HEIGHT,automationGraphNodeHeightForPorts,automationGraphOutputPorts } from './automationGraphLayout';

export function AutomationGraphNode({ data,selected: flowSelected }: NodeProps<Node<GraphCanvasNodeData>>) {
  const {
    definition,catalog,nodeComposition,status,occurrence,selected,editable,hovered,connectedOutputPorts,outputAddPosition,
    runtimeFact,onHover,onOpen,canRunToNode,onRunToNode,onDisplayNameChange,onDuplicate,onDelete,onOutputAdd,
  } = data as GraphNodeData;
  const t = useAutomationCanvasText();
  const isSelected = selected || flowSelected;
  const trigger = isAutomationTriggerKind(definition.kind);
  const category = automationNodeCategory(catalog?.category);
  const processDefinitionId = typeof definition.parameters.definitionId === 'string' ? definition.parameters.definitionId : '';
  const visualKind = definition.kind === 'process.run-definition' && processDefinitionId
    ? `process-preset:${processDefinitionId}`
    : definition.kind;
  const Icon = automationNodeIcon(visualKind, category, definition.typeVersion, nodeComposition);
  const runtimeActive = data.runtimeState === 'active';
  const operatorStatus = runtimeFact?.status;
  const visibleStatus = runtimeActive && (!operatorStatus || operatorStatus === 'passing' || operatorStatus === 'idle')
    ? 'running'
    : operatorStatus ?? status;
  const completed = visibleStatus === 'succeeded' || visibleStatus === 'compensated';
  const failed = visibleStatus === 'failed' || visibleStatus === 'canceled';
  const hasFeedback = Boolean(visibleStatus || (occurrence && occurrence.total > 0));
  const outputPorts = automationGraphOutputPorts(catalog,connectedOutputPorts);
  const hasNamedOutputPorts = Boolean(outputPorts?.length);
  const hasNoOutput = outputPorts !== undefined && outputPorts.length === 0;
  const outputCount = outputPorts?.length ?? 0;
  const [renaming,setRenaming] = useState(false);
  const [nameDraft,setNameDraft] = useState(definition.displayName);

  useEffect(() => {
    if (!renaming) setNameDraft(definition.displayName);
  }, [definition.displayName,renaming]);

  function beginRename() {
    if (!editable) return;
    setNameDraft(definition.displayName);
    setRenaming(true);
  }

  function finishRename() {
    const displayName = nameDraft.trim();
    setRenaming(false);
    if (!displayName) {
      setNameDraft(definition.displayName);
      return;
    }
    if (displayName !== definition.displayName) onDisplayNameChange(definition.id, displayName);
  }

  function cancelRename() {
    setNameDraft(definition.displayName);
    setRenaming(false);
  }

  return (
    <article
      className="automation-graph-node"
      data-xgc-category={category}
      data-xgc-trigger={trigger ? 'true' : 'false'}
      data-xgc-output-layout={hasNamedOutputPorts ? 'named' : 'single'}
      data-xgc-output-count={outputCount}
      style={{
        width: AUTOMATION_GRAPH_NODE_WIDTH,
        height: automationGraphNodeHeightForPorts(outputCount),
        '--automation-node-header-height': `${AUTOMATION_GRAPH_NODE_HEADER_HEIGHT}px`,
        '--automation-node-port-height': `${AUTOMATION_GRAPH_PORT_HEIGHT}px`,
      } as CSSProperties}
      data-xgc-kind={definition.kind}
      data-selected={isSelected ? 'true' : undefined}
      aria-label={definition.displayName}
      title={definition.displayName}
      tabIndex={0}
      data-xgc-role="automation-node"
      data-xgc-id={definition.id}
      data-xgc-status={operatorStatus ?? (runtimeActive ? 'active' : status)}
      data-xgc-observed={runtimeFact?.observed}
      data-xgc-readiness={runtimeFact?.readiness}
      data-xgc-engine-status={runtimeActive || operatorStatus ? status : undefined}
      data-xgc-runtime-state={runtimeActive ? 'active' : undefined}
      onMouseEnter={() => onHover(definition.id, true)}
      onMouseLeave={() => onHover(definition.id, false)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'F2' && event.key !== 'Enter')) return;
        event.preventDefault();
        beginRename();
      }}
    >
      <AutomationNodeToolbar
        id={definition.id}
        label={definition.displayName}
        editable={editable}
        visible={hovered || isSelected}
        onHover={onHover}
        onOpen={onOpen}
        canRunToNode={canRunToNode}
        onRunToNode={trigger ? undefined : onRunToNode}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
      <WorkflowNodeSurface
        className="automation-node-tile"
        content={(
          <div className="automation-node-heading">
            <span className="automation-node-icon" data-xgc-role="automation-node-icon" data-xgc-id={definition.id}>
              {trigger ? (
                <span className="automation-trigger-icon" data-xgc-role="automation-trigger-icon" data-xgc-id={definition.id}>
                  <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
                </span>
              ) : <Icon aria-hidden="true" size={20} strokeWidth={1.75} />}
            </span>
            <div className="automation-node-caption">
              <div className="automation-node-name-slot">
                {renaming ? (
                  <InputControl
                    className="automation-node-name-input nodrag nopan"
                    aria-label={t('Rename {name}', { name: definition.displayName })}
                    autoFocus
                    value={nameDraft}
                    dataXgcRole="automation-node-display-name-input"
                    dataXgcId={definition.id}
                    onChange={(value) => setNameDraft(limitAutomationNodeDisplayName(value))}
                    onBlur={finishRename}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        finishRename();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                ) : (
                  <span className="automation-node-display-name nodrag nopan" data-xgc-role="automation-node-display-name" data-xgc-id={definition.id}>{definition.displayName}</span>
                )}
              </div>
              {hasFeedback && <div className="automation-node-feedback">
                {visibleStatus && (
                  <StatusText
                    className="automation-node-status"
                    role="status"
                    status={visibleStatus}
                    aria-label={t('Status: {status}', { status: t(visibleStatus.replaceAll('-', ' ')) })}
                    data-xgc-status={visibleStatus}
                    data-xgc-role={operatorStatus ? 'automation-node-operator-status' : 'automation-node-status'}
                    data-xgc-id={definition.id}
                  >
                    {completed ? <Check aria-hidden="true" size={12} /> : failed ? <X aria-hidden="true" size={12} /> : null}
                    {t(visibleStatus.replaceAll('-', ' '))}
                  </StatusText>
                )}
                {occurrence && occurrence.total > 0 && (
                  <span
                    className="automation-occurrences-node-count"
                    data-active={occurrence.active > 0 ? 'true' : undefined}
                    data-failed={occurrence.failed > 0 ? 'true' : undefined}
                    aria-label={`${occurrence.total} ${occurrence.total === 1 ? 'invocation' : 'invocations'}, ${occurrence.active} active, ${occurrence.failed} failed`}
                    data-xgc-role="automation-node-aggregate"
                    data-xgc-id={definition.id}
                  >×{occurrence.total}</span>
                )}
              </div>}
            </div>
          </div>
        )}
        contentClassName="automation-node-tile-content"
        dataXgcId={definition.id}
        dataXgcRole="automation-node-tile"
        handles={(
          <>
            {!trigger && <Handle className="automation-node-target-handle" type="target" position={Position.Left} data-xgc-role="automation-node-target-handle" data-xgc-id={definition.id} />}
            {hasNamedOutputPorts ? (
              <div className="automation-node-output-ports">
                {outputPorts!.map((port,index) => (
                  <span className="automation-node-output-port" data-xgc-port={port.id} data-xgc-connected={connectedOutputPorts.includes(port.id) ? 'true' : 'false'} key={port.id} style={{ top: AUTOMATION_GRAPH_NODE_HEADER_HEIGHT + (index + 0.5) * AUTOMATION_GRAPH_PORT_HEIGHT }}>
                    <span
                      className="nodrag nopan"
                      data-xgc-id={`${definition.id}:${port.id}`}
                      data-xgc-role="automation-node-output-port-label"
                    >{port.label}</span>
                    <Handle id={port.id} type="source" position={Position.Right} data-xgc-role="automation-node-source-handle" data-xgc-id={`${definition.id}:${port.id}`} />
                    {editable && !connectedOutputPorts.includes(port.id) && (
                      <OutputAddButton nodeId={definition.id} sourcePort={port.id} position={outputAddPosition} onAdd={onOutputAdd} named />
                    )}
                  </span>
                ))}
              </div>
            ) : !hasNoOutput && (
              <span className="automation-node-main-output" data-xgc-connected={connectedOutputPorts.includes('main') ? 'true' : 'false'}>
                <Handle id="main" type="source" position={Position.Right} data-xgc-role="automation-node-source-handle" data-xgc-id={definition.id} />
                {editable && !connectedOutputPorts.includes('main') && (
                  <OutputAddButton nodeId={definition.id} sourcePort="main" position={outputAddPosition} onAdd={onOutputAdd} />
                )}
              </span>
            )}
          </>
        )}
        padding="none"
        selected={isSelected}
      />
    </article>
  );
}

function OutputAddButton({ nodeId,sourcePort,position,onAdd,named = false }: {
  nodeId: string;
  sourcePort: string;
  position: GraphPoint;
  onAdd: (id: string, sourcePort: string, position: GraphPoint) => void;
  named?: boolean;
}) {
  const t = useAutomationCanvasText();
  return (
    <ControlButton
      className="automation-node-output-add nodrag nopan"
      iconOnly
      size="compact"
      data-xgc-named={named ? 'true' : 'false'}
      type="button"
      aria-label={t('Add node from {port} output', { port: sourcePort })}
      title={t('Add next node')}
      data-xgc-role="automation-node-output-add"
      data-xgc-id={`${nodeId}:${sourcePort}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onAdd(nodeId, sourcePort, position);
      }}
    >
      <Plus size={12} strokeWidth={2} aria-hidden="true" />
    </ControlButton>
  );
}

function AutomationNodeToolbar({ id,label,editable,visible,onHover,onOpen,canRunToNode,onRunToNode,onDuplicate,onDelete }: {
  id: string;
  label: string;
  editable: boolean;
  visible: boolean;
  onHover: (id: string, active: boolean) => void;
  onOpen: (id: string) => void;
  canRunToNode: boolean;
  onRunToNode?: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useAutomationCanvasText();
  return (
    <WorkflowNodeToolbar
      actions={[
        {
          appearance: 'ghost',
          icon: <Settings2 size={14} />,
          id: 'automation-node-open',
          label: t('Open node properties'),
          onClick: () => onOpen(id),
          uiSize: 'compact',
        },
        ...(onRunToNode ? [{
          appearance: 'ghost' as const,
          disabled: !canRunToNode,
          icon: <Play size={14} />,
          id: 'automation-run-through-node',
          label: t('Run to this node'),
          onClick: () => onRunToNode(id),
          uiSize: 'compact' as const,
        }] : []),
        ...(editable ? [{
          appearance: 'ghost' as const,
          icon: <Copy size={14} />,
          id: 'automation-node-duplicate',
          label: t('Duplicate node'),
          onClick: () => onDuplicate(id),
          uiSize: 'compact' as const,
        }, {
          appearance: 'ghost' as const,
          icon: <Trash2 size={14} />,
          id: 'automation-node-delete',
          label: t('Delete node'),
          onClick: () => onDelete(id),
          tone: 'danger' as const,
          uiSize: 'compact' as const,
        }] : []),
      ]}
      ariaLabel={t('{label} actions', { label })}
      nodeId={id}
      className="automation-node-toolbar nodrag nopan"
      dataXgcId={id}
      dataXgcRole="automation-node-actions"
      onActiveChange={(active) => onHover(id, active)}
      visible={visible}
    />
  );
}
