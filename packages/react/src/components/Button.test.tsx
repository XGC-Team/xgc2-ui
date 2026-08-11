import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, ButtonLink } from './Button';

describe('Button', () => {
  it('defaults to a non-submitting button and exposes visual state as data', () => {
    render(<Button tone="primary">Run</Button>);
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-tone', 'primary');
  });

  it('forwards native button behavior', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('provides the same visual contract for navigation links', () => {
    render(<ButtonLink href="/settings" appearance="ghost">Settings</ButtonLink>);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('data-appearance', 'ghost');
  });
});
