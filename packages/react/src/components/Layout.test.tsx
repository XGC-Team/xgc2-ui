import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inline, OperatorWorkspace, ResponsiveGrid, ScrollRegion, SectionHeader, Stack } from './Layout';

describe('layout primitives', () => {
  it('owns shared spacing and responsive layout variants', () => {
    const { container } = render(
      <OperatorWorkspace gap="comfortable" padding="compact">
        <Stack gap="tight"><span>Stacked</span></Stack>
        <Inline justify="between" wrap={false}><span>Left</span><span>Right</span></Inline>
        <ResponsiveGrid columnWidth="wide"><span>Grid item</span></ResponsiveGrid>
        <ScrollRegion aria-label="Logs">Scrollable</ScrollRegion>
      </OperatorWorkspace>,
    );

    expect(container.querySelector('.xgc-operator-workspace')).toHaveAttribute('data-padding', 'compact');
    expect(container.querySelector('.xgc-stack')).toHaveAttribute('data-gap', 'tight');
    expect(container.querySelector('.xgc-inline')).not.toHaveAttribute('data-wrap');
    expect(container.querySelector('.xgc-responsive-grid')).toHaveAttribute('data-column-width', 'wide');
    expect(screen.getByLabelText('Logs')).toHaveAttribute('data-fill', 'true');
  });

  it('keeps section headings compact and action-oriented', () => {
    render(<SectionHeader title="Processes" actions={<button type="button">Refresh</button>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Processes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
