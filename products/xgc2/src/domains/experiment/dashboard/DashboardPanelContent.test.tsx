/** @vitest-environment jsdom */
import { act,fireEvent,render,screen } from '@testing-library/react';
import { useEffect,useState,useSyncExternalStore,type ReactNode } from 'react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../experimentModel';
import { DashboardPanelContent } from './DashboardPanelContent';

function surface(width: number,panel: PanelInstance,renderPanel: (panel: PanelInstance) => ReactNode) {
  return <div style={{ width }}>
    <DashboardPanelContent panel={panel} renderPanel={renderPanel} />
  </div>;
}

function panel(): PanelInstance {
  return {
    id: 'panel-a',
    pluginId: 'automation-workflow-audit',
    title: 'Original title',
    gridPos: { x: 0,y: 0,w: 4,h: 3 },
    query: {},
    options: {},
    fieldConfig: {},
    portBindings: [],
  };
}

describe('DashboardPanelContent', () => {
  it('reuses content and its DOM through parent width updates without adding a host', () => {
    const item = panel();
    const renderPanel = vi.fn((current: PanelInstance) => <article>{current.title}</article>);
    const { container,rerender } = render(surface(900,item,renderPanel));
    const content = screen.getByRole('article');

    for (const width of [880,840,800,840,900]) rerender(surface(width,item,renderPanel));

    expect(renderPanel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('article')).toBe(content);
    expect(container.firstElementChild?.children).toHaveLength(1);
    expect(container.firstElementChild?.firstElementChild).toBe(content);
  });

  it('renders changed panel inputs even when the panel id stays the same', () => {
    const item = panel();
    const renderPanel = vi.fn((current: PanelInstance) => <article>{current.title}</article>);
    const { rerender } = render(surface(900,item,renderPanel));
    const content = screen.getByRole('article');

    rerender(surface(880,{ ...item,title: 'Updated title' },renderPanel));

    expect(renderPanel).toHaveBeenCalledTimes(2);
    expect(content).toHaveTextContent('Updated title');
    expect(screen.getByRole('article')).toBe(content);
  });

  it('uses a new render callback and its latest action binding', () => {
    const item = panel();
    const originalAction = vi.fn();
    const latestAction = vi.fn();
    const { rerender } = render(surface(900,item,() => <button onClick={originalAction}>Original action</button>));
    const button = screen.getByRole('button');

    rerender(surface(900,item,() => <button onClick={latestAction}>Latest action</button>));
    fireEvent.click(screen.getByRole('button',{ name: 'Latest action' }));

    expect(screen.getByRole('button')).toBe(button);
    expect(originalAction).not.toHaveBeenCalled();
    expect(latestAction).toHaveBeenCalledTimes(1);
  });

  it('preserves local state and live subscriptions across geometry updates', () => {
    const item = panel();
    let value = 10;
    const listeners = new Set<() => void>();
    const unsubscribe = vi.fn((listener: () => void) => { listeners.delete(listener); });
    const subscribe = vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => unsubscribe(listener);
    });
    const getSnapshot = () => value;
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function LiveContent() {
      const [count,setCount] = useState(0);
      const reading = useSyncExternalStore(subscribe,getSnapshot);
      useEffect(() => {
        mounted();
        return () => { unmounted(); };
      }, []);
      return <button onClick={() => setCount((current) => current + 1)}>{count}:{reading}</button>;
    }
    const renderPanel = vi.fn(() => <LiveContent />);
    const { rerender,unmount } = render(surface(900,item,renderPanel));
    const button = screen.getByRole('button');
    fireEvent.click(button);
    rerender(surface(800,item,renderPanel));
    act(() => {
      value = 20;
      listeners.forEach((listener) => listener());
    });
    rerender(surface(900,item,renderPanel));

    expect(button).toHaveTextContent('1:20');
    expect(screen.getByRole('button')).toBe(button);
    expect(renderPanel).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});
