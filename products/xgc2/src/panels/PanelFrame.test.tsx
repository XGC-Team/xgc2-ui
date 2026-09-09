/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../domains/experiment/experimentPublic';
import { PanelFrame } from './PanelFrame';

describe('PanelFrame', () => {
  it('keeps the accessible panel name without a visible workspace title', () => {
    const { container,rerender } = render(
      <PanelFrame panel={panel()} selected={false} onSelect={vi.fn()} onConfigure={vi.fn()}>
        <div>Panel content</div>
      </PanelFrame>,
    );

    const frame = container.querySelector('[data-xgc-role="experiment-panel"][data-xgc-id="panel-a"]');
    const header = container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-a"]');
    expect(frame).toHaveAccessibleName('Lichtblick');
    expect(header).not.toHaveClass('xgc-workspace-panel-drag-handle');
    expect(frame).not.toHaveClass('xgc-workspace-panel-drag-handle');
    expect(header?.querySelector('.xgc-workspace-panel-title .xgc-visually-hidden')).toHaveTextContent('Lichtblick');
    expect(header?.querySelector('.xgc-panel-frame-actions')).not.toBeNull();

    rerender(
      <PanelFrame panel={panel()} selected editing onSelect={vi.fn()} onConfigure={vi.fn()} onDelete={vi.fn()}>
        <div>Panel content</div>
      </PanelFrame>,
    );
    const editedHeader = container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-a"]');
    expect(editedHeader).toHaveClass('xgc-workspace-panel-drag-handle');
    expect(editedHeader).not.toHaveAttribute('hidden');
    expect(editedHeader?.querySelector('.xgc-workspace-panel-title .xgc-visually-hidden')).toHaveTextContent('Lichtblick');
    expect(container.querySelector('[data-xgc-role="panel-delete"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="panel-config"]')).not.toBeNull();
  });

  it('keeps header actions when the title is visually hidden', () => {
    const { container } = render(
      <PanelFrame
        panel={panel()}
        selected={false}
        headerActions={<button type="button">Run robot simulation</button>}
        onSelect={vi.fn()}
      >
        <div>Panel content</div>
      </PanelFrame>,
    );

    const header = container.querySelector('[data-xgc-role="experiment-panel-header"]');
    const trailing = header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    expect(header?.querySelector('.xgc-visually-hidden')).toHaveTextContent('Lichtblick');
    expect(trailing).toHaveTextContent('Run robot simulation');
    expect(trailing?.childElementCount).toBeGreaterThan(0);
  });

  it('hides an empty header without losing the panel accessible name', () => {
    const { container } = render(
      <PanelFrame panel={panel()} selected={false} onSelect={vi.fn()}>
        <div>Panel content</div>
      </PanelFrame>,
    );

    const header = container.querySelector<HTMLElement>('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-a"]');
    const actions = header?.querySelector('.xgc-panel-frame-actions');
    expect(header).toHaveAttribute('hidden');
    expect(container.querySelector('[data-xgc-role="experiment-panel"]')).toHaveAccessibleName('Lichtblick');
    expect(actions).toBeInTheDocument();
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-leading"]')).toBeInTheDocument();
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-leading"]'))
      .toHaveAttribute('data-xgc-id', 'panel-a');
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-status"]')).toBeNull();
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]')).toBeInTheDocument();
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'))
      .toHaveAttribute('data-xgc-id', 'panel-a');
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]')?.childElementCount).toBe(0);
  });

  it('uses the elevated shared panel material by default and quiet seams only in GCS mode', () => {
    const { container, rerender } = render(
      <PanelFrame panel={panel()} selected={false} onSelect={vi.fn()}>Content</PanelFrame>,
    );
    expect(container.querySelector('.xgc-workspace-panel')).toHaveAttribute('data-chrome', 'framed');

    rerender(<PanelFrame panel={panel()} selected={false} gcsMode onSelect={vi.fn()}>Content</PanelFrame>);
    expect(container.querySelector('.xgc-workspace-panel')).toHaveAttribute('data-chrome', 'seamed');
  });

  it('expresses edit interaction as a capability instead of matching magic panel ids', () => {
    const { container } = render(
      <PanelFrame panel={panel()} selected editing interactiveWhileEditing onSelect={vi.fn()}>
        <button type="button">Robot control</button>
      </PanelFrame>,
    );

    const frame = container.querySelector('[data-xgc-role="experiment-panel"]');
    expect(frame).toHaveAttribute('data-xgc-interactive-while-editing', 'true');
    expect(frame?.querySelector('.xgc-panel-frame-body')).not.toHaveAttribute('aria-disabled');
  });

  it('does not show layout-edit-only badges on panel chrome while editing', () => {
    const { container } = render(
      <PanelFrame panel={panel()} selected editing onSelect={vi.fn()} onDelete={vi.fn()}>
        <div>Panel content</div>
      </PanelFrame>,
    );

    const frame = container.querySelector('[data-xgc-role="experiment-panel"][data-xgc-id="panel-a"]');
    const header = container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-a"]');
    expect(header).not.toHaveTextContent('layout only');
    expect(frame).not.toHaveTextContent('Layout edit only');
    expect(header?.querySelector('.xgc-panel-frame-edit-badge')).toBeNull();
  });

  it('renders panel header actions as icon controls', () => {
    const { container } = render(
      <PanelFrame panel={panel()} selected editing onSelect={vi.fn()} onConfigure={vi.fn()} onDelete={vi.fn()}>
        <div>Panel content</div>
      </PanelFrame>,
    );

    const del = container.querySelector('[data-xgc-role="panel-delete"][data-xgc-id="panel-a"]');
    const config = container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="panel-a"]');
    expect(del).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(config).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(del).toHaveClass('xgc-panel-frame-action');
    expect(config).toHaveClass('xgc-panel-frame-action');
  });

  it('places configure before delete on the right side of the panel header', () => {
    const { container } = render(
      <PanelFrame panel={panel()} selected editing onSelect={vi.fn()} onConfigure={vi.fn()} onDelete={vi.fn()}>
        <div>Panel content</div>
      </PanelFrame>,
    );

    const trailing = container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    const config = container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="panel-a"]');
    const del = container.querySelector('[data-xgc-role="panel-delete"][data-xgc-id="panel-a"]');
    expect(config).not.toBeNull();
    expect(del).not.toBeNull();
    expect(config?.nextElementSibling).toBe(del);
    expect(trailing?.lastElementChild).toBe(del);
  });

  it('places leading views left, status center, and runtime actions with chrome on the right', () => {
    const { container } = render(
      <PanelFrame
        panel={panel()}
        selected
        editing
        headerLeading={<button type="button">Views</button>}
        headerStatus={<span>Ready</span>}
        headerActions={<button type="button">Run panel workflow</button>}
        onSelect={vi.fn()}
        onConfigure={vi.fn()}
        onDelete={vi.fn()}
      >
        <div>Panel content</div>
      </PanelFrame>,
    );

    const header = container.querySelector('[data-xgc-role="experiment-panel-header"]');
    const leading = header?.querySelector('[data-xgc-role="experiment-panel-header-leading"]');
    const status = header?.querySelector('[data-xgc-role="experiment-panel-header-status"]');
    const trailing = header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    const run = trailing?.querySelector('button');
    const config = trailing?.querySelector('[data-xgc-role="panel-config"]');
    const del = trailing?.querySelector('[data-xgc-role="panel-delete"]');
    expect(leading?.nextElementSibling).toBe(status);
    expect(status?.nextElementSibling).toBe(trailing);
    expect(leading).toHaveAttribute('data-xgc-id', 'panel-a');
    expect(status).toHaveAttribute('data-xgc-id', 'panel-a');
    expect(trailing).toHaveAttribute('data-xgc-id', 'panel-a');
    expect(leading).toHaveTextContent('Views');
    expect(status).toHaveTextContent('Ready');
    expect(run).toHaveTextContent('Run panel workflow');
    expect(run?.nextElementSibling).toBe(config);
    expect(config?.nextElementSibling).toBe(del);
    expect(leading?.contains(run ?? null)).toBe(false);
  });

  it('does not make interactive-while-editing frames grab from the article', () => {
    const { container } = render(
      <PanelFrame panel={panel()} selected editing interactiveWhileEditing onSelect={vi.fn()}>
        <button type="button">Robot control</button>
      </PanelFrame>,
    );

    const frame = container.querySelector('[data-xgc-role="experiment-panel"]');
    const header = container.querySelector('[data-xgc-role="experiment-panel-header"]');
    expect(frame).not.toHaveClass('xgc-workspace-panel-drag-handle');
    expect(header).toHaveClass('xgc-workspace-panel-drag-handle');
  });
});

function panel(): PanelInstance {
  return {
    id: 'panel-a',
    pluginId: 'xgc2-lichtblick',
    title: 'Lichtblick',
    gridPos: { x: 0,y: 0,w: 6,h: 5 },
    query: {},options: {},fieldConfig: {},portBindings: [],
  };
}
