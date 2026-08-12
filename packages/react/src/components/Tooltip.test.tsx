// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';

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
});
