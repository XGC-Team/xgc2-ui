import type { Meta, StoryObj } from '@storybook/react-vite';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { WorkflowCanvas, WorkflowCanvasToolbar, WorkflowNodeSurface } from '@xgc2/ui-workflow';

const meta = {
  title: 'Foundations/Workflow canvas',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const nodes = [
  { id: 'trigger', position: { x: 60, y: 100 }, data: { label: 'Manual trigger' }, type: 'gallery' },
  { id: 'process', position: { x: 300, y: 100 }, data: { label: 'Run process' }, type: 'gallery' },
  { id: 'complete', position: { x: 540, y: 100 }, data: { label: 'Complete' }, type: 'gallery' },
];
const edges = [
  { id: 'trigger-process', source: 'trigger', target: 'process' },
  { id: 'process-complete', source: 'process', target: 'complete' },
];

const nodeTypes = {
  gallery: ({ data, selected }: NodeProps) => (
    <WorkflowNodeSurface
      content={<strong>{String(data.label)}</strong>}
      handles={(
        <>
          <Handle position={Position.Left} type="target" />
          <Handle position={Position.Right} type="source" />
        </>
      )}
      selected={selected}
    />
  ),
};

export const SpatialFoundation: Story = {
  render: () => (
    <div className="xgc-gallery-workflow-canvas">
      <WorkflowCanvas
        controls={(api) => (
          <WorkflowCanvasToolbar
            actions={[
              { id: 'fit', icon: <span>◎</span>, label: 'Zoom to fit', onClick: api.fitView },
              { id: 'zoom-in', icon: <span>+</span>, label: 'Zoom in', onClick: api.zoomIn },
              { id: 'zoom-out', icon: <span>−</span>, label: 'Zoom out', onClick: api.zoomOut },
            ]}
            ariaLabel="Canvas controls"
          />
        )}
        edges={edges}
        nodeTypes={nodeTypes}
        nodes={nodes}
      />
    </div>
  ),
};
