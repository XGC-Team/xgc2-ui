// @vitest-environment jsdom
import { useRef } from 'react';
import { act,cleanup,render } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { markGroundStationRead } from './groundStationAttention';
import { useGroundStationVisibleReceipts } from './useGroundStationVisibleReceipts';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

vi.mock('./groundStationAttention', () => ({ markGroundStationRead: vi.fn() }));
const observers: TestObserver[] = [];
class TestObserver {
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }
  report(target: Element, isIntersecting: boolean, intersectionRatio: number) {
    this.callback([{ target,isIntersecting,intersectionRatio } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const decision = { id: 'decision-a',targetScope: 'agent-a',revision: 3 } as GroundStationDecisionInteraction;
const items = [decision];

beforeEach(() => {
  observers.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('IntersectionObserver', TestObserver);
  Object.defineProperty(document, 'visibilityState', { configurable: true,value: 'visible' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Surface({ visible = true,targetId = 'agent-a' }: { visible?: boolean;targetId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGroundStationVisibleReceipts(ref, items, visible, targetId);
  return <div ref={ref}><article data-xgc-role="ground-station-chat-decision-entry" data-xgc-id="decision-a" /></div>;
}

describe('actual visible interaction receipts', () => {
  it('observes newly materialized rows without treating mounting as reading', async () => {
    const view = render(<Surface />);
    const host = view.container.firstElementChild!;
    const previous = host.querySelector('article')!;
    let next: HTMLElement;
    await act(async () => {
      previous.remove();
      next = document.createElement('article');
      next.setAttribute('data-xgc-role','ground-station-chat-decision-entry');
      next.setAttribute('data-xgc-id','decision-a');
      host.appendChild(next);
    });
    expect(observers.at(-1)!.observe).toHaveBeenCalledWith(next!);
    expect(markGroundStationRead).not.toHaveBeenCalled();
    act(() => observers[0].report(previous,true,1));
    expect(markGroundStationRead).not.toHaveBeenCalled();
    act(() => observers.at(-1)!.report(next!,true,1));
    expect(markGroundStationRead).toHaveBeenCalledWith(decision,'agent-a');
  });
  it('uses the browser viewport and requires the observed entry to intersect it', () => {
    const view = render(<Surface />);
    const entry = view.container.querySelector('article')!;
    expect(observers[0].options).toEqual({ root: null,threshold: 0.5 });
    act(() => observers[0].report(entry, false, 0));
    act(() => observers[0].report(entry, true, 0.2));
    expect(markGroundStationRead).not.toHaveBeenCalled();
    act(() => observers[0].report(entry, true, 0.75));
    expect(markGroundStationRead).toHaveBeenCalledWith(decision, 'agent-a');
  });

  it('does not observe a parked surface or consume an already queued callback after parking', () => {
    const view = render(<Surface visible={false} />);
    expect(observers).toHaveLength(0);
    view.rerender(<Surface />);
    const observer = observers[0];
    const entry = view.container.querySelector('article')!;
    view.rerender(<Surface visible={false} />);
    expect(observer.disconnect).toHaveBeenCalled();
    act(() => observer.report(entry, true, 1));
    expect(markGroundStationRead).not.toHaveBeenCalled();
  });

  it('does not record background-tab visibility and reobserves after the tab becomes visible', () => {
    const view = render(<Surface />);
    const entry = view.container.querySelector('article')!;
    Object.defineProperty(document, 'visibilityState', { configurable: true,value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => observers[0].report(entry, true, 1));
    expect(markGroundStationRead).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true,value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(observers).toHaveLength(2);
    act(() => observers[1].report(entry, true, 1));
    expect(markGroundStationRead).toHaveBeenCalledOnce();
  });

  it('discards callbacks captured for an earlier complete execution target key', () => {
    const view = render(<Surface targetId="core:a" />);
    const entry = view.container.querySelector('article')!;
    const previous = observers[0];
    view.rerender(<Surface targetId="core:b" />);
    act(() => previous.report(entry, true, 1));
    expect(markGroundStationRead).not.toHaveBeenCalled();
    act(() => observers[1].report(entry, true, 1));
    expect(markGroundStationRead).toHaveBeenCalledWith(decision, 'core:b');
  });
});
