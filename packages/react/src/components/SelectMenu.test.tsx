import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectMenu } from './SelectMenu';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SelectMenu', () => {
  it('portals grouped options and reports selection', () => {
    const onOpen = vi.fn();
    const onValueChange = vi.fn();
    const { container } = render(
      <SelectMenu
        ariaLabel="Sort resources"
        dataXgcRole="resource-sort"
        fill
        menuPlacement="above"
        onOpen={onOpen}
        onValueChange={onValueChange}
        options={[
          { group: 'Order', label: 'Recent', value: 'recent' },
          { group: 'Order', label: 'Name', value: 'name' },
        ]}
        value="recent"
      />,
    );

    expect(container.querySelector('[data-xgc-role="resource-sort"]')).toHaveAttribute('data-xgc-control', 'select');
    fireEvent.click(screen.getByRole('button', { name: 'Sort resources' }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: 'Order' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Sort resources' }).parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole('option', { name: 'Name' }));
    expect(onValueChange).toHaveBeenCalledWith('name');
  });

  it('keeps a one-line option description out of the selected trigger name', () => {
    const onValueChange = vi.fn();
    render(
      <SelectMenu
        ariaLabel="Experiment type"
        onValueChange={onValueChange}
        options={[
          { description: 'Gazebo physics and scripted worlds', label: 'Simulation', value: 'simulation' },
          { description: '   ', label: 'Blank', value: 'blank' },
          { label: 'Field', value: 'field' },
        ]}
        value="simulation"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Experiment type' });
    expect(trigger).toHaveTextContent('Simulation');
    expect(trigger).not.toHaveTextContent('Gazebo');
    fireEvent.click(trigger);
    const simulation = screen.getByRole('option', { name: 'Simulation' });
    const description = simulation.querySelector('.xgc-select-option-description');
    expect(description).toHaveTextContent('Gazebo physics and scripted worlds');
    expect(simulation).toHaveAttribute('aria-describedby', description?.id);
    expect(screen.getByRole('option', { name: 'Field' }).querySelector('.xgc-select-option-description')).toBeNull();
    expect(screen.getByRole('option', { name: 'Blank' }).querySelector('.xgc-select-option-description')).toBeNull();
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Experiment type' }), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Blank' })).toHaveFocus();
    fireEvent.click(screen.getByRole('option', { name: 'Field' }));
    expect(onValueChange).toHaveBeenCalledWith('field');
    expect(trigger).toHaveTextContent('Simulation');
    expect(trigger).not.toHaveTextContent('Gazebo');
  });

  it('keeps separate description targets when values would sanitize to one id', () => {
    render(
      <SelectMenu
        ariaLabel="Paths"
        onValueChange={() => undefined}
        options={[
          { description: 'Dot path', label: 'Dot', value: 'a.b' },
          { description: 'Slash path', label: 'Slash', value: 'a/b' },
        ]}
        value="a.b"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Paths' });
    expect(trigger).toHaveTextContent('Dot');
    expect(trigger).not.toHaveTextContent('Dot path');
    fireEvent.click(trigger);
    const dot = screen.getByRole('option', { name: 'Dot' });
    const slash = screen.getByRole('option', { name: 'Slash' });
    const dotDescription = document.getElementById(dot.getAttribute('aria-describedby') ?? '');
    const slashDescription = document.getElementById(slash.getAttribute('aria-describedby') ?? '');
    expect(dot.getAttribute('aria-describedby')).not.toBe(slash.getAttribute('aria-describedby'));
    expect(dotDescription).toHaveTextContent('Dot path');
    expect(slashDescription).toHaveTextContent('Slash path');
    expect(document.getElementById(dot.getAttribute('aria-labelledby') ?? '')).toHaveTextContent('Dot');
    expect(document.getElementById(slash.getAttribute('aria-labelledby') ?? '')).toHaveTextContent('Slash');
  });

  it('flips above when the preferred space below is too small', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const { container } = render(
      <SelectMenu
        ariaLabel="Rows per page"
        onValueChange={() => undefined}
        options={[{ label: '10 / page', value: '10' }, { label: '50 / page', value: '50' }]}
        value="10"
      />,
    );
    const root = container.querySelector('.xgc-select-control') as HTMLElement;
    root.getBoundingClientRect = () => ({
      bottom: 392, height: 32, left: 20, right: 180, top: 360, width: 160, x: 20, y: 360, toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rows per page' }));
    expect(screen.getByRole('listbox', { name: 'Rows per page' })).toHaveAttribute('data-xgc-menu-placement', 'above');
  });

  it('closes from the current blur frame when focus has left', () => {
    const queued = queueAnimationFrames();
    const { container } = render(<RowsPerPageMenu />);
    const trigger = screen.getByRole('button', { name: 'Rows per page' });
    const root = container.querySelector('.xgc-select-control') as HTMLElement;
    fireEvent.click(trigger);
    const option = screen.getByRole('option', { name: '10 / page' });

    fireEvent.blur(root, { relatedTarget: option });
    expect(queued).toHaveLength(0);

    (document.activeElement as HTMLElement).blur();
    expect(queued).toHaveLength(1);
    act(() => { queued[0]!(0); });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the newer blur frame when an older callback runs', () => {
    const queued = queueAnimationFrames();
    const cancel = vi.mocked(window.cancelAnimationFrame);
    const { container, unmount } = render(<RowsPerPageMenu />);
    const trigger = screen.getByRole('button', { name: 'Rows per page' });
    const root = container.querySelector('.xgc-select-control') as HTMLElement;
    fireEvent.click(trigger);

    fireEvent.blur(root);
    fireEvent.blur(root);
    expect(cancel).toHaveBeenCalledWith(1);
    const stale = queued[0]!;
    cancel.mockClear();
    act(() => { stale(0); });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    unmount();
    expect(cancel).toHaveBeenCalledWith(2);
  });
});

function RowsPerPageMenu() {
  return (
    <SelectMenu
      ariaLabel="Rows per page"
      onValueChange={() => undefined}
      options={[{ label: '10 / page', value: '10' }, { label: '50 / page', value: '50' }]}
      value="10"
    />
  );
}

function queueAnimationFrames() {
  const queued: FrameRequestCallback[] = [];
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    queued.push(callback);
    return queued.length;
  });
  return queued;
}
