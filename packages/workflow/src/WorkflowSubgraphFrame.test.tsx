import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkflowSubgraphFrame } from './WorkflowSubgraphFrame';

describe('WorkflowSubgraphFrame', () => {
  it('renders compound scope header, badge, handles, and body slots cleanly', () => {
    const { container } = render(
      <WorkflowSubgraphFrame
        aria-label="For each robot"
        badge="maxConcurrency: 4"
        dataXgcId="loop-robots"
        handles={<span data-testid="handle-slot" />}
        running
        selected
        subtitle="$input.start.robots"
        title="For each robot"
      >
        <div data-testid="subgraph-body">2 inner steps</div>
      </WorkflowSubgraphFrame>,
    );

    const frame = screen.getByRole('region', { name: 'For each robot' });
    expect(frame).toHaveClass('xgc-workflow-subgraph-frame');
    expect(frame).toHaveAttribute('data-xgc-role', 'workflow-subgraph-frame');
    expect(frame).toHaveAttribute('data-xgc-id', 'loop-robots');
    expect(frame).toHaveAttribute('data-selected', 'true');
    expect(frame).toHaveAttribute('data-running', 'true');
    expect(frame).toHaveTextContent('For each robot');
    expect(frame).toHaveTextContent('$input.start.robots');
    expect(frame).toHaveTextContent('maxConcurrency: 4');
    expect(screen.getByTestId('subgraph-body')).toHaveTextContent('2 inner steps');
    expect(container.querySelector('[data-xgc-slot="handles"] [data-testid="handle-slot"]')).not.toBeNull();
  });
});
