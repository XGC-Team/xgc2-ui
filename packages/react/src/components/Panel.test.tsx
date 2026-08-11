import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('connects its region name to the visible title', () => {
    render(<Panel title="Runtime status">Ready</Panel>);
    const panel = screen.getByRole('region', { name: 'Runtime status' });
    expect(panel).toHaveTextContent('Ready');
  });
});
