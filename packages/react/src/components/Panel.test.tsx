import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('connects its region name to the visible title', () => {
    render(<Panel title="Runtime status">Ready</Panel>);
    const panel = screen.getByRole('region', { name: 'Runtime status' });
    expect(panel).toHaveTextContent('Ready');
  });

  it('keeps helper copy out of the fixed panel header', () => {
    const { container } = render(<Panel title="Packages" description="Repository package list">Content</Panel>);
    expect(container.querySelector('.xgc-panel-header')).not.toHaveTextContent('Repository package list');
    expect(container.querySelector('.xgc-panel-body')).toHaveTextContent('Repository package list');
  });

  it('owns fill, scrolling, and column body layout without consumer CSS piercing', () => {
    const { container } = render(<Panel fill bodyLayout="column" bodyScroll>Content</Panel>);
    expect(container.querySelector('.xgc-panel')).toHaveAttribute('data-fill', 'true');
    expect(container.querySelector('.xgc-panel-body')).toHaveAttribute('data-layout', 'column');
    expect(container.querySelector('.xgc-panel-body')).toHaveAttribute('data-scroll', 'true');
  });
});
