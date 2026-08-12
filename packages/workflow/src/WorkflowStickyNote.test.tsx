import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowStickyNote } from './WorkflowStickyNote';

vi.mock('@xyflow/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('@xyflow/react')>(),
  NodeResizer: () => <span data-testid="node-resizer" />,
}));

describe('WorkflowStickyNote', () => {
  it('owns markdown display, edit/save behavior, resizing affordance, and deletion', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <WorkflowStickyNote
        ariaLabel="Sticky note one"
        content="# Mission\n**Ready**"
        deleteLabel="Delete sticky note"
        editable
        editorLabel="Sticky note content"
        id="one"
        onChange={onChange}
        onDelete={onDelete}
        selected
      />,
    );

    const note = screen.getByRole('article', { name: 'Sticky note one' });
    expect(note.querySelector('.xgc-workflow-sticky-note-content')).not.toHaveClass('nodrag');
    expect(note.querySelector('[data-level="1"]')).toHaveTextContent('Mission');
    expect(screen.getByTestId('node-resizer')).toBeInTheDocument();
    fireEvent.doubleClick(note);
    const editor = screen.getByRole('textbox', { name: 'Sticky note content' });
    fireEvent.change(editor, { target: { value: 'Updated' } });
    fireEvent.blur(editor);
    expect(onChange).toHaveBeenCalledWith('one', { content: 'Updated' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete sticky note' }));
    expect(onDelete).toHaveBeenCalledWith('one');
  });
});
