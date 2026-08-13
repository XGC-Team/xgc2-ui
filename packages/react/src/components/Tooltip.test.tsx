// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';
import { Modal } from './Modal';

describe('Tooltip', () => {
  it('portals delayed help without changing the wrapped control', () => {
    vi.useFakeTimers();
    render(<Tooltip content="Operator help" delayMs={20}><button type="button">Target</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Target' }).parentElement!);
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByRole('button', { name: 'Target' }).parentElement).toHaveAttribute('data-xgc-role', 'tooltip-trigger');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Operator help');
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-xgc-portaled', 'true');
    expect(screen.getByRole('tooltip').style.position).toBe('fixed');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Target' }).parentElement!);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });

  it('is a transparent wrapper when disabled or empty', () => {
    const { container } = render(<Tooltip content="" enabled={false}><button type="button">Target</button></Tooltip>);
    expect(container.querySelector('.xgc-tooltip-trigger')).toBeNull();
  });

  it('dismisses on an unconsumed Escape', async () => {
    vi.useFakeTimers();
    render(<Tooltip content="Operator help" delayMs={0}><button type="button">Target</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Target' }).parentElement!);
    act(() => vi.runAllTimers());
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('dismisses before its parent modal even when focus is elsewhere', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="Container">
        <Tooltip content="Operator help" delayMs={0}><button type="button">Target</button></Tooltip>
        <button type="button">Elsewhere</button>
      </Modal>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Target' }).parentElement!);
    act(() => vi.runAllTimers());
    screen.getByRole('button', { name: 'Elsewhere' }).focus();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Elsewhere' }), { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Container' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
