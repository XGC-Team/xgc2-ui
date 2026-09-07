import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkbenchShell } from './WorkbenchShell';

let resize: ResizeObserverCallback;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function installObserver() {
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} disconnect() {}
  });
}
function width(value: number) {
  act(() => resize([{ contentRect: { width: value } } as ResizeObserverEntry], {} as ResizeObserver));
}
it('keeps draft nodes mounted while narrow panes become reachable and hidden panes inert', () => {
  installObserver();
  const props = {
    editor: <input aria-label="Draft" defaultValue="" />,
    explorer: <button>Project</button>,
    inspector: <input aria-label="Paper" defaultValue="" />,
  };
  const { container, rerender } = render(<WorkbenchShell {...props} />);
  const draft = screen.getByRole('textbox', { name: 'Draft' });
  const paper = screen.getByRole('textbox', { name: 'Paper' });
  fireEvent.change(draft, { target: { value: 'unsaved argument' } });
  fireEvent.change(paper, { target: { value: 'unsaved manuscript' } });
  width(390);
  expect(screen.queryByRole('textbox', { name: 'Paper' })).toBeNull();
  expect(paper.closest('aside')).toHaveAttribute('inert');
  expect(container.firstChild).toHaveAttribute('data-single-pane', 'true');
  rerender(<WorkbenchShell {...props} focusedPane="inspector" />);
  expect(screen.getByRole('textbox', { name: 'Paper' })).toBe(paper);
  expect(paper).toHaveValue('unsaved manuscript');
  expect(draft.closest('section')).toHaveAttribute('hidden');
  rerender(<WorkbenchShell {...props} focusedPane="explorer" />);
  expect(screen.getByRole('button', { name: 'Project' })).toBeVisible();
  width(1200);
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft);
  expect(draft).toHaveValue('unsaved argument');
  expect(screen.getByRole('textbox', { name: 'Paper' })).toBe(paper);
});
it('opens a full inspector at compact widths and falls back when it is closed', () => {
  installObserver();
  const props = { editor: <button>Edit</button>, explorer: <button>Browse</button>, inspector: <button>Inspect</button> };
  const { container, rerender } = render(<WorkbenchShell {...props} />);
  width(800);
  expect(container.firstChild).toHaveAttribute('data-inspector', 'absent');
  expect(screen.getByRole('button', { name: 'Browse' })).toBeVisible();
  rerender(<WorkbenchShell {...props} focusedPane="inspector" />);
  expect(container.firstChild).toHaveAttribute('data-single-pane', 'true');
  expect(screen.getByRole('button', { name: 'Inspect' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  rerender(<WorkbenchShell {...props} focusedPane="inspector" inspectorOpen={false} explorerOpen={false} />);
  expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
  expect(container.firstChild).toHaveAttribute('data-explorer', 'absent');
  expect(container.querySelector('.xgc-workbench-inspector')).toHaveAttribute('inert');
});
