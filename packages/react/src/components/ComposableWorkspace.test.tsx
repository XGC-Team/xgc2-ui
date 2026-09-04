import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ComposableWorkspace,
  clampWorkspacePosition,
  resolveWorkspaceBreakpoint,
  type ComposableWorkspaceAdapterProps,
} from './ComposableWorkspace';

type Item = { id: string; position: { x: number; y: number; w: number; h: number } };

describe('ComposableWorkspace', () => {
  it('passes constrained layout and shared interaction policy to an injected engine', () => {
    let adapter: ComposableWorkspaceAdapterProps<Item> | undefined;
    const { container } = render(
      <ComposableWorkspace
        columns={12}
        editing
        gap={[8, 8]}
        grid="editing"
        getConstraints={() => ({ minW: 3, minH: 2 })}
        getItemId={(item) => item.id}
        getPosition={(item) => item.position}
        items={[{ id: 'camera', position: { x: 11, y: 0, w: 1, h: 1 } }]}
        onLayoutCommit={vi.fn()}
        renderItem={(item) => item.id}
        renderLayout={(props) => {
          adapter = props;
          return <div className={props.className}>{props.children}</div>;
        }}
        rowHeight={40}
      />,
    );

    expect(adapter?.items[0]).toMatchObject({ id: 'camera', x: 9, y: 0, w: 3, h: 2 });
    expect(adapter?.dragCancelSelector).toContain('.xgc-workspace-panel-interactive');
    expect(adapter?.dragCancelSelector).toContain('button');
    expect(adapter?.dragHandleSelector).toBe('.xgc-workspace-panel-drag-handle');
    expect(adapter?.resizeHandles).toEqual(['se', 'e', 's']);
    expect(container.querySelector('.xgc-composable-workspace')).toHaveAttribute('data-editing', 'true');
    expect(container.querySelector('.xgc-composable-workspace')).toHaveAttribute('data-grid', 'editing');
    expect(container.querySelector('.xgc-composable-workspace-item')).toHaveTextContent('camera');
  });

  it('clamps committed positions at the shared boundary without owning persistence', () => {
    const onLayoutCommit = vi.fn();
    let adapter: ComposableWorkspaceAdapterProps<Item> | undefined;
    render(
      <ComposableWorkspace
        columns={12}
        getConstraints={() => ({ minW: 3, minH: 2, maxW: 8 })}
        getItemId={(item) => item.id}
        getPosition={(item) => item.position}
        items={[{ id: 'camera', position: { x: 0, y: 0, w: 4, h: 3 } }]}
        onLayoutCommit={onLayoutCommit}
        renderItem={(item) => item.id}
        renderLayout={(props) => {
          adapter = props;
          return props.children;
        }}
        rowHeight={40}
      />,
    );

    adapter?.onLayoutCommit([{ id: 'camera', x: 11, y: -2, w: 20, h: 1 }]);
    expect(onLayoutCommit).toHaveBeenCalledWith({ camera: { x: 4, y: 0, w: 8, h: 2 } });

    adapter?.onLayoutCommit([{ id: 'stale-layout-key', x: 0, y: 0, w: 4, h: 2 }]);
    expect(onLayoutCommit).toHaveBeenLastCalledWith({});
  });

  it('selects the largest matching breakpoint and exposes its column count', () => {
    const breakpoints = [
      { name: 'compact', minWidth: 0, columns: 4 },
      { name: 'wide', minWidth: 900, columns: 12 },
    ];
    expect(resolveWorkspaceBreakpoint(1100, breakpoints)).toEqual(breakpoints[1]);
    expect(resolveWorkspaceBreakpoint(600, breakpoints)).toEqual(breakpoints[0]);
    expect(clampWorkspacePosition({ x: 10, y: 0, w: 4, h: 2 }, {}, 12)).toEqual({ x: 8, y: 0, w: 4, h: 2 });
    expect(clampWorkspacePosition({ x: 0, y: 0, w: 20, h: 2 }, {}, 12)).toEqual({ x: 0, y: 0, w: 12, h: 2 });
  });

  it('keeps an empty editable canvas inside the same shared grid surface', () => {
    const renderLayout = vi.fn(() => null);
    const { container } = render(
      <ComposableWorkspace
        columns={12}
        editing
        empty={<p>No panels</p>}
        getItemId={(item: Item) => item.id}
        getPosition={(item) => item.position}
        grid="editing"
        items={[]}
        onLayoutCommit={() => undefined}
        renderItem={(item) => item.id}
        renderLayout={renderLayout}
        rowHeight={40}
      />,
    );

    expect(renderLayout).not.toHaveBeenCalled();
    expect(container.querySelector('.xgc-composable-workspace-empty')).toHaveTextContent('No panels');
  });

  it('aligns grid tracks to adapter columns, gaps, and container padding', () => {
    const { container } = render(
      <ComposableWorkspace
        columns={12}
        gap={[8, 8]}
        getItemId={(item: Item) => item.id}
        getPosition={(item) => item.position}
        items={[]}
        onLayoutCommit={() => undefined}
        padding={[16, 16]}
        renderItem={(item) => item.id}
        renderLayout={() => null}
        rowHeight={40}
        width={1200}
      />,
    );
    const workspace = container.querySelector<HTMLElement>('.xgc-composable-workspace')!;
    expect(workspace.style.getPropertyValue('--xgc-workspace-column-pitch')).toBe('98px');
    expect(workspace.style.getPropertyValue('--xgc-workspace-origin-x')).toBe('16px');
    expect(workspace.style.getPropertyValue('--xgc-workspace-origin-y')).toBe('16px');
  });
});
