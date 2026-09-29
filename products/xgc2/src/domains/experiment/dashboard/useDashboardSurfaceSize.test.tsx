// @vitest-environment jsdom

import { act,render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { useDashboardSurfaceSize } from './useDashboardSurfaceSize';

class ResizeObserverStub {
  callback: ResizeObserverCallback;
  target?: Element;
  static last: ResizeObserverStub | null = null;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.last = this;
  }
  observe(target: Element) { this.target=target; }
  unobserve() {}
  disconnect() {}
  fire() {
    const node=this.target as HTMLElement;
    this.callback([{ target:node,contentRect:{ width:node.clientWidth,height:node.clientHeight } }] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

function Harness({ onSize }: { onSize: (size: { width: number; height: number; mounted: boolean }) => void }) {
  const size = useDashboardSurfaceSize();
  onSize(size);
  return (
    <div data-xgc-role="app-shell">
      <aside data-xgc-role="app-sidebar" />
      <div ref={size.containerRef} data-testid="surface" />
    </div>
  );
}

describe('useDashboardSurfaceSize', () => {
  function renderSizeHarness() {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames[id - 1] = () => undefined;
    });
    const sizes: Array<{ width: number; height: number; mounted: boolean }> = [];
    const view = render(<Harness onSize={(size) => sizes.push(size)} />);
    const node = view.getByTestId('surface');
    const sidebar = view.container.querySelector('[data-xgc-role="app-sidebar"]')!;
    const flush = () => {
      const pending = frames.splice(0);
      act(() => { for (const frame of pending) frame(0); });
    };
    return { view, node, sidebar, sizes, frames, flush };
  }

  it('waits for a measurable first layout and retains panel state while the tab is hidden', () => {
    const { view, node, sizes, flush } = renderSizeHarness();
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 0 });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 0 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)).toMatchObject({ width: 0, height: 0, mounted: false });
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 400 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)).toMatchObject({ width: 800, height: 400, mounted: true });
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 0 });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 0 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)).toMatchObject({ width: 800, height: 400, mounted: true });
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 920 });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 500 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)).toMatchObject({ width: 920, height: 500, mounted: true });
    view.unmount();
    vi.unstubAllGlobals();
  });

  it('commits ResizeObserver during sidebar width transitions so the grid follows', () => {
    const { view, node, sidebar, sizes, flush } = renderSizeHarness();
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 400 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)?.width).toBe(800);

    sidebar.dispatchEvent(new TransitionEvent('transitionstart', { propertyName: 'width', bubbles: true }));
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 920 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)?.width).toBe(920);

    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 1000 });
    act(() => ResizeObserverStub.last?.fire());
    flush();
    expect(sizes.at(-1)?.width).toBe(1000);

    act(() => {
      sidebar.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'width', bubbles: true }));
    });
    expect(sizes.at(-1)?.width).toBe(1000);
    view.unmount();
    vi.unstubAllGlobals();
  });

  it('coalesces ResizeObserver bursts onto one animation frame and does not write size back', () => {
    const { view, node, sizes, frames, flush } = renderSizeHarness();
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 400 });
    const before = sizes.length;
    act(() => {
      ResizeObserverStub.last?.fire();
      Object.defineProperty(node, 'clientWidth', { configurable: true, value: 810 });
      ResizeObserverStub.last?.fire();
      Object.defineProperty(node, 'clientWidth', { configurable: true, value: 1000 });
      ResizeObserverStub.last?.fire();
    });
    expect(sizes.length).toBe(before);
    expect(frames).toHaveLength(1);
    // Observer delivery already contains the latest measured size. Rendering
    // must not synchronously remeasure the DOM after other frame writers.
    Object.defineProperty(node,'clientWidth',{ configurable:true,get:() => { throw new Error('redundant layout read'); } });
    Object.defineProperty(node,'clientHeight',{ configurable:true,get:() => { throw new Error('redundant layout read'); } });
    flush();
    expect(sizes.at(-1)?.width).toBe(1000);
    expect(node.style.width).toBe('');
    view.unmount();
    vi.unstubAllGlobals();
  });
});
