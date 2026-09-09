/** @vitest-environment jsdom */
import { act,render,screen } from '@testing-library/react';
import { useSyncExternalStore,type ReactNode } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../experimentModel';
import { DashboardGrid } from './DashboardGrid';

const surface = vi.hoisted(() => ({
  width: 900,
  height: 600,
  mounted: true,
  containerRef: { current: null },
}));

vi.mock('./useDashboardSurfaceSize', () => ({ useDashboardSurfaceSize: () => surface }));
vi.mock('react-grid-layout', () => ({
  GridLayout: ({ children,width,gridConfig }: {
    children: ReactNode;
    width: number;
    gridConfig: { rowHeight: number };
  }) => <div data-testid="grid-layout" data-width={width} data-row-height={gridConfig.rowHeight}>{children}</div>,
}));

function panels(): PanelInstance[] {
  return Array.from({ length: 5 },(_,index) => ({
    id: `panel-${index}`,
    pluginId: 'automation-workflow-audit',
    title: `Panel ${index}`,
    gridPos: { x: index * 6,y: 0,w: 6,h: 4 },
    query: {},
    options: {},
    fieldConfig: {},
    portBindings: [],
  }));
}

describe('DashboardGrid content rendering through ComposableWorkspace', () => {
  beforeEach(() => {
    surface.width = 900;
    surface.height = 600;
    surface.containerRef.current = null;
  });

  it.each([false,true])('keeps five panel bodies stable while geometry changes (GCS %s)', (gcsMode) => {
    const items = panels();
    const renderPanel = vi.fn((panel: PanelInstance) => <article>{panel.title}</article>);
    const onLayoutCommit = vi.fn();
    const tree = () => <DashboardGrid panels={items} editing={false} gcsMode={gcsMode} onLayoutCommit={onLayoutCommit}>
      {renderPanel}
    </DashboardGrid>;
    const { container,rerender } = render(tree());
    const contents = screen.getAllByRole('article');
    const rowHeight = screen.getByTestId('grid-layout').getAttribute('data-row-height');
    expect(container.querySelectorAll('.xgc-composable-workspace-item')).toHaveLength(5);

    for (const [width,height] of [[880,600],[840,600],[800,540],[840,540],[900,660]]) {
      surface.width = width!;
      surface.height = height!;
      rerender(tree());
      expect(screen.getByTestId('grid-layout')).toHaveAttribute('data-width',String(width));
      screen.getAllByRole('article').forEach((node,index) => expect(node).toBe(contents[index]));
    }

    expect(renderPanel).toHaveBeenCalledTimes(5);
    if (gcsMode) expect(screen.getByTestId('grid-layout').getAttribute('data-row-height')).not.toBe(rowHeight);
    expect(onLayoutCommit).not.toHaveBeenCalled();
  });

  it('updates changed panel inputs and a new renderer through the real workspace', () => {
    let items = panels();
    let renderPanel = vi.fn((panel: PanelInstance) => <article>{panel.title}</article>);
    const onLayoutCommit = vi.fn();
    const tree = () => <DashboardGrid panels={items} editing={false} gcsMode onLayoutCommit={onLayoutCommit}>
      {renderPanel}
    </DashboardGrid>;
    const { rerender } = render(tree());
    const contents = screen.getAllByRole('article');

    items = items.map((item,index) => index === 2 ? { ...item,title: 'Updated panel' } : item);
    rerender(tree());
    expect(renderPanel).toHaveBeenCalledTimes(6);
    expect(contents[2]).toHaveTextContent('Updated panel');

    renderPanel = vi.fn((panel: PanelInstance) => <article>{panel.title}: live</article>);
    rerender(tree());
    expect(renderPanel).toHaveBeenCalledTimes(5);
    screen.getAllByRole('article').forEach((node,index) => {
      expect(node).toBe(contents[index]);
      expect(node).toHaveTextContent(': live');
    });
  });

  it('keeps all five live subscriptions updating without recreating panel content', () => {
    const items = panels();
    let reading = 10;
    const listeners = new Set<() => void>();
    const unsubscribe = vi.fn((listener: () => void) => { listeners.delete(listener); });
    const subscribe = vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => unsubscribe(listener);
    });
    const getSnapshot = () => reading;
    function LivePanel({ panel }: { panel: PanelInstance }) {
      const value = useSyncExternalStore(subscribe,getSnapshot);
      return <article>{panel.title}: {value}</article>;
    }
    const renderPanel = vi.fn((panel: PanelInstance) => <LivePanel panel={panel} />);
    const onLayoutCommit = vi.fn();
    const tree = () => <DashboardGrid panels={items} editing={false} gcsMode onLayoutCommit={onLayoutCommit}>
      {renderPanel}
    </DashboardGrid>;
    const { rerender,unmount } = render(tree());
    const contents = screen.getAllByRole('article');
    surface.width = 800;
    surface.height = 540;
    rerender(tree());
    act(() => {
      reading = 20;
      listeners.forEach((listener) => listener());
    });
    surface.width = 900;
    rerender(tree());

    screen.getAllByRole('article').forEach((node,index) => {
      expect(node).toBe(contents[index]);
      expect(node).toHaveTextContent(': 20');
    });
    expect(renderPanel).toHaveBeenCalledTimes(5);
    expect(subscribe).toHaveBeenCalledTimes(5);
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(5);
    expect(listeners.size).toBe(0);
  });
});
