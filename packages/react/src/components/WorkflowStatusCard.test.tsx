// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowStatusCard } from './WorkflowStatusCard';

describe('WorkflowStatusCard', () => {
  const completedCard = (completion?:{ id:string;percent:number },paused=false,onClick=vi.fn()) => (
    <WorkflowStatusCard ariaLabel="Publish" dataXgcRole="command" dataXgcId="publish"
      layout="tile" metrics={{ primary:'' }} title="Publish" tone="neutral"
      status="stopped" running={false} onClick={onClick} paused={paused}
      progress={{ percent:0,color:'var(--color-progress-measured)',completion }} />
  );
  const finish = () => {
    // jsdom exposes WebkitAnimation but omits AnimationEvent, so React
    // registers the prefixed end event in this environment.
    const event = new Event(typeof window.AnimationEvent === 'function' ? 'animationend' : 'webkitAnimationEnd', { bubbles:true });
    Object.defineProperty(event, 'animationName', { value:'xgc-workflow-status-card-complete' });
    fireEvent(document.querySelector('.xgc-progress-fill')!, event);
  };

  it('plays a measured immediate success once without keeping execution busy', () => {
    const onClick=vi.fn();
    const { rerender }=render(completedCard(undefined,false,onClick));
    rerender(completedCard({ id:'accepted-a',percent:100 },false,onClick));
    const button=screen.getByRole('button',{ name:'Publish' });
    expect(button).toHaveAttribute('data-xgc-completion-id','accepted-a');
    expect(button).toHaveAttribute('data-xgc-running','false');
    expect(button).toHaveAttribute('data-xgc-progress','0');
    expect(button).toBeEnabled();
    expect(button.querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    finish();
    expect(button).not.toHaveAttribute('data-xgc-completion-id');
    expect(button.querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
    rerender(completedCard({ id:'accepted-a',percent:100 },false,onClick));
    expect(button).not.toHaveAttribute('data-xgc-completion-id');
    rerender(completedCard({ id:'accepted-b',percent:100 },false,onClick));
    expect(button).toHaveAttribute('data-xgc-completion-id','accepted-b');
    finish();
    rerender(completedCard({ id:'accepted-a',percent:100 },false,onClick));
    expect(button).not.toHaveAttribute('data-xgc-completion-id');
  });

  it('consumes hidden receipts and does not replay a parked presentation', () => {
    const { rerender }=render(completedCard({ id:'accepted-a',percent:100 }));
    expect(screen.getByRole('button')).toHaveAttribute('data-xgc-completion-id','accepted-a');
    rerender(completedCard({ id:'accepted-a',percent:100 },true));
    rerender(completedCard({ id:'accepted-a',percent:100 }));
    expect(screen.getByRole('button')).not.toHaveAttribute('data-xgc-completion-id');
    rerender(completedCard({ id:'accepted-b',percent:100 },true));
    rerender(completedCard({ id:'accepted-b',percent:100 }));
    expect(screen.getByRole('button')).not.toHaveAttribute('data-xgc-completion-id');
  });

  it('does not delay clearing or replay when reduced motion finishes immediately', () => {
    render(completedCard({ id:'accepted-a',percent:75 }));
    expect(screen.getByRole('button').querySelector('.xgc-progress-fill'))
      .toHaveStyle({ '--xgc-progress-percent':'75%' });
    // The family motion floor shortens animation duration, while the same
    // animationend path releases presentation without an execution timer.
    finish();
    expect(screen.getByRole('button')).not.toHaveAttribute('data-xgc-completion-id');
    expect(screen.getByRole('button').querySelector('.xgc-progress-fill'))
      .toHaveStyle({ '--xgc-progress-percent':'0%' });
  });

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

  it('keeps a measured danger fill on a default command tile after a workflow node failure', () => {
    const { container } = render(
      <WorkflowStatusCard
        ariaLabel="Build"
        dataXgcId="build"
        dataXgcRole="panel-action-invoke"
        layout="tile"
        metrics={{ primary: '' }}
        onClick={() => undefined}
        progress={{
          color: 'var(--color-progress-failed)',
          max: 1,
          percent: 100,
          tone: 'danger',
          value: 1,
        }}
        running={false}
        status="failed"
        title="Build"
        tone="neutral"
      />,
    );
    const button = container.querySelector('[data-xgc-role="panel-action-invoke"]')!;
    expect(button).toHaveAttribute('data-xgc-tone', 'neutral');
    expect(button).toHaveAttribute('data-xgc-progress', '100');
    expect(button).toHaveAttribute('data-xgc-status', 'failed');
    expect(button.querySelector('.xgc-progress')).toHaveAttribute('data-xgc-tone', 'danger');
    expect(button.querySelector('.xgc-progress-fill')).toHaveStyle({
      '--xgc-progress-fill': 'var(--color-progress-failed)',
      '--xgc-progress-percent': '100%',
    });
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
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('exposes aria-pressed only when the caller sets pressed', () => {
    const { rerender } = render(
      <WorkflowStatusCard
        ariaLabel="Hold"
        dataXgcRole="ugv-chassis-hold"
        dataXgcId="ugv-chassis-hold"
        layout="tile"
        metrics={{ primary: 'Ready' }}
        onClick={() => undefined}
        pressed
        progress={{ percent: 0 }}
        running={false}
        status="stopped"
        statusLabel="idle"
        title="Hold"
        tone="neutral"
      />,
    );
    expect(screen.getByRole('button', { name: 'Hold' })).toHaveAttribute('aria-pressed', 'true');
    rerender(
      <WorkflowStatusCard
        ariaLabel="Hold"
        dataXgcRole="ugv-chassis-hold"
        dataXgcId="ugv-chassis-hold"
        layout="tile"
        metrics={{ primary: 'Ready' }}
        onClick={() => undefined}
        pressed={false}
        progress={{ percent: 0 }}
        running={false}
        status="stopped"
        statusLabel="idle"
        title="Hold"
        tone="neutral"
      />,
    );
    expect(screen.getByRole('button', { name: 'Hold' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lets progress use an independent signal without recoloring status copy', () => {
    const { container } = render(
      <WorkflowStatusCard
        ariaLabel="ROS; ready"
        dataXgcId="roscore"
        dataXgcRole="ros-basic-service-control"
        metrics={{ primary: '1/1 ready' }}
        progress={{ color: 'var(--color-service-ready)',label: 'ROS readiness',percent: 100,tone: 'success',value: 1,max: 1 }}
        running
        status="ready"
        statusLabel="ready"
        title="ROS"
        tone="neutral"
      />,
    );
    const card = container.querySelector('[data-xgc-role="ros-basic-service-control"]')!;
    const progress = card.querySelector('[role="progressbar"]')!;
    expect(card).toHaveAttribute('data-xgc-tone','neutral');
    expect(progress).toHaveAttribute('data-xgc-tone','success');
    expect(progress).toHaveStyle({ '--xgc-progress-fill':'var(--color-service-ready)' });
  });

  it('requires an explicit solid command appearance without inferring it from failed status', () => {
    const onClick = vi.fn();
    const common = {
      layout:'tile' as const,metrics:{ primary:'' },progress:{ percent:50,value:50,label:'Progress' },
      running:false,status:'failed',tone:'danger' as const,
    };
    const { container } = render(<>
      <WorkflowStatusCard {...common} ariaLabel="Failed workflow" title="Failed workflow"
        dataXgcRole="test-status" dataXgcId="failed" />
      <WorkflowStatusCard {...common} ariaLabel="Retry" title="Retry" onClick={onClick}
        dataXgcRole="test-command" dataXgcId="retry" />
      <WorkflowStatusCard {...common} appearance="solid" ariaLabel="E-stop" title="E-stop"
        dataXgcRole="test-command" dataXgcId="stop" onClick={onClick} pressed disabled />
    </>);
    expect(container.querySelector('[data-xgc-id="failed"]')).toHaveAttribute('data-xgc-appearance','default');
    expect(screen.getByRole('button',{ name:'Retry' })).toHaveAttribute('data-xgc-appearance','default');
    const stop = screen.getByRole('button',{ name:'E-stop' });
    expect(stop).toHaveAttribute('data-xgc-appearance','solid');
    expect(stop).toHaveAttribute('aria-pressed','true');
    expect(stop.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow','50');
    fireEvent.click(stop);
    expect(onClick).not.toHaveBeenCalled();
  });
});
