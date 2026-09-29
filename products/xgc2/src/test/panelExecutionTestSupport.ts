import { vi } from 'vitest';
import type { AutomationRunDetail } from '../domains/automation/automationPublic';
import { createPanelExecutionObserver } from '../panels/panelExecutionObserver';
import type { PanelExecutionObserver } from '../panels/types';

type Commands = Partial<Pick<PanelExecutionObserver,'loadRunDetail'|'retainRunDetail'|'retainRunObservation'>>;

const backingDetails = new WeakMap<PanelExecutionObserver,Record<string,AutomationRunDetail>>();

/**
 * An execution observer over a mutable details record. Tests change a Run
 * with testRunDetails(observer)[id] = detail and then re-render; the observer
 * reads the record on each render like the dashboard Run store does.
 */
export function testPanelExecution(
  details: Record<string,AutomationRunDetail> = {},
  commands: Commands = {},
): PanelExecutionObserver {
  const observer = createPanelExecutionObserver(() => details,() => () => undefined,{
    loadRunDetail: commands.loadRunDetail ?? vi.fn(),
    retainRunDetail: commands.retainRunDetail ?? vi.fn(() => vi.fn()),
    retainRunObservation: commands.retainRunObservation ?? vi.fn(() => vi.fn()),
  });
  backingDetails.set(observer,details);
  return observer;
}

/** The mutable details record behind a testPanelExecution observer. */
export function testRunDetails(execution: PanelExecutionObserver | undefined): Record<string,AutomationRunDetail> {
  const details = execution && backingDetails.get(execution);
  if (!details) throw new Error('The execution observer was not created by testPanelExecution.');
  return details;
}
