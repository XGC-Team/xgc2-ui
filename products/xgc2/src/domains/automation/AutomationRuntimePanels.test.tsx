// @vitest-environment jsdom

import { fireEvent,render,within , screen} from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import { AutomationNodeInputPanel,AutomationNodeOutputPanel,AutomationRuntimeValuePanel } from './AutomationRuntimePanels';
import {
  AUTOMATION_INPUT_FIELD_DRAG_TYPE,
  automationInputFieldExpression,
  isAutomationLocalInputExpression,
} from './automationInputExpression';
import type { AutomationNodeExecutionSummary } from './automationExecutionContracts';

describe('AutomationRuntimePanels', () => {
  beforeEach(() => localStorage.clear());

  it('groups an exact input snapshot by upstream node and switches sources without changing execution', () => {
    const nodeSummary = runtimeNode({
      inputs: {
        prepare: { ready: true,sequence: 1 },
        safety: { cleared: false,reason: 'wind' },
      },
    });
    const { container } = render(
      <AutomationNodeInputPanel
        nodeId="takeoff"
        runId="run-001"
        nodeSummary={nodeSummary}
        sources={[
          { id: 'prepare',label: 'Prepare vehicle · prepare' },
          { id: 'safety',label: 'Safety gate · safety' },
        ]}
      />,
    );

    const panel = container.querySelector<HTMLElement>('[data-xgc-role="automation-node-input"][data-xgc-id="takeoff"]')!;
    const header = panel.querySelector<HTMLElement>('.automation-runtime-panel-header')!;
    const source = within(panel).getByRole('button', { name: 'Source' });
    const sourceControl = source.closest('[data-xgc-control="select"]');
    expect(within(header).getByText('Input')).toHaveClass('automation-node-pane-title');
    expect(within(header).getByText('Input').tagName).toBe('SPAN');
    expect(within(header).getByRole('tablist', { name: 'input data view' }))
      .toHaveClass('xgc-tab-strip','automation-pane-tabs','automation-node-pane-tabs');
    expect(within(header).getByRole('tablist', { name: 'input data view' }))
      .toHaveAttribute('data-size','default');
    expect(within(header).getByRole('tablist', { name: 'input data view' }))
      .toHaveAttribute('data-variant','contained');
    expect(sourceControl).toHaveAttribute('data-value', 'prepare');
    expect(sourceControl).toHaveClass('xgc-control', 'xgc-select-control');
    expect(within(panel).getByRole('tab', { name: 'Schema' })).toHaveClass('xgc-tab-item', 'xgc-tab-control');
    expect(within(panel).getByRole('tab', { name: 'Schema' })).toHaveAttribute('data-xgc-role', 'automation-runtime-view-mode');
    expect(within(panel).getByRole('tab', { name: 'Schema' })).toHaveAttribute('aria-selected', 'true');
    expect(panel.querySelector('[data-xgc-role="automation-runtime-view-mode"][data-xgc-id="input:table"]')).toHaveClass('xgc-tab-item');
    expect(within(panel).getByRole('searchbox', { name: 'Search input data' }).closest('[data-xgc-control="search"]'))
      .toHaveClass('xgc-control', 'xgc-search-control');

    fireEvent.click(within(panel).getByRole('tab', { name: 'JSON' }));
    expect(panel).toHaveTextContent('"ready": true');
    fireEvent.click(source);
    fireEvent.click(screen.getByRole('option', { name: 'Safety gate · safety' }));
    expect(panel).toHaveTextContent('"cleared": false');
    expect(panel).toHaveTextContent('"reason": "wind"');
    expect(panel).not.toHaveTextContent('Run run-001');
  });

  it('shows only the error for a failed node and only output for a successful node', () => {
    const failedSummary = runtimeNode({
      status: 'failed',attemptCount: 2,route: 'failure',revision: 7,
      output: { observedState: 'failed',code: 42 },errorClass: 'permanent',error: 'process exited',
    });
    const failed = render(<AutomationNodeOutputPanel nodeId="launch" runId="run-002" nodeSummary={failedSummary} />);
    const panel = failed.container.querySelector<HTMLElement>('[data-xgc-role="automation-node-output"][data-xgc-id="launch"]')!;
    const header = panel.querySelector<HTMLElement>('.automation-runtime-panel-header')!;

    expect(within(header).getByText('Output')).toBeInTheDocument();
    expect(within(header).getByRole('tablist', { name: 'output data view' }))
      .toHaveClass('xgc-tab-strip','automation-pane-tabs','automation-node-pane-tabs');
    expect(within(header).getByRole('tablist', { name: 'output data view' }))
      .toHaveAttribute('data-size','default');
    expect(within(header).getByRole('tablist', { name: 'output data view' }))
      .toHaveAttribute('data-variant','contained');
    expect(panel.querySelector('[data-xgc-role="automation-node-runtime-meta"]')).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent('Run run-002');
    expect(panel.querySelector('[data-xgc-role="automation-node-runtime-error"][data-xgc-id="launch"]')).toHaveTextContent('permanentprocess exited');
    expect(panel).not.toHaveTextContent('observedState');
    expect(panel).not.toHaveTextContent('No persisted output');
    failed.unmount();

    const succeededSummary = runtimeNode({ output: { observedState: 'ready',code: 42 } });
    const first = render(<AutomationNodeOutputPanel nodeId="launch" runId="run-002" nodeSummary={succeededSummary} />);
    const succeededPanel = first.container.querySelector<HTMLElement>('[data-xgc-role="automation-node-output"][data-xgc-id="launch"]')!;
    expect(succeededPanel.querySelector('[data-xgc-role="automation-node-runtime-error"]')).toBeNull();
    expect(succeededPanel).toHaveTextContent('observedState');
    fireEvent.change(within(succeededPanel).getByRole('searchbox', { name: 'Search output data' }), { target: { value: 'code' } });
    fireEvent.click(within(succeededPanel).getByRole('tab', { name: 'JSON' }));
    expect(succeededPanel).toHaveTextContent('"code": 42');
    expect(succeededPanel).not.toHaveTextContent('observedState');
    first.unmount();

    const second = render(<AutomationNodeOutputPanel nodeId="launch" runId="run-002" nodeSummary={succeededSummary} />);
    expect(within(second.container).getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not repeat a single input source label', () => {
    const { container } = render(
      <AutomationNodeInputPanel
        nodeId="delay"
        runId="run-003"
        nodeSummary={runtimeNode({ inputs: { trigger: { fired: true } } })}
        sources={[{ id: 'trigger',label: 'Manual trigger · trigger-manual' }]}
      />,
    );

    expect(container).not.toHaveTextContent('Manual trigger · trigger-manual');
    expect(within(container).queryByRole('combobox', { name: 'Source' })).not.toBeInTheDocument();
  });

  it('keeps one full search row for both single-field input and output data', () => {
    const input = render(
      <AutomationNodeInputPanel
        nodeId="single-input"
        runId="run-single"
        nodeSummary={runtimeNode({ inputs: { producer: { ready: true } } })}
        sources={[{ id: 'producer',label: 'Producer' }]}
      />,
    );
    const inputSearch = input.container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="input"]',
    )!;
    expect(inputSearch).toHaveClass('automation-runtime-search');
    expect(inputSearch).not.toHaveAttribute('data-disabled');
    expect(inputSearch.parentElement).toHaveClass('automation-runtime-view-toolbar');
    input.unmount();

    const output = render(
      <AutomationNodeOutputPanel
        nodeId="single-output"
        runId="run-single"
        nodeSummary={runtimeNode({ output: { ready: true } })}
      />,
    );
    const outputSearch = output.container.querySelector<HTMLElement>(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="output"]',
    )!;
    expect(outputSearch).toHaveClass('automation-runtime-search');
    expect(outputSearch).not.toHaveAttribute('data-disabled');
    expect(outputSearch.parentElement).toHaveClass('automation-runtime-view-toolbar');
  });

  it('keeps disabled input and output search rows visible when a node has no searchable data', () => {
    const noInput = render(<AutomationNodeInputPanel nodeId="empty-input" sources={[]} />);
    expect(noInput.container.querySelector(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="input"]',
    )).toHaveAttribute('data-disabled', 'true');
    noInput.unmount();

    const noOutput = render(<AutomationNodeOutputPanel nodeId="empty-output" runId="run-empty" nodeSummary={runtimeNode()} />);
    expect(noOutput.container.querySelector(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="output"]',
    )).toHaveAttribute('data-disabled', 'true');
    noOutput.unmount();

    const executionFact = render(
      <AutomationRuntimeValuePanel
        title="Output"
        pane="output"
        role="automation-execution-node-output"
        id="empty-fact"
        value={undefined}
        empty="No persisted output."
      />,
    );
    expect(executionFact.container.querySelector(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="output"]',
    )).toHaveAttribute('data-disabled', 'true');
    const header = executionFact.container.querySelector<HTMLElement>('.automation-runtime-panel-header')!;
    expect(within(header).getByText('Output')).toBeInTheDocument();
    expect(within(header).queryByText('OUTPUT')).not.toBeInTheDocument();
  });

  it('shows actual Run parameters without an upstream-source selector', () => {
    const { container } = render(
      <AutomationNodeInputPanel
        nodeId="if-adapters"
        runId="run-parameters"
        nodeSummary={runtimeNode({
          nodeId: 'if-adapters',
          inputs: { called: { trigger: 'automation-call' } },
        })}
        sources={[
          { id: 'manual',label: 'Run panel workflow · manual' },
          { id: 'called',label: 'Run as an Experiment binding · called' },
        ]}
        showRunParameters
        runParameters={{ autoStartAdapters: true,rosMasterUri: 'ros-master.local:11311' }}
      />,
    );

    expect(container.querySelector('[data-xgc-role="automation-node-input-source"][data-xgc-id="if-adapters"]')).toBeNull();
    expect(container).not.toHaveTextContent('Run as an Experiment binding · called');
    expect(container).toHaveTextContent('autoStartAdapters');
    const row = within(container).getByTitle('Drag $.autoStartAdapters to an Expression field');
    const values = new Map<string,string>();
    const dataTransfer = { effectAllowed: 'none',setData: (type: string, value: string) => values.set(type, value) };
    fireEvent.dragStart(row, { dataTransfer });
    expect(values.get('text/plain')).toBe('{{ $run.parameters.autoStartAdapters }}');
    fireEvent.click(within(container).getByRole('tab', { name: 'JSON' }));
    expect(container).toHaveTextContent('true');
    expect(container).toHaveTextContent('rosMasterUri');
  });

  it('makes INPUT schema and table rows draggable with source identity and typed JSON path segments', () => {
    const { container } = render(
      <AutomationNodeInputPanel
        nodeId="takeoff"
        runId="run-004"
        nodeSummary={runtimeNode({ inputs: {
          prepare: { robots: [{ 'mav/system id': 4 }] },
          safety: { ready: true },
        } })}
        sources={[
          { id: 'prepare',label: 'Prepare' },
          { id: 'safety',label: 'Safety' },
        ]}
      />,
    );
    const row = within(container).getByTitle('Drag $.robots[0]["mav/system id"] to an Expression field');
    const values = new Map<string,string>();
    const dataTransfer = {
      effectAllowed: 'none',
      setData: (type: string, value: string) => values.set(type, value),
    };

    expect(row).toHaveAttribute('draggable', 'true');
    expect(row).toHaveAttribute('data-xgc-role', 'automation-input-field');
    fireEvent.dragStart(row, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('copy');
    const payload = JSON.parse(values.get(AUTOMATION_INPUT_FIELD_DRAG_TYPE) ?? '{}');
    expect(payload).toEqual({
      version: 1,sourceId: 'prepare',multipleSources: true,segments: ['robots',0,'mav/system id'],
    });
    expect(values.get('text/plain')).toBe('{{ $inputs["prepare"].robots[0]["mav/system id"] }}');

    fireEvent.click(within(container).getByRole('tab', { name: 'Table' }));
    expect(within(container).getByTitle('Drag $.robots[0]["mav/system id"] to an Expression field')).toHaveAttribute('draggable', 'true');
  });

  it('uses an upstream output schema before the first run and keeps every drag reference input-local', () => {
    const { container } = render(
      <AutomationNodeInputPanel
        nodeId="fan-out"
        sources={[{
          id: 'robot-source',
          label: 'Read Robots · robot-source',
          outputSchema: {
            type: 'object',
            properties: {
              selectedRobots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    initialPose: {
                      type: 'object',
                      properties: { x: { type: 'number' } },
                    },
                  },
                },
              },
            },
          },
        }]}
      />,
    );

    expect(container).not.toHaveTextContent('No execution selected');
    const row = within(container).getByTitle('Drag $.selectedRobots[0].initialPose.x to an Expression field');
    const values = new Map<string,string>();
    const dataTransfer = { effectAllowed: 'none',setData: (type: string, value: string) => values.set(type, value) };
    fireEvent.dragStart(row, { dataTransfer });

    expect(values.get('text/plain')).toBe('{{ $input.selectedRobots[0].initialPose.x }}');
    expect(values.get('text/plain')).not.toContain('$assets');
    expect(values.get('text/plain')).not.toContain('$run');
  });

  it('prefers captured run inputs over the authoring output schema', () => {
    const { container } = render(
      <AutomationNodeInputPanel
        nodeId="consumer"
        runId="run-005"
        nodeSummary={runtimeNode({ inputs: { producer: { actual: 42 } } })}
        sources={[{
          id: 'producer',label: 'Producer',
          outputSchema: { type: 'object',properties: { plannedOnly: { type: 'string' } } },
        }]}
      />,
    );

    expect(container).toHaveTextContent('actual');
    fireEvent.click(within(container).getByRole('tab', { name: 'Table' }));
    expect(container).toHaveTextContent('42');
    expect(container).not.toHaveTextContent('plannedOnly');
  });

  it('builds pure local mappings for roots, identifiers, arrays, and special keys', () => {
    expect(automationInputFieldExpression({ sourceId: 'only',multipleSources: false,segments: [] })).toBe('{{ $input }}');
    expect(automationInputFieldExpression({ sourceId: 'only',multipleSources: false,segments: ['robots',0,'enabled'] }))
      .toBe('{{ $input.robots[0].enabled }}');
    expect(automationInputFieldExpression({
      sourceId: 'source "A"',multipleSources: true,segments: ['topic/name','space key',1],
    })).toBe('{{ $inputs["source \\"A\\""]["topic/name"]["space key"][1] }}');
    expect(isAutomationLocalInputExpression('{{ $input.robots[0]["mav/system id"] }}')).toBe(true);
    expect(isAutomationLocalInputExpression('{{ $inputs["source-id"].robots[0] }}')).toBe(true);
    expect(isAutomationLocalInputExpression('Robot {{ $input.name }} is {{ $input.state }}')).toBe(true);
    expect(isAutomationLocalInputExpression('{{ $run.parameters.robot }}')).toBe(false);
    expect(isAutomationLocalInputExpression('{{ $assets.external.robots }}')).toBe(false);
  });

  it('distinguishes loading, failed detail loading, and a node with no public output', () => {
    const loading = render(<AutomationNodeOutputPanel nodeId="wait" runId="run-003" loading />);
    expect(loading.container).toHaveTextContent('Loading execution data');
    expect(loading.container.querySelector(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="output"]',
    )).toHaveAttribute('data-disabled', 'true');
    loading.unmount();

    const failed = render(<AutomationNodeOutputPanel nodeId="wait" runId="run-003" error="request failed" />);
    expect(within(failed.container).getByRole('alert')).toHaveTextContent('Unable to load execution datarequest failed');
    expect(failed.container.querySelector(
      '[data-xgc-role="automation-runtime-search"][data-xgc-id="output"]',
    )).toHaveAttribute('data-disabled', 'true');
    failed.unmount();

    const empty = render(<AutomationNodeOutputPanel nodeId="wait" runId="run-003" nodeSummary={runtimeNode()} />);
    expect(empty.container).toHaveTextContent('No persisted output');
  });
});

function runtimeNode(patch: Partial<AutomationNodeExecutionSummary> = {}): AutomationNodeExecutionSummary {
  return {
    runId: 'run-001',nodeId: 'launch',kind: 'process.run-definition',status: 'succeeded',attemptCount: 1,
    occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
    updatedAt: '2026-07-14T07:00:01Z',revision: 1,...patch,
  };
}
