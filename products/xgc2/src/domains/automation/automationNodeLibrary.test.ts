import { describe,expect,it } from 'vitest';
import type { ProcessDefinition } from '../execution/executionPublic';
import { automationCatalogTraits } from './automationCatalogTestFixtures';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import { newAutomationNode,newAutomationSpec } from './automationSpecModel';
import {
  automationNodeLibraryItemForNode,
  buildAutomationNodeLibrary,
  defaultAutomationNodeLibraryItems,
  validateAutomationLibraryNodes,
} from './automationNodeLibrary';
import { composeAutomationNodeWeb } from './nodes/automationNodeWebComposition';
import { callGraphAutomationNodeContributions } from './nodes/callGraph/callGraphAutomationNodeContributions';
import { coreFlowAutomationNodeContributions } from './nodes/coreFlow/coreFlowAutomationNodeContributions';
import { groundStationAutomationNodeContributions } from './nodes/groundStation/groundStationAutomationNodeContributions';

const fixtureRosMasterURI = 'http://ros-master.test:11311';
const coreFlowNodeComposition = composeAutomationNodeWeb(...coreFlowAutomationNodeContributions);
const groundStationNodeComposition = composeAutomationNodeWeb(...groundStationAutomationNodeContributions);
const callGraphNodeComposition = composeAutomationNodeWeb(...callGraphAutomationNodeContributions);

describe('Automation node library', () => {
	it('describes the single generic Profile-driven robot operation node', () => {
		const [operation] = buildAutomationNodeLibrary([{
			kind: 'robot.operation',typeVersion: 2,label: 'Run Robot operation',category: 'robot',traits: automationCatalogTraits('robot.operation'),
			parameterSchema: { type: 'object',properties: {} },
		}], []);

		expect(operation).toMatchObject({
			id: 'robot.operation',runtimeTypeVersion: 2,
			description: 'Run a Profile-defined operation for one robot or a selected robot batch through the trusted semantic control path.',
		});
	});

	it('offers the current typed ROS1 publish and service nodes', () => {
		const items = buildAutomationNodeLibrary([
			{
				kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ros1',traits: automationCatalogTraits('ros1.publish-topic'),outputPorts: [{ id: 'published',label: 'Published' },{ id: 'error',label: 'Error' }],
				parameterSchema: { type: 'object',required: ['rosMasterUri','rosIp','rosHostname','topic','messageType','message','publishCount','publishRateHz','latch','queueSize'],properties: {
					rosMasterUri: { type: 'string',default: fixtureRosMasterURI },rosIp: { type: 'string',default: '' },rosHostname: { type: 'string',default: '' },
					topic: { type: 'string' },messageType: { type: 'string',pattern: '^[A-Za-z][A-Za-z0-9_]*/[A-Za-z][A-Za-z0-9_]*$',default: 'std_msgs/String' },message: { type: 'object',default: { data: '' } },latch: { type: 'boolean',default: false },
					publishCount: { type: 'integer',default: 1 },publishRateHz: { type: 'number',default: 1 },queueSize: { type: 'integer',default: 10 },
				} },
			},
			{
				kind: 'ros1.call-service',typeVersion: 1,label: 'Call service',category: 'ros1',traits: automationCatalogTraits('ros1.call-service'),outputPorts: [{ id: 'response',label: 'Response' },{ id: 'error',label: 'Error' }],
				parameterSchema: { type: 'object',required: ['rosMasterUri','rosIp','rosHostname','service','serviceType','request','waitForServiceMs','callTimeoutMs'],properties: {
					rosMasterUri: { type: 'string',default: fixtureRosMasterURI },rosIp: { type: 'string',default: '' },rosHostname: { type: 'string',default: '' },
					service: { type: 'string' },serviceType: { type: 'string' },request: { type: 'object',default: {} },
					waitForServiceMs: { type: 'integer',default: 5000 },callTimeoutMs: { type: 'integer',default: 30000 },
				} },
			},
		], []);

		expect(items).toMatchObject([
			{
				id: 'ros1.publish-topic',description: 'Publish typed ROS1 messages.',category: 'ros1',
				initialParameters: { rosMasterUri: fixtureRosMasterURI,rosIp: '',rosHostname: '',topic: '',messageType: 'std_msgs/String',message: { data: '' },publishCount: 1,publishRateHz: 1,latch: false,queueSize: 10 },
				outputPorts: [{ id: 'published',label: 'Published' },{ id: 'error',label: 'Error' }],
			},
			{
				id: 'ros1.call-service',description: 'Call an arbitrary typed ROS1 service; prefer semantic robot nodes when their safety policy applies.',category: 'ros1',
				initialParameters: { rosMasterUri: fixtureRosMasterURI,rosIp: '',rosHostname: '',service: '',serviceType: '',request: {},waitForServiceMs: 5000,callTimeoutMs: 30000 },
				outputPorts: [{ id: 'response',label: 'Response' },{ id: 'error',label: 'Error' }],
			},
		]);
	});

	it('offers a ROS1 wait node with the ROS Core identity defaults', () => {
		const [wait] = buildAutomationNodeLibrary([{
			kind: 'ros1.wait-roscore-ready',typeVersion: 1,label: 'Wait for ROS Core Ready',category: 'ros1',traits: automationCatalogTraits('ros1.wait-roscore-ready'),outputPorts: [{ id: 'ready',label: 'Ready' }],
			parameterSchema: {
				type: 'object',required: ['rosInstallPath','rosMasterUri','rosIp','rosHostname','masterLogLevel','rosLogDir'],properties: {
					rosInstallPath: { type: 'string',default: '/opt/ros/noetic' },rosMasterUri: { type: 'string',default: fixtureRosMasterURI },
					rosIp: { type: 'string',default: '' },rosHostname: { type: 'string',default: '' },masterLogLevel: { type: 'string',default: 'info' },rosLogDir: { type: 'string',default: '/tmp/xgc2/ros/log' },
				},
			},
		}], []);

		expect(wait).toMatchObject({
			id: 'ros1.wait-roscore-ready',runtimeKind: 'ros1.wait-roscore-ready',label: 'Wait for ROS Core Ready',category: 'ros1',
			description: 'Wait for a matching managed ROS Core to become ready.',outputPorts: [{ id: 'ready',label: 'Ready' }],
			initialParameters: { rosInstallPath: '/opt/ros/noetic',rosMasterUri: fixtureRosMasterURI,rosIp: '',rosHostname: '',masterLogLevel: 'info',rosLogDir: '/tmp/xgc2/ros/log' },
		});
	});

	it('offers a coalesced Gazebo server wait that targets the current managed scene by default', () => {
		const [wait] = buildAutomationNodeLibrary([{
			kind: 'ros1.wait-gazebo-ready',typeVersion: 2,label: 'Wait for Gazebo Server',category: 'ros1',traits: automationCatalogTraits('ros1.wait-gazebo-ready'),outputPorts: [{ id: 'ready',label: 'Ready' },{ id: 'timed-out',label: 'Timed out' }],
			parameterSchema: { type: 'object',properties: {
				timeoutSeconds: { type: 'integer',default: 120 },
			} },
		}], []);

		expect(wait).toMatchObject({
			id: 'ros1.wait-gazebo-ready',runtimeKind: 'ros1.wait-gazebo-ready',label: 'Wait for Gazebo Server',category: 'ros1',
			description: 'Wait for any managed Gazebo server on the execution target to become ready.',
			outputPorts: [{ id: 'ready',label: 'Ready' },{ id: 'timed-out',label: 'Timed out' }],
			initialParameters: { timeoutSeconds: 120 },
		});
	});

  it('initializes Delay with its supported resume mode and a two-second interval', () => {
    const [delay] = buildAutomationNodeLibrary([{
      kind: 'delay',typeVersion: 2,label: 'Delay',category: 'control',traits: automationCatalogTraits('delay'),parameterSchema: {
        type: 'object',required: ['resume','amount','unit'],properties: {
          resume: { type: 'string',enum: ['timeInterval'],default: 'timeInterval' },
          amount: { type: 'number',minimum: 0,default: 2 },
          unit: { type: 'string',enum: ['seconds','minutes','hours','days'],default: 'seconds' },
        },
      },
    }], [], coreFlowNodeComposition);

    expect(delay).toMatchObject({
      runtimeKind: 'delay',runtimeTypeVersion: 2,
      description: 'Pause execution for a configured interval.',
      initialParameters: { resume: 'timeInterval',amount: 2,unit: 'seconds' },
      editableParameterPath: 'root',
    });
  });

  it('projects the runtime output schema into the authoring library without sharing mutable state', () => {
    const outputSchema = {
      type: 'object',
      properties: { selectedRobots: { type: 'array',items: { type: 'object',properties: { id: { type: 'string' } } } } },
    };
    const [asset] = buildAutomationNodeLibrary([{
      kind: 'asset.experiment-robots',typeVersion: 1,label: 'Current Experiment Robots',category: 'Asset',traits: automationCatalogTraits('asset.experiment-robots'),
      parameterSchema: { type: 'object',properties: {} },outputSchema,
    }], []);

    expect(asset.outputSchema).toEqual(outputSchema);
    expect(asset.outputSchema).not.toBe(outputSchema);
  });

	it('presents the current Experiment Robots as a parameter-free immutable source', () => {
		const [asset] = buildAutomationNodeLibrary([{
			kind: 'asset.experiment-robots',typeVersion: 1,label: 'Current Experiment Robots',category: 'asset',traits: automationCatalogTraits('asset.experiment-robots'),
			parameterSchema: { type: 'object',additionalProperties: false },
		}], []);

		expect(asset).toMatchObject({
			id: 'asset.experiment-robots',runtimeKind: 'asset.experiment-robots',runtimeTypeVersion: 1,
			label: 'Current Experiment Robots',category: 'asset',initialParameters: {},
			description: 'Read the immutable Robot selection frozen into the current Experiment run.',
		});
	});

  it('surfaces the trusted panel-state query as a ground-station node', () => {
    const [panelState] = buildAutomationNodeLibrary([{
      kind: 'panel.state.get',typeVersion: 1,label: 'Ground-station panel state',category: 'ground-station',traits: automationCatalogTraits('panel.state.get'),
      parameterSchema: {
        type: 'object',required: ['experimentCommitId','dashboardId','panelId','revision'],properties: {
          experimentCommitId: { type: 'string' },dashboardId: { type: 'string' },
          panelId: { type: 'string' },revision: { type: 'integer',minimum: 1 },
        },
      },
      outputPorts: [{ id: 'snapshot',label: 'Snapshot' }],
    }], []);

    expect(panelState).toMatchObject({
      id: 'panel.state.get',runtimeKind: 'panel.state.get',label: 'Ground-station panel state',category: 'ground-station',
      description: 'Read one revision-pinned public state snapshot from a panel in the immutable Experiment.',
      initialParameters: { experimentCommitId: '',dashboardId: '',panelId: '',revision: 1 },
      outputPorts: [{ id: 'snapshot',label: 'Snapshot' }],
    });
  });

  it('presents the panel-existence node with authoring vocabulary', () => {
    const [panelExists] = buildAutomationNodeLibrary([
      {
        kind: 'experiment.panel.exists',typeVersion: 1,label: 'Experiment panel exists',category: 'ground-station',
        traits: automationCatalogTraits('experiment.panel.exists'),
        parameterSchema: {
          type: 'object',required: ['pluginId'],properties: {
            pluginId: { type: 'string' },dashboardId: { type: 'string' },
          },
        },
        outputPorts: [{ id: 'matched',label: 'Matched' }],
      },
    ], []);

    expect(panelExists).toMatchObject({
      id: 'experiment.panel.exists',runtimeKind: 'experiment.panel.exists',category: 'ground-station',
      label: 'Experiment panel exists',
      description: 'Check whether the frozen Experiment declares a panel of one plugin, then route presentation accordingly.',
      initialParameters: { pluginId: '' },
      outputPorts: [{ id: 'matched',label: 'Matched' }],
    });
    expect(panelExists.keywords).toContain('fallback');
  });

  it('groups panel confirmation and transient notification nodes as ground-station interactions', () => {
    const items = buildAutomationNodeLibrary([
      {
        kind: 'gcs.request-confirmation',typeVersion: 1,label: 'Request confirmation',category: 'ground-station',traits: automationCatalogTraits('gcs.request-confirmation'),
        parameterSchema: { type: 'object',required: ['prompt'],properties: {
          prompt: { type: 'string' },
        } },
      },
      {
        kind: 'notification',typeVersion: 2,label: 'Notification',category: 'ground-station',traits: automationCatalogTraits('notification'),
        parameterSchema: { type: 'object',required: ['message'],properties: {
          title: { type: 'string',default: '' },message: { type: 'string' },
          level: { type: 'string',enum: ['info','success','warning','error'],default: 'info' },
          durationMs: { type: 'integer',minimum: 2000,maximum: 30000,default: 6000 },
        } },
      },
      {
        kind: 'human.wait-confirmation',typeVersion: 1,label: 'Wait for confirmation',category: 'ground-station',traits: automationCatalogTraits('human.wait-confirmation'),
        parameterSchema: { type: 'object',required: ['interactionId'],properties: {
          interactionId: { type: 'string' },
        } },
      },
    ], [], groundStationNodeComposition);

    expect(items).toMatchObject([
      {
        id: 'gcs.request-confirmation',category: 'ground-station',
        description: 'Publish a durable confirmation request into the ground-station panel.',
        initialParameters: { prompt: '' },
      },
      {
        id: 'notification',category: 'ground-station',
        description: 'Publish a notification to the ground station notification center.',
        initialParameters: { title: '',message: '',level: 'info',durationMs: 6000 },
      },
      {
        id: 'human.wait-confirmation',category: 'ground-station',
        description: 'Wait for a panel confirmation and route confirmed, canceled, or timed-out.',
        initialParameters: { interactionId: '' },
      },
    ]);
  });

  it('presents workflow nodes as thin entry points to the shared ground-station capabilities', () => {
    const kinds = [
      ['gcs.status-card','Workflow status card'],
      ['gcs.offer-context','Offer ground-station context'],
    ] as const;
    const items = buildAutomationNodeLibrary(kinds.map(([kind,label]) => ({
      kind,typeVersion: 1,label,category: 'ground-station',traits: automationCatalogTraits(kind),parameterSchema: { type: 'object',properties: {} },
    })), [], groundStationNodeComposition);

    expect(items.map(({ id,category,description }) => ({ id,category,description }))).toEqual([
      { id: 'gcs.status-card',category: 'ground-station',description: 'Publish or update a persistent workflow status card.' },
      { id: 'gcs.offer-context',category: 'ground-station',description: 'Offer a safe link to relevant ground-station context.' },
    ]);
  });

  it('applies CallGraph library presentation only through exact-version composition', () => {
    const catalog: AutomationNodeCatalogEntry[] = [
      {
        kind: 'automation.call',typeVersion: 4,label: 'Call automation',category: 'control',
        traits: automationCatalogTraits('automation.call'),parameterSchema: {},
      },
      {
        kind: 'automation.return',typeVersion: 1,label: 'Return',category: 'control',
        traits: automationCatalogTraits('automation.return'),parameterSchema: {},outputPorts: [],
      },
    ];
    expect(buildAutomationNodeLibrary(catalog, [])[0]?.description)
      .toMatch(/control node/i);
    const items = buildAutomationNodeLibrary(catalog, [], callGraphNodeComposition);
    expect(items.map((item) => ({ id: item.id,description: item.description }))).toEqual([
      {
        id: 'automation.call',
        description: 'Call another Automation and optionally wait for its result.',
      },
      {
        id: 'automation.return',
        description: 'Finish a called Automation and return its result to the caller.',
      },
    ]);
  });

  it('projects every trusted event trigger into the Trigger category', () => {
    const triggers: AutomationNodeCatalogEntry[] = [
      { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object' } },
      { kind: 'trigger.schedule',typeVersion: 2,label: 'Schedule trigger',category: 'trigger',traits: automationCatalogTraits('trigger.schedule'),parameterSchema: { type: 'object' } },
      { kind: 'trigger.form-submission',typeVersion: 1,label: 'On form submission',category: 'trigger',traits: automationCatalogTraits('trigger.form-submission'),parameterSchema: { type: 'object' } },
      { kind: 'trigger.chat-message',typeVersion: 1,label: 'On chat message',category: 'trigger',traits: automationCatalogTraits('trigger.chat-message'),parameterSchema: { type: 'object' } },
      { kind: 'trigger.webhook',typeVersion: 1,label: 'On webhook call',category: 'trigger',traits: automationCatalogTraits('trigger.webhook'),parameterSchema: { type: 'object' } },
      { kind: 'trigger.automation-call',typeVersion: 1,label: 'When called by Automation',category: 'trigger',traits: automationCatalogTraits('trigger.automation-call'),parameterSchema: { type: 'object' } },
    ];

    expect(buildAutomationNodeLibrary(triggers, []).map((item) => ({
      id: item.id,runtimeKind: item.runtimeKind,label: item.label,category: item.category,
    }))).toEqual(triggers.map((entry) => ({
      id: entry.kind,runtimeKind: entry.kind,label: entry.label,category: 'trigger',
    })));
  });

  it('describes every flow-control primitive and preserves an explicit terminal output list', () => {
    const controls: AutomationNodeCatalogEntry[] = [
      { kind: 'filter',typeVersion: 1,label: 'Filter',category: 'control',traits: automationCatalogTraits('filter'),parameterSchema: {},outputPorts: [{ id: 'kept',label: 'Kept' }] },
      { kind: 'merge',typeVersion: 1,label: 'Merge',category: 'control',traits: automationCatalogTraits('merge'),parameterSchema: {} },
      { kind: 'switch',typeVersion: 1,label: 'Switch',category: 'control',traits: automationCatalogTraits('switch'),parameterSchema: {},outputPorts: [{ id: 'fallback',label: 'Fallback' }] },
      { kind: 'stop-and-error',typeVersion: 1,label: 'Stop and Error',category: 'control',traits: automationCatalogTraits('stop-and-error'),parameterSchema: {},outputPorts: [] },
      { kind: 'automation.call',typeVersion: 4,label: 'Call Automation',category: 'control',traits: automationCatalogTraits('automation.call'),parameterSchema: {} },
      { kind: 'automation.return',typeVersion: 1,label: 'Return',category: 'control',traits: automationCatalogTraits('automation.return'),parameterSchema: {},outputPorts: [] },
    ];

    const items = buildAutomationNodeLibrary(
      controls,
      [],
      composeAutomationNodeWeb(
        ...coreFlowAutomationNodeContributions,
        ...callGraphAutomationNodeContributions,
      ),
    );
    expect(items.map((item) => item.description)).toEqual([
      'Keep only items that match the configured rules.',
      'Wait for every connected data input, then combine its JSON items.',
      'Route execution to the first matching case or the fallback output.',
      'Stop the Automation immediately and report a configured error.',
      'Call another Automation and optionally wait for its result.',
      'Finish a called Automation and return its result to the caller.',
    ]);
    expect(items.at(-1)?.outputPorts).toEqual([]);
    expect(items[1].outputPorts).toBeUndefined();
  });

  it('materializes the single scalar automation.call contract without fan-out policies', () => {
    const [call] = buildAutomationNodeLibrary([{
      kind: 'automation.call',typeVersion: 4,label: 'Call Automation',category: 'control',traits: automationCatalogTraits('automation.call'),
      parameterSchema: {
        type: 'object',required: ['automationId','branch','mode','criticality','inputMode','parameters'],properties: {
          automationId: { type: 'string' },branch: { type: 'string',default: 'main' },
          mode: { type: 'string',enum: ['sync','async'],default: 'sync' },
          criticality: { type: 'string',enum: ['required','auxiliary'],default: 'required' },
          inputMode: { type: 'string',enum: ['configured'],default: 'configured' },
          parameters: { type: 'object',default: {} },
        },
      },
    }], []);

    expect(call.initialParameters).toEqual({
      automationId: '',branch: 'main',mode: 'sync',criticality: 'required',inputMode: 'configured',parameters: {},
    });
  });

  it('projects trusted process presets through the sole process runtime handler', () => {
    const items = buildAutomationNodeLibrary(catalog, [
      processDefinition('roscore', 'ROS 1 master', {
        port: { type: 'integer',default: 11311,minimum: 1,maximum: 65535,description: 'ROS master TCP port' },
        configPath: { type: 'string',default: '/opt/ros/default.conf','x-xgc-path-kind': 'file','x-xgc-file-extensions': ['.conf'] },
        existingMasterPolicy: {
          type: 'string',title: 'Existing ROS master',default: 'fail',enum: ['fail','force-restart'],enumNames: ['Fail startup','Force restart'],fixedOnly: true,
        },
      }),
      processDefinition('foxglove-bridge', 'Foxglove bridge', {
        port: { type: 'integer',default: 8765 },
        token: { type: 'string',sensitive: true },
      }, [{ id: 'advanced',label: 'Advanced',collapsed: true,parameters: ['port','token'] }]),
      processDefinition('test-daemon', 'Test daemon', { duration: { type: 'integer',default: 10 } }),
    ]);

    expect(items.map((item) => item.id)).toEqual([
      'trigger.manual',
      'process-preset:roscore',
      'process-preset:foxglove-bridge',
    ]);
    const roscore = items[1];
    expect(roscore).toMatchObject({
      runtimeKind: 'process.run-definition',runtimeTypeVersion: 2,label: 'ROS 1 master',category: 'ros1',
      description: 'ROS 1 master description',
      editableParameterPath: 'parameters',
      initialParameters: {
        definitionId: 'roscore',definitionDigest: 'digest-roscore',runtimeLifecycle: 'supervised',
        parameters: { port: 11311,configPath: '/opt/ros/default.conf',existingMasterPolicy: 'fail' },
      },
    });
    expect(roscore.editableParameterSchema).toEqual({
      type: 'object',additionalProperties: false,
      properties: {
        port: { type: 'integer',title: 'Port',default: 11311,minimum: 1,maximum: 65535,description: 'ROS master TCP port','x-xgc-expression': true },
        configPath: { type: 'string',title: 'Config Path',default: '/opt/ros/default.conf','x-xgc-path-kind': 'file','x-xgc-file-extensions': ['.conf'],'x-xgc-expression': true },
        existingMasterPolicy: {
          type: 'string',title: 'Existing ROS master',default: 'fail',enum: ['fail','force-restart'],enumNames: ['Fail startup','Force restart'],
        },
      },
    });
    expect(items[2].editableParameterSchema).toMatchObject({
		'x-xgc-parameter-groups': [
			{ id: 'advanced',label: 'Advanced',collapsed: true,parameters: ['port','token'] },
		],
      properties: {
        port: { 'x-xgc-expression': true },
        token: { sensitive: true },
      },
    });
    expect((items[2].editableParameterSchema.properties as Record<string,unknown>).token).not.toHaveProperty('x-xgc-expression');
    expect(JSON.stringify(roscore)).not.toMatch(/executable|argv|instanceId/);
  });

  it('uses the sole current ROS1 command schema without a browser rewrite', () => {
    const currentCatalog: AutomationNodeCatalogEntry = {
      kind: 'ros1.run',typeVersion: 2,label: 'ROS1 Run / Launch',category: 'ros1',traits: ['effect','wait'],
      parameterSchema: {
        type: 'object',required: ['setupBash','command'],properties: {
          setupBash: { type: 'string',title: 'ROS1 setup.bash',default: '/opt/ros/noetic/setup.bash' },
          command: { type: 'string',title: 'Command (rosrun / roslaunch)',default: '' },
        },
      },
    };
    const items = buildAutomationNodeLibrary([currentCatalog], []);

    expect(defaultAutomationNodeLibraryItems(items).map((item) => `${item.runtimeKind}@${item.runtimeTypeVersion}`))
      .toEqual(['ros1.run@2']);
    expect(items[0]).toMatchObject({
      initialParameters: { setupBash: '/opt/ros/noetic/setup.bash',command: '' },
      editableParameterSchema: {
        required: ['setupBash','command'],
        properties: {
          setupBash: { title: 'ROS1 setup.bash' },
          command: { title: 'Command (rosrun / roslaunch)' },
        },
      },
    });
  });

  it('classifies presets by their ROS1 runtime dependency', () => {
    const ros1PresetIds = [
      'roscore','foxglove-bridge','gazebo-server','scout-gazebo-robot','gazebo-vrpn-server',
      'mavros-px4-sitl','vrpn-client-ros1','rviz',
    ];
    const independentPresets = {
      'lichtblick-web': 'visualization',
      'gazebo-client': 'simulation',
    };
    const items = buildAutomationNodeLibrary(catalog, [
      ...ros1PresetIds.map((id) => processDefinition(id, id)),
      ...Object.keys(independentPresets).map((id) => processDefinition(id, id)),
    ]);
    const categoryOf = (definitionId: string) => items.find((item) => item.id === `process-preset:${definitionId}`)?.category;

    expect(Object.fromEntries(ros1PresetIds.map((id) => [id,categoryOf(id)])))
      .toEqual(Object.fromEntries(ros1PresetIds.map((id) => [id,'ros1'])));
    expect(Object.fromEntries(Object.keys(independentPresets).map((id) => [id,categoryOf(id)])))
      .toEqual(independentPresets);
  });

	it('projects every ROS1 process preset through the same expression eligibility rule', () => {
		const ros1PresetIds = [
			'roscore','foxglove-bridge','gazebo-server','scout-gazebo-robot','mavros-px4-sitl',
			'gazebo-vrpn-server','vrpn-client-ros1','rviz',
		];
		const items = buildAutomationNodeLibrary(catalog, ros1PresetIds.map((id) => processDefinition(id, id, {
			editable: { type: 'string',default: '' },
			fixed: { type: 'string',default: '',fixedOnly: true },
			secret: { type: 'string',default: '',sensitive: true },
		})));

		for (const definitionId of ros1PresetIds) {
			const item = items.find((candidate) => candidate.id === `process-preset:${definitionId}`);
			expect(item, definitionId).toBeDefined();
			const properties = item?.editableParameterSchema.properties as Record<string,Record<string,unknown>>;
			expect(properties.editable['x-xgc-expression'], definitionId).toBe(true);
			expect(properties.fixed, definitionId).not.toHaveProperty('x-xgc-expression');
			expect(properties.secret, definitionId).not.toHaveProperty('x-xgc-expression');
		}
	});

  it('resolves presets by runtime kind and locked definition identity', () => {
    const items = buildAutomationNodeLibrary(catalog, [
      processDefinition('roscore', 'ROS 1 master'),
      processDefinition('foxglove-bridge', 'Foxglove bridge'),
    ]);
    const node = newAutomationNode('process.run-definition', {
      definitionId: 'foxglove-bridge',definitionDigest: 'digest-foxglove-bridge',parameters: {},
    });

    expect(automationNodeLibraryItemForNode(items, node)?.id).toBe('process-preset:foxglove-bridge');
    const spec = newAutomationSpec('Mission');
    spec.nodes = [node];
    expect(validateAutomationLibraryNodes(spec, items)).toBe('');
    node.parameters = { definitionId: 'missing',parameters: {} };
    expect(validateAutomationLibraryNodes(spec, items)).toContain('unavailable or changed process definition');
    node.parameters = { definitionId: 'roscore',definitionDigest: 'stale-digest',parameters: {} };
    expect(validateAutomationLibraryNodes(spec, items)).toContain('changed process definition');
  });

  it('exposes only curated user-launchable presets and omits internal process definitions', () => {
    const publicIds = [
      'lichtblick-web','roscore','foxglove-bridge','gazebo-server','scout-gazebo-robot',
      'gazebo-vrpn-server','gazebo-client','vrpn-client-ros1',
      'rviz',
      'xgc2-camera-intrinsic-calibrator-ros1','xgc2-camera-extrinsic-calibrator-ros1',
      'xgc2-camera-extrinsic-tf-ros1',
    ];
    const removedCommandIds = ['roslaunch-command','python-command','executable-command'];
    // Deleted god-node residue: absence of a preset entry is the deletion, so a
    // served definition must yield no palette item at all rather than a hidden one.
    const removedAlgorithmIds = [
      'fs150-vrpn-state-estimator','fs150-hover-thrust-estimator',
      'fs150-multirotor-controller','fs150-reference-trajectory',
      'px4-highres-imu-rate',
    ];
    const definitions = [
      ...publicIds.map((id) => processDefinition(id, id)),
      ...removedCommandIds.map((id) => processDefinition(id, id)),
      ...removedAlgorithmIds.map((id) => processDefinition(id, id)),
      processDefinition('test-daemon', 'Test daemon'),
      processDefinition('lichtblick-robot-scene', 'Internal scene publisher'),
      processDefinition('px4-multirotor-ros1-adapter', 'Internal Robot Adapter runtime'),
    ];

    const items = buildAutomationNodeLibrary(catalog, definitions);
    expect(items
      .filter((item) => item.id.startsWith('process-preset:'))
      .map((item) => item.id.slice('process-preset:'.length)))
      .toEqual(publicIds);
    for (const id of [...removedCommandIds,...removedAlgorithmIds]) {
      expect(items.find((item) => item.id === `process-preset:${id}`)).toBeUndefined();
    }
    expect(items
      .find((item) => item.id === 'process-preset:vrpn-client-ros1'))
      .toMatchObject({ label: 'vrpn-client-ros1',category: 'ros1' });
    expect(items
      .filter((item) => item.id.startsWith('process-preset:xgc2-camera-'))
      .map((item) => item.category))
      .toEqual(['perception','perception','perception']);
  });
});

const catalog: AutomationNodeCatalogEntry[] = [
  { kind: 'trigger.manual',typeVersion: 1,label: 'Manual trigger',category: 'trigger',traits: automationCatalogTraits('trigger.manual'),parameterSchema: { type: 'object' } },
  {
    kind: 'process.run-definition',typeVersion: 2,label: 'Run process definition',category: 'process',traits: automationCatalogTraits('process.run-definition'),canCompensate: true,
    parameterSchema: {
      type: 'object',required: ['definitionId','definitionDigest','parameters','runtimeLifecycle'],properties: {
        definitionId: { type: 'string' },definitionDigest: { type: 'string' },parameters: { type: 'object' },
        runtimeLifecycle: { type: 'string',enum: ['attached','supervised','detach-after-ready'],default: 'supervised' },
      },
    },
  },
];

function processDefinition(
  id: string,
  label: string,
  properties: ProcessDefinition['parameters']['properties'] = {},
	groups: NonNullable<ProcessDefinition['parameters']['groups']> = [],
): ProcessDefinition {
  return {
    id,version: '1.0.0',label,description: `${label} description`,drivers: ['host'],
    parameters: { properties,groups,additionalProperties: false },
    command: { executable: `/trusted/${id}` },
    readiness: { kind: 'process',interval: 1,timeout: 1,successThreshold: 1,failureThreshold: 1 },
    liveness: { kind: 'process',interval: 1,timeout: 1,successThreshold: 1,failureThreshold: 1 },
    stop: { gracePeriod: 1 },restart: { mode: 'never',maxRestarts: 0,backoff: 0 },digest: `digest-${id}`,
  };
}
