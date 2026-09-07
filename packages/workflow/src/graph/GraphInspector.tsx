import type { ReactNode } from 'react';
import { Button, DescriptionItem, DescriptionList, ScrollRegion, Stack, Toolbar } from '@xgc2/ui-react';
import type { GraphEdge, GraphNode } from './model.js';
export interface GraphInspectorProps {
  node: GraphNode;
  relations: readonly GraphEdge[];
  resolveLabel(id: string): string;
  onReveal(id: string): void;
  onClose(): void;
  onDiscuss?(): void;
  onOpen?(): void;
  evidence?: ReactNode;
}
/** Inspect existing records. This component never confirms or manufactures an edge. */
export function GraphInspector({ node, relations, resolveLabel, onReveal, onClose, onDiscuss, onOpen, evidence }: GraphInspectorProps) {
  const incident = relations.filter(edge => edge.source === node.id || edge.target === node.id);
  return <aside className="xgc-graph-inspector" aria-label={`${node.label}的详情`}>
    <Toolbar><span>资源详情</span><Button aria-label="关闭资源详情" onClick={onClose}>关闭</Button></Toolbar>
    <ScrollRegion>
      <Stack>
        <h2>{node.label}</h2>
        <p>{node.summary}</p>
        <DescriptionList>
          <DescriptionItem label="类型" value={node.kind} />
          <DescriptionItem label="版本" value={node.revision} />
        </DescriptionList>
        <h3>相连资源 · {incident.length}</h3>
        <ul className="xgc-graph-relations">
          {incident.map(edge => {
            const outgoing = edge.source === node.id;
            const other = outgoing ? edge.target : edge.source;
            return <li key={edge.id}>
              <span>{outgoing ? '→' : '←'} {edge.label} · {edge.state === 'confirmed' ? '已确认' : '待审查建议'}</span>
              <Button onClick={() => onReveal(other)}>{resolveLabel(other)}</Button>
            </li>;
          })}
        </ul>
        {evidence}
      </Stack>
    </ScrollRegion>
    <Toolbar>
      {onOpen ? <Button onClick={onOpen}>打开原始资源</Button> : null}
      {onDiscuss ? <Button onClick={onDiscuss}>带入主 Chat</Button> : null}
    </Toolbar>
  </aside>;
}
