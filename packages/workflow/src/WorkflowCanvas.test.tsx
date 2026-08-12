import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkflowCanvas, WorkflowCanvasToolbar, WorkflowElementToolbar } from './WorkflowCanvas';

beforeAll(() => {
  class TestResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
  if (!globalThis.DOMMatrixReadOnly) {
    Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
      configurable: true,
      value: class TestDOMMatrixReadOnly { m22 = 1; },
    });
  }
});

describe('WorkflowCanvas', () => {
  it('owns the spatial surface, grid, empty state, and standard interaction defaults', () => {
    const { container } = render(
      <div style={{ height: 400, width: 600 }}>
        <WorkflowCanvas edges={[]} empty="Add a node" nodes={[]} />
      </div>,
    );

    expect(container.querySelector('[data-xgc-role="workflow-canvas"]')).toHaveClass('xgc-workflow-canvas');
    expect(container.querySelector('.react-flow__background')).not.toBeNull();
    expect(container.querySelector('.xgc-workflow-canvas-empty')).toHaveTextContent('Add a node');
  });

  it('renders stable, accessible canvas actions without product-owned button skins', () => {
    const onAdd = vi.fn();
    render(
      <WorkflowCanvasToolbar
        actions={[{ id: 'add-node', icon: <span>+</span>, label: 'Add node', onClick: onAdd }]}
        ariaLabel="Canvas controls"
        dataXgcId="editor"
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas controls' });
    const action = within(toolbar).getByRole('button', { name: 'Add node' });
    expect(toolbar).toHaveAttribute('data-xgc-role', 'workflow-canvas-controls');
    expect(action).toHaveClass('xgc-button');
    expect(action).toHaveAttribute('data-xgc-role', 'add-node');
    fireEvent.click(action);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('owns element action styling, event isolation, and active state reporting', () => {
    const onActiveChange = vi.fn();
    const onDelete = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <WorkflowElementToolbar
          actions={[{
            appearance: 'ghost',
            id: 'delete-element',
            icon: <span>×</span>,
            label: 'Delete element',
            onClick: onDelete,
            tone: 'danger',
            uiSize: 'compact',
          }]}
          ariaLabel="Element actions"
          dataXgcId="node-1"
          onActiveChange={onActiveChange}
        />
      </div>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Element actions' });
    const action = within(toolbar).getByRole('button', { name: 'Delete element' });
    expect(toolbar).toHaveClass('xgc-workflow-element-toolbar');
    expect(action).toHaveAttribute('data-xgc-role', 'delete-element');
    expect(action).toHaveAttribute('data-xgc-id', 'node-1');
    fireEvent.mouseEnter(toolbar);
    fireEvent.click(action);
    fireEvent.mouseLeave(toolbar);
    expect(onActiveChange).toHaveBeenNthCalledWith(1, true);
    expect(onActiveChange).toHaveBeenNthCalledWith(2, false);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
