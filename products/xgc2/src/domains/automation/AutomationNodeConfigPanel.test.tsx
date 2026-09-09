// @vitest-environment jsdom

import { fireEvent,render,screen,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { AutomationNodeConfigPanel } from './AutomationNodeConfigPanel';
import { automationCatalogTraits } from './automationCatalogTestFixtures';
import { AUTOMATION_INPUT_FIELD_DRAG_TYPE,automationInputFieldExpression } from './automationInputExpression';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import { newAutomationNode } from './automationSpecModel';
import { composeAutomationNodeWeb } from './nodes/automationNodeWebComposition';
import { coreFlowAutomationNodeContributions } from './nodes/coreFlow/coreFlowAutomationNodeContributions';
import { processAutomationNodeContributions } from './nodes/process/processAutomationNodeContributions';
import { DEFAULT_BASH_COMMAND_BLOCKLIST } from './nodes/process/processBashStaticValidation';

const fixtureRosMasterURI = 'http://ros-master.test:11311';
const coreFlowNodeComposition = composeAutomationNodeWeb(...coreFlowAutomationNodeContributions);
const processNodeComposition = composeAutomationNodeWeb(...processAutomationNodeContributions);

const catalog: AutomationNodeCatalogEntry = {
  kind: 'process.run-definition',
  typeVersion: 2,
  label: 'Run process definition',
  category: 'Process',traits: automationCatalogTraits('process.run-definition'),
  parameterSchema: {
    type: 'object',
    required: ['definitionId','parameters'],
    properties: { definitionId: { type: 'string' },parameters: { type: 'object' } },
  },
};

const processSchema = {
  type: 'object',
  properties: { port: { type: 'integer',title: 'Port',default: 11311,minimum: 1,maximum: 65535,'x-xgc-expression': true } },
};

const delayCatalog: AutomationNodeCatalogEntry = {
  kind: 'delay',
  typeVersion: 2,
  label: 'Delay',
  category: 'Control',traits: automationCatalogTraits('delay'),
  parameterSchema: {
    type: 'object',
    required: ['resume','amount','unit'],
    properties: {
      resume: { type: 'string',title: 'Resume',enum: ['timeInterval'],enumNames: ['After Time Interval'],default: 'timeInterval' },
      amount: { type: 'number',title: 'Wait Amount',minimum: 0,default: 2,'x-xgc-expression': true },
      unit: { type: 'string',title: 'Wait Unit',enum: ['seconds','minutes','hours','days'],enumNames: ['Seconds','Minutes','Hours','Days'],default: 'seconds' },
    },
  },
};

describe('AutomationNodeConfigPanel', () => {
  it('authors one ROS1 Run / Launch node as setup.bash followed by a direct command', () => {
    const ros1Catalog: AutomationNodeCatalogEntry = {
      kind: 'ros1.run',typeVersion: 2,label: 'ROS1 Run / Launch',category: 'ros1',traits: ['effect','wait'],
      parameterSchema: { type: 'object',additionalProperties: false,required: ['setupBash','command'],properties: {
        setupBash: { type: 'string',title: 'ROS1 setup.bash',default: '/opt/ros/noetic/setup.bash','x-xgc-path-kind': 'file','x-xgc-order': 10,'x-xgc-expression': true },
        command: { type: 'string',title: 'Command (rosrun / roslaunch)',default: '','x-xgc-order': 20,'x-xgc-expression': true },
      } },
    };
    const node = { ...newAutomationNode('ros1.run', {
      setupBash: '/opt/ros/noetic/setup.bash',command: 'rosrun demo talker',
    }, 'ROS1 Run / Launch', 2),id: 'ros1-command' };
    const onChange = vi.fn();
    const view = render(<AutomationNodeConfigPanel
      node={node}
      catalog={ros1Catalog}
      nodeComposition={processNodeComposition}
      onChange={onChange}
      onError={vi.fn()}
    />);

    const setup = screen.getByLabelText('ROS1 setup.bash');
    const command = screen.getByLabelText('Command (rosrun / roslaunch)');
    const setupField = setup.closest('[data-xgc-role="automation-node-path-parameter"]');
    const commandField = command.closest('[data-xgc-role="automation-node-parameter"]');
    expect(setupField).toHaveAttribute('data-xgc-id', 'ros1-command:setupBash');
    expect(commandField).toHaveAttribute('data-xgc-id', 'ros1-command:command');
    expect(setupField?.compareDocumentPosition(commandField!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(screen.getByRole('group', { name: 'ROS1 setup.bash value source' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Command (rosrun / roslaunch) value source' })).toBeInTheDocument();
		expect(view.container.querySelector(
			'[data-xgc-role="automation-node-parameter-mode"][data-xgc-id="ros1-command:/command:expression"]',
		)).toBeInTheDocument();
    expect(screen.queryByLabelText('Package')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Args JSON')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Executable')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Launch file')).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"]')).toBeNull();

    fireEvent.change(command, { target: { value: 'roslaunch demo robot.launch' } });
    expect(onChange).toHaveBeenCalledWith({ parameters: {
      setupBash: '/opt/ros/noetic/setup.bash',command: 'roslaunch demo robot.launch',
    } });
  });

  it('keeps environment setup in the multiline Bash command instead of exposing a second JSON control', () => {
    const bashCatalog: AutomationNodeCatalogEntry = {
      kind: 'process.run-bash',typeVersion: 1,label: 'Run Bash command',category: 'process',traits: ['effect','wait'],
      parameterSchema: { type: 'object',required: ['command'],properties: {
        command: { type: 'string',title: 'Bash command','x-xgc-control': 'textarea' },
        commandBlocklist: {
          type: 'string',title: 'Blocked command patterns',default: DEFAULT_BASH_COMMAND_BLOCKLIST,'x-xgc-control': 'textarea',
        },
        timeoutSeconds: { type: 'integer',title: 'Timeout seconds',default: 0 },
      } },
    };
    const node = { ...newAutomationNode('process.run-bash', {
      command: 'echo first',commandBlocklist: DEFAULT_BASH_COMMAND_BLOCKLIST,timeoutSeconds: 0,
    }, 'Run Bash command', 1),id: 'bash' };
    const onChange = vi.fn();
    const onError = vi.fn();
    const view = render(<AutomationNodeConfigPanel
      node={node}
      catalog={bashCatalog}
      nodeComposition={processNodeComposition}
      onChange={onChange}
      onError={onError}
    />);

    const editor = screen.getByLabelText('Bash command');
    expect(editor.tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Blocked command patterns')).toHaveValue(DEFAULT_BASH_COMMAND_BLOCKLIST);
    const fields = [...view.container.querySelectorAll('.automation-node-parameter-field > label')]
      .map((field) => field.textContent);
    expect(fields.indexOf('Blocked command patterns')).toBe(fields.indexOf('Bash command') + 1);
    expect(screen.queryByText('Environment overrides')).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="bash:environment"]')).toBeNull();
    fireEvent.change(editor, { target: { value: 'export ROS_MASTER_URI=http://core:11311\nsource /opt/ros/noetic/setup.bash\nroslaunch pkg robot.launch' } });
    expect(onChange).toHaveBeenCalledWith({ parameters: {
      ...node.parameters,
      command: 'export ROS_MASTER_URI=http://core:11311\nsource /opt/ros/noetic/setup.bash\nroslaunch pkg robot.launch',
    } });
    view.rerender(<AutomationNodeConfigPanel
      node={{ ...node,parameters: { ...node.parameters,command: 'rm -rf /*' } }}
      catalog={bashCatalog}
      nodeComposition={processNodeComposition}
      onChange={onChange}
      onError={onError}
    />);
    expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/matches blocked command pattern/));
  });

  it('edits IF conditions as expressions, operators, values, and AND/OR without exposing storage fields', () => {
    const conditionCatalog: AutomationNodeCatalogEntry = {
      kind: 'condition',typeVersion: 2,label: 'IF',category: 'Control',traits: automationCatalogTraits('condition'),
      parameterSchema: { type: 'object',properties: {
        source: { type: 'string',title: 'Source' },
        inputNode: { type: 'string',title: 'Input node' },
        itemsPath: { type: 'string',title: 'Items JSON Pointer' },
        combinator: { type: 'string',title: 'Match' },
        conditions: { type: 'array',title: 'Conditions' },
      } },
    };
    const node = {
      ...newAutomationNode('condition', {
        source: 'run',itemsPath: '',combinator: 'all',
        conditions: [
          { path: '/autoStartAdapters',operator: 'equals',value: true },
          { path: '/rosMasterUri',operator: 'notEmpty' },
        ],
      }, 'Read autoStartAdapters', 2),
      id: 'if-adapters',
    };
    const onChange = vi.fn();
    const { container } = render(<AutomationNodeConfigPanel node={node} catalog={conditionCatalog} nodeComposition={coreFlowNodeComposition} onChange={onChange} onError={vi.fn()} />);

    expect(screen.getByLabelText('Condition 1 expression')).toHaveValue('{{ $run.parameters.autoStartAdapters }}');
    expect(screen.getByRole('button', { name: 'Condition 1 operator' })).toHaveTextContent('Is equal to');
    expect(screen.getByLabelText('Condition 1 value')).toHaveValue('true');
    expect(screen.getByLabelText('Condition 2 expression')).toHaveValue('{{ $run.parameters.rosMasterUri }}');
    expect(screen.getByLabelText('Condition 2 value not required')).toBeDisabled();
    const conditionOneMode = screen.getByRole('group', { name: 'Condition 1 value source' });
    const conditionTwoMode = screen.getByRole('group', { name: 'Condition 2 value source' });
    expect(within(conditionOneMode).getByRole('button', { name: 'Expression' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(conditionTwoMode).getByRole('button', { name: 'Expression' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="if-adapters:source"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="if-adapters:conditions"]')).toBeNull();

    fireEvent.click(within(conditionOneMode).getByRole('button', { name: 'Fixed' }));
    expect(onChange).toHaveBeenLastCalledWith({ parameters: {
      ...node.parameters,
      conditions: [
        { path: '/autoStartAdapters',operator: 'equals',value: true,leftMode: 'fixed',leftValue: '' },
        { path: '/rosMasterUri',operator: 'notEmpty' },
      ],
    } });

    fireEvent.click(within(screen.getByRole('group', { name: 'Condition matching' })).getByRole('button', { name: 'OR' }));
    expect(onChange).toHaveBeenLastCalledWith({ parameters: { ...node.parameters,combinator: 'any' } });
  });

  it('accepts a dragged Run parameter in an IF expression and stores the compatible source and pointer', () => {
    const node = {
      ...newAutomationNode('condition', {
        source: 'run',itemsPath: '',combinator: 'all',
        conditions: [{ path: '/old',operator: 'equals',value: true }],
      }, 'IF', 2),
      id: 'if-run',
    };
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} nodeComposition={coreFlowNodeComposition} onChange={onChange} onError={vi.fn()} />);
    const editor = screen.getByLabelText('Condition 1 expression');
    const payload = JSON.stringify({
      version: 1,sourceId: 'run.parameters',multipleSources: false,
      segments: ['autoStartAdapters'],scope: 'run-parameters',
    });
    const dataTransfer = {
      types: [AUTOMATION_INPUT_FIELD_DRAG_TYPE],
      dropEffect: 'none',
      getData: vi.fn((type: string) => type === AUTOMATION_INPUT_FIELD_DRAG_TYPE ? payload : ''),
    };

    fireEvent.drop(editor, { dataTransfer });

    expect(onChange).toHaveBeenCalledWith({ parameters: {
      ...node.parameters,
      source: 'run',
      inputNode: undefined,
      itemsPath: '',
      conditions: [{ path: '/autoStartAdapters',operator: 'equals',value: true }],
    } });
  });

  it('keeps Fixed or Expression mode independent for every IF condition', () => {
    const node = {
      ...newAutomationNode('condition', {
        source: 'run',itemsPath: '',combinator: 'all',
        conditions: [
          { path: '/ignored',leftMode: 'fixed',leftValue: true,operator: 'equals',value: true },
          { path: '/autoStartAdapters',leftMode: 'expression',operator: 'equals',value: true },
        ],
      }, 'IF', 2),
      id: 'if-independent',
    };
    const { container } = render(<AutomationNodeConfigPanel node={node} nodeComposition={coreFlowNodeComposition} onChange={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByLabelText('Condition 1 fixed left value')).toHaveValue('true');
    expect(screen.queryByLabelText('Condition 1 expression')).toBeNull();
    expect(screen.getByLabelText('Condition 2 expression')).toHaveValue('{{ $run.parameters.autoStartAdapters }}');
    expect(within(screen.getByRole('group', { name: 'Condition 1 value source' })).getByRole('button', { name: 'Fixed' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Condition 2 value source' })).getByRole('button', { name: 'Expression' }))
      .toHaveAttribute('aria-pressed', 'true');
    const firstControls = container.querySelector('[data-xgc-role="automation-condition-row"][data-xgc-id="if-independent:0"] .automation-condition-controls')!;
    expect(firstControls.querySelector('[data-xgc-role="automation-condition-remove"]')).not.toBeNull();
  });

	it('uses one JSON template editor for known ROS1 messages while message types remain open', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
			parameterSchema: { type: 'object',required: ['topic','messageType','message'],properties: {
				topic: { type: 'string',title: 'Topic' },messageType: { type: 'string',title: 'Message type',pattern: '^[A-Za-z][A-Za-z0-9_]*/[A-Za-z][A-Za-z0-9_]*$','x-xgc-expression': true },message: { type: 'object',title: 'Message',default: { data: '' },'x-xgc-expression': true },
			} },
		};
		const node = { ...newAutomationNode('ros1.publish-topic', { topic: '/mavros/cmd/arming',messageType: 'std_msgs/Bool',message: { data: false } }, 'Publish', 3),id: 'ros1-publish-topic' };
		const onChange = vi.fn();
		const onError = vi.fn();
		const { container } = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={onError} />);

		expect(container.querySelector('[data-xgc-role="automation-node-property-tabs"]'))
			.toHaveClass('xgc-tab-strip','automation-pane-tabs','automation-node-pane-tabs','automation-node-property-tabs');
		expect(screen.getByText('Node properties')).toHaveClass('automation-node-pane-title');
		expect(screen.getByText('Node properties').tagName).toBe('SPAN');
		expect(container.querySelector('[data-xgc-role="automation-node-inspector"][data-xgc-id="ros1-publish-topic"]')).toHaveAttribute('data-xgc-required-markers', 'hidden');
		expect(container.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="ros1-publish-topic:topic"] .xgc-form-field-description')).toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node-property-tabs"]')).toHaveAttribute('data-size','default');
		expect(container.querySelector('[data-xgc-role="automation-node-property-tabs"]')).toHaveAttribute('data-variant','contained');
		expect(screen.getByRole('tab', { name: 'Parameters' })).toHaveClass('xgc-tab-item', 'xgc-tab-control');
		expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('data-xgc-role', 'automation-node-property-tab');
		expect(screen.getByRole('tab', { name: 'Parameters' })).toHaveAttribute('aria-selected', 'true');
		const messageType = screen.getByLabelText('Message type');
		expect(screen.getByRole('group', { name: 'Message type value source' })).toBeInTheDocument();
		expect(messageType).toHaveTextContent('std_msgs/Bool');
		expect(messageType).toHaveAttribute('aria-haspopup', 'listbox');
		const messageTypeField = container.querySelector('[data-xgc-role="automation-ros1-message-type"][data-xgc-id="ros1-publish-topic"]');
		expect(messageTypeField).toHaveAttribute('data-required', 'true');
		expect(messageTypeField?.querySelector('.xgc-form-field-description')).toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-ros1-message-type-select"][data-xgc-id="ros1-publish-topic"]')).toHaveAttribute('data-xgc-control', 'select');
		expect(container.querySelector('[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="ros1-publish-topic:/message"]'))
			.toHaveAttribute('data-xgc-mode-placement', 'label-row');
		expect(container.querySelector('[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="ros1-publish-topic:/message"] > .automation-parameter-mode-row'))
			.not.toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-node-parameter-mode"][data-xgc-id="ros1-publish-topic:/message:fixed"]'))
			.toHaveAttribute('aria-pressed', 'true');
		const messageEditor = container.querySelector<HTMLTextAreaElement>(
			'[data-xgc-role="automation-node-parameter-json"][data-xgc-id="ros1-publish-topic:message"] textarea',
		)!;
		expect(messageEditor).toHaveValue('{\n  "data": false\n}');
		expect(messageEditor.closest('.automation-json-terminal-template')).not.toBeNull();
		expect(messageEditor.closest('.automation-json-terminal-template')?.querySelector('.xgc-form-field-description')).toBeNull();
		expect(container.querySelector('[data-xgc-role="automation-ros1-message-field"]')).toBeNull();
		fireEvent.change(messageEditor, { target: { value: '{"data":true}' } });
		fireEvent.blur(messageEditor);
		expect(onChange).toHaveBeenCalledWith({ parameters: { topic: '/mavros/cmd/arming',messageType: 'std_msgs/Bool',message: { data: true } } });

		fireEvent.click(messageType);
		const messageTypeList = screen.getByRole('listbox', { name: 'Message type' });
		expect(messageTypeList.querySelector('.xgc-select-group-label')).toBeNull();
		expect(screen.getByRole('option', { name: 'mavros_msgs/PositionTarget' })).toHaveAttribute('data-xgc-id', 'ros1-publish-topic:mavros_msgs/PositionTarget');
		expect(screen.getByRole('option', { name: 'mavros_msgs/AttitudeTarget' })).toHaveAttribute('data-xgc-id', 'ros1-publish-topic:mavros_msgs/AttitudeTarget');
		fireEvent.click(screen.getByRole('option', { name: 'mavros_msgs/PositionTarget' }));
		expect(onChange).toHaveBeenLastCalledWith({ parameters: {
			topic: '/mavros/cmd/arming',messageType: 'mavros_msgs/PositionTarget',message: {
				header: { frame_id: '' },coordinate_frame: 1,type_mask: 3583,
				position: { x: 0,y: 0,z: 0 },velocity: { x: 0,y: 0,z: 0 },
				acceleration_or_force: { x: 0,y: 0,z: 0 },yaw: 0,yaw_rate: 0,
			},
		} });
		expect(onError).toHaveBeenLastCalledWith('');
	});

	it('offers ROS2 message templates with package/msg names', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros2.publish-topic',typeVersion: 1,label: 'Publish ROS2 topic',category: 'ros2',traits: ['effect'],
			parameterSchema: { type: 'object',required: ['messageType','message'],properties: {
				messageType: { type: 'string',title: 'Message type',pattern: '^[A-Za-z][A-Za-z0-9_]*/msg/[A-Za-z][A-Za-z0-9_]*$' },
				message: { type: 'object',title: 'Message',default: { data: '' },'x-xgc-expression': true },
			} },
		};
		const node = {
			...newAutomationNode('ros2.publish-topic', { messageType: 'std_msgs/msg/String',message: { data: '' } }, 'Publish ROS2', 1),
			id: 'ros2-publish-topic',
		};
		const onChange = vi.fn();
		const view = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);

		expect(view.container.querySelector('[data-xgc-role="automation-ros2-message-type"][data-xgc-id="ros2-publish-topic"] .xgc-form-field-description'))
			.toBeNull();
		const messageType = screen.getByLabelText('Message type');
		fireEvent.click(messageType);
		expect(screen.getByRole('option', { name: 'sensor_msgs/msg/Imu' })).toBeInTheDocument();
		fireEvent.click(screen.getByRole('option', { name: 'geometry_msgs/msg/Twist' }));
		expect(onChange).toHaveBeenLastCalledWith({ parameters: {
			messageType: 'geometry_msgs/msg/Twist',
			message: { linear: { x: 0,y: 0,z: 0 },angular: { x: 0,y: 0,z: 0 } },
		} });
		expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="ros2-publish-topic:message"] .xgc-form-field-description'))
			.toBeNull();
	});

	it('edits ROS1 publish count, rate, and latch at stable selectors', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
			parameterSchema: { type: 'object',required: ['publishCount','publishRateHz','latch'],properties: {
				publishCount: { type: 'integer',title: 'Publish count',description: 'Positive integers publish exactly that many messages. Zero or a negative integer publishes continuously until stopped.',maximum: 10000,default: 1 },
				publishRateHz: { type: 'number',title: 'Publish rate (Hz)',minimum: 0.1,maximum: 200,default: 1 },
				latch: { type: 'boolean',title: 'Latch',default: false },
			} },
		};
		const node = { ...newAutomationNode('ros1.publish-topic', { publishCount: 3,publishRateHz: 20,latch: false }, 'Publish', 3),id: 'ros1-publish-topic' };
		const onChange = vi.fn();
		const view = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);
		const latch = view.container.querySelector<HTMLElement>('[data-xgc-role="automation-node-parameter"][data-xgc-id="ros1-publish-topic:latch"]')!;
		const count = view.container.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="ros1-publish-topic:publishCount"] input')!;
		const rate = view.container.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="ros1-publish-topic:publishRateHz"] input')!;

		expect(count).toHaveValue(3);
		expect(count).not.toHaveAttribute('min');
		expect(count).toHaveAttribute('max', '10000');
		expect(rate).toHaveValue(20);
		expect(rate).toHaveAttribute('max', '200');
		const countField = view.container.querySelector<HTMLElement>('[data-xgc-role="automation-node-parameter"][data-xgc-id="ros1-publish-topic:publishCount"]')!;
		expect(within(countField).getByLabelText('Publish count (0 = unlimited)')).toBe(count);
		expect(countField.querySelector('.xgc-form-field-label')).toHaveTextContent('Publish count');
		expect(countField.querySelector('.xgc-input-unit')).toHaveTextContent('0 = unlimited');
		expect(countField).not.toHaveTextContent('Positive integers publish exactly that many messages');
		expect(countField.querySelector('.xgc-form-field-description')).toBeNull();
		expect(latch).toHaveTextContent('Latch');
		expect(latch).toHaveTextContent('Off');
		fireEvent.focus(count);
		fireEvent.change(count, { target: { value: '' } });
		expect(count).toHaveValue(null);
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.change(count, { target: { value: '5' } });
		expect(count).toHaveValue(5);
		expect(onChange).toHaveBeenLastCalledWith({ parameters: { publishCount: 5,publishRateHz: 20,latch: false } });
		fireEvent.change(count, { target: { value: '-1' } });
		expect(onChange).toHaveBeenLastCalledWith({ parameters: { publishCount: -1,publishRateHz: 20,latch: false } });
		fireEvent.focus(rate);
		fireEvent.change(rate, { target: { value: '' } });
		expect(rate).toHaveValue(null);
		fireEvent.change(rate, { target: { value: '12.5' } });
		expect(rate).toHaveValue(12.5);
		expect(onChange).toHaveBeenLastCalledWith({ parameters: { publishCount: 3,publishRateHz: 12.5,latch: false } });
		fireEvent.click(within(latch).getByRole('switch', { name: 'Latch' }));
		expect(onChange).toHaveBeenLastCalledWith({ parameters: { publishCount: 3,publishRateHz: 20,latch: true } });

		view.rerender(<AutomationNodeConfigPanel node={{ ...node,parameters: { publishCount: 3,publishRateHz: 20,latch: true } }} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);
		expect(view.container.querySelector('[data-xgc-role="automation-node-parameter"][data-xgc-id="ros1-publish-topic:latch"]'))
			.toHaveTextContent('On');
	});

	it('keeps the ROS1 message mode tabs on the expression label row', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
			parameterSchema: { type: 'object',required: ['messageType','message'],properties: {
				messageType: { type: 'string',title: 'Message type' },
				message: { type: 'object',title: 'Message',default: { data: '' },'x-xgc-expression': true },
			} },
		};
		const node = {
			...newAutomationNode('ros1.publish-topic', { messageType: 'std_msgs/Bool',message: { data: false } }, 'Publish', 3),
			id: 'ros1-publish-topic',
			parameterBindings: [{ target: '/message',expression: '{{ $input.message }}',language: 'xgc-expression-v2' as const }],
		};
		const { container } = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={vi.fn()} onError={vi.fn()} />);
		const binding = container.querySelector(
			'[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="ros1-publish-topic:/message"]',
		);

		expect(binding).toHaveAttribute('data-xgc-mode-placement', 'label-row');
		expect(container.querySelector(
			'[data-xgc-role="automation-node-parameter-mode"][data-xgc-id="ros1-publish-topic:/message:expression"]',
		)).toHaveAttribute('aria-pressed', 'true');
	});

	it('edits arbitrary installed ROS1 message types as strict JSON objects', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
			parameterSchema: { type: 'object',required: ['messageType','message'],properties: {
				messageType: { type: 'string',title: 'Message type',pattern: '^[A-Za-z][A-Za-z0-9_]*/[A-Za-z][A-Za-z0-9_]*$' },message: { type: 'object',title: 'Message',default: {} },
			} },
		};
		const node = { ...newAutomationNode('ros1.publish-topic', { messageType: 'acme_msgs/Telemetry',message: { sample: 42 } }, 'Publish', 3),id: 'publish' };
		const onChange = vi.fn();
		const onError = vi.fn();
		const view = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={onError} />);
		expect(screen.getByLabelText('Message type')).toHaveTextContent('acme_msgs/Telemetry');
		const editor = view.container.querySelector<HTMLTextAreaElement>('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="publish:message"] textarea')!;

		expect(editor).toHaveValue('{\n  "sample": 42\n}');
		fireEvent.change(editor, { target: { value: '{"sample":43,"nested":{"ok":true}}' } });
		fireEvent.blur(editor);
		expect(onChange).toHaveBeenCalledWith({ parameters: { messageType: 'acme_msgs/Telemetry',message: { sample: 43,nested: { ok: true } } } });
		expect(onError).toHaveBeenLastCalledWith('');

		onChange.mockClear();
		onError.mockClear();
		fireEvent.change(editor, { target: { value: '[]' } });
		fireEvent.blur(editor);
		expect(onChange).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith('Message: value must be a JSON object');

		onError.mockClear();
		fireEvent.change(editor, { target: { value: '{broken' } });
		fireEvent.blur(editor);
		expect(onChange).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(expect.stringContaining('Message:'));
	});

	it('edits known single-field ROS1 messages through the shared JSON template', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
			parameterSchema: { type: 'object',required: ['messageType','message'],properties: {
				messageType: { type: 'string',title: 'Message type' },message: { type: 'object',title: 'Message',default: { data: 0 } },
			} },
		};
		const node = { ...newAutomationNode('ros1.publish-topic', { messageType: 'std_msgs/Int32',message: { data: 0 } }, 'Publish', 3),id: 'publish' };
		const onChange = vi.fn();
		const { container } = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);

		const editor = container.querySelector<HTMLTextAreaElement>('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="publish:message"] textarea')!;
		expect(editor).toHaveValue('{\n  "data": 0\n}');
		fireEvent.change(editor, { target: { value: '{"data":2147483647}' } });
		fireEvent.blur(editor);
		expect(onChange).toHaveBeenCalledWith({ parameters: { messageType: 'std_msgs/Int32',message: { data: 2147483647 } } });
	});

	it('edits multi-field ROS1 messages through the same JSON template', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
			parameterSchema: { type: 'object',required: ['messageType','message'],properties: {
				messageType: { type: 'string',title: 'Message type' },message: { type: 'object',title: 'Message',default: {} },
			} },
		};
		const node = { ...newAutomationNode('ros1.publish-topic', { messageType: 'geometry_msgs/PoseStamped',message: { header: { frame_id: 'map' },pose: { position: { x: 1.25 },orientation: { w: 1 } } } }, 'Publish', 3),id: 'publish' };
		const onChange = vi.fn();
		const { container } = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);

		const editor = container.querySelector<HTMLTextAreaElement>('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="publish:message"] textarea')!;
		expect(editor.value).toContain('"frame_id": "map"');
		expect(screen.queryByLabelText('Position x')).toBeNull();
		fireEvent.change(editor, { target: { value: '{"header":{"frame_id":"map"},"pose":{"position":{"x":1.25,"y":2.5},"orientation":{"w":1}}}' } });
		fireEvent.blur(editor);
		expect(onChange).toHaveBeenCalledWith({ parameters: {
			messageType: 'geometry_msgs/PoseStamped',
			message: { header: { frame_id: 'map' },pose: { position: { x: 1.25,y: 2.5 },orientation: { w: 1 } } },
		} });
	});

	it('seeds ROS service requests from the selected type and uses the same Fixed or Expression editor', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.call-service',typeVersion: 1,label: 'Call service',category: 'ros1',traits: automationCatalogTraits('ros1.call-service'),
			parameterSchema: { type: 'object',required: ['serviceType','request'],properties: {
				serviceType: { type: 'string',title: 'Service type','x-xgc-expression': true },
				request: { type: 'object',title: 'Request',default: {},'x-xgc-expression': true },
			} },
		};
		const node = {
			...newAutomationNode('ros1.call-service', { serviceType: 'std_srvs/SetBool',request: { data: false } }, 'Call service', 1),
			id: 'ros1-call-service',
		};
		const onChange = vi.fn();
		const view = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);
		const requestEditor = view.container.querySelector<HTMLTextAreaElement>(
			'[data-xgc-role="automation-node-parameter-json"][data-xgc-id="ros1-call-service:request"] textarea',
		)!;

		expect(requestEditor).toHaveValue('{\n  "data": false\n}');
		expect(requestEditor.closest('.automation-json-terminal-template')?.querySelector('.xgc-form-field-description')).toBeNull();
		const serviceType = screen.getByLabelText(/^Service type\*/);
		expect(screen.getByRole('group', { name: 'Service type value source' })).toBeInTheDocument();
		expect(serviceType).toHaveAttribute('placeholder', 'std_srvs/SetBool');
		expect(serviceType).toHaveAttribute('list', 'automation-parameter-ros1-call-service-serviceType-suggestions');
		expect(view.container.querySelector('[data-xgc-role="automation-ros-service-type"][data-xgc-id="ros1-call-service"] .xgc-form-field-description')).toBeNull();
		expect(view.container.querySelector('option[value="mavros_msgs/CommandBool"]')).not.toBeNull();
		fireEvent.change(requestEditor, { target: { value: '{"data":true}' } });
		fireEvent.blur(requestEditor);
		expect(onChange).toHaveBeenLastCalledWith({ parameters: { serviceType: 'std_srvs/SetBool',request: { data: true } } });

		fireEvent.change(serviceType, { target: { value: 'mavros_msgs/CommandBool' } });
		expect(onChange).toHaveBeenLastCalledWith({ parameters: { serviceType: 'mavros_msgs/CommandBool',request: { value: false } } });
		fireEvent.click(within(screen.getByRole('group', { name: 'Request value source' })).getByRole('button', { name: 'Expression' }));
		expect(onChange).toHaveBeenLastCalledWith({ parameterBindings: [{ target: '/request',expression: '{{ $input }}',language: 'xgc-expression-v2' }] });
	});

	it('keeps ROS advanced parameters in one flat collapsed section', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.wait-roscore-ready',typeVersion: 1,label: 'Wait for ROS Core Ready',category: 'ros1',traits: automationCatalogTraits('ros1.wait-roscore-ready'),
			parameterSchema: { type: 'object','x-xgc-parameter-groups': [{
				id: 'ros-advanced',label: 'ROS Advanced',collapsed: true,
				parameters: ['rosInstallPath','rosMasterUri','rosIp','rosHostname','masterLogLevel','rosLogDir'],
			}],properties: {
				rosInstallPath: { type: 'string',title: 'ROS installation path','x-xgc-expression': true },
				rosMasterUri: { type: 'string',title: 'ROS_MASTER_URI','x-xgc-expression': true },
				rosIp: { type: 'string',title: 'ROS_IP','x-xgc-expression': true },
				rosHostname: { type: 'string',title: 'ROS_HOSTNAME','x-xgc-expression': true },
				masterLogLevel: { type: 'string',title: 'Master log level',enum: ['info','warn'],'x-xgc-expression': true },
				rosLogDir: { type: 'string',title: 'ROS Log Dir','x-xgc-path-kind': 'directory','x-xgc-expression': true },
			} },
		};
		const node = { ...newAutomationNode('ros1.wait-roscore-ready', {
			rosInstallPath: '/opt/ros/noetic',rosMasterUri: fixtureRosMasterURI,rosIp: '',rosHostname: '',masterLogLevel: 'info',rosLogDir: '/tmp/xgc2/ros/log',
		}, 'Wait for ROS Core', 1),id: 'ros-master' };
		const { container } = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={vi.fn()} onError={vi.fn()} />);

		const advanced = screen.getByText('ROS Advanced').closest('details')!;
		expect(advanced).toHaveAttribute('data-xgc-role', 'automation-parameter-group');
		expect(advanced).toHaveAttribute('data-xgc-id', 'ros-master:ros-advanced');
		expect(advanced).toHaveAttribute('data-xgc-collapsed', 'true');
		expect(advanced).not.toHaveAttribute('open');
		expect(within(advanced).queryByText('Installation')).not.toBeInTheDocument();
		expect(within(advanced).queryByText('Host')).not.toBeInTheDocument();
		expect(within(advanced).queryByText('Logging')).not.toBeInTheDocument();
		expect(within(advanced).getByLabelText('ROS installation path')).toBeInTheDocument();
		expect(within(advanced).getByLabelText('ROS_MASTER_URI')).toBeInTheDocument();
		for (const label of ['ROS installation path','ROS_MASTER_URI','ROS_IP','ROS_HOSTNAME','Master log level','ROS Log Dir']) {
			expect(within(advanced).getByRole('group', { name: `${label} value source` })).toBeInTheDocument();
		}
		expect(within(advanced).getByLabelText('ROS_MASTER_URI').parentElement).toHaveAttribute('data-xgc-control', 'input');
		expect(screen.getByLabelText('Node name').parentElement).toHaveAttribute('data-xgc-control', 'input');
		expect(within(advanced).getByLabelText('ROS Log Dir')).toBeInTheDocument();
		const pathField = container.querySelector('[data-xgc-role="automation-node-path-parameter"][data-xgc-id="ros-master:rosLogDir"]')!;
		expect(pathField.querySelector('[data-xgc-role="input-action"]')).not.toBeNull();
		const browse = within(pathField as HTMLElement).getByRole('button', { name: 'Browse' });
		expect(browse).toHaveAttribute('data-icon-only', 'true');
		expect(browse).toHaveTextContent('');
		expect(browse.querySelector('svg')).not.toBeNull();
		fireEvent.click(within(advanced).getByText('ROS Advanced'));
		expect(advanced).toHaveAttribute('open');
	});

	it('offers Fixed and Expression for ROS advanced parameters on every other ROS node', () => {
		const nativeContextProperties = {
			rosMasterUri: { type: 'string',title: 'ROS_MASTER_URI','x-xgc-expression': true },
			rosIp: { type: 'string',title: 'ROS_IP','x-xgc-expression': true },
			rosHostname: { type: 'string',title: 'ROS_HOSTNAME','x-xgc-expression': true },
		};
		const cases = [
			{ kind: 'ros1.publish-topic',version: 3,nodeId: 'ros1-publish-topic',properties: nativeContextProperties,labels: ['ROS_MASTER_URI','ROS_IP','ROS_HOSTNAME'] },
			{ kind: 'ros1.call-service',version: 1,nodeId: 'ros1-call-service',properties: nativeContextProperties,labels: ['ROS_MASTER_URI','ROS_IP','ROS_HOSTNAME'] },
			{ kind: 'ros1.record-bag',version: 1,nodeId: 'ros1-record-bag',properties: {
				rosInstallPath: { type: 'string',title: 'ROS installation path','x-xgc-expression': true },
				...nativeContextProperties,
			},labels: ['ROS installation path','ROS_MASTER_URI','ROS_IP','ROS_HOSTNAME'] },
		] as const;
		for (const current of cases) {
			const parameterSchema = {
				type: 'object',
				'x-xgc-parameter-groups': [{
					id: 'ros-advanced',label: 'ROS Advanced',collapsed: true,parameters: Object.keys(current.properties),
				}],
				properties: current.properties,
			};
			const catalogEntry: AutomationNodeCatalogEntry = {
				kind: current.kind,typeVersion: current.version,label: current.kind,category: 'ros1',traits: automationCatalogTraits(current.kind),parameterSchema,
			};
			const node = { ...newAutomationNode(current.kind, {
				rosInstallPath: '/opt/ros/noetic',rosMasterUri: fixtureRosMasterURI,rosIp: '',rosHostname: '',rosLogDir: '/tmp/xgc2/ros/log',
			}, current.kind, current.version),id: current.nodeId };
			const view = render(<AutomationNodeConfigPanel node={node} catalog={catalogEntry} onChange={vi.fn()} onError={vi.fn()} />);

			const advanced = within(view.container).getByText('ROS Advanced').closest('details')!;
			for (const label of current.labels) {
				expect(within(advanced).getByRole('group', { name: `${label} value source` })).toBeInTheDocument();
			}
			expect(view.container.querySelector(
				`[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="${current.nodeId}:/rosMasterUri"]`,
			)).not.toBeNull();
			view.unmount();
		}
	});

	it('keeps the ROS bag guided selectors on the same Fixed and Expression contract', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.record-bag',typeVersion: 1,label: 'Record ROS bag',category: 'ros1',traits: automationCatalogTraits('ros1.record-bag'),
			parameterSchema: { type: 'object',properties: {
				slotIds: { type: 'array',title: 'Experiment robot slots','x-xgc-expression': true },
				robotTopics: { type: 'array',title: 'Robot topics','x-xgc-expression': true },
				globalTopics: { type: 'array',title: 'Global topics','x-xgc-expression': true },
			} },
		};
		const node = { ...newAutomationNode('ros1.record-bag', {
			slotIds: [],robotTopics: ['odom'],globalTopics: ['/tf'],
		}, 'Record ROS bag', 1),id: 'ros1-record-bag' };
		const onChange = vi.fn();
		render(<AutomationNodeConfigPanel
			node={node}
			catalog={rosCatalog}
			parameterOptions={{ slotIds: [{ value: 'ugv-1',label: 'UGV 1' }] }}
			onChange={onChange}
			onError={vi.fn()}
		/>);

		for (const label of ['Experiment robot slots','Robot topics','Global topics']) {
			expect(screen.getByRole('group', { name: `${label} value source` })).toBeInTheDocument();
		}
		expect(screen.getByLabelText('Robot slots ([] = all)')).toBeEnabled();
		fireEvent.click(within(screen.getByRole('group', { name: 'Robot topics value source' })).getByRole('button', { name: 'Expression' }));
		expect(onChange).toHaveBeenLastCalledWith({
			parameterBindings: [{ target: '/robotTopics',expression: '{{ $input }}',language: 'xgc-expression-v2' }],
		});
	});

	it('shows scientific camera topics only for the scientific recording profile', () => {
		const rosCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.record-bag',typeVersion: 1,label: 'Record ROS bag',category: 'ros1',traits: automationCatalogTraits('ros1.record-bag'),
			parameterSchema: { type: 'object',properties: {
				recordingProfile: { type: 'string',title: 'Recording profile',enum: ['general','camera_scientific'] },
				slotIds: { type: 'array',title: 'Experiment robot slots' },
				robotTopics: { type: 'array',title: 'Robot topics' },
				globalTopics: { type: 'array',title: 'Global topics' },
				includeMotionCapture: { type: 'boolean',title: 'Motion capture' },
				cameraTopicRoots: { type: 'array',title: 'Camera topic roots' },
			} },
		};
		const general = { ...newAutomationNode('ros1.record-bag', {
			recordingProfile: 'general',slotIds: [],robotTopics: [],globalTopics: [],includeMotionCapture: false,cameraTopicRoots: [],
			expectedDurationMinutes: 60,estimatedVideoBitrateMbps: 0,capacitySafetyFactor: 1.25,
			splitSizeMiB: 1024,maxSplits: 10,minFreeSpaceGiB: 2,compression: 'lz4',
		}, 'Record ROS bag', 1),id: 'general-bag' };
		const onChange = vi.fn();
		const generalView = render(<AutomationNodeConfigPanel node={general} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);
		expect(screen.queryByLabelText('Camera topic roots')).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Recording profile' }));
		fireEvent.click(screen.getByRole('option', { name: 'camera_scientific' }));
		expect(onChange).toHaveBeenLastCalledWith({ parameters: {
			...general.parameters,
			recordingProfile: 'camera_scientific',cameraTopicRoots: ['/xgc/camera/world'],
			expectedDurationMinutes: 60,estimatedVideoBitrateMbps: 24,capacitySafetyFactor: 1.25,
			splitSizeMiB: 2048,maxSplits: 8,minFreeSpaceGiB: 4,compression: 'none',
		} });
		generalView.unmount();

		const scientific = { ...general,id: 'scientific-bag',parameters: {
			...general.parameters,recordingProfile: 'camera_scientific',cameraTopicRoots: ['/xgc/camera/world'],
			estimatedVideoBitrateMbps: 24,splitSizeMiB: 2048,maxSplits: 8,minFreeSpaceGiB: 4,compression: 'none',
		} };
		const scientificOnChange = vi.fn();
		render(<AutomationNodeConfigPanel node={scientific} catalog={rosCatalog} onChange={scientificOnChange} onError={vi.fn()} />);
		expect(screen.getByLabelText('Camera topic roots')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Recording profile' }));
		fireEvent.click(screen.getByRole('option', { name: 'general' }));
		expect(scientificOnChange).toHaveBeenLastCalledWith({ parameters: {
			...scientific.parameters,
			recordingProfile: 'general',cameraTopicRoots: [],
			expectedDurationMinutes: 60,estimatedVideoBitrateMbps: 0,capacitySafetyFactor: 1.25,
			splitSizeMiB: 1024,maxSplits: 10,minFreeSpaceGiB: 2,compression: 'lz4',
		} });
	});

	it('reuses ROS Advanced for managed ROS process parameters while keeping task fields visible', () => {
		const rosProcessSchema = { type: 'object','x-xgc-parameter-groups': [{
			id: 'ros-advanced',label: 'ROS Advanced',collapsed: true,
			parameters: ['rosInstallPath','rosMasterUri','rosIp','rosHostname'],
		}],properties: {
			configPath: { type: 'string',title: 'RViz config' },
			rosInstallPath: { type: 'string',title: 'ROS installation path' },
			rosMasterUri: { type: 'string',title: 'ROS_MASTER_URI' },
			rosIp: { type: 'string',title: 'ROS_IP' },
			rosHostname: { type: 'string',title: 'ROS_HOSTNAME' },
		} };
		const node = { ...newAutomationNode('process.run-definition', {
			definitionId: 'rviz',parameters: { configPath: '/tmp/default.rviz',rosInstallPath: '/opt/ros/noetic',rosMasterUri: fixtureRosMasterURI,rosIp: '',rosHostname: '' },
		}, 'RViz', 2),id: 'rviz' };
		render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={rosProcessSchema} parameterPath="parameters" onChange={vi.fn()} onError={vi.fn()} />);

		const configPath = screen.getByLabelText('RViz config');
		const advanced = screen.getByText('ROS Advanced').closest('details')!;
		expect(configPath.closest('details')).toBeNull();
		expect(within(advanced).getByLabelText('ROS installation path')).toBeInTheDocument();
		expect(within(advanced).getByLabelText('ROS_MASTER_URI')).toBeInTheDocument();
		expect(within(advanced).getByText('4 parameters')).toBeInTheDocument();
	});

	it('keeps Foxglove topics visible and folds its declared advanced parameters', () => {
		const foxgloveSchema = { type: 'object','x-xgc-parameter-groups': [{
			id: 'advanced',label: 'Advanced',collapsed: true,
			parameters: ['port','rosMasterPort','rosPackagePath','sendBufferLimitBytes'],
		}],properties: {
			allowedTopics: { type: 'string',title: 'Allowed topics' },
			port: { type: 'integer',title: 'WebSocket port' },
			rosMasterPort: { type: 'integer',title: 'ROS master port' },
			rosPackagePath: { type: 'string',title: 'ROS package path' },
			sendBufferLimitBytes: { type: 'integer',title: 'Send buffer limit (bytes)' },
		} };
		const node = { ...newAutomationNode('process.run-definition', {
			definitionId: 'foxglove-bridge',parameters: {
				allowedTopics: '^/tf',port: 8765,rosMasterPort: 11311,
				rosPackagePath: '/opt/ros/noetic/share',sendBufferLimitBytes: 10_000_000,
			},
		}, 'Foxglove bridge', 2),id: 'foxglove-bridge' };
		const view = render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={foxgloveSchema} parameterPath="parameters" onChange={vi.fn()} onError={vi.fn()} />);

		const allowedTopics = screen.getByLabelText('Allowed topics');
		const advanced = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-group"][data-xgc-id="foxglove-bridge:advanced"]',
		)!;
		expect(allowedTopics.closest('details')).toBeNull();
		expect(advanced).toHaveAttribute('data-xgc-collapsed', 'true');
		expect(advanced).not.toHaveAttribute('open');
		expect(within(advanced).getByText('4 parameters')).toBeInTheDocument();
		expect(within(advanced).getByLabelText('WebSocket port')).toBeInTheDocument();
		expect(within(advanced).getByLabelText('ROS master port')).toBeInTheDocument();
		expect(within(advanced).getByLabelText('ROS package path')).toBeInTheDocument();
		expect(within(advanced).getByLabelText('Send buffer limit (bytes)')).toBeInTheDocument();
	});

	it('groups Gazebo server parameters into collapsed semantic sections', () => {
		const gazeboSchema = { type: 'object','x-xgc-parameter-groups': [
			{ id: 'simulation',label: 'Simulation',collapsed: true,parameters: ['world','physics','paused'] },
			{ id: 'physics-timing',label: 'Physics Timing',collapsed: true,parameters: ['overrideWorldPhysicsTiming','maxStepSize','realTimeUpdateRate'] },
			{ id: 'vrpn-server',label: 'VRPN Server',collapsed: true,parameters: ['vrpnBindAddress','vrpnPort'] },
			{ id: 'vrpn-tracking',label: 'VRPN Tracking',collapsed: true,parameters: ['vrpnAutoTrackKnownModels','vrpnPublishRate'] },
			{ id: 'gazebo-advanced',label: 'Gazebo Advanced',collapsed: true,parameters: ['masterPort','verbose','allowOnlineModels'] },
			{ id: 'ros-advanced',label: 'ROS Advanced',collapsed: true,parameters: ['rosInstallPath','rosMasterUri','rosIp','rosHostname','rosLogDir'] },
		],properties: {
			masterPort: { type: 'integer',title: 'Gazebo master port' },
			rosInstallPath: { type: 'string',title: 'ROS installation path' },
			rosMasterUri: { type: 'string',title: 'ROS_MASTER_URI' },
			rosIp: { type: 'string',title: 'ROS_IP' },
			rosHostname: { type: 'string',title: 'ROS_HOSTNAME' },
			rosLogDir: { type: 'string',title: 'ROS_LOG_DIR' },
			world: { type: 'string',title: 'World',description: 'Absolute Gazebo world file','x-xgc-path-kind': 'file' },
			physics: { type: 'string',title: 'Physics',enum: ['ode','bullet'],description: 'Gazebo physics engine' },
			overrideWorldPhysicsTiming: { type: 'boolean',title: 'Override world physics timing' },
			maxStepSize: { type: 'number',title: 'Max step size (s)' },
			realTimeUpdateRate: { type: 'number',title: 'Real-time update rate (Hz)' },
			paused: { type: 'boolean',title: 'Paused' },
			verbose: { type: 'boolean',title: 'Verbose' },
			allowOnlineModels: { type: 'boolean',title: 'Allow online models' },
			vrpnBindAddress: { type: 'string',title: 'VRPN bind address' },
			vrpnPort: { type: 'integer',title: 'VRPN port' },
			vrpnAutoTrackKnownModels: { type: 'boolean',title: 'Auto-track known models' },
			vrpnPublishRate: { type: 'number',title: 'VRPN publish rate' },
		} };
		const node = { ...newAutomationNode('process.run-definition', {
			definitionId: 'gazebo-server',parameters: {
				masterPort: 11345,rosInstallPath: '/opt/ros/noetic',rosMasterUri: fixtureRosMasterURI,
				rosIp: '',rosHostname: '',rosLogDir: '/tmp/xgc2/ros/log',
				world: '/tmp/empty.world',physics: 'ode',overrideWorldPhysicsTiming: false,maxStepSize: 0.004,realTimeUpdateRate: 250,
				paused: false,verbose: true,allowOnlineModels: false,
				vrpnBindAddress: '0.0.0.0',vrpnPort: 3884,vrpnAutoTrackKnownModels: true,vrpnPublishRate: 120,
			},
		}, 'Gazebo server', 2),id: 'gazebo-server' };
		const view = render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={gazeboSchema} parameterPath="parameters" onChange={vi.fn()} onError={vi.fn()} />);

		const groupedParameters = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-groups"][data-xgc-id="gazebo-server"]',
		)!;
		const simulation = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-group"][data-xgc-id="gazebo-server:simulation"]',
		)!;
		const physicsTiming = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-group"][data-xgc-id="gazebo-server:physics-timing"]',
		)!;
		const vrpnServer = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-group"][data-xgc-id="gazebo-server:vrpn-server"]',
		)!;
		const vrpnTracking = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-group"][data-xgc-id="gazebo-server:vrpn-tracking"]',
		)!;
		const gazeboAdvanced = view.container.querySelector<HTMLElement>(
			'[data-xgc-role="automation-parameter-group"][data-xgc-id="gazebo-server:gazebo-advanced"]',
		)!;
		expect(groupedParameters).toContainElement(simulation);
		for (const group of [simulation,physicsTiming,vrpnServer,vrpnTracking,gazeboAdvanced]) {
			expect(group).not.toHaveAttribute('open');
			expect(group).toHaveAttribute('data-xgc-collapsed', 'true');
		}
		expect(within(simulation).getByText('3 parameters')).toBeInTheDocument();
		const world = screen.getByLabelText('World');
		expect(world.closest('details')).toBe(simulation);
		expect(within(world.closest('.automation-path-parameter')!).getByRole('button', { name: 'Browse' })).toBeInTheDocument();
		const physics = screen.getByLabelText('Physics');
		expect(physics.closest('details')).toBe(simulation);
		expect(physics.closest('[data-xgc-role="automation-node-parameter"]')).toHaveAttribute('data-xgc-id', 'gazebo-server:physics');
		expect(world.closest('[data-xgc-role="automation-node-path-parameter"]')).toHaveAttribute('data-xgc-id', 'gazebo-server:world');
		expect(physics.closest('[data-xgc-control="select"]')).toHaveAttribute('data-xgc-size', 'default');
		expect(world.closest('.xgc-input')).toHaveAttribute('data-size', 'default');
		expect(within(physicsTiming).getByRole('switch', { name: 'Override world physics timing' })).not.toBeChecked();
		expect(within(physicsTiming).getByLabelText('Max step size (s)')).toHaveValue(0.004);
		expect(within(physicsTiming).getByLabelText('Real-time update rate (Hz)')).toHaveValue(250);
		const paused = screen.getByRole('switch', { name: 'Paused' });
		expect(paused).not.toBeChecked();
		expect(paused).toHaveAttribute('type', 'checkbox');
		expect(paused.parentElement?.querySelector('.automation-boolean-switch')).toBeNull();
		expect(paused.closest('.xgc-boolean-control')).toHaveTextContent('PausedOff');
		expect(paused.closest('.xgc-form-field')).toBeNull();
		expect(paused.closest('details')).toBe(simulation);
		expect(screen.queryByText('Absolute Gazebo world file')).not.toBeInTheDocument();
		expect(screen.queryByText('Gazebo physics engine')).not.toBeInTheDocument();
		expect(within(vrpnServer).getByText('2 parameters')).toBeInTheDocument();
		expect(within(vrpnServer).getByLabelText('VRPN bind address')).toBeInTheDocument();
		expect(within(vrpnTracking).getByText('2 parameters')).toBeInTheDocument();
		expect(within(vrpnTracking).getByLabelText('Auto-track known models')).toBeInTheDocument();
		expect(within(gazeboAdvanced).getByText('3 parameters')).toBeInTheDocument();
		expect(within(gazeboAdvanced).getByLabelText('Gazebo master port')).toBeInTheDocument();
		expect(within(gazeboAdvanced).getByLabelText('Allow online models')).toBeInTheDocument();
		const rosAdvanced = screen.getByText('ROS Advanced').closest('details')!;
		expect(within(rosAdvanced).getByText('5 parameters')).toBeInTheDocument();
		expect(within(rosAdvanced).getByLabelText('ROS installation path')).toBeInTheDocument();
		expect(within(rosAdvanced).getByLabelText('ROS_MASTER_URI')).toBeInTheDocument();
		expect(within(rosAdvanced).getByLabelText('ROS_LOG_DIR')).toBeInTheDocument();
		fireEvent.click(within(simulation).getByText('Simulation'));
		expect(simulation).toHaveAttribute('open');
	});

	it('keeps Gazebo launch configuration out of the wait node', () => {
		const waitCatalog: AutomationNodeCatalogEntry = {
			kind: 'ros1.wait-gazebo-ready',typeVersion: 2,label: 'Wait for Gazebo Server',category: 'ros1',traits: automationCatalogTraits('ros1.wait-gazebo-ready'),
			parameterSchema: { type: 'object',required: ['timeoutSeconds'],properties: {
				timeoutSeconds: { type: 'integer',title: 'Wait timeout (s)',minimum: 1,maximum: 3600,default: 120 },
			},additionalProperties: false },
		};
		const node = { ...newAutomationNode('ros1.wait-gazebo-ready', {
			timeoutSeconds: 120,
		}, 'Wait for Gazebo Server', 2),id: 'wait-gazebo' };
		render(<AutomationNodeConfigPanel node={node} catalog={waitCatalog} onChange={vi.fn()} onError={vi.fn()} />);

		const timeout = screen.getByLabelText('Wait timeout (s)');
		expect(timeout).toHaveValue(120);
		expect(timeout.closest('[data-xgc-role="automation-node-parameter"]')).toHaveAttribute(
			'data-xgc-id',
			'wait-gazebo:timeoutSeconds',
		);
		expect(screen.queryByLabelText('World')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Physics')).not.toBeInTheDocument();
		expect(screen.queryByLabelText('Max step size (s)')).not.toBeInTheDocument();
		expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
		expect(screen.queryByText('ROS Advanced')).not.toBeInTheDocument();
	});

  it('renders Delay as a name plus typed resume interval controls defaulting to 2 seconds', () => {
    const node = { ...newAutomationNode('delay', { resume: 'timeInterval',amount: 2,unit: 'seconds' }, 'Delay', 2),id: 'delay' };
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} catalog={delayCatalog} onChange={onChange} onError={vi.fn()} />);

    expect(screen.getByLabelText('Node name')).toHaveValue('Delay');
    const resume = screen.getByLabelText('Resume');
    expect(resume).toHaveTextContent('After Time Interval');
    expect(resume).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(resume);
    const resumeOptions = screen.getByRole('listbox', { name: 'Resume' });
    expect(resumeOptions).toHaveClass('xgc-select-menu');
    expect(within(resumeOptions).getAllByRole('option')).toHaveLength(1);
    expect(within(resumeOptions).getByRole('option', { name: 'After Time Interval' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Wait Amount')).toHaveValue(2);
    expect(screen.getByRole('group', { name: 'Wait Amount value source' })).toBeInTheDocument();
    const unit = screen.getByLabelText('Wait Unit');
    expect(unit).toHaveTextContent('Seconds');

    fireEvent.change(screen.getByLabelText('Wait Amount'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ parameters: { resume: 'timeInterval',amount: 5,unit: 'seconds' } });
    fireEvent.click(unit);
    const unitOptions = screen.getByRole('listbox', { name: 'Wait Unit' });
    expect(within(unitOptions).getByRole('option', { name: 'Seconds' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(unitOptions).getByRole('option', { name: 'Minutes' }));
    expect(onChange).toHaveBeenLastCalledWith({ parameters: { resume: 'timeInterval',amount: 2,unit: 'minutes' } });
  });

  it('renders labeled dynamic options while persisting the stable Automation resource ID', () => {
    const callCatalog: AutomationNodeCatalogEntry = {
      kind: 'automation.call',typeVersion: 4,label: 'Call Automation',category: 'Control',traits: automationCatalogTraits('automation.call'),
      parameterSchema: {
        type: 'object',required: ['automationId','branch','mode','criticality','inputMode','parameters'],properties: {
          automationId: { type: 'string' },
          branch: { type: 'string',default: 'main' },
          mode: { type: 'string',enum: ['sync','async'],default: 'sync' },
          criticality: { type: 'string',enum: ['required','auxiliary'],default: 'required' },
          inputMode: { type: 'string',enum: ['configured'],default: 'configured' },
          parameters: { type: 'object',default: {} },
          targetCommitId: { type: 'string',readOnly: true },
          targetConfigDigest: { type: 'string',readOnly: true },
          targetDefinitionDigest: { type: 'string',readOnly: true },
          targetVersion: { type: 'integer',minimum: 1,readOnly: true },
        },
      },
    };
    const node = { ...newAutomationNode('automation.call', {
      automationId: 'automation-b',branch: 'main',mode: 'sync',criticality: 'required',inputMode: 'configured',parameters: {},
      targetCommitId: 'commit-b',targetConfigDigest: 'c'.repeat(64),targetDefinitionDigest: 'd'.repeat(64),targetVersion: 2,
    }, 'Call Automation', 4),id: 'call' };
    const onChange = vi.fn();
    const { container } = render(<AutomationNodeConfigPanel
      node={node}
      catalog={callCatalog}
      parameterOptions={{ automationId: [
        { value: 'automation-b',label: 'Mapping mission' },
        { value: 'automation-c',label: 'Landing mission' },
      ] }}
      onChange={onChange}
      onError={vi.fn()}
    />);

    const automation = screen.getByLabelText('Automation');
    const targetSection = container.querySelector<HTMLDetailsElement>('[data-xgc-role="automation-call-target"][data-xgc-id="call"]')!;
    const inputsSection = container.querySelector<HTMLDetailsElement>('[data-xgc-role="automation-call-inputs"][data-xgc-id="call"]')!;
    expect(automation).toHaveTextContent('Mapping mission');
    expect(screen.getByLabelText('Branch')).toHaveValue('main');
    expect(screen.getByRole('switch', { name: 'Wait for completion' })).toBeChecked();
    expect(targetSection).toHaveAttribute('open');
    expect(inputsSection).toHaveAttribute('open');
    expect(inputsSection).toHaveTextContent('Select an Automation');
    fireEvent.click(targetSection.querySelector('summary')!);
    fireEvent.click(inputsSection.querySelector('summary')!);
    expect(targetSection).not.toHaveAttribute('open');
    expect(targetSection.querySelector('summary')).toHaveAttribute('aria-expanded', 'false');
    expect(inputsSection).not.toHaveAttribute('open');
    expect(inputsSection.querySelector('summary')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(targetSection.querySelector('summary')!);
    expect(targetSection).toHaveAttribute('open');
    for (const name of ['targetCommitId','targetConfigDigest','targetDefinitionDigest','targetVersion']) {
      expect(container.querySelector(`[data-xgc-role="automation-node-parameter"][data-xgc-id="call:${name}"]`)).toBeNull();
    }
    fireEvent.click(automation);
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Automation' })).getByRole('option', { name: 'Landing mission' }));
    expect(onChange).toHaveBeenCalledWith({
      parameters: {
        automationId: 'automation-c',actionId: '',branch: 'main',mode: 'sync',
        criticality: 'required',inputMode: 'configured',parameters: {},
      },
      parameterBindings: undefined,
    });
  });

  it('shows only the Merge options that apply to the selected data operation', () => {
    const mergeCatalog: AutomationNodeCatalogEntry = {
      kind: 'merge',typeVersion: 2,label: 'Merge',category: 'Data',traits: automationCatalogTraits('merge'),
      parameterSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string',title: 'Mode',enum: ['append','combine','chooseBranch'],enumNames: ['Append','Combine','Choose branch'] },
          combineBy: { type: 'string',title: 'Combine by',enum: ['matchingFields','position','allCombinations'] },
          fieldsToMatch: { type: 'string',title: 'Fields to match' },
          joinMode: { type: 'string',title: 'Items to output',enum: ['keepMatches','keepEverything'] },
          outputDataFrom: { type: 'string',title: 'Output data from',enum: ['both','input1','input2'] },
          includeUnpaired: { type: 'boolean',title: 'Include unpaired items' },
          clashHandling: { type: 'string',title: 'When fields clash',enum: ['preferLast','preferFirst','addSuffix'] },
          mergeMode: { type: 'string',title: 'Merge nested objects',enum: ['deep','shallow'] },
          output: { type: 'string',title: 'Output',enum: ['specifiedInput','empty'] },
          selectedInput: { type: 'string',title: 'Use data from' },
        },
      },
    };
    const parameters = {
      mode: 'append',combineBy: 'matchingFields',fieldsToMatch: '',joinMode: 'keepMatches',
      outputDataFrom: 'both',includeUnpaired: false,clashHandling: 'preferLast',
      mergeMode: 'deep',output: 'specifiedInput',selectedInput: '',
    };
    const props = {
      catalog: mergeCatalog,
      nodeComposition: coreFlowNodeComposition,
      parameterOptions: { selectedInput: [
        { value: 'left',label: 'Left source · left' },
        { value: 'right',label: 'Right source · right' },
      ] },
      onChange: vi.fn(),
      onError: vi.fn(),
    };
    const view = render(<AutomationNodeConfigPanel
      {...props}
      node={{ ...newAutomationNode('merge', parameters, 'Merge data', 2),id: 'merge-data' }}
    />);

    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
    expect(screen.queryByLabelText('Combine by')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Use data from')).not.toBeInTheDocument();

    view.rerender(<AutomationNodeConfigPanel
      {...props}
      node={{ ...newAutomationNode('merge', { ...parameters,mode: 'combine' }, 'Merge data', 2),id: 'merge-data' }}
    />);
    expect(screen.getByLabelText('Combine by')).toBeInTheDocument();
    expect(screen.getByLabelText('Fields to match')).toBeInTheDocument();
    expect(screen.getByLabelText('Items to output')).toBeInTheDocument();
    expect(screen.getByLabelText('Output data from')).toBeInTheDocument();
    expect(screen.queryByLabelText('Include unpaired items')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Output')).not.toBeInTheDocument();

    view.rerender(<AutomationNodeConfigPanel
      {...props}
      node={{ ...newAutomationNode('merge', { ...parameters,mode: 'combine',joinMode: 'enrichInput1' }, 'Merge data', 2),id: 'merge-data' }}
    />);
    expect(screen.queryByLabelText('Output data from')).not.toBeInTheDocument();

    view.rerender(<AutomationNodeConfigPanel
      {...props}
      node={{ ...newAutomationNode('merge', { ...parameters,mode: 'chooseBranch' }, 'Merge data', 2),id: 'merge-data' }}
    />);
    expect(screen.getByLabelText('Output')).toBeInTheDocument();
    expect(screen.getByLabelText('Use data from')).toBeInTheDocument();
    expect(screen.queryByLabelText('Combine by')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fields to match')).not.toBeInTheDocument();
  });

  it('keeps pinned v1 notification fields Fixed-only while allowing the matching v2 catalog', () => {
    const catalogEntry = expressionCatalog();
    const pinnedV1 = { ...newAutomationNode('notification', { message: 'fixed' }, 'notification', 1),id: 'notification-node' };
    const view = render(<AutomationNodeConfigPanel node={pinnedV1} catalog={catalogEntry} onChange={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByLabelText('Message')).toHaveValue('fixed');
    expect(screen.queryByRole('group', { name: 'Message value source' })).toBeNull();

    view.rerender(<AutomationNodeConfigPanel node={{ ...pinnedV1,typeVersion: 2 }} catalog={catalogEntry} onChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Message value source' })).toBeInTheDocument();
  });

  it('does not invent a v1 handler pin for an invalid node type version', () => {
		const node = { ...newAutomationNode('notification', { message: 'fixed' }),id: 'invalid-node',typeVersion: 0 };
		const v1Catalog = expressionCatalog(1);
		const view = render(<AutomationNodeConfigPanel node={node} catalog={v1Catalog} onChange={vi.fn()} onError={vi.fn()} />);

		expect(screen.queryByRole('group', { name: 'Message value source' })).toBeNull();
		view.rerender(<AutomationNodeConfigPanel node={{ ...node,typeVersion: 1 }} catalog={v1Catalog} onChange={vi.fn()} onError={vi.fn()} />);
		expect(screen.getByRole('group', { name: 'Message value source' })).toBeInTheDocument();
	});

  it('requires an explicit matching catalog version for an external parameter schema', () => {
    const schema = { type: 'object',properties: { port: { type: 'integer',title: 'Port','x-xgc-expression': true } } };
    const node = { ...newAutomationNode('process.run-definition', { definitionId: 'worker',parameters: { port: 11311 } }, 'worker', 2),id: 'worker' };
    const view = render(<AutomationNodeConfigPanel node={node} parameterSchema={schema} parameterPath="parameters" onChange={vi.fn()} onError={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'Port value source' })).toBeNull();
    view.rerender(<AutomationNodeConfigPanel node={node} catalog={{ ...catalog,typeVersion: 1 }} parameterSchema={schema} parameterPath="parameters" onChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Port value source' })).toBeNull();
    view.rerender(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={schema} parameterPath="parameters" onChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Port value source' })).toBeInTheDocument();
  });

  it('materializes an optional process parameter fallback before binding it', () => {
    const schema = { type: 'object',properties: { port: { type: 'integer',title: 'Port',default: 11311,'x-xgc-expression': true } } };
    const node = { ...newAutomationNode('process.run-definition', { definitionId: 'worker',definitionDigest: 'digest',parameters: {} }, 'worker', 2),id: 'worker' };
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={schema} parameterPath="parameters" onChange={onChange} onError={vi.fn()} />);

    fireEvent.click(within(screen.getByRole('group', { name: 'Port value source' })).getByRole('button', { name: 'Expression' }));
    expect(onChange).toHaveBeenCalledWith({
      parameterBindings: [{ target: '/parameters/port',expression: '{{ $input }}',language: 'xgc-expression-v2' }],
      parameters: { definitionId: 'worker',definitionDigest: 'digest',parameters: { port: 11311 } },
    });
  });

  it('offers Fixed and Expression only for declared scalar, boolean, enum, and object fields', () => {
    const schema = expressionParameterSchema();
    const node = { ...newAutomationNode('notification', {
      message: 'fixed message',enabled: true,level: 'warning',payload: { retries: 2 },items: ['uav1'],plain: 'fixed only',
    }, 'notification', 2),id: 'expression-node' };
    const onChange = vi.fn();
    const view = render(<AutomationNodeConfigPanel node={node} catalog={expressionCatalog()} parameterSchema={schema} onChange={onChange} onError={vi.fn()} />);

    expect(screen.getByLabelText('Message')).toHaveValue('fixed message');
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeChecked();
    expect(screen.getByLabelText('Level')).toHaveTextContent('Warning');
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="expression-node:payload"] textarea')).toHaveValue('{\n  "retries": 2\n}');
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="expression-node:items"] textarea')).toHaveValue('[\n  "uav1"\n]');
    for (const label of ['Message','Enabled','Level','Payload','Items']) {
      const modes = screen.getByRole('group', { name: `${label} value source` });
      expect(modes).toHaveClass('xgc-tab-strip');
      expect(modes).toHaveAttribute('data-xgc-size', 'compact');
      expect(within(modes).getByRole('button', { name: 'Fixed' })).toHaveClass('xgc-tab-item', 'xgc-tab-control');
      expect(within(modes).getByRole('button', { name: 'Fixed' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(modes).getByRole('button', { name: 'Expression' })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.queryByRole('group', { name: 'Plain value source' })).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="expression-node:/message"]')).not.toBeNull();
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-mode"][data-xgc-id="expression-node:/message:expression"]')).not.toBeNull();
    expect(view.container).not.toHaveTextContent('Value source');
    expect(view.container).not.toHaveTextContent('Parameter explanation must never render');
    expect(screen.getByRole('switch', { name: 'Enabled' }).closest('.xgc-boolean-control')).toHaveTextContent('EnabledOn');
    expect(screen.getByRole('switch', { name: 'Enabled' }).closest('.xgc-form-field')).toBeNull();

    for (const [label,target] of [['Message','/message'],['Enabled','/enabled'],['Level','/level'],['Payload','/payload'],['Items','/items']] as const) {
      onChange.mockClear();
      fireEvent.click(within(screen.getByRole('group', { name: `${label} value source` })).getByRole('button', { name: 'Expression' }));
      expect(onChange).toHaveBeenCalledWith({ parameterBindings: [{ target,expression: '{{ $input }}',language: 'xgc-expression-v2' }] });
    }
  });

  it('uses an explicit source-qualified v2 root when a node has multiple INPUT sources', () => {
    const node = { ...newAutomationNode('notification', { message: 'fixed' }, 'notification', 2),id: 'multi-input' };
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel
      node={node}
      catalog={expressionCatalog()}
      parameterSchema={expressionParameterSchema()}
      inputSourceIds={['prepare','safety-check']}
      onChange={onChange}
      onError={vi.fn()}
    />);

    fireEvent.click(within(screen.getByRole('group', { name: 'Message value source' })).getByRole('button', { name: 'Expression' }));
    expect(onChange).toHaveBeenCalledWith({
      parameterBindings: [{ target: '/message',expression: '{{ $inputs["prepare"] }}',language: 'xgc-expression-v2' }],
    });
  });

  it('persists expression text, keeps the Fixed value, omits below-control guidance, and locks immutable snapshots', () => {
    const schema = expressionParameterSchema();
    const fixed = { ...newAutomationNode('notification', { message: 'fixed message' }, 'notification', 2),id: 'expression-node' };
    const binding = { target: '/message',expression: 'Robot {{ $input.name }} ready',language: 'xgc-expression-v2' as const };
    const onChange = vi.fn();
    const view = render(<AutomationNodeConfigPanel
      node={{ ...fixed,parameterBindings: [binding] }}
      catalog={expressionCatalog()}
      parameterSchema={schema}
      readOnly
      onChange={onChange}
      onError={vi.fn()}
    />);

    const modes = screen.getByRole('group', { name: 'Message value source' });
    expect(within(modes).getByRole('button', { name: 'Fixed' })).toBeDisabled();
    expect(within(modes).getByRole('button', { name: 'Expression' })).toBeDisabled();
    const editor = screen.getByLabelText('Message expression') as HTMLTextAreaElement;
    expect(editor).toHaveValue(binding.expression);
    expect(editor).toHaveAttribute('readonly');
    expect(screen.queryByText(/Drag an INPUT field here/)).not.toBeInTheDocument();
    expect(view.container).not.toHaveTextContent('$assets');
    expect(view.container).not.toHaveTextContent('$run');
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-expression"][data-xgc-id="expression-node:/message"]')).not.toBeNull();
    expect(fixed.parameters.message).toBe('fixed message');

    view.rerender(<AutomationNodeConfigPanel
      node={{ ...fixed,parameterBindings: [binding] }}
      catalog={expressionCatalog()}
      parameterSchema={schema}
      onChange={onChange}
      onError={vi.fn()}
    />);
    fireEvent.change(screen.getByLabelText('Message expression'), { target: { value: '{{ $input.status }}' } });
    expect(onChange).toHaveBeenLastCalledWith({ parameterBindings: [{ target: '/message',expression: '{{ $input.status }}',language: 'xgc-expression-v2' }] });
    fireEvent.click(within(screen.getByRole('group', { name: 'Message value source' })).getByRole('button', { name: 'Fixed' }));
    expect(onChange).toHaveBeenLastCalledWith({ parameterBindings: undefined });
    expect(fixed.parameters.message).toBe('fixed message');
  });

  it('drops a pure typed mapping into an empty Expression and inserts a reference at the cursor in existing text', () => {
    const node = {
      ...newAutomationNode('notification', { message: 'fixed' }, 'notification', 2),
      id: 'expression-node',
      parameterBindings: [{ target: '/message',expression: 'robot=',language: 'xgc-expression-v2' as const }],
    };
    const onChange = vi.fn();
    const view = render(<AutomationNodeConfigPanel node={node} catalog={expressionCatalog()} parameterSchema={expressionParameterSchema()} onChange={onChange} onError={vi.fn()} />);
    const editor = screen.getByLabelText('Message expression') as HTMLTextAreaElement;
    const payload = JSON.stringify({
      version: 1,
      sourceId: 'prepare "primary"',
      multipleSources: true,
      segments: ['robots',0,'mav/system id'],
    });
    const dataTransfer = {
      types: [AUTOMATION_INPUT_FIELD_DRAG_TYPE],
      dropEffect: 'none',
      getData: vi.fn((type: string) => type === AUTOMATION_INPUT_FIELD_DRAG_TYPE ? payload : ''),
    };

    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.dragEnter(editor, { dataTransfer });
    expect(editor).toHaveAttribute('data-drag-active', 'true');
    fireEvent.drop(editor, { dataTransfer });

    expect(dataTransfer.dropEffect).toBe('copy');
    expect(onChange).toHaveBeenCalledWith({
      parameterBindings: [{
        target: '/message',
        expression: `robot=${automationInputFieldExpression({
          sourceId: 'prepare "primary"',multipleSources: true,segments: ['robots',0,'mav/system id'],
        })}`,
        language: 'xgc-expression-v2',
      }],
    });
    expect(editor).not.toHaveAttribute('data-drag-active');

    onChange.mockClear();
    view.rerender(<AutomationNodeConfigPanel
      node={{ ...node,parameterBindings: [{ target: '/message',expression: '',language: 'xgc-expression-v2' }] }}
      catalog={expressionCatalog()}
      parameterSchema={expressionParameterSchema()}
      onChange={onChange}
      onError={vi.fn()}
    />);
    const emptyEditor = screen.getByLabelText('Message expression');
    fireEvent.drop(emptyEditor, { dataTransfer });
    expect(onChange).toHaveBeenCalledWith({
      parameterBindings: [{
        target: '/message',
        expression: automationInputFieldExpression({
          sourceId: 'prepare "primary"',multipleSources: true,segments: ['robots',0,'mav/system id'],
        }),
        language: 'xgc-expression-v2',
      }],
    });
  });

  it('keeps sensitive, read-only, and process identity fields Fixed-only even if a schema marks them bindable', () => {
    const schema = {
      type: 'object',
      properties: {
        message: { type: 'string',title: 'Message','x-xgc-expression': true },
        secret: { type: 'string',title: 'Secret',sensitive: true,'x-xgc-expression': true },
        definitionId: { type: 'string',title: 'Definition ID','x-xgc-expression': true },
        definitionDigest: { type: 'string',title: 'Definition digest','x-xgc-expression': true },
        immutable: { type: 'string',title: 'Immutable',readOnly: true,'x-xgc-expression': true },
      },
    };
    const node = { ...newAutomationNode('notification', {
      message: 'ready',secret: 'token',definitionId: 'worker',definitionDigest: 'sha256:abc',immutable: 'server-owned',
    }, 'notification', 2),id: 'safe-bindings' };
    render(<AutomationNodeConfigPanel node={node} catalog={expressionCatalog()} parameterSchema={schema} onChange={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Message value source' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Secret value source' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Definition ID value source' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Definition digest value source' })).toBeNull();
    expect(screen.queryByLabelText('Immutable')).toBeNull();
  });

  it('repairs a missing required Fixed fallback when leaving Expression mode', () => {
    const node = {
      ...newAutomationNode('notification', {}, 'notification', 2),
      id: 'expression-node',
      parameterBindings: [{ target: '/message',expression: '{{ $input }}',language: 'xgc-expression-v2' as const }],
    };
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} catalog={expressionCatalog()} parameterSchema={expressionParameterSchema()} onChange={onChange} onError={vi.fn()} />);

    fireEvent.click(within(screen.getByRole('group', { name: 'Message value source' })).getByRole('button', { name: 'Fixed' }));

    expect(onChange).toHaveBeenCalledWith({ parameterBindings: undefined,parameters: { message: '' } });
  });

  it('uses escaped nested JSON Pointer targets and creates type-correct required Fixed fallbacks', () => {
    const schema = {
      type: 'object',
      required: ['topic/name~format','enabled','level','payload'],
      properties: {
        'topic/name~format': { type: 'string',title: 'Topic name','x-xgc-expression': true },
        enabled: { type: 'boolean',title: 'Enabled','x-xgc-expression': true },
        level: { type: 'string',title: 'Level',enum: ['info','warning'],'x-xgc-expression': true },
        payload: {
          type: 'object',title: 'Payload','x-xgc-expression': true,required: ['count'],
          properties: { count: { type: 'integer',minimum: 1 } },
        },
      },
    };
    const node = { ...newAutomationNode('process.run-definition', { definitionId: 'worker',parameters: {} }, 'process.run-definition', 2),id: 'nested' };
    const onChange = vi.fn();
    const view = render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={schema} parameterPath="parameters" onChange={onChange} onError={vi.fn()} />);

    const cases = [
      ['Topic name','topic/name~format','/parameters/topic~1name~0format',''],
      ['Enabled','enabled','/parameters/enabled',false],
      ['Level','level','/parameters/level','info'],
      ['Payload','payload','/parameters/payload',{ count: 1 }],
    ] as const;
    for (const [label,name,target,fallback] of cases) {
      onChange.mockClear();
      fireEvent.click(within(screen.getByRole('group', { name: `${label} value source` })).getByRole('button', { name: 'Expression' }));
      expect(onChange).toHaveBeenCalledWith({
        parameterBindings: [{ target,expression: '{{ $input }}',language: 'xgc-expression-v2' }],
        parameters: { definitionId: 'worker',parameters: { [name]: fallback } },
      });
    }
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-binding"][data-xgc-id="nested:/parameters/topic~1name~0format"]')).not.toBeNull();
  });

  it('preserves the fixed ROS message template across Expression mode', () => {
    const rosCatalog: AutomationNodeCatalogEntry = {
      kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),
      parameterSchema: { type: 'object',required: ['messageType','message'],properties: {
        messageType: { type: 'string' },
        message: { type: 'object',title: 'Message','x-xgc-expression': true },
      } },
    };
    const node = { ...newAutomationNode('ros1.publish-topic', { messageType: 'std_msgs/Bool',message: { data: false } }, 'Publish', 3),id: 'publish' };
    const onChange = vi.fn();
    const view = render(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);

    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="publish:message"] textarea'))
      .toHaveValue('{\n  "data": false\n}');
    fireEvent.click(within(screen.getByRole('group', { name: 'Message value source' })).getByRole('button', { name: 'Expression' }));
    expect(onChange).toHaveBeenCalledWith({ parameterBindings: [{ target: '/message',expression: '{{ $input }}',language: 'xgc-expression-v2' }] });

    view.rerender(<AutomationNodeConfigPanel node={{ ...node,parameterBindings: [{ target: '/message',expression: '{{ $input.message }}',language: 'xgc-expression-v2' } as const] }} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);
    expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="publish:message"]')).toBeNull();
    expect(screen.getByLabelText('Message expression')).toHaveValue('{{ $input.message }}');

		onChange.mockClear();
		fireEvent.click(within(screen.getByRole('group', { name: 'Message value source' })).getByRole('button', { name: 'Fixed' }));
		expect(onChange).toHaveBeenCalledWith({ parameterBindings: undefined });
		view.rerender(<AutomationNodeConfigPanel node={node} catalog={rosCatalog} onChange={onChange} onError={vi.fn()} />);
		expect(view.container.querySelector('[data-xgc-role="automation-node-parameter-json"][data-xgc-id="publish:message"] textarea'))
			.toHaveValue('{\n  "data": false\n}');
  });

  it('separates node-specific Parameters from common Settings', () => {
    const node = managedNode();
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={processSchema} parameterPath="parameters" onChange={onChange} onError={vi.fn()} />);

    const parametersTab = screen.getByRole('tab', { name: 'Parameters' });
    expect(parametersTab).toHaveAttribute('data-xgc-id', 'process-01:parameters');
    const parameters = screen.getByRole('tabpanel');
    expect(parameters).toHaveAttribute('data-xgc-id', 'process-01:parameters');
    expect(within(parameters).getByLabelText('Node name')).toHaveValue('ROS master');
    expect(parameters.querySelector('[data-xgc-role="automation-node-id"]')).toBeNull();
    expect(parameters.querySelector('[data-xgc-role="automation-node-kind"]')).toBeNull();
    expect(within(parameters).getByLabelText('Port')).toHaveValue(11311);
    expect(within(parameters).queryByLabelText(/definition|instance/i)).toBeNull();
    expect(parameters.querySelector('[data-xgc-role="automation-node-retry"]')).toBeNull();

    const settingsTab = screen.getByRole('tab', { name: 'Settings' });
    expect(settingsTab).toHaveAttribute('data-xgc-id', 'process-01:settings');
    fireEvent.click(settingsTab);

    const settings = screen.getByRole('tabpanel');
    expect(settings).toHaveAttribute('data-xgc-id', 'process-01:settings');
    expect(settings.querySelector('[data-xgc-role="automation-node-parameter"]')).toBeNull();
    expect(within(settings).queryByLabelText('Node name')).toBeNull();
    expect(within(settings).queryByLabelText('Stable node ID')).toBeNull();
    expect(within(settings).queryByLabelText('Registered kind')).toBeNull();
    expect(settings.querySelector('[data-xgc-role="automation-node-retry"]')).toHaveClass('xgc-form-section');
    expect(within(settings).queryByRole('switch')).toBeNull();
  });

  it('edits the display name without exposing internal node identity', () => {
    const node = managedNode();
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={processSchema} parameterPath="parameters" onChange={onChange} onError={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Parameters' })).toHaveAttribute('aria-selected', 'true');

    const parameters = screen.getByRole('tabpanel');
    const displayName = within(parameters).getByLabelText('Node name');
    expect(displayName).toHaveValue('ROS master');
    expect(displayName).toBeRequired();
    expect(displayName).not.toHaveAttribute('readonly');
    expect(displayName).not.toHaveAttribute('maxlength');
    expect(within(parameters).queryByLabelText('Stable node ID')).toBeNull();
    expect(within(parameters).queryByLabelText('Registered kind')).toBeNull();

    fireEvent.change(displayName, { target: { value: 'Primary ROS master' } });
    expect(onChange).toHaveBeenCalledWith({ displayName: 'Primary ROS master' });

    fireEvent.change(displayName, { target: { value: '🚀'.repeat(161) } });
    expect(onChange).toHaveBeenLastCalledWith({ displayName: '🚀'.repeat(160) });
  });

  it('offers the existing ROS master policy directly below the node name', () => {
    const node = {
      ...managedNode(),
      parameters: {
        definitionId: 'roscore',definitionDigest: 'digest-roscore',
        parameters: { port: 11311,existingMasterPolicy: 'fail' },
      },
    };
    const schema = { type: 'object',properties: {
      existingMasterPolicy: {
        type: 'string',title: 'Existing ROS master',default: 'fail',
        enum: ['fail','force-restart'],enumNames: ['Fail startup','Force restart'],
      },
    } };
    const onChange = vi.fn();
    render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={schema} parameterPath="parameters" onChange={onChange} onError={vi.fn()} />);

    const nodeName = screen.getByLabelText('Node name');
    const policy = screen.getByRole('button', { name: 'Existing ROS master' });
    expect(nodeName.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(policy).toHaveTextContent('Fail startup');

    fireEvent.click(policy);
    fireEvent.click(screen.getByRole('option', { name: 'Force restart' }));
    expect(onChange).toHaveBeenCalledWith({ parameters: {
      definitionId: 'roscore',definitionDigest: 'digest-roscore',
      parameters: { port: 11311,existingMasterPolicy: 'force-restart' },
    } });
  });

  it('edits nested trusted process parameters without exposing locked runtime identity', () => {
    const node = managedNode();
    const onChange = vi.fn();
    render(
      <AutomationNodeConfigPanel
        node={node}
        catalog={catalog}
        parameterSchema={processSchema}
        parameterPath="parameters"
        onChange={onChange}
        onError={vi.fn()}
      />,
    );

    const port = screen.getByRole('spinbutton', { name: 'Port' });
    expect(screen.getByRole('group', { name: 'Port value source' })).toBeInTheDocument();
    fireEvent.change(port, { target: { value: '11312' } });
    expect(onChange).toHaveBeenCalledWith({ parameters: {
      definitionId: 'roscore',definitionDigest: 'digest-roscore',parameters: { port: 11312 },
    } });

    expect(screen.queryByText('definitionId')).toBeNull();
    expect(screen.queryByText('definitionDigest')).toBeNull();
    expect(screen.queryByText('instanceId')).toBeNull();
    expect(screen.queryByLabelText('Stable node ID')).toBeNull();
    expect(screen.queryByLabelText('Registered kind')).toBeNull();
  });

  it('keeps the display name read-only for immutable snapshots without exposing internal identity', () => {
    const node = managedNode();
    render(<AutomationNodeConfigPanel node={node} catalog={catalog} parameterSchema={processSchema} parameterPath="parameters" readOnly onChange={vi.fn()} onError={vi.fn()} />);

    const parameters = screen.getByRole('tabpanel');
    expect(within(parameters).getByLabelText('Node name')).toHaveAttribute('readonly');
    expect(within(parameters).queryByLabelText('Stable node ID')).toBeNull();
    expect(within(parameters).queryByLabelText('Registered kind')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    const settings = screen.getByRole('tabpanel');
    expect(within(settings).queryByLabelText('Node name')).toBeNull();
    expect(within(settings).queryByLabelText('Stable node ID')).toBeNull();
    expect(within(settings).queryByRole('switch')).toBeNull();
    expect(within(settings).getByLabelText('Max attempts')).toBeDisabled();
    expect(within(settings).getByLabelText('Initial backoff (s)')).toBeDisabled();
    expect(within(settings).getByLabelText('Max backoff (s)')).toBeDisabled();
  });
});

function managedNode() {
  return {
    ...newAutomationNode('process.run-definition', {
      definitionId: 'roscore',definitionDigest: 'digest-roscore',parameters: { port: 11311 },
    }, 'ROS master', 2),
    id: 'process-01',
  };
}

function expressionParameterSchema() {
  return {
    type: 'object',
    required: ['message','enabled','level','payload','items'],
    properties: {
      message: { type: 'string',title: 'Message',description: 'Parameter explanation must never render','x-xgc-expression': true },
      enabled: { type: 'boolean',title: 'Enabled','x-xgc-expression': true },
      level: { type: 'string',title: 'Level',enum: ['info','warning'],enumNames: ['Info','Warning'],'x-xgc-expression': true },
      payload: { type: 'object',title: 'Payload','x-xgc-expression': true },
      items: { type: 'array',title: 'Items','x-xgc-expression': true },
      plain: { type: 'string',title: 'Plain' },
    },
  };
}

function expressionCatalog(typeVersion = 2): AutomationNodeCatalogEntry {
  return {
    kind: 'notification',
    typeVersion,
    label: 'notification',
    category: 'Ground station',
    traits: automationCatalogTraits('notification'),
    parameterSchema: expressionParameterSchema(),
  };
}
