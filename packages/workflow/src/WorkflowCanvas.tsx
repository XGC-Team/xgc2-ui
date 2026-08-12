import {
  Background,
  NodeToolbar,
  Position,
  ReactFlow,
  SelectionMode,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type ReactFlowProps,
  type XYPosition,
} from '@xyflow/react';
import { Button } from '@xgc2/ui-react';
import type { ButtonAppearance, ButtonTone, ComponentSize } from '@xgc2/ui-react';
import type { DragEvent as ReactDragEvent, HTMLAttributes, ReactNode } from 'react';
import { useMemo, useRef } from 'react';

export type WorkflowCanvasApi<NodeType extends Node = Node, EdgeType extends Edge = Edge> = {
  fitView: () => void;
  instance: ReactFlowInstance<NodeType, EdgeType> | null;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type WorkflowCanvasDrop = {
  dataType: string;
  onDrop: (value: string, position: XYPosition, event: ReactDragEvent<HTMLDivElement>) => void;
};

export type WorkflowCanvasProps<NodeType extends Node = Node, EdgeType extends Edge = Edge> = Omit<
  ReactFlowProps<NodeType, EdgeType>,
  'children' | 'edges' | 'nodes' | 'onDragOver' | 'onDrop' | 'onInit'
> & {
  children?: ReactNode;
  className?: string;
  containerProps?: Omit<HTMLAttributes<HTMLDivElement>, 'className'> & { [key: `data-${string}`]: boolean | number | string | undefined };
  controls?: ReactNode | ((api: WorkflowCanvasApi<NodeType, EdgeType>) => ReactNode);
  dataXgcId?: string;
  dataXgcRole?: string;
  drop?: WorkflowCanvasDrop;
  edges: EdgeType[];
  editable?: boolean;
  empty?: ReactNode;
  emptyWhen?: boolean;
  flowClassName?: string;
  gridGap?: number;
  gridSize?: number;
  nodes: NodeType[];
  onReady?: (instance: ReactFlowInstance<NodeType, EdgeType>) => void;
};

const FIT_VIEW_OPTIONS = { maxZoom: 1.25, padding: 0.18 };
const DELETE_KEYS = ['Backspace', 'Delete'];
const PAN_BUTTONS = [1];
const PRO_OPTIONS = { hideAttribution: true };

export function WorkflowCanvas<NodeType extends Node = Node, EdgeType extends Edge = Edge>({
  children,
  className,
  containerProps,
  controls,
  dataXgcId,
  dataXgcRole = 'workflow-canvas',
  deleteKeyCode,
  drop,
  edges,
  editable = false,
  elementsSelectable = true,
  empty,
  emptyWhen,
  fitView = true,
  fitViewOptions = FIT_VIEW_OPTIONS,
  flowClassName,
  gridGap = 18,
  gridSize = 1,
  maxZoom = 1.7,
  minZoom = 0.25,
  nodes,
  nodesConnectable,
  nodesDraggable,
  onReady,
  panOnDrag,
  proOptions = PRO_OPTIONS,
  selectionMode = SelectionMode.Partial,
  selectionOnDrag,
  snapToGrid,
  zoomOnDoubleClick = false,
  ...flowProps
}: WorkflowCanvasProps<NodeType, EdgeType>) {
  const instanceRef = useRef<ReactFlowInstance<NodeType, EdgeType> | null>(null);
  const api = useMemo<WorkflowCanvasApi<NodeType, EdgeType>>(() => ({
    fitView: () => void instanceRef.current?.fitView({ ...fitViewOptions, duration: 180 }),
    get instance() { return instanceRef.current; },
    zoomIn: () => void instanceRef.current?.zoomIn({ duration: 140 }),
    zoomOut: () => void instanceRef.current?.zoomOut({ duration: 140 }),
  }), [fitViewOptions]);
  const showEmpty = emptyWhen ?? nodes.length === 0;

  return (
    <div
      {...containerProps}
      className={classNames('xgc-workflow-canvas', className)}
      data-editable={editable || undefined}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
    >
      <ReactFlow<NodeType, EdgeType>
        {...flowProps}
        className={flowClassName}
        deleteKeyCode={deleteKeyCode === undefined ? (editable ? DELETE_KEYS : null) : deleteKeyCode}
        edges={edges}
        elementsSelectable={elementsSelectable}
        fitView={fitView}
        fitViewOptions={fitViewOptions}
        maxZoom={maxZoom}
        minZoom={minZoom}
        nodes={nodes}
        nodesConnectable={nodesConnectable ?? editable}
        nodesDraggable={nodesDraggable ?? editable}
        onDragOver={drop ? (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        } : undefined}
        onDrop={drop ? (event) => {
          event.preventDefault();
          const value = event.dataTransfer.getData(drop.dataType);
          if (!value || !instanceRef.current) return;
          drop.onDrop(value, instanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }), event);
        } : undefined}
        onInit={(instance) => {
          instanceRef.current = instance;
          onReady?.(instance);
        }}
        panOnDrag={panOnDrag ?? (editable ? PAN_BUTTONS : true)}
        proOptions={proOptions}
        selectionMode={selectionMode}
        selectionOnDrag={selectionOnDrag ?? editable}
        snapToGrid={snapToGrid ?? editable}
        zoomOnDoubleClick={zoomOnDoubleClick}
      >
        <Background gap={gridGap} size={gridSize} />
        {children}
        {typeof controls === 'function' ? controls(api) : controls}
      </ReactFlow>
      {showEmpty && empty ? <div className="xgc-workflow-canvas-empty">{empty}</div> : null}
    </div>
  );
}

export type WorkflowToolbarAction = {
  ariaKeyShortcuts?: string;
  appearance?: ButtonAppearance;
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  title?: string;
  tone?: ButtonTone;
  uiSize?: ComponentSize;
};

export type WorkflowCanvasToolbarAction = WorkflowToolbarAction;

export type WorkflowCanvasToolbarProps = {
  actions: readonly WorkflowCanvasToolbarAction[];
  ariaLabel: string;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
};

export function WorkflowCanvasToolbar({
  actions,
  ariaLabel,
  className,
  dataXgcId,
  dataXgcRole = 'workflow-canvas-controls',
}: WorkflowCanvasToolbarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={classNames('xgc-workflow-canvas-toolbar', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
      role="toolbar"
    >
      <WorkflowToolbarButtons actions={actions} dataXgcId={dataXgcId} />
    </div>
  );
}

export type WorkflowElementToolbarProps = {
  actions: readonly WorkflowToolbarAction[];
  ariaLabel: string;
  className?: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  onActiveChange?: (active: boolean) => void;
};

export function WorkflowElementToolbar({
  actions,
  ariaLabel,
  className,
  dataXgcId,
  dataXgcRole = 'workflow-element-actions',
  onActiveChange,
}: WorkflowElementToolbarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={classNames('xgc-workflow-element-toolbar', className)}
      data-xgc-id={dataXgcId}
      data-xgc-role={dataXgcRole}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseEnter={() => onActiveChange?.(true)}
      onMouseLeave={() => onActiveChange?.(false)}
      role="toolbar"
    >
      <WorkflowToolbarButtons actions={actions} dataXgcId={dataXgcId} />
    </div>
  );
}

export type WorkflowNodeToolbarProps = WorkflowElementToolbarProps & {
  nodeId: string;
  visible: boolean;
};

export function WorkflowNodeToolbar({
  actions,
  ariaLabel,
  className,
  dataXgcId,
  dataXgcRole = 'workflow-node-actions',
  nodeId,
  onActiveChange,
  visible,
}: WorkflowNodeToolbarProps) {
  return (
    <NodeToolbar
      align="center"
      aria-label={ariaLabel}
      className={classNames('xgc-workflow-element-toolbar', className)}
      data-xgc-id={dataXgcId ?? nodeId}
      data-xgc-role={dataXgcRole}
      isVisible={visible}
      nodeId={nodeId}
      offset={7}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseEnter={() => onActiveChange?.(true)}
      onMouseLeave={() => onActiveChange?.(false)}
      position={Position.Top}
      role="toolbar"
    >
      <WorkflowToolbarButtons actions={actions} dataXgcId={dataXgcId ?? nodeId} />
    </NodeToolbar>
  );
}

function WorkflowToolbarButtons({ actions, dataXgcId }: {
  actions: readonly WorkflowToolbarAction[];
  dataXgcId?: string;
}) {
  return actions.map((action) => (
    <Button
      appearance={action.appearance}
      aria-keyshortcuts={action.ariaKeyShortcuts}
      aria-label={action.label}
      aria-pressed={action.pressed}
      data-xgc-id={dataXgcId}
      data-xgc-role={action.id}
      disabled={action.disabled}
      iconOnly
      key={action.id}
      onClick={action.onClick}
      title={action.title ?? action.label}
      tone={action.tone}
      uiSize={action.uiSize}
    >
      {action.icon}
    </Button>
  ));
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
