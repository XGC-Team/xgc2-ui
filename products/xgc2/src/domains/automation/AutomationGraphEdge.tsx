import { WorkflowElementToolbar } from '@xgc2/ui-workflow';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeToolbar,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { Plus,Trash2 } from 'lucide-react';
import { useAutomationCanvasText } from './automationCanvasMessages';
import { edgeLabelTransform } from './automationGraphModel';
import { automationRoutedEdgePath } from './automationGraphRouting';
import type { GraphEdge,GraphPoint } from './automationGraphTypes';

export function AutomationGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  selected,
  data,
}: EdgeProps<GraphEdge>) {
  const [path,labelX,labelY] = data?.routePoints
    ? automationRoutedEdgePath(data.routePoints,{ x: sourceX,y: sourceY },{ x: targetX,y: targetY })
    : getSmoothStepPath({ sourceX,sourceY,sourcePosition,targetX,targetY,targetPosition,borderRadius: 12 });
  const isSelected = Boolean(selected || data?.selected);
  return (
    <>
      <g
        data-xgc-role="automation-edge"
        data-xgc-id={id}
        data-xgc-condition={data?.condition ?? 'success'}
        data-xgc-run-succeeded={data?.runSucceeded ? 'true' : 'false'}
        data-xgc-selected={isSelected ? 'true' : 'false'}
      >
        {/* `<g>` has no painted geometry; Chrome can omit it from elementsFromPoint. */}
        <path className="automation-edge-hit" d={path} fill="none" />
        <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={40} />
      </g>
      <EdgeToolbar
        edgeId={id}
        x={labelX}
        y={labelY}
        alignY="bottom"
        className="nodrag nopan"
        isVisible={Boolean(data && (data.hovered || isSelected))}
      >
        <AutomationEdgeActions
          id={id}
          position={{ x: labelX,y: labelY }}
          editable={Boolean(data?.editable)}
          onHover={data?.onHover}
          onInsert={data?.onInsert}
          onDelete={data?.onDelete}
        />
      </EdgeToolbar>
      {label && (
        <EdgeLabelRenderer>
          <span
            className="automation-edge-label"
            data-xgc-role="automation-edge-label"
            data-xgc-id={id}
            style={{ transform: edgeLabelTransform(labelX, labelY) }}
          >{label}</span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export function AutomationEdgeActions({ id,position,editable = false,onHover,onInsert,onDelete }: {
  id: string;
  position: GraphPoint;
  editable?: boolean;
  onHover?: (id: string, active: boolean) => void;
  onInsert?: (id: string, position: GraphPoint) => void;
  onDelete?: (id: string) => void;
}) {
  const t = useAutomationCanvasText();
  return (
    <WorkflowElementToolbar
      actions={editable ? [{
        appearance: 'ghost',
        icon: <Plus size={14} />,
        id: 'automation-edge-insert',
        label: t('Insert node'),
        onClick: () => onInsert?.(id, position),
        uiSize: 'compact',
      }, {
        appearance: 'ghost',
        icon: <Trash2 size={14} />,
        id: 'automation-edge-delete',
        label: t('Delete connection'),
        onClick: () => onDelete?.(id),
        tone: 'danger',
        uiSize: 'compact',
      }] : []}
      ariaLabel={t('Connection {id} actions', { id })}
      className="automation-edge-toolbar"
      dataXgcId={id}
      dataXgcRole="automation-edge-actions"
      onActiveChange={(active) => onHover?.(id, active)}
    />
  );
}
