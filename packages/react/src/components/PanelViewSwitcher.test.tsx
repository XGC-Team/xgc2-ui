// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelViewSwitcher } from './PanelViewSwitcher';

function Icon({ size, ...props }: { 'aria-hidden'?: boolean; className?: string; size?: number | string }) {
  return <svg {...props} height={size} width={size} />;
}

describe('PanelViewSwitcher', () => {
  it('owns icon/label presentation, selection and event isolation', () => {
    const onChange = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <PanelViewSwitcher
          ariaLabel="Panel view"
          items={[{ id: 'overview', label: 'Overview', icon: Icon }, { id: 'raw', label: 'Raw', icon: Icon }]}
          onChange={onChange}
          value="overview"
        />
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(onChange).toHaveBeenCalledWith('raw');
    expect(parentClick).not.toHaveBeenCalled();
  });
});
