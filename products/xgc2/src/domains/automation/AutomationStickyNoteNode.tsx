import { WorkflowStickyNote } from '@xgc2/ui-workflow';
import type { Node, NodeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useAutomationCanvasText } from './automationCanvasMessages';
import {
  AUTOMATION_STICKY_NOTE_MAX_SIZE,
  AUTOMATION_STICKY_NOTE_MIN_HEIGHT,
  AUTOMATION_STICKY_NOTE_MIN_WIDTH,
} from './automationDefinitionContracts';
import type { GraphCanvasNodeData, StickyNoteNodeData } from './automationGraphTypes';

/** Domain adapter; spatial note interaction and appearance live in @xgc2/ui-workflow. */
export function AutomationStickyNoteNode({ data, selected }: NodeProps<Node<GraphCanvasNodeData>>) {
  const t = useAutomationCanvasText();
  const { note, editable, onChange, onDelete } = data as StickyNoteNodeData;
  return <WorkflowStickyNote
    ariaLabel={t('Sticky note {id}', { id: note.id })}
    content={note.content}
    dataXgcId={note.id}
    dataXgcRole="automation-sticky-note"
    deleteDataXgcRole="automation-sticky-note-delete"
    deleteIcon={<Trash2 aria-hidden="true" size={14} />}
    deleteLabel={t('Delete sticky note')}
    editable={editable}
    editorLabel={t('Sticky note content')}
    id={note.id}
    maxSize={AUTOMATION_STICKY_NOTE_MAX_SIZE}
    minHeight={AUTOMATION_STICKY_NOTE_MIN_HEIGHT}
    minWidth={AUTOMATION_STICKY_NOTE_MIN_WIDTH}
    onChange={onChange}
    onDelete={onDelete}
    selected={selected}
  />;
}
