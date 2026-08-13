import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import styles from './styles.css?raw';
import { WorkflowNodeSurface } from './WorkflowNodeSurface';

describe('WorkflowNodeSurface', () => {
  it('renders stable handle and content slots without adding product semantics', () => {
    render(
      <WorkflowNodeSurface
        aria-label="Workflow node one"
        className="product-node"
        content={<strong>Product-owned content</strong>}
        contentClassName="product-node-content"
        dataXgcId="node-1"
        handles={<span data-testid="connection-handle" />}
        padding="none"
        role="group"
        selected
      />,
    );

    const surface = screen.getByRole('group', { name: 'Workflow node one' });
    expect(surface).toHaveClass('xgc-workflow-node-surface', 'product-node');
    expect(surface).toHaveAttribute('data-padding', 'none');
    expect(surface).toHaveAttribute('data-selected', 'true');
    expect(surface).toHaveAttribute('data-xgc-id', 'node-1');
    expect(surface).toHaveAttribute('data-xgc-role', 'workflow-node-surface');
    expect(surface.querySelector('[data-xgc-slot="handles"]')).toContainElement(screen.getByTestId('connection-handle'));
    expect(surface.querySelector('[data-xgc-slot="content"]')).toHaveClass('product-node-content');
    expect(surface.querySelector('[data-xgc-slot="content"]')).toHaveTextContent('Product-owned content');
    expect(surface).not.toHaveAttribute('data-status');
    expect(surface).not.toHaveAttribute('data-role');
  });

  it('omits optional handle and selection state when they are not supplied', () => {
    const { container } = render(<WorkflowNodeSurface content="Node content" />);
    const surface = container.querySelector('.xgc-workflow-node-surface');

    expect(surface).not.toBeNull();
    expect(surface).not.toHaveAttribute('data-selected');
    expect(surface?.querySelector('[data-xgc-slot="handles"]')).toBeNull();
    expect(surface?.querySelector('[data-xgc-slot="content"]')).toHaveTextContent('Node content');
  });

  it('uses a complete selected ring without an edge marker or status decoration', () => {
    const selectedRule = styles.match(/\.xgc-workflow-node-surface\[data-selected='true'\]\s*\{[^}]+\}/)?.[0];
    const handleRule = styles.match(/\.xgc-workflow-node-surface \.react-flow__handle\s*\{[^}]+\}/)?.[0];

    expect(selectedRule).toContain('box-shadow: var(--shadow-selection-ring), var(--shadow-card)');
    expect(selectedRule).not.toMatch(/border-(?:left|inline-start)/);
    expect(handleRule).toContain('border-radius: var(--radius-xs)');
    expect(handleRule).not.toContain('var(--radius-pill)');
  });

  it('owns one role-based palette for both skins without product automation aliases', () => {
    const palette = [
      '--color-workflow-tone-amber',
      '--color-workflow-tone-green',
      '--color-workflow-tone-cyan',
      '--color-workflow-tone-orange',
      '--color-workflow-tone-purple',
      '--color-workflow-tone-blue',
      '--color-workflow-tone-red',
      '--color-workflow-tone-teal',
      '--color-workflow-tone-indigo',
      '--color-workflow-tone-pink',
    ];

    for (const token of palette) {
      expect([...styles.matchAll(new RegExp(`${token}:`, 'g'))]).toHaveLength(2);
    }
    expect(styles).not.toContain('--color-automation-');
    expect(styles).not.toMatch(/--color-workflow-(?:run|node)-/);
  });
});
