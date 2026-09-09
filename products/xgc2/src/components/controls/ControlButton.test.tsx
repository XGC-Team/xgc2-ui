// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ControlButton,ControlLink } from './ControlButton';

describe('action controls', () => {
  it('preserves standard stable-selector data attributes', () => {
    const { container } = render(<ControlButton data-xgc-role="stable-action" data-xgc-id="resource-a">Run</ControlButton>);
    const button = container.querySelector('button');
    expect(button).toHaveAttribute('data-xgc-role', 'stable-action');
    expect(button).toHaveAttribute('data-xgc-id', 'resource-a');
  });

  it('parameterizes buttons without asking domains to assemble style classes', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ControlButton appearance="ghost" size="compact" tone="danger" dataXgcRole="control-action" dataXgcId="one" onClick={onClick}>
        Remove
      </ControlButton>,
    );
    const button = container.querySelector('[data-xgc-role="control-action"][data-xgc-id="one"]')!;

    expect(button).toHaveClass('xgc-button', 'xgc-control', 'xgc-control-button');
    expect(button).toHaveAttribute('data-xgc-size', 'compact');
    expect(button).toHaveAttribute('data-xgc-tone', 'danger');
    expect(button).toHaveAttribute('data-xgc-appearance', 'ghost');
    expect(button).not.toHaveAttribute('data-xgc-icon-only');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('provides the same typed control contract for navigation actions', () => {
    render(<ControlLink href="https://example.com/docs" size="compact" target="_blank">Docs</ControlLink>);
    const link = screen.getByRole('link',{ name: 'Docs' });
    expect(link).toHaveClass('xgc-button','xgc-control','xgc-control-button');
    expect(link).toHaveAttribute('data-xgc-control','link');
    expect(link).toHaveAttribute('data-xgc-size','compact');
  });
});
