import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('exposes tab semantics and changes selection on click', () => {
    const onValueChange = vi.fn();
    render(
      <Tabs
        ariaLabel="Runtime view"
        value="logs"
        options={[{ label: 'Logs', value: 'logs' }, { label: 'Metrics', value: 'metrics' }]}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Metrics' }));
    expect(onValueChange).toHaveBeenCalledWith('metrics');
  });

  it('supports arrow-key navigation and skips disabled tabs', () => {
    const onValueChange = vi.fn();
    render(
      <Tabs
        ariaLabel="Runtime view"
        value="logs"
        options={[
          { label: 'Logs', value: 'logs' },
          { label: 'Disabled', value: 'disabled', disabled: true },
          { label: 'Metrics', value: 'metrics' },
        ]}
        onValueChange={onValueChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith('metrics');
  });
});
