// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { WorkflowStatusCard } from './WorkflowStatusCard';

describe('WorkflowStatusCard', () => {
  it('owns the stable visual, tone, metric, and measured progress contract', () => {
    const { container } = render(
      <WorkflowStatusCard
        title="Navigation"
        statusLabel="running"
        tone="success"
        status="running"
        running
        metrics={{ primary: '2/4 ready',secondary: '50%' }}
        progress={{ percent: 50,value: 50,label: 'Navigation readiness' }}
        dataXgcRole="test-workflow"
        dataXgcId="navigation"
        runId="run-navigation"
        ariaLabel="Navigation; current status running"
      ><button type="button">Stop</button></WorkflowStatusCard>,
    );

    const card = container.querySelector('[data-xgc-role="test-workflow"]')!;
    expect(card).toHaveClass('xgc-workflow-status-card');
    expect(card.tagName).toBe('ARTICLE');
    expect(card).toHaveAttribute('data-xgc-tone', 'success');
    expect(card).toHaveAttribute('data-xgc-status', 'running');
    expect(card).toHaveAttribute('data-xgc-running', 'true');
    expect(card).toHaveAttribute('data-xgc-progress', '50');
    expect(card).toHaveAttribute('data-xgc-run-id', 'run-navigation');
    expect(card.querySelector('.xgc-workflow-status-card-heading')).toHaveTextContent('Navigationrunning');
    expect(card.querySelector('.xgc-workflow-status-card-metrics')).toHaveTextContent('2/4 ready50%');
    expect(card.querySelector('[role="progressbar"]')).toHaveAccessibleName('Navigation readiness');
    expect(card.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '50');
    expect(card).toHaveTextContent('Stop');
  });

  it('clamps visual progress and omits measurement semantics when there is no value', () => {
    const { container } = render(
      <WorkflowStatusCard
        title="Mapping"
        tone="neutral"
        status="idle"
        running={false}
        metrics={{ primary: 'Ready' }}
        progress={{ percent: 140 }}
        dataXgcRole="test-workflow"
        dataXgcId="mapping"
        ariaLabel="Mapping; ready"
      />,
    );

    const card = container.querySelector('[data-xgc-role="test-workflow"]')!;
    expect(card).toHaveAttribute('data-xgc-progress', '100');
    expect(card.querySelector('.xgc-workflow-status-card-progress .xgc-progress-fill'))
      .toHaveStyle({ '--xgc-progress-percent': '100%' });
    expect(card.querySelector('[role="progressbar"]')).toBeNull();
    expect(card.querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
  });

  it('renders as a button when an action callback is provided', () => {
    const onClick = vi.fn();
    render(
      <WorkflowStatusCard
        title="ALTCTL"
        statusLabel="idle"
        tone="neutral"
        status="stopped"
        running={false}
        metrics={{ primary: 'Ready' }}
        progress={{ percent: 0 }}
        dataXgcRole="robot-operation-mode-altctl"
        dataXgcId="no-run:mode-altctl"
        ariaLabel="ALTCTL"
        titleAttr="idle"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'ALTCTL' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveClass('xgc-workflow-status-card');
    expect(button).toHaveAttribute('data-xgc-role', 'robot-operation-mode-altctl');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes tile layout metadata with its action name and status', () => {
    const { container } = render(
      <WorkflowStatusCard
        layout="tile"
        title="OFFBOARD"
        statusLabel="idle"
        tone="neutral"
        status="stopped"
        running={false}
        metrics={{ primary: 'Ready' }}
        progress={{ percent: 0 }}
        dataXgcRole="robot-operation-mode-offboard"
        dataXgcId="run:mode-offboard"
        ariaLabel="OFFBOARD"
      />,
    );
    const card = container.querySelector('[data-xgc-role="robot-operation-mode-offboard"]')!;
    expect(card).toHaveAttribute('data-xgc-layout', 'tile');
    expect(card.querySelector('.xgc-workflow-status-card-heading strong')).toHaveTextContent('OFFBOARD');
    expect(card.querySelector('.xgc-workflow-status-card-heading em')).toHaveTextContent('idle');
  });
});
