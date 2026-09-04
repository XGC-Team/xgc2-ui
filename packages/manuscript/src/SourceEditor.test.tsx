import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceEditor } from './SourceEditor';

describe('SourceEditor', () => {
  it('is a markable host with role and id on the chrome box', () => {
    render(<SourceEditor implementation="plain" onValueChange={() => undefined} value="\\section{Loop}" />);
    const editor = screen.getByRole('textbox', { name: 'Source' });
    expect(editor).toHaveAttribute('data-xgc-role', 'source-editor');
    expect(editor).toHaveAttribute('data-xgc-id', 'source-editor');
    expect(editor).toHaveClass('xgc-manuscript-source-editor');
  });

  it('reports cursor line after a click and accepts an incoming reveal', () => {
    const onCursorChange = vi.fn();
    const { rerender } = render(
      <SourceEditor implementation="plain" onCursorChange={onCursorChange} onValueChange={() => undefined} value={'a\nb\nc'} />,
    );
    const editor = screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(2, 2);
    fireEvent.click(editor);
    expect(onCursorChange).toHaveBeenCalledWith({ line: 2, column: 1 });
    rerender(
      <SourceEditor
        cursor={{ line: 3, column: 1 }}
        implementation="plain"
        onCursorChange={onCursorChange}
        onValueChange={() => undefined}
        value={'a\nb\nc'}
      />,
    );
    expect(editor.selectionStart).toBe(4);
  });
});
