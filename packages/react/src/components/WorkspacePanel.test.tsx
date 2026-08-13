import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePanel, WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR } from './WorkspacePanel';

describe('WorkspacePanel', () => {
  it('owns the compact panel chrome, accessible title, actions, and fill body', () => {
    const { container } = render(
      <WorkspacePanel
        actions={<button type="button">Refresh</button>}
        bodyLayout="column"
        bodyScroll
        title="Telemetry"
      >
        Stream
      </WorkspacePanel>,
    );

    expect(screen.getByRole('article', { name: 'Telemetry' })).toHaveTextContent('Stream');
    expect(container.querySelector('.xgc-workspace-panel-header')).toHaveTextContent('Refresh');
    expect(container.querySelector('.xgc-workspace-panel-title')).toHaveTextContent('Telemetry');
    expect(container.querySelector('.xgc-workspace-panel-body')).toHaveAttribute('data-layout', 'column');
    expect(container.querySelector('.xgc-workspace-panel-body')).toHaveAttribute('data-scroll', 'true');
  });

  it('keeps an action-ready chrome row even when the panel has no visible title', () => {
    const { container } = render(<WorkspacePanel aria-label="Camera feed">Video</WorkspacePanel>);
    expect(screen.getByRole('article', { name: 'Camera feed' })).toBeInTheDocument();
    expect(container.querySelector('.xgc-workspace-panel-header')).toBeInTheDocument();
    expect(container.querySelector('.xgc-workspace-panel-actions')).toBeEmptyDOMElement();
  });

  it('exposes one shared drag handle and gates selection interaction to edit mode', () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <WorkspacePanel onSelect={onSelect} selected>Runtime</WorkspacePanel>,
    );
    const panel = container.querySelector<HTMLElement>('.xgc-workspace-panel')!;
    fireEvent.click(panel);
    expect(onSelect).not.toHaveBeenCalled();
    expect(panel).not.toHaveAttribute('data-selected');

    rerender(<WorkspacePanel editing onSelect={onSelect} selected>Runtime</WorkspacePanel>);
    expect(container.querySelector(WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR)).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-selected', 'true');
    const select = screen.getByRole('button', { name: 'Select panel' });
    expect(select).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(select);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disables body interaction during layout editing unless explicitly allowed', () => {
    const { container, rerender } = render(
      <WorkspacePanel editing><button type="button">Run</button></WorkspacePanel>,
    );
    expect(container.querySelector('.xgc-workspace-panel-body')).toHaveAttribute('aria-disabled', 'true');
    expect(container.querySelector('.xgc-workspace-panel-body')).toHaveAttribute('inert');
    expect(screen.getByRole('article')).not.toHaveAttribute('tabindex');

    rerender(<WorkspacePanel editing interactiveWhileEditing><button type="button">Run</button></WorkspacePanel>);
    expect(container.querySelector('.xgc-workspace-panel-body')).not.toHaveAttribute('aria-disabled');
    expect(container.querySelector('.xgc-workspace-panel-body')).not.toHaveAttribute('inert');
  });

  it('preserves consumer click handlers and does not select from nested actions', () => {
    const onClick = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <WorkspacePanel
        actions={<button type="button">Configure</button>}
        editing
        onClick={onClick}
        onSelect={onSelect}
        title="Runtime"
      >
        Content
      </WorkspacePanel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('.xgc-workspace-panel-title')!);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('.xgc-workspace-panel')!);
    expect(onClick).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});
