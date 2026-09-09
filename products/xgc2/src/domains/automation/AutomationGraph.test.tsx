// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll,describe,expect,it,vi } from 'vitest';
import { AutomationCanvasControls } from './AutomationCanvasControls';
import { AutomationEdgeActions } from './AutomationGraphEdge';
import { AutomationGraph } from './AutomationGraphView';
import { automationCatalogFixture,automationCatalogTraits } from './automationCatalogTestFixtures';
import type {
  AutomationEdge,
  AutomationNode,
} from './automationDefinitionContracts';
import type { AutomationNodeExecutionSummary } from './automationExecutionContracts';
import { automationGraphNodeHeight,tidyAutomationGraphPositions } from './automationGraphLayout';
import { edgeLabelTransform,graphEdges,graphHasCycle } from './automationGraphModel';
import { newAutomationNode,newAutomationStickyNote } from './automationSpecModel';
import { composeAutomationNodeWeb } from './nodes/automationNodeWebComposition';
import { callGraphAutomationNodeContributions } from './nodes/callGraph/callGraphAutomationNodeContributions';
import { coreFlowAutomationNodeContributions } from './nodes/coreFlow/coreFlowAutomationNodeContributions';
import { groundStationAutomationNodeContributions } from './nodes/groundStation/groundStationAutomationNodeContributions';

const coreFlowNodeComposition = composeAutomationNodeWeb(...coreFlowAutomationNodeContributions);
const callGraphNodeComposition = composeAutomationNodeWeb(...callGraphAutomationNodeContributions);
const groundStationNodeComposition = composeAutomationNodeWeb(...groundStationAutomationNodeContributions);

beforeAll(() => {
  class TestResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      Object.defineProperty(target, 'offsetWidth', { configurable: true,value: 112 });
      Object.defineProperty(target, 'offsetHeight', { configurable: true,value: 92 });
      queueMicrotask(() => this.callback([{
        target,
        contentRect: { width: 112,height: 92 },
      } as ResizeObserverEntry], this as unknown as ResizeObserver));
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: TestResizeObserver,writable: true });
  if (!globalThis.DOMMatrixReadOnly) {
    Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
      configurable: true,
      value: class TestDOMMatrixReadOnly { m22 = 1; },
    });
  }
});

describe('AutomationGraph', () => {
	it('ignores persisted coordinates when automatic layout is enabled for a system workflow', async () => {
		const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
			definition={{
				nodes: [
					{ ...newAutomationNode('trigger.manual'),id: 'start',position: { x: 777,y: 555 } },
					{ ...newAutomationNode('notification'),id: 'finish',position: { x: 888,y: 666 } },
				],
				edges: [{ id: 'start-finish',from: 'start',to: 'finish',condition: 'success' }],
			}}
			catalog={[]}
			positions={{ start: { x: 777,y: 555 },finish: { x: 888,y: 666 } }}
			autoLayout
		/></div>);

		const graph = container.querySelector('[data-xgc-role="automation-graph"]');
		expect(graph).toHaveAttribute('data-xgc-layout', 'automatic');
		expect(container.querySelector('[data-xgc-role="automation-graph-purpose"]')).toBeNull();
		await waitFor(() => {
			expect(container.querySelector<HTMLElement>('[data-testid="rf__node-start"]')?.style.transform).toBe('translate(0px,0px)');
			expect(container.querySelector<HTMLElement>('[data-testid="rf__node-finish"]')?.style.transform).toBe('translate(324px,0px)');
		});
	});

	it('does not show a canvas purpose badge over the graph', () => {
		const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
			definition={{ nodes: [],edges: [] }}
			catalog={[]}
		/></div>);

		expect(container.querySelector('[data-xgc-role="automation-graph-purpose"]')).toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-graph-empty"]')).toHaveTextContent(
			'Add a trusted node type from the catalog to build this automation.',
		);
	});

	it('renders typed ROS1 operation nodes with success and error outputs', () => {
		const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
			definition={{ nodes: [
				{ ...newAutomationNode('ros1.publish-topic', {}, 'Publish topic', 3),id: 'publish',displayName: 'Publish topic' },
				{ ...newAutomationNode('ros1.call-service'),id: 'service',displayName: 'Call service' },
			],edges: [] }}
			catalog={[
				{ kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),parameterSchema: {},outputPorts: [{ id: 'published',label: 'Published' },{ id: 'error',label: 'Error' }] },
				{ kind: 'ros1.call-service',typeVersion: 1,label: 'Call service',category: 'ros1',traits: automationCatalogTraits('ros1.call-service'),parameterSchema: {},outputPorts: [{ id: 'response',label: 'Response' },{ id: 'error',label: 'Error' }] },
			]}
		/></div>);
		expect(container.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="publish:published"]')).not.toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="publish:error"]')).not.toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="service:response"]')).not.toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="service:error"]')).not.toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="publish"] .lucide-send')).not.toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node"][data-xgc-id="service"] .lucide-arrow-left-right')).not.toBeNull();
	});

	it('renders Wait for ROS Core Ready as a ROS node with one named external port', () => {
		const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
			definition={{ nodes: [{ ...newAutomationNode('ros1.wait-roscore-ready'),id: 'wait-roscore',displayName: 'Wait for ROS Core Ready' }],edges: [] }}
			catalog={[{ kind: 'ros1.wait-roscore-ready',typeVersion: 1,label: 'Wait for ROS Core Ready',category: 'ros1',traits: automationCatalogTraits('ros1.wait-roscore-ready'),parameterSchema: {},outputPorts: [{ id: 'ready',label: 'Ready' }] }]}
		/></div>);
		const node = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="wait-roscore"]')!;
		expect(node.querySelector('.lucide-network')).not.toBeNull();
		expect(node).toHaveAttribute('data-xgc-output-layout', 'named');
		expect(node.querySelector('.automation-node-tile')).toHaveTextContent('Wait for ROS Core Ready');
		expect(node.querySelector('.automation-node-output-ports')).toHaveTextContent('Ready');
		expect(node.querySelector('[data-xgc-role="automation-node-output-port-label"][data-xgc-id="wait-roscore:ready"]')).toHaveTextContent('Ready');
		expect(node.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="wait-roscore:ready"]')).not.toBeNull();
	});

	it('renders Wait for Gazebo Server with one ready port and a simulation icon', () => {
		const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
			definition={{ nodes: [{ ...newAutomationNode('ros1.wait-gazebo-ready', { timeoutSeconds:120 }, 'Wait for Gazebo Server', 2),id: 'wait-gazebo' }],edges: [] }}
			catalog={[{ kind: 'ros1.wait-gazebo-ready',typeVersion: 2,label: 'Wait for Gazebo Server',category: 'ros1',traits: automationCatalogTraits('ros1.wait-gazebo-ready'),parameterSchema: {},outputPorts: [{ id: 'ready',label: 'Ready' },{ id: 'timed-out',label: 'Timed out' }] }]}
		/></div>);
		const node = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="wait-gazebo"]')!;
		expect(node).toHaveAttribute('data-xgc-output-layout', 'named');
		expect(node.querySelector('.lucide-box')).not.toBeNull();
		expect(node.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="wait-gazebo:ready"]')).not.toBeNull();
	});

	it('uses a process preset identity for its neutral graph icon', () => {
		const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
			definition={{ nodes: [{
				...newAutomationNode('process.run-definition', { definitionId: 'mavros-px4-sitl' }),
				id: 'mavros',displayName: 'MAVROS PX4 SITL',
			}],edges: [] }}
			catalog={[automationCatalogFixture({
				kind: 'process.run-definition',typeVersion: 1,label: 'Run process',category: 'process',traits: ['effect','wait'],parameterSchema: {},
			})]}
		/></div>);
		const icon = container.querySelector<HTMLElement>('[data-xgc-role="automation-node-icon"][data-xgc-id="mavros"]')!;
		expect(icon).not.toHaveAttribute('data-xgc-icon-tone');
		expect(icon.querySelector('.lucide-plane')).not.toBeNull();
	});

  it('keeps persisted named edge handles available while the catalog is loading', () => {
    const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('process.run-definition'),id: 'master',displayName: 'ROS Core' },
          { ...newAutomationNode('process.run-definition'),id: 'gazebo',displayName: 'Gazebo' },
        ],
        edges: [{ id: 'master-gazebo',from: 'master',to: 'gazebo',sourcePort: 'ready',route: 'ready',condition: 'success' }],
      }}
      catalog={[]}
    /></div>);

    expect(container.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="master:ready"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-node-source-handle"][data-xgc-id="master"]')).toBeNull();
  });

  it('renders catalog control outputs and omits a source handle for an explicit terminal node', () => {
    const { container } = render(<div style={{ width: 900,height: 500 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('condition'),id: 'condition',typeVersion: 2 },
          { ...newAutomationNode('switch'),id: 'switch' },
          { ...newAutomationNode('stop-and-error'),id: 'stop' },
          { ...newAutomationNode('automation.return'),id: 'return' },
        ],
        edges: [],
      }}
      catalog={[
        { kind: 'condition',typeVersion: 2,label: 'If',category: 'control',traits: automationCatalogTraits('condition'),parameterSchema: {},outputPorts: [{ id: 'true',label: 'True' },{ id: 'false',label: 'False' }] },
        { kind: 'switch',typeVersion: 1,label: 'Switch',category: 'control',traits: automationCatalogTraits('switch'),parameterSchema: {},outputPorts: [{ id: 'case-1',label: 'Case 1' },{ id: 'case-2',label: 'Case 2' },{ id: 'case-3',label: 'Case 3' },{ id: 'case-4',label: 'Case 4' },{ id: 'fallback',label: 'Fallback' }] },
        { kind: 'stop-and-error',typeVersion: 1,label: 'Stop and Error',category: 'control',traits: automationCatalogTraits('stop-and-error'),parameterSchema: {},outputPorts: [] },
        { kind: 'automation.return',typeVersion: 1,label: 'Return',category: 'control',traits: automationCatalogTraits('automation.return'),parameterSchema: {},outputPorts: [] },
      ]}
      nodeComposition={coreFlowNodeComposition}
    /></div>);

    const condition = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="condition"]')!;
    const switchNode = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="switch"]')!;
    const stop = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="stop"]')!;
    const returnNode = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="return"]')!;
    expect(condition).toHaveAttribute('data-xgc-kind', 'condition');
    expect(condition.querySelector('.automation-node-icon svg path[d="M21.5 5.75H2"]')).not.toBeNull();
    expect(condition.querySelectorAll('[data-xgc-role="automation-node-source-handle"]')).toHaveLength(2);
    expect(switchNode.querySelectorAll('[data-xgc-role="automation-node-source-handle"]')).toHaveLength(5);
    expect(switchNode).toHaveAttribute('data-xgc-output-count', '5');
    expect(stop.querySelector('[data-xgc-role="automation-node-target-handle"]')).not.toBeNull();
    expect(stop.querySelector('[data-xgc-role="automation-node-source-handle"]')).toBeNull();
    expect(stop.querySelector('.lucide-shield-x')).not.toBeNull();
    expect(returnNode.querySelector('[data-xgc-role="automation-node-target-handle"]')).not.toBeNull();
    expect(returnNode.querySelector('[data-xgc-role="automation-node-source-handle"]')).toBeNull();
  });

  it('extends each unconnected output to an add button and hides it after connection', () => {
    const onOutputAdd = vi.fn();
    const { container } = render(<div style={{ width: 900,height: 500 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('condition'),id: 'condition',position: { x: 40,y: 60 } },
          { ...newAutomationNode('notification'),id: 'notify',position: { x: 300,y: 60 } },
        ],
        edges: [{ id: 'condition-notify',from: 'condition',to: 'notify',route: 'true',condition: 'success' }],
      }}
      catalog={[
        { kind: 'condition',typeVersion: 1,label: 'If',category: 'control',traits: automationCatalogTraits('condition'),parameterSchema: {},outputPorts: [{ id: 'true',label: 'True' },{ id: 'false',label: 'False' }] },
        { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'action',traits: automationCatalogTraits('notification'),parameterSchema: {} },
      ]}
      positions={{ condition: { x: 40,y: 60 },notify: { x: 300,y: 60 } }}
      editable
      onOutputAdd={onOutputAdd}
    /></div>);

    expect(container.querySelector('[data-xgc-role="automation-node-output-add"][data-xgc-id="condition:true"]')).toBeNull();
    const addFalse = container.querySelector<HTMLButtonElement>('[data-xgc-role="automation-node-output-add"][data-xgc-id="condition:false"]')!;
    expect(addFalse).not.toBeNull();
    expect(addFalse).toHaveAttribute('data-xgc-named', 'true');
    fireEvent.click(addFalse);
    expect(onOutputAdd).toHaveBeenCalledWith('condition', 'false', { x: 364,y: 60 });
  });

  it('attaches named routes and lifecycle ports to their graph handles', () => {
    const edges = graphEdges([
      { id: 'condition-yes',from: 'condition',to: 'yes',condition: 'success',route: 'true' },
      { id: 'process-ready',from: 'process',to: 'ready',condition: 'success',sourcePort: 'ready' },
    ]);

    expect(edges.map((edge) => [edge.id,edge.sourceHandle,edge.label ?? null])).toEqual([
      ['condition-yes','true',null],
      ['process-ready','ready',null],
    ]);
  });

  it('preserves controlled selection and an opened property target after real node events', async () => {
    const { container } = render(<GraphInteractionHarness />);
    const wrapper = container.querySelector<HTMLElement>('[data-testid="rf__node-notify"]')!;

    fireEvent.click(wrapper.querySelector('[data-xgc-role="automation-node-tile"]')!);
    await waitFor(() => {
      expect(screen.getByTestId('selected-node')).toHaveTextContent('notify');
      expect(wrapper).toHaveClass('selected');
      expect(wrapper.querySelector('[data-xgc-role="automation-node"]')).toHaveAttribute('data-selected', 'true');
    });

    fireEvent.doubleClick(wrapper.querySelector('[data-xgc-role="automation-node-display-name"]')!);
    await waitFor(() => expect(screen.getByTestId('opened-node')).toHaveTextContent('notify'));
    expect(screen.getByTestId('selected-node')).toHaveTextContent('notify');
  });

  it('keeps names and readable runtime state inside neutral cards without schema metadata', () => {
    const definition = {
      nodes: [
        { ...newAutomationNode('trigger.manual'),id: 'trigger',displayName: 'Start manually' },
        { ...newAutomationNode('condition', { value: true }),id: 'branch',displayName: 'Check condition' },
        { ...newAutomationNode('process.run-definition', { definitionId: 'roscore',parameters: { port: 11311 } }),id: 'primary',displayName: 'Start ROS master' },
        { ...newAutomationNode('notification', { message: 'failed' }),id: 'fallback',displayName: 'Notify failure' },
        { ...newAutomationNode('merge'),id: 'join',displayName: 'Join branches' },
      ],
      edges: [
        { id: 'trigger-branch',from: 'trigger',to: 'branch',condition: 'success' as const },
        { id: 'branch-primary',from: 'branch',to: 'primary',condition: 'success' as const,route: 'true' },
        { id: 'branch-fallback',from: 'branch',to: 'fallback',condition: 'failure' as const },
        { id: 'primary-join',from: 'primary',to: 'join',condition: 'success' as const },
        { id: 'fallback-join',from: 'fallback',to: 'join',condition: 'always' as const },
      ],
    };
    const catalog = [
      { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: {} },
      { kind: 'condition',typeVersion: 1,label: 'Condition',category: 'control',traits: automationCatalogTraits('condition'),parameterSchema: {} },
      { kind: 'process.run-definition',typeVersion: 1,label: 'Run process definition',category: 'process',traits: automationCatalogTraits('process.run-definition'),parameterSchema: {},outputPorts: [{ id: 'ready',label: 'Ready' },{ id: 'stopped',label: 'Stopped' },{ id: 'error',label: 'Error' }],canCompensate: true },
      { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'action',traits: automationCatalogTraits('notification'),parameterSchema: {} },
      { kind: 'merge',typeVersion: 1,label: 'Merge',category: 'control',traits: automationCatalogTraits('merge'),parameterSchema: {} },
    ];
    const { container } = render(<div style={{ width: 1000,height: 600 }}><AutomationGraph
      definition={definition}
      catalog={catalog}
      positions={{ primary: { x: 123,y: 45 } }}
      nodeSummaries={[
        { runId: 'run-1',nodeId: 'trigger',kind: 'trigger.manual',status: 'succeeded',attemptCount: 1,occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,updatedAt: '2026-07-12T00:00:00Z',revision: 2 },
        { runId: 'run-1',nodeId: 'primary',kind: 'process.run-definition',status: 'waiting',attemptCount: 1,occurrenceCount: 1,activeOccurrenceCount: 1,completedOccurrenceCount: 0,failedOccurrenceCount: 0,updatedAt: '2026-07-12T00:00:00Z',revision: 2 },
        { runId: 'run-1',nodeId: 'fallback',kind: 'notification',status: 'failed',attemptCount: 1,occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 1,updatedAt: '2026-07-12T00:00:00Z',revision: 2 },
      ]}
    /></div>);

    expect(container.querySelectorAll('[data-xgc-role="automation-node"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-xgc-role="automation-node-tile"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-xgc-role="automation-node-icon"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-xgc-role="automation-node-display-name"]')).toHaveLength(5);
    expect(container.querySelector('[data-xgc-role="automation-node-fanout"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-node-join"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-node-compensation"]')).toBeNull();
    expect(container.querySelector('.automation-node-badges')).toBeNull();
    const primary = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="primary"]')!;
    expect(primary).toHaveTextContent('Start ROS master');
    expect(primary).toHaveTextContent('waiting');
    expect(primary.querySelector('code')).toBeNull();
    expect(primary.querySelector('small')).toBeNull();
    expect(primary).toHaveAttribute('data-xgc-status', 'waiting');
    expect(primary.querySelector('[data-xgc-role="automation-node-status"]')).toHaveTextContent('waiting');
    expect(primary.querySelector('.lucide-network')).not.toBeNull();
    expect(primary.querySelector('.automation-node-tile')).toHaveTextContent('Start ROS master');
    expect(primary.querySelector('.automation-node-output-ports')).toHaveTextContent('ReadyStoppedError');
    const fallback = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="fallback"]')!;
    expect(fallback).toHaveAttribute('aria-label', 'Notify failure');
    expect(fallback).toHaveAttribute('title', 'Notify failure');
    expect(fallback.querySelector('[data-xgc-role="automation-node-status"] .lucide-x')).not.toBeNull();
    expect(container.querySelectorAll('[data-xgc-role="automation-node-target-handle"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-xgc-role="automation-node-source-handle"]')).toHaveLength(7);
    const trigger = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="trigger"]')!;
    expect(trigger).toHaveAttribute('aria-label', 'Start manually');
    expect(trigger).toHaveTextContent('Start manually');
    expect(trigger.querySelector('[data-xgc-role="automation-trigger-icon"] svg')).not.toBeNull();
    expect(trigger.querySelector('[data-xgc-role="automation-node-status"]')).toHaveAttribute('aria-label', 'Status: succeeded');
    expect(trigger.querySelector('[data-xgc-role="automation-node-status"] .lucide-check')).not.toBeNull();
    expect(trigger.querySelector('[data-xgc-role="automation-node-target-handle"]')).toBeNull();
    expect((container.querySelector('.react-flow__node[data-id="primary"]') as HTMLElement).style.transform).toBe('translate(123px,45px)');
    expect(container.querySelector('[data-testid="rf__wrapper"] [data-xgc-role="automation-canvas-controls"]')).not.toBeNull();
    expect(graphEdges(definition.edges).map((edge) => [
      edge.id,
      edge.label ?? null,
    ])).toEqual([
      ['trigger-branch',null],
      ['branch-primary',null],
      ['branch-fallback','failure'],
      ['primary-join',null],
      ['fallback-join','always'],
    ]);
    expect(edgeLabelTransform(120, 40)).toBe('translate(-50%, 0) translate(120px, 48px)');
  });

  it('uses an hourglass icon for Delay nodes', () => {
    const definition = {
      nodes: [{ ...newAutomationNode('delay', { resume: 'timeInterval',amount: 3,unit: 'seconds' }, 'Wait 3 seconds', 2),id: 'delay' }],
      edges: [],
    };
    const { container } = render(<div style={{ width: 400,height: 300 }}><AutomationGraph
      definition={definition}
      catalog={[{ kind: 'delay',typeVersion: 2,label: 'Delay',category: 'control',traits: automationCatalogTraits('delay'),parameterSchema: {} }]}
      nodeComposition={coreFlowNodeComposition}
    /></div>);
    const delay = container.querySelector('[data-xgc-role="automation-node-icon"][data-xgc-id="delay"]');

    expect(delay?.querySelector('.lucide-hourglass')).not.toBeNull();
    expect(delay?.querySelector('.lucide-timer')).toBeNull();
  });

  it('renders readable runtime states with completion and failure glyphs', () => {
    const statuses: AutomationNodeExecutionSummary['status'][] = [
      'pending','running','waiting','succeeded','failed','canceled','skipped','compensating','compensated',
    ];
    const definition = {
      nodes: statuses.map((status, index) => ({
        ...newAutomationNode('notification', { message: status }, status, 1),
        id: `node-${status}`,
        position: { x: (index % 3) * 220,y: Math.floor(index / 3) * 110 },
      })),
      edges: [],
    };
    const nodeSummaries: AutomationNodeExecutionSummary[] = statuses.map((status) => ({
      runId: 'run-statuses',
      nodeId: `node-${status}`,
      kind: 'notification',
      status,
      attemptCount: 1,
      occurrenceCount: 1,
      activeOccurrenceCount: status === 'running' || status === 'waiting' ? 1 : 0,
      completedOccurrenceCount: status === 'running' || status === 'waiting' ? 0 : 1,
      failedOccurrenceCount: status === 'failed' ? 1 : 0,
      updatedAt: '2026-07-15T08:00:00Z',
      revision: 1,
    }));
    const { container } = render(<div style={{ width: 800,height: 500 }}><AutomationGraph
      definition={definition}
      catalog={[{ kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: {} }]}
      nodeSummaries={nodeSummaries}
    /></div>);

    for (const status of ['succeeded','compensated']) {
      const node = container.querySelector(`[data-xgc-role="automation-node"][data-xgc-id="node-${status}"]`)!;
      expect(node.querySelector('[data-xgc-role="automation-node-status"] .lucide-check')).not.toBeNull();
    }
    for (const status of ['failed','canceled']) {
      const node = container.querySelector(`[data-xgc-role="automation-node"][data-xgc-id="node-${status}"]`)!;
      expect(node.querySelector('[data-xgc-role="automation-node-status"] .lucide-x')).not.toBeNull();
    }
    for (const status of ['pending','running','waiting','skipped','compensating']) {
      const node = container.querySelector(`[data-xgc-role="automation-node"][data-xgc-id="node-${status}"]`)!;
      expect(node.querySelector('[data-xgc-role="automation-node-status"]')).toHaveTextContent(status);
    }
  });

  it('keeps an active supervised process readable without animated chrome or a completion icon', () => {
    const service = { ...newAutomationNode('process.run-definition', { definitionId: 'roscore',parameters: {} }),id: 'service',displayName: 'Start ROS Core' };
    const { container } = render(<div style={{ width: 400,height: 300 }}><AutomationGraph
      definition={{ nodes: [service],edges: [] }}
      catalog={[{ kind: 'process.run-definition',typeVersion: 1,label: 'Run process definition',category: 'Process',traits: automationCatalogTraits('process.run-definition'),parameterSchema: {} }]}
      nodeSummaries={[{
        runId: 'run-active',nodeId: 'service',kind: 'process.run-definition',status: 'succeeded',attemptCount: 1,
        occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,
        updatedAt: '2026-07-20T05:00:00Z',revision: 1,
      }]}
      activeRuntimeNodeIds={['service']}
    /></div>);

    const node = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="service"]')!;
    expect(node).toHaveAttribute('data-xgc-status', 'active');
    expect(node).toHaveAttribute('data-xgc-engine-status', 'succeeded');
    expect(node).toHaveAttribute('data-xgc-runtime-state', 'active');
    expect(node).toHaveAttribute('data-xgc-status', 'active');
    expect(node.querySelector('[data-xgc-role="automation-node-tile"]')).not.toHaveAttribute('data-running');
    expect(node.querySelector('[data-xgc-role="automation-node-status"]')).toHaveTextContent('running');
    expect(node.querySelector('.lucide-loader-circle')).toBeNull();
    expect(node.querySelector('.lucide-check')).toBeNull();
  });

  it.each(['passing','idle','failing','stopping'])('preserves runtime truth when a live process has operator state %s', (operatorStatus) => {
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{ nodes: [{ ...newAutomationNode('process.run-definition'),id: 'service' }],edges: [] }}
      catalog={[]}
      activeRuntimeNodeIds={['service']}
      nodeRuntimeFacts={{ service: { status: operatorStatus } }}
    /></div>);
    const state = container.querySelector('[data-xgc-role="automation-node-operator-status"][data-xgc-id="service"]');
    expect(state).toHaveTextContent(operatorStatus === 'passing' || operatorStatus === 'idle' ? 'running' : operatorStatus);
  });

  it('projects edge condition, completion, and selection through the edge owner data contract', async () => {
    const edge = { id: 'start-delay',from: 'start',to: 'delay',condition: 'success' as const };
    const succeeded = (nodeId: string): AutomationNodeExecutionSummary => ({
      runId: 'run-1',nodeId,kind: 'delay',status: 'succeeded',attemptCount: 1,occurrenceCount: 1,activeOccurrenceCount: 0,completedOccurrenceCount: 1,failedOccurrenceCount: 0,updatedAt: '2026-07-12T00:00:00Z',revision: 2,
    });

    const incompleteEdge = graphEdges(
      [edge],
      '',
      false,
      '',
      undefined,
      undefined,
      undefined,
      [succeeded('start')],
    )[0];
    expect(incompleteEdge.className).toBe('automation-graph-edge');
    expect(incompleteEdge.data).toMatchObject({ condition: 'success',runSucceeded: false,selected: false });
    const completedEdge = graphEdges([edge], '', false, '', undefined, undefined, undefined, [succeeded('start'),succeeded('delay')])[0];
    expect(completedEdge.className).toBe('automation-graph-edge');
    expect(completedEdge.data).toMatchObject({ condition: 'success',runSucceeded: true,selected: false });
    expect(completedEdge.markerEnd).toMatchObject({ color: 'var(--color-text-muted)' });
    const waiting = (nodeId: string): AutomationNodeExecutionSummary => ({ ...succeeded(nodeId),status: 'waiting' });
    expect(graphEdges([{ ...edge,sourcePort: 'ready' }], '', false, '', undefined, undefined, undefined, [waiting('start'),succeeded('delay')])[0].data)
      .toMatchObject({ runSucceeded: false });
    expect(graphEdges([edge], '', false, '', undefined, undefined, undefined, [succeeded('start'),waiting('delay')])[0].data)
      .toMatchObject({ runSucceeded: false });
    expect(graphEdges([{ ...edge,sourcePort: 'ready',route: 'ready' }])[0].label).toBeUndefined();

    const { container } = render(<div style={{ width: 500,height: 300 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('trigger.manual'),id: 'start' },
          { ...newAutomationNode('delay'),id: 'delay' },
        ],
        edges: [edge],
      }}
      catalog={[]}
      nodeSummaries={[succeeded('start'),succeeded('delay')]}
      selectedEdgeId={edge.id}
    /></div>);
    await waitFor(() => expect(container.querySelector('[data-xgc-role="automation-edge"]')).not.toBeNull());
    const owner = container.querySelector('[data-xgc-role="automation-edge"][data-xgc-id="start-delay"]')!;
    expect(owner).toHaveAttribute('data-xgc-condition', 'success');
    expect(owner).toHaveAttribute('data-xgc-run-succeeded', 'true');
    expect(owner).toHaveAttribute('data-xgc-selected', 'true');
    expect(owner.querySelector('.automation-edge-hit')).not.toBeNull();
    expect(owner.closest('.automation-graph-edge')).toHaveClass('automation-graph-edge');
  });

  it('renders every trigger kind with a trusted icon and source handles only', () => {
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('trigger.manual'),id: 'trigger-manual',displayName: 'Run now' },
          { ...newAutomationNode('trigger.schedule'),id: 'trigger-schedule',displayName: 'Every morning' },
          { ...newAutomationNode('trigger.form-submission'),id: 'trigger-form',displayName: 'Submit intake' },
          { ...newAutomationNode('trigger.chat-message'),id: 'trigger-chat',displayName: 'Receive message' },
          { ...newAutomationNode('trigger.webhook'),id: 'trigger-webhook',displayName: 'Receive webhook' },
          { ...newAutomationNode('trigger.automation-call'),id: 'trigger-automation-call',displayName: 'Called by workflow' },
        ],
        edges: [],
      }}
      catalog={[
        { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: {} },
        { kind: 'trigger.schedule',typeVersion: 1,label: 'Schedule trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.schedule'),parameterSchema: {} },
        { kind: 'trigger.form-submission',typeVersion: 1,label: 'On form submission',category: 'Trigger',traits: automationCatalogTraits('trigger.form-submission'),parameterSchema: {} },
        { kind: 'trigger.chat-message',typeVersion: 1,label: 'On chat message',category: 'Trigger',traits: automationCatalogTraits('trigger.chat-message'),parameterSchema: {} },
        { kind: 'trigger.webhook',typeVersion: 1,label: 'On webhook call',category: 'Trigger',traits: automationCatalogTraits('trigger.webhook'),parameterSchema: {} },
        { kind: 'trigger.automation-call',typeVersion: 1,label: 'When called by Automation',category: 'Trigger',traits: automationCatalogTraits('trigger.automation-call'),parameterSchema: {} },
      ]}
      nodeComposition={callGraphNodeComposition}
    /></div>);

    const manual = container.querySelector<HTMLElement>('[data-testid="rf__node-trigger-manual"] [data-xgc-role="automation-node"]')!;
    const schedule = container.querySelector<HTMLElement>('[data-testid="rf__node-trigger-schedule"] [data-xgc-role="automation-node"]')!;
    const form = container.querySelector<HTMLElement>('[data-testid="rf__node-trigger-form"] [data-xgc-role="automation-node"]')!;
    const chat = container.querySelector<HTMLElement>('[data-testid="rf__node-trigger-chat"] [data-xgc-role="automation-node"]')!;
    const webhook = container.querySelector<HTMLElement>('[data-testid="rf__node-trigger-webhook"] [data-xgc-role="automation-node"]')!;
    const automationCall = container.querySelector<HTMLElement>('[data-testid="rf__node-trigger-automation-call"] [data-xgc-role="automation-node"]')!;
    expect(manual).toHaveAttribute('title', 'Run now');
    expect(schedule).toHaveAttribute('title', 'Every morning');
    expect(manual).toHaveTextContent('Run now');
    expect(schedule).toHaveTextContent('Every morning');
    expect(manual.querySelector('.lucide-mouse-pointer-click')).not.toBeNull();
    expect(schedule.querySelector('.lucide-calendar-clock')).not.toBeNull();
    expect(form.querySelector('.lucide-rectangle-ellipsis')).not.toBeNull();
    expect(chat.querySelector('.lucide-message-circle')).not.toBeNull();
    expect(webhook.querySelector('.lucide-webhook')).not.toBeNull();
    expect(automationCall.querySelector('.lucide-git-pull-request-arrow')).not.toBeNull();
    for (const trigger of [manual,schedule,form,chat,webhook,automationCall]) {
      expect(trigger.querySelector('[data-xgc-role="automation-node-target-handle"]')).toBeNull();
      expect(trigger.querySelector('[data-xgc-role="automation-node-source-handle"]')).not.toBeNull();
    }
  });

  it('drops a node by its stable library item ID instead of its shared runtime kind', async () => {
    const onLibraryDrop = vi.fn();
    const onReady = vi.fn();
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{ nodes: [],edges: [] }}
      catalog={[]}
      editable
      onReady={onReady}
      onLibraryDrop={onLibraryDrop}
    /></div>);
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    const flow = container.querySelector<HTMLElement>('.react-flow__pane')!;
    const dataTransfer = {
      dropEffect: 'none',
      getData: vi.fn((type: string) => type === 'text/xgc-automation-node-library-item' ? 'process-preset:roscore' : ''),
    };

    fireEvent.dragOver(flow, { dataTransfer });
    fireEvent.drop(flow, { clientX: 120,clientY: 80,dataTransfer });

    await waitFor(() => expect(onLibraryDrop).toHaveBeenCalledWith(
      'process-preset:roscore',
      expect.objectContaining({ x: expect.any(Number),y: expect.any(Number) }),
    ));
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('selects on click, opens properties on double click, and exposes hover actions', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{ nodes: [{ ...newAutomationNode('notification'),id: 'notify',displayName: 'Notify team' }],edges: [] }}
      catalog={[{ kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: {} }]}
      editable
      onNodeSelect={onSelect}
      onNodeOpen={onOpen}
      onNodeDuplicate={onDuplicate}
      onNodesDelete={onDelete}
    /></div>);

    const wrapper = container.querySelector<HTMLElement>('[data-testid="rf__node-notify"]')!;
    fireEvent.click(wrapper);
    expect(onSelect).toHaveBeenCalledWith('notify');
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.doubleClick(wrapper.querySelector('[data-xgc-role="automation-node-tile"]')!);
    fireEvent.doubleClick(wrapper.querySelector('[data-xgc-role="automation-node-display-name"]')!);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-xgc-role="automation-node-display-name-input"]')).toBeNull();

    fireEvent.mouseEnter(wrapper);
    const toolbar = container.querySelector<HTMLElement>('[data-xgc-role="automation-node-actions"][data-xgc-id="notify"]')!;
    expect(toolbar).not.toBeNull();
    expect(toolbar.style.transform).toContain('translate(-50%, -100%)');
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Open node properties' }));
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Duplicate node' }));
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Delete node' }));
    expect(onDuplicate).toHaveBeenCalledWith('notify');
    expect(onDelete).toHaveBeenCalledWith(['notify']);
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('keeps hover actions available from the Gazebo server node content', () => {
    const onNodeRunTo = vi.fn();
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{ nodes: [{
        ...newAutomationNode('process.run-definition', { definitionId: 'gazebo-server',parameters: {} }),
        id: 'gazebo-server',
        displayName: 'Gazebo server',
      }],edges: [] }}
      catalog={[{
        kind: 'process.run-definition',typeVersion: 1,label: 'Run process definition',category: 'Process',
        traits: automationCatalogTraits('process.run-definition'),parameterSchema: {},
        outputPorts: [{ id: 'ready',label: 'Ready' },{ id: 'error',label: 'Error' }],
      }]}
      editable
      canRunToNode
      onNodeRunTo={onNodeRunTo}
    /></div>);

    const wrapper = container.querySelector<HTMLElement>('[data-testid="rf__node-gazebo-server"]')!;
    const node = wrapper.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="gazebo-server"]')!;
    fireEvent.mouseEnter(node.querySelector('.automation-node-output-ports')!);

    const toolbar = container.querySelector<HTMLElement>('[data-xgc-role="automation-node-actions"][data-xgc-id="gazebo-server"]')!;
    expect(toolbar).not.toBeNull();
    expect(within(toolbar).getByRole('button', { name: 'Open node properties' })).toBeVisible();
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Run to this node' }));
    expect(within(toolbar).getByRole('button', { name: 'Duplicate node' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Delete node' })).toBeVisible();
    expect(onNodeRunTo).toHaveBeenCalledWith('gazebo-server');
  });

  it('renames an editable node inline by F2 or Enter', () => {
    const onRename = vi.fn();
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{ nodes: [{ ...newAutomationNode('notification'),id: 'notify',displayName: 'Notify team' }],edges: [] }}
      catalog={[{ kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: {} }]}
      editable
      onNodeDisplayNameChange={onRename}
    /></div>);

    const node = container.querySelector<HTMLElement>('[data-xgc-role="automation-node"][data-xgc-id="notify"]')!;
    node.focus();
    fireEvent.keyDown(node, { key: 'F2' });
    let input = container.querySelector<HTMLInputElement>('[data-xgc-role="automation-node-display-name-input"][data-xgc-id="notify"] input')!;
    fireEvent.change(input, { target: { value: 'Alert operators' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('notify', 'Alert operators');

    node.focus();
    fireEvent.keyDown(node, { key: 'F2' });
    input = container.querySelector<HTMLInputElement>('[data-xgc-role="automation-node-display-name-input"][data-xgc-id="notify"] input')!;
    fireEvent.change(input, { target: { value: 'Discarded name' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).toHaveBeenCalledTimes(1);

    node.focus();
    fireEvent.keyDown(node, { key: 'Enter' });
    input = container.querySelector<HTMLInputElement>('[data-xgc-role="automation-node-display-name-input"][data-xgc-id="notify"] input')!;
    fireEvent.change(input, { target: { value: 'Notify pilots' } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenLastCalledWith('notify', 'Notify pilots');
  });

  it('uses trusted kind icons, then category and generic fallbacks', () => {
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('notification'),id: 'known',typeVersion: 2,displayName: 'Notify' },
          { ...newAutomationNode('custom.process'),id: 'category',displayName: 'Custom process' },
          { ...newAutomationNode('custom.unknown'),id: 'fallback',displayName: 'Custom node' },
        ],
        edges: [],
      }}
      catalog={[
        { kind: 'notification',typeVersion: 2,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: {} },
        automationCatalogFixture({ kind: 'custom.process',typeVersion: 1,label: 'Custom process',category: 'Process',traits: ['effect'],parameterSchema: {} }),
        automationCatalogFixture({ kind: 'custom.unknown',typeVersion: 1,label: 'Custom node',category: 'Other',traits: ['effect'],parameterSchema: {} }),
      ]}
      nodeComposition={groundStationNodeComposition}
    /></div>);

    expect(container.querySelector('[data-xgc-id="known"] .lucide-bell-ring')).not.toBeNull();
    expect(container.querySelector('[data-xgc-id="category"] .lucide-server-cog')).not.toBeNull();
    expect(container.querySelector('[data-xgc-id="fallback"] .lucide-sparkles')).not.toBeNull();
  });

  it('shows insert and delete actions at the midpoint of a hovered connection', () => {
    const onInsert = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(<AutomationEdgeActions
      id="start-notify"
      position={{ x: 120,y: 40 }}
      editable
      onInsert={onInsert}
      onDelete={(id) => onDelete([id])}
    />);
    const toolbar = container.querySelector<HTMLElement>('[data-xgc-role="automation-edge-actions"][data-xgc-id="start-notify"]')!;
    expect(within(toolbar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Insert node','Delete connection']);
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Insert node' }));
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Delete connection' }));
    expect(onInsert).toHaveBeenCalledWith('start-notify', { x: 120,y: 40 });
    expect(onDelete).toHaveBeenCalledWith(['start-notify']);
    expect(graphEdges([{ id: 'start-notify',from: 'start',to: 'notify' } as AutomationEdge])[0]).toMatchObject({ interactionWidth: 40 });
  });

  it('deletes the selected canvas node with the keyboard Delete key', async () => {
    const onDelete = vi.fn();
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{
        nodes: [
          { ...newAutomationNode('trigger.manual'),id: 'start' },
          { ...newAutomationNode('notification'),id: 'notify' },
        ],
        edges: [{ id: 'start-notify',from: 'start',to: 'notify',condition: 'success' }],
      }}
      catalog={[
        { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: {} },
        { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: {} },
      ]}
      editable
      onElementsDelete={onDelete}
    /></div>);

    fireEvent.click(container.querySelector('[data-testid="rf__node-notify"]')!);
    fireEvent.keyDown(document, { key: 'Delete',code: 'Delete' });
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith({
      nodeIds: ['notify'],
      edgeIds: ['start-notify'],
      stickyNoteIds: [],
    }));
  });

  it('renders an editable sticky note as a handle-free canvas annotation', () => {
    const note = newAutomationStickyNote('note-1', { x: 80,y: 40 });
    const onChange = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(<div style={{ width: 700,height: 400 }}><AutomationGraph
      definition={{ nodes: [{ ...newAutomationNode('trigger.manual'),id: 'start' }],edges: [],stickyNotes: [note] }}
      catalog={[{ kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'Trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: {} }]}
      editable
      onStickyNoteChange={onChange}
      onStickyNoteDelete={onDelete}
    /></div>);

    const sticky = container.querySelector<HTMLElement>('[data-xgc-role="automation-sticky-note"][data-xgc-id="note-1"]')!;
    expect(sticky).not.toBeNull();
    expect(sticky.querySelector('[data-xgc-role="automation-node-target-handle"]')).toBeNull();
    expect(sticky.querySelector('[data-xgc-role="automation-node-source-handle"]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-testid="rf__node-sticky-note:note-1"]')?.style.width).toBe('240px');
    expect(sticky).toHaveTextContent("I'm a note");

    fireEvent.doubleClick(sticky);
    const editor = sticky.querySelector<HTMLTextAreaElement>('textarea[aria-label="Sticky note content"]')!;
    fireEvent.change(editor, { target: { value: 'Mission note' } });
    fireEvent.blur(editor);
    expect(onChange).toHaveBeenCalledWith('note-1', { content: 'Mission note' });
  });

  it('rejects a connection that would turn the saved graph into a cycle', () => {
    const nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'a' },
      { ...newAutomationNode('notification'),id: 'b' },
      { ...newAutomationNode('merge'),id: 'c' },
    ];
    const edges = [
      { id: 'a-b',from: 'a',to: 'b',condition: 'success' as const },
      { id: 'b-c',from: 'b',to: 'c',condition: 'success' as const },
      { id: 'c-a',from: 'c',to: 'a',condition: 'success' as const },
    ];

    expect(graphHasCycle(nodes, edges)).toBe(true);
    expect(graphHasCycle(nodes, edges.slice(0, 2))).toBe(false);
  });
});

function GraphInteractionHarness() {
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [openedNodeId, setOpenedNodeId] = useState('');
  return (
    <div style={{ width: 700,height: 400 }}>
      <AutomationGraph
        definition={GRAPH_INTERACTION_DEFINITION}
        catalog={GRAPH_INTERACTION_CATALOG}
        selectedNodeId={selectedNodeId}
        editable
        onNodeSelect={setSelectedNodeId}
        onNodeOpen={(id) => {
          setSelectedNodeId(id);
          setOpenedNodeId(id);
        }}
        onSelectionClear={() => {
          setSelectedNodeId('');
          setOpenedNodeId('');
        }}
      />
      <output data-testid="selected-node">{selectedNodeId}</output>
      <output data-testid="opened-node">{openedNodeId}</output>
    </div>
  );
}

const GRAPH_INTERACTION_DEFINITION = {
  nodes: [{ ...newAutomationNode('notification'),id: 'notify',displayName: 'Notify team' }],
  edges: [],
};
const GRAPH_INTERACTION_CATALOG = [
  { kind: 'notification',typeVersion: 1,label: 'Notification',category: 'Action',traits: automationCatalogTraits('notification'),parameterSchema: {} },
];

describe('Automation canvas controls', () => {
  it('exposes add plus the four canvas actions in the requested order through stable selectors', () => {
    const actions = { add: vi.fn(),note: vi.fn(),fit: vi.fn(),in: vi.fn(),out: vi.fn(),tidy: vi.fn() };
    const { container } = render(
      <AutomationCanvasControls
        onAdd={actions.add}
        onAddStickyNote={actions.note}
        onZoomToFit={actions.fit}
        onZoomIn={actions.in}
        onZoomOut={actions.out}
        onTidyUp={actions.tidy}
      />,
    );

    const controls = container.querySelector<HTMLElement>('[data-xgc-role="automation-canvas-controls"]')!;
    expect(within(controls).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Add node','Add sticky note','Zoom to fit','Zoom in','Zoom out','Tidy up']);
    expect(within(controls).getByRole('button', { name: 'Add sticky note' })).toHaveAttribute('aria-keyshortcuts', 'Shift+S');
    fireEvent.click(screen.getByRole('button', { name: 'Add node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add sticky note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom to fit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tidy up' }));

    expect(actions.add).toHaveBeenCalledOnce();
    expect(actions.note).toHaveBeenCalledOnce();
    expect(actions.fit).toHaveBeenCalledOnce();
    expect(actions.in).toHaveBeenCalledOnce();
    expect(actions.out).toHaveBeenCalledOnce();
    expect(actions.tidy).toHaveBeenCalledOnce();
  });

  it('omits unavailable authoring controls without moving the canvas controls', () => {
    const { container } = render(<AutomationCanvasControls
      onAdd={vi.fn()}
      onAddStickyNote={vi.fn()}
      onZoomToFit={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      onTidyUp={vi.fn()}
      addDisabled
      stickyNoteDisabled
      tidyDisabled
    />);
    const controls = container.querySelector<HTMLElement>('[data-xgc-role="automation-canvas-controls"]')!;
    expect(within(controls).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Zoom to fit','Zoom in','Zoom out',
    ]);
    expect(container.querySelector('[data-xgc-role="automation-node-library-open"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-sticky-note-add"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-tidy-up"]')).toBeNull();
  });
});

describe('tidyAutomationGraphPositions', () => {
	it('aligns ordinary nodes in a chain without a special size for ROS', () => {
		const nodes = [
			{ ...newAutomationNode('trigger.manual'),id: 'manual' },
			{ ...newAutomationNode('ros1.wait-roscore-ready'),id: 'wait' },
			{ ...newAutomationNode('process.run-definition', { definitionId: 'roscore' }),id: 'roscore' },
		];
		const edges = [
			{ id: 'manual-wait',from: 'manual',to: 'wait',condition: 'success' as const },
			{ id: 'wait-roscore',from: 'wait',to: 'roscore',condition: 'success' as const },
		];

		expect(tidyAutomationGraphPositions(nodes, edges)).toEqual({
			manual: { x: 0,y: 0 },
			wait: { x: 324,y: 0 },
			roscore: { x: 648,y: 0 },
		});
	});

  it('lays out a DAG by depth and gives peers separate rows', () => {
    const nodes = ['start','left','right','join'].map((id, index) => ({ id,displayName: id,kind: 'test',parameters: {},position: { x: index * 3,y: index * 7 } })) as AutomationNode[];
    const edges = [
      { id: 'a',from: 'start',to: 'left' },
      { id: 'b',from: 'start',to: 'right' },
      { id: 'c',from: 'left',to: 'join' },
      { id: 'd',from: 'right',to: 'join' },
    ] as AutomationEdge[];

    expect(tidyAutomationGraphPositions(nodes, edges)).toEqual({
      start: { x: 0,y: 0 },
      left: { x: 324,y: -76 },
      right: { x: 324,y: 76 },
      join: { x: 648,y: 0 },
    });
  });

  it('uses generous aligned columns and centers every layer around the canvas axis', () => {
    const nodes = ['start','a','b','c','finish'].map((id) => ({ id,displayName: id,kind: 'test',parameters: {} })) as AutomationNode[];
    const edges = [
      { id: 'start-a',from: 'start',to: 'a' },
      { id: 'start-b',from: 'start',to: 'b' },
      { id: 'start-c',from: 'start',to: 'c' },
      { id: 'a-finish',from: 'a',to: 'finish' },
      { id: 'b-finish',from: 'b',to: 'finish' },
      { id: 'c-finish',from: 'c',to: 'finish' },
    ] as AutomationEdge[];

    expect(tidyAutomationGraphPositions(nodes, edges)).toEqual({
      start: { x: 0,y: 0 },
      a: { x: 324,y: -152 },
      b: { x: 324,y: 0 },
      c: { x: 324,y: 152 },
      finish: { x: 648,y: 0 },
    });
  });
  it('leaves clearance for every named output, including more than five and inferred ports', () => {
    const ports = Array.from({ length: 7 },(_,index) => ({ id: `case-${index}`,label: `Case ${index}` }));
    const source = { ...newAutomationNode('switch'),id: 'branch' };
    const peer = { ...newAutomationNode('notification'),id: 'peer' };
    const finish = { ...newAutomationNode('notification'),id: 'finish' };
    const catalog = [automationCatalogFixture({ kind: 'switch',typeVersion: 1,label: 'Switch',category: 'control',parameterSchema: {},outputPorts: ports })];
    const edges: AutomationEdge[] = ports.map((port) => ({ id: port.id,from: source.id,to: finish.id,sourcePort: port.id,condition: 'success' }));
    const catalogHeight = automationGraphNodeHeight(source,catalog[0],edges);
    expect(automationGraphNodeHeight(source,undefined,edges)).toBe(catalogHeight);
    const positions = tidyAutomationGraphPositions([source,peer,finish],edges,catalog);
    expect(Math.abs(positions.peer.y - positions.branch.y)).toBeGreaterThanOrEqual(catalogHeight + 72);
    expect(positions.finish.x - positions.branch.x).toBeGreaterThan(216 + 64);
  });

});
