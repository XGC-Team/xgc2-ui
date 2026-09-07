import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { GraphCanvas } from './GraphCanvas.js';
import type { GraphSnapshot } from './model.js';
import type { GraphRenderer, GraphRendererFactory, GraphRendererOptions } from './renderer.js';
vi.mock('./renderer.js', () => ({ readGraphTheme: () => ({ background: '#090909', node: '#ccc', muted: '#888', edge: '#555', focus: '#fff', text: '#ddd' }) }));
const snapshot: GraphSnapshot = {
  id: 's1', scope: 'synthetic', complete: false,
  nodes: [{ id: 'a', label: '研究问题', kind: 'question', revision: 'a:1' }, { id: 'b', label: '论文', kind: 'paper', revision: 'b:1' }],
  edges: [{ id: 'ab', source: 'a', target: 'b', label: 'related', state: 'proposed', evidenceRefs: [] }],
};
let api: GraphRenderer;
let factory: GraphRendererFactory;
let currentOptions!: GraphRendererOptions;
beforeEach(() => {
  api = { setIndex: vi.fn(), setFilter: vi.fn(), setSelection: vi.fn(), setTheme: vi.fn(), setReducedMotion: vi.fn(), setLabels: vi.fn(), focus: vi.fn(), fit: vi.fn(), zoom: vi.fn(), resize: vi.fn(), camera: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })), restore: vi.fn(), capture: vi.fn(() => ''), destroy: vi.fn() };
  factory = vi.fn((_element: HTMLElement, options: GraphRendererOptions) => { currentOptions = options; return api; });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test('updates snapshots without destroying the renderer or resetting the camera', () => {
  const changed = vi.fn();
  const view = render(<GraphCanvas snapshot={snapshot} createRenderer={factory} selectedIds={[]} onSelectionChange={changed} />);
  view.rerender(<GraphCanvas snapshot={{ ...snapshot, id: 's2' }} createRenderer={factory} selectedIds={['a']} onSelectionChange={changed} />);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(api.destroy).not.toHaveBeenCalled();
  expect(api.restore).not.toHaveBeenCalled();
  expect(api.setSelection).toHaveBeenLastCalledWith(['a']);
  view.unmount(); expect(api.destroy).toHaveBeenCalledTimes(1);
});
test('sends a version-pinned selection and excludes unconfirmed relations', () => {
  const discuss = vi.fn();
  render(<GraphCanvas snapshot={snapshot} createRenderer={factory} selectedIds={['a', 'b']} onSelectionChange={vi.fn()} onDiscuss={discuss} />);
  fireEvent.click(screen.getByRole('button', { name: '讨论所选' }));
  expect(discuss).toHaveBeenCalledWith(expect.objectContaining({ snapshotId: 's1', edgeRefs: [], nodeRefs: [{ id: 'a', revision: 'a:1' }, { id: 'b', revision: 'b:1' }] }));
  expect(Object.isFrozen(discuss.mock.calls[0]![0])).toBe(true);
});
test('provides navigable resource buttons independently of the canvas', () => {
  const select = vi.fn();
  render(<GraphCanvas snapshot={snapshot} createRenderer={factory} selectedIds={[]} onSelectionChange={select} />);
  fireEvent.click(screen.getByRole('button', { name: '资源列表' }));
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索图谱资源' }), { target: { value: '研究' } });
  fireEvent.click(screen.getByRole('button', { name: '研究问题' }));
  expect(select).toHaveBeenCalledWith(['a']);
  expect(api.focus).toHaveBeenCalledWith(['a']);
});
test('uses the latest callback without rebuilding the graph', () => {
  const first = vi.fn(); const next = vi.fn();
  const view = render(<GraphCanvas snapshot={snapshot} createRenderer={factory} selectedIds={[]} onSelectionChange={first} />);
  view.rerender(<GraphCanvas snapshot={snapshot} createRenderer={factory} selectedIds={[]} onSelectionChange={next} />);
  currentOptions.onSelection(['a']); expect(next).toHaveBeenCalledWith(['a']); expect(first).not.toHaveBeenCalled();
});
test('keeps the resource list usable when the graphics engine fails', () => {
  const broken = () => { throw new Error('graphics unavailable'); };
  render(<GraphCanvas snapshot={snapshot} createRenderer={broken} selectedIds={[]} onSelectionChange={vi.fn()} />);
  expect(screen.getByText(/graphics unavailable/)).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: '搜索图谱资源' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '研究问题' })).toBeInTheDocument();
});
test('rejects dangling data before invoking the engine', () => {
  render(<GraphCanvas snapshot={{ ...snapshot, nodes: [] }} createRenderer={factory} selectedIds={[]} onSelectionChange={vi.fn()} />);
  expect(factory).not.toHaveBeenCalled();
  expect(screen.getByText(/Dangling edge/)).toBeInTheDocument();
});
