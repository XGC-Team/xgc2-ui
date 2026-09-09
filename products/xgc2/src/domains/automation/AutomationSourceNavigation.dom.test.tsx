// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { ProductRouteVisibilityProvider } from '../../shared/routeReady';
import { AutomationExecutionHistory } from './AutomationExecutionHistory';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';
import type { AutomationSourceLocation } from './automationNavigation';

vi.mock('./AutomationExecutionHistoryList', () => ({ AutomationExecutionHistoryList: () => null }));
vi.mock('./AutomationActiveRuns', () => ({ AutomationActiveRuns: () => null }));
vi.mock('./AutomationExecutionRunDetail', () => ({ AutomationExecutionRunDetail: () => null }));
vi.mock('./AutomationNodeOccurrencesDrawer', () => ({
  AutomationNodeOccurrencesDrawer: ({ runId,nodeId,focusedInvocationId,onClose }: {
    runId: string;nodeId: string;focusedInvocationId: string;onClose: () => void;
  }) => <aside data-testid="occurrence" data-run={runId} data-node={nodeId} data-invocation={focusedInvocationId}>
    <button onClick={onClose}>Close occurrences</button>
  </aside>,
}));
afterEach(cleanup);

describe('workflow source node presentation', () => {
  it('opens the exact occurrence, supports re-opening, and keeps its portal hidden while parked', () => {
    const source: AutomationSourceLocation = { targetId: 'agent-a',resourceId: 'workflow-a',runId: 'run-a',nodeId: 'notify',invocationId: 'occurrence-2' };
    const run = { id: 'run-a',status: 'succeeded',acceptedAt: '2026-09-06T00:00:00Z' } as AutomationExecutionRunSummary;
    const entry = { id: run.id,runId: run.id,targetId: 'agent-a',automationResourceId: 'workflow-a',acceptedAt: run.acceptedAt,phase: 'run' as const,run };
    const surface = (visible: boolean,location = source) => <ProductRouteVisibilityProvider visible={visible}>
      <AutomationExecutionHistory
        resourceId="workflow-a" sourceLocation={location} entries={[entry]} selectedEntry={entry}
        selectedRun={run} catalog={[]} busy={false}
        onSelect={vi.fn()} onRefreshRun={vi.fn()} onStop={vi.fn()}
      />
    </ProductRouteVisibilityProvider>;
    const view = render(surface(true));
    expect(screen.getByTestId('occurrence')).toHaveAttribute('data-run', 'run-a');
    expect(screen.getByTestId('occurrence')).toHaveAttribute('data-node', 'notify');
    expect(screen.getByTestId('occurrence')).toHaveAttribute('data-invocation', 'occurrence-2');
    fireEvent.click(screen.getByRole('button', { name: 'Close occurrences' }));
    expect(screen.queryByTestId('occurrence')).toBeNull();
    const reopened = { ...source };
    view.rerender(surface(true, reopened));
    expect(screen.getByTestId('occurrence')).toBeInTheDocument();
    view.rerender(surface(false, reopened));
    expect(screen.queryByTestId('occurrence')).toBeNull();
    view.rerender(surface(true, reopened));
    expect(screen.getByTestId('occurrence')).toHaveAttribute('data-invocation', 'occurrence-2');
  });
});
