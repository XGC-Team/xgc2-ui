// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';
import { Modal } from './Modal';

describe('Tooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('places help beside its rendered child when the contents trigger has no box', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'BUTTON'
        ? new DOMRect(500,300,100,30)
        : new DOMRect(0,0,0,0);
    });
    render(<Tooltip content="Operator help"><button type="button">Target</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByRole('button',{ name: 'Target' }).parentElement!);
    act(() => vi.advanceTimersByTime(200));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.style.left).toBe('470px');
    expect(tooltip.style.top).toBe('270px');
  });

  it('does not reopen after pointer and mouse enter both fire and the pointer leaves before the delay', () => {
    vi.useFakeTimers();
    render(<Tooltip content="Operator help"><button type="button">Target</button></Tooltip>);
    const trigger = screen.getByRole('button',{ name: 'Target' }).parentElement!;
    fireEvent.pointerEnter(trigger);
    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(10));
    fireEvent.pointerLeave(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('clears pending help when disabled rather than resurrecting it when re-enabled', () => {
    vi.useFakeTimers();
    const child = <button type="button">Target</button>;
    const { rerender } = render(<Tooltip content="Operator help">{child}</Tooltip>);
    fireEvent.mouseEnter(screen.getByRole('button',{ name: 'Target' }).parentElement!);
    rerender(<Tooltip content="Operator help" enabled={false}>{child}</Tooltip>);
    act(() => vi.advanceTimersByTime(300));
    rerender(<Tooltip content="Operator help">{child}</Tooltip>);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses visible help after paired pointer and mouse leave events', () => {
    vi.useFakeTimers();
    render(<Tooltip content="Operator help"><button type="button">Target</button></Tooltip>);
    const trigger = screen.getByRole('button', { name: 'Target' }).parentElement!;
    fireEvent.pointerEnter(trigger);
    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerLeave(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('cancels another pending hover when scrolling dismisses visible help', () => {
    vi.useFakeTimers();
    render(<Tooltip content="Operator help"><button type="button">Target</button></Tooltip>);
    const trigger = screen.getByRole('button', { name: 'Target' }).parentElement!;
    fireEvent.pointerEnter(trigger);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.mouseEnter(trigger);
    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

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
