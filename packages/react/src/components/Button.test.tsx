import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Button, ButtonLink } from './Button';

describe('Button', () => {
  it('keeps flat corner and elevation ownership in the shared stylesheet', () => {
    const css=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../styles.css'),'utf8');
    const flat=css.match(/\.xgc-button\[data-appearance='flat'\]\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(flat).toContain('border-radius: 0;');
    expect(flat).toContain('border-width: 0;');
    expect(flat).toContain('box-shadow: none;');
    expect(css).toMatch(/\.xgc-button\[data-appearance='flat'\]:hover:not\(:disabled\):not\(\[aria-disabled='true'\]\)/);
    expect(css).toMatch(/\.xgc-button\[data-appearance='flat'\]:active:not\(:disabled\):not\(\[aria-disabled='true'\]\)\s*\{[^}]*translate:\s*none;/);
  });
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

  it('offers flat composition without losing button and link behavior', () => {
    const onClick=vi.fn();
    render(<><Button appearance="flat" aria-expanded={false} onClick={onClick}>Details</Button>
      <ButtonLink appearance="flat" href="/history">History</ButtonLink>
      <Button appearance="flat" disabled onClick={onClick}>Unavailable</Button></>);
    const button=screen.getByRole('button',{name:'Details'});
    expect(button).toHaveAttribute('data-appearance','flat');
    expect(button).toHaveAttribute('aria-expanded','false');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button',{name:'Unavailable'}));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link',{name:'History'})).toHaveAttribute('data-appearance','flat');
  });
});
