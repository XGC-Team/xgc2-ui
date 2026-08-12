import { NodeResizer, type XYPosition } from '@xyflow/react';
import { Button, Textarea } from '@xgc2/ui-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';

export type WorkflowStickyNotePatch = {
  content?: string;
  height?: number;
  position?: XYPosition;
  width?: number;
};

export type WorkflowStickyNoteProps = {
  ariaLabel: string;
  className?: string;
  content: string;
  dataXgcId?: string;
  dataXgcRole?: string;
  deleteDataXgcRole?: string;
  deleteIcon?: ReactNode;
  deleteLabel: string;
  editable?: boolean;
  editorLabel: string;
  id: string;
  maxSize?: number;
  minHeight?: number;
  minWidth?: number;
  onChange: (id: string, patch: WorkflowStickyNotePatch) => void;
  onDelete: (id: string) => void;
  renderContent?: (content: string) => ReactNode;
  selected?: boolean;
};

export function WorkflowStickyNote({
  ariaLabel,
  className,
  content: savedContent,
  dataXgcId,
  dataXgcRole = 'workflow-sticky-note',
  deleteDataXgcRole = 'workflow-sticky-note-delete',
  deleteIcon = '×',
  deleteLabel,
  editable = false,
  editorLabel,
  id,
  maxSize = 720,
  minHeight = 120,
  minWidth = 180,
  onChange,
  onDelete,
  renderContent = renderStickyMarkdown,
  selected = false,
}: WorkflowStickyNoteProps) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(savedContent);
  useEffect(() => setContent(savedContent), [savedContent]);

  const finishEditing = () => {
    setEditing(false);
    if (content !== savedContent) onChange(id, { content });
  };

  return (
    <article
      aria-label={ariaLabel}
      className={classNames('xgc-workflow-sticky-note', className)}
      data-editing={editing || undefined}
      data-selected={selected || undefined}
      data-xgc-id={dataXgcId ?? id}
      data-xgc-role={dataXgcRole}
      onDoubleClick={(event) => {
        if (!editable) return;
        event.stopPropagation();
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={editable && selected}
        maxHeight={maxSize}
        maxWidth={maxSize}
        minHeight={minHeight}
        minWidth={minWidth}
        onResizeEnd={(_event, params) => onChange(id, {
          height: params.height,
          position: { x: params.x, y: params.y },
          width: params.width,
        })}
      />
      {editing ? (
        <Textarea
          aria-label={editorLabel}
          autoFocus
          className="xgc-workflow-sticky-note-editor nodrag nowheel"
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) event.currentTarget.blur();
          }}
          onValueChange={setContent}
          value={content}
        />
      ) : (
        <div className="xgc-workflow-sticky-note-content nowheel">
          {renderContent(content)}
        </div>
      )}
      {editable && selected && !editing ? (
        <Button
          aria-label={deleteLabel}
          className="xgc-workflow-sticky-note-delete nodrag"
          data-xgc-id={dataXgcId ?? id}
          data-xgc-role={deleteDataXgcRole}
          iconOnly
          onClick={() => onDelete(id)}
          uiSize="compact"
        >
          {deleteIcon}
        </Button>
      ) : null}
    </article>
  );
}

function renderStickyMarkdown(content: string) {
  return content.split('\n').map((line, index) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      return <strong className="xgc-workflow-sticky-note-heading" data-level={(heading[1] ?? '').length} key={index}>{renderInline(heading[2] ?? '')}</strong>;
    }
    return <span key={index}>{line ? renderInline(line) : '\u00a0'}</span>;
  });
}

function renderInline(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <Fragment key={index}>{part}</Fragment>);
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}
