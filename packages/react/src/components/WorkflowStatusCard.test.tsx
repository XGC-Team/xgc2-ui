// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowStatusCard } from './WorkflowStatusCard';

describe('WorkflowStatusCard', () => {
  it('keeps state in typography and progress without semantic chip chrome', () => {
    const { container } = render(
      <WorkflowStatusCard
        ariaLabel="Navigation; current status running"
        dataXgcId="navigation"
        dataXgcRole="test-workflow"
        metrics={{ primary: '2/4 ready', secondary: '50%' }}
        progress={{ label: 'Navigation readiness', percent: 50, value: 50 }}
        runId="run-navigation"
        running
        status="running"
        statusLabel="running"
        title="Navigation"
        tone="success"
      />,
    );
    const card = container.querySelector('[data-xgc-role="test-workflow"]')!;
    expect(card.tagName).toBe('ARTICLE');
    expect(card).toHaveAttribute('data-xgc-progress', '50');
    expect(card.querySelector('.xgc-workflow-status-card-heading')).toHaveTextContent('Navigationrunning');
    expect(card.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '50');
  });

  it('clamps progress and becomes a native button only when actionable', () => {
    const onClick = vi.fn();
    render(
      <WorkflowStatusCard
        ariaLabel="OFFBOARD"
        dataXgcId="mode-offboard"
        dataXgcRole="robot-operation-mode-offboard"
        layout="tile"
        metrics={{ primary: 'Ready' }}
        onClick={onClick}
        progress={{ percent: 140 }}
        running={false}
        status="stopped"
        statusLabel="idle"
        title="OFFBOARD"
        tone="neutral"
      />,
    );
    const button = screen.getByRole('button', { name: 'OFFBOARD' });
    expect(button).toHaveAttribute('data-xgc-progress', '100');
    expect(button).toHaveAttribute('data-xgc-layout', 'tile');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
