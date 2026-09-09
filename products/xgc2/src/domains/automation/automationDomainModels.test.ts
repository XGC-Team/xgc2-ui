import { describe,expect,it } from 'vitest';
import { automationCatalogFixture,automationCatalogTraits } from './automationCatalogTestFixtures';
import {
  AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH,
  AUTOMATION_RETURN_KIND,
  AUTOMATION_SCHEMA_VERSION,
  automationActionWorkNodes,
  automationWorkflowNodeCount,
  automationWorkNodeOccupancy,
  type AutomationNodeCatalogEntry,
  type AutomationParameterBinding,
  type AutomationTargetPolicy,
} from './automationDefinitionContracts';
import {
  AUTOMATION_CALL_TRIGGER_KIND,
  AUTOMATION_TRIGGER_KINDS,
  isAutomationTriggerKind,
} from './automationTriggerContracts';
import type { AutomationRun } from './automationRunContracts';
import { graphHasCycle } from './automationGraphModel';
import { isAutomationRunActive } from './automationRunModel';
import {
  cloneAutomationSpec,
  hydrateAutomationSpec,
  limitAutomationNodeDisplayName,
  newAutomationNode as newAutomationNodeBase,
  newAutomationSpec,
  newAutomationStickyNote,
  normalizeAutomationSpec,
} from './automationSpecModel';
import { validateAutomationSpec as validateAutomationSpecBase } from './automationValidation';
import { composeAutomationNodeWeb } from './nodes/automationNodeWebComposition';
import { coreFlowAutomationNodeContributions } from './nodes/coreFlow/coreFlowAutomationNodeContributions';

const catalog: AutomationNodeCatalogEntry[] = [
  ...AUTOMATION_TRIGGER_KINDS.map((kind) => ({ kind,typeVersion: 1,label: kind,category: 'Trigger',traits: automationCatalogTraits(kind),parameterSchema: { type: 'object',properties: {} } })),
  automationCatalogFixture({ kind: 'process.command',typeVersion: 1,label: 'Command',category: 'Process',traits: ['effect'],parameterSchema: { type: 'object',properties: {} } }),
  { kind: 'notification',typeVersion: 2,label: 'Notification',category: 'Ground station',traits: automationCatalogTraits('notification'),parameterSchema: { type: 'object',properties: {} } },
  { kind: 'gcs.request-confirmation',typeVersion: 1,label: 'Request confirmation',category: 'Ground station',traits: automationCatalogTraits('gcs.request-confirmation'),parameterSchema: { type: 'object',properties: {} } },
  { kind: 'human.wait-confirmation',typeVersion: 1,label: 'Wait for confirmation',category: 'Ground station',traits: automationCatalogTraits('human.wait-confirmation'),parameterSchema: { type: 'object',properties: {} } },
  { kind: 'process.run-definition',typeVersion: 2,label: 'Native process',category: 'Process',traits: automationCatalogTraits('process.run-definition'),parameterSchema: { type: 'object',properties: {} },outputPorts: [{ id: 'ready',label: 'Ready' },{ id: 'stopped',label: 'Stopped' },{ id: 'error',label: 'Error' }] },
  { kind: 'simulation.render-fs150-sdf',typeVersion: 1,label: 'Render FS150 SDF',category: 'Simulation',traits: automationCatalogTraits('simulation.render-fs150-sdf'),parameterSchema: {},outputPorts: [{ id: 'rendered',label: 'Rendered' },{ id: 'error',label: 'Error' }] },
  { kind: 'simulation.spawn-fs150-sdf',typeVersion: 1,label: 'Spawn FS150 SDF',category: 'Simulation',traits: automationCatalogTraits('simulation.spawn-fs150-sdf'),parameterSchema: {},outputPorts: [{ id: 'spawned',label: 'Spawned' },{ id: 'error',label: 'Error' }] },
  { kind: 'condition',typeVersion: 2,label: 'If',category: 'Control',traits: automationCatalogTraits('condition'),parameterSchema: {},outputPorts: [{ id: 'true',label: 'True' },{ id: 'false',label: 'False' }] },
  { kind: 'filter',typeVersion: 1,label: 'Filter',category: 'Control',traits: automationCatalogTraits('filter'),parameterSchema: {},outputPorts: [{ id: 'kept',label: 'Kept' }] },
  { kind: 'merge',typeVersion: 1,label: 'Merge',category: 'Control',traits: automationCatalogTraits('merge'),parameterSchema: {} },
  { kind: 'switch',typeVersion: 1,label: 'Switch',category: 'Control',traits: automationCatalogTraits('switch'),parameterSchema: {},outputPorts: [{ id: 'case-1',label: 'Case 1' },{ id: 'case-2',label: 'Case 2' },{ id: 'case-3',label: 'Case 3' },{ id: 'case-4',label: 'Case 4' },{ id: 'fallback',label: 'Fallback' }] },
  { kind: 'stop-and-error',typeVersion: 1,label: 'Stop and Error',category: 'Control',traits: automationCatalogTraits('stop-and-error'),parameterSchema: {},outputPorts: [] },
  { kind: AUTOMATION_RETURN_KIND,typeVersion: 1,label: 'Return',category: 'Control',traits: automationCatalogTraits('automation.return'),parameterSchema: {},outputPorts: [] },
];

const coreFlowNodeComposition = composeAutomationNodeWeb(...coreFlowAutomationNodeContributions);

function newAutomationNode(
  kind: string,
  parameters: Record<string,unknown> = {},
  label = kind,
  typeVersion = kind === 'condition' ? 2 : 1,
) {
  return newAutomationNodeBase(kind, parameters, label, typeVersion);
}

function validateAutomationSpec(
  spec: Parameters<typeof validateAutomationSpecBase>[0],
  nodeCatalog?: AutomationNodeCatalogEntry[],
) {
  return validateAutomationSpecBase(spec, nodeCatalog, coreFlowNodeComposition);
}

describe('Automation domain models', () => {
  it('rejects a relative ROS topic before saving while allowing an expression binding', () => {
    const publishCatalog: AutomationNodeCatalogEntry[] = [
      ...catalog,
      {
        kind: 'ros1.publish-topic',typeVersion: 3,label: 'Publish topic',category: 'ROS1',traits: ['effect'],
        parameterSchema: {
          type: 'object',required: ['topic'],properties: {
            topic: { type: 'string',title: 'Topic',pattern: '^/[A-Za-z_][A-Za-z0-9_]*(/[A-Za-z_][A-Za-z0-9_]*)*$' },
          },
        },
      },
    ];
    const spec = newAutomationSpec('Publish');
    const publish = newAutomationNode('ros1.publish-topic', { topic: 'chatter' }, 'Publish topic', 3);
    publish.id = 'ros1-publish-topic';
    const trigger = newAutomationNode('trigger.manual');
    trigger.id = 'trigger-manual';
    spec.nodes = [trigger,publish];
    spec.actions[0]!.entryNodeId = trigger.id;
    spec.edges = [{
      id: 'trigger-manual-ros1-publish-topic',from: trigger.id,to: publish.id,condition: 'success',
    }];

    expect(validateAutomationSpec(spec, publishCatalog))
      .toBe('Node ros1-publish-topic: Topic must start with / and be an absolute ROS graph name, for example /chatter.');
    publish.parameters.topic = '/chatter';
    expect(validateAutomationSpec(spec, publishCatalog)).toBe('');
    publish.parameters.topic = 'resolved-at-runtime';
    publish.parameterBindings = [{ target: '/topic',language: 'xgc-expression-v2',expression: '{{ $input.topic }}' }];
    expect(validateAutomationSpec(spec, publishCatalog))
      .toBe('Node ros1-publish-topic: Topic must start with / and be an absolute ROS graph name, for example /chatter.');
    publish.parameters.topic = '/placeholder';
    expect(validateAutomationSpec(spec, publishCatalog)).toBe('');
  });

  it('uses Action-scoped Admission with parallel default and explicit limited policies', () => {
    const fresh = newAutomationSpec('Parallel by default');
    fresh.nodes = [newAutomationNode('trigger.manual')];
    fresh.actions[0]!.entryNodeId = fresh.nodes[0]!.id;
    expect(fresh.actions[0]!.admission).toEqual({});
    expect(hydrateAutomationSpec(fresh).actions[0]!.admission).toEqual({});
    expect(cloneAutomationSpec(fresh).actions[0]!.admission).toEqual({});
    expect(normalizeAutomationSpec(fresh).actions[0]!.admission).toEqual({});

    fresh.actions[0]!.admission = {
      concurrency: { scope: 'workflow',limit: 2,onConflict: 'queue',appliesTo: 'all' },
    };
    expect(cloneAutomationSpec(fresh).actions[0]!.admission).toEqual(fresh.actions[0]!.admission);
    expect(normalizeAutomationSpec(fresh).actions[0]!.admission).toEqual(fresh.actions[0]!.admission);
    expect(validateAutomationSpec(fresh, catalog)).toBe('');

    fresh.actions[0]!.inputSchema.fields = [{ name: 'robot',kind: 'string' }];
    fresh.actions[0]!.admission.concurrency = {
      scope: 'key',limit: 1,keyExpression: '/robot',onConflict: 'replace',appliesTo: 'root',
    };
    expect(validateAutomationSpec(fresh, catalog)).toBe('');
    fresh.actions[0]!.admission.concurrency.keyExpression = 'robot';
    expect(validateAutomationSpec(fresh, catalog)).toContain('RFC 6901');
    fresh.actions[0]!.admission.concurrency.keyExpression = '/missing';
    expect(validateAutomationSpec(fresh, catalog)).toContain('unknown parameter');
    fresh.actions[0]!.admission.concurrency.keyExpression = '/robot';
    fresh.actions[0]!.inputSchema.fields[0]!.sensitive = true;
    expect(validateAutomationSpec(fresh, catalog)).toContain('sensitive parameter');
  });

  it('normalizes one complete typed aggregate without inventing runtime identity', () => {
    const spec = newAutomationSpec(' Mission ', ' local ');
    spec.metadata.tags = [' beta ','alpha','beta'];
    spec.nodes = [newAutomationNode('trigger.manual', {}, ' Manual trigger ')];
    spec.nodes[0].id = ' start ';
    spec.actions[0]!.entryNodeId = ' start ';
    const normalized = normalizeAutomationSpec(spec);

    expect(normalized.metadata).toEqual({ name: 'Mission',description: '',tags: ['alpha','beta'] });
    expect(normalized.targetPolicy.executionTargetId).toBe('local');
    expect(normalized.schemaVersion).toBe(4);
    expect(AUTOMATION_SCHEMA_VERSION).toBe(4);
    expect(normalized.nodes[0].id).toBe('start');
    expect(normalized.nodes[0].displayName).toBe('Manual trigger');
    expect(JSON.stringify(normalized)).not.toContain('definitionId');
    expect(Object.keys(normalized)).toEqual([
      'schemaVersion','metadata','targetPolicy','actions','nodes','edges','stickyNotes',
    ]);
    expect(validateAutomationSpec(normalized, catalog)).toBe('');
  });

  it('preserves supported effect roles and discards unknown declarations', () => {
    const spec = newAutomationSpec('Protected provider');
    const privileged = newAutomationNode('process.command') as ReturnType<typeof newAutomationNode> & {
      effectRole: string;
    };
    privileged.effectRole = 'bootstrap-provider';
    spec.nodes = [privileged];

    for (const authored of [
      hydrateAutomationSpec(spec),
      cloneAutomationSpec(spec),
      normalizeAutomationSpec(spec),
    ]) {
      expect(authored.nodes[0]).toHaveProperty('effectRole', 'bootstrap-provider');
    }

    const unknown = structuredClone(spec);
    (unknown.nodes[0] as unknown as { effectRole: string }).effectRole = 'unknown-provider';
    expect(hydrateAutomationSpec(unknown).nodes[0]).not.toHaveProperty('effectRole');
    expect(cloneAutomationSpec(unknown).nodes[0]).not.toHaveProperty('effectRole');
    expect(normalizeAutomationSpec(unknown).nodes[0]).not.toHaveProperty('effectRole');
    expect(newAutomationNode('process.command')).not.toHaveProperty('effectRole');
  });

  it('preserves portable inherited target policy without inventing a fixed target', () => {
    const spec = newAutomationSpec('Portable Experiment workflow');
    spec.targetPolicy = { mode: 'inherit',executionTargetId: '' };
    spec.nodes = [newAutomationNode('trigger.manual')];
    spec.actions[0]!.entryNodeId = spec.nodes[0]!.id;

    expect(hydrateAutomationSpec(spec).targetPolicy).toEqual({ mode: 'inherit',executionTargetId: '' });
    expect(cloneAutomationSpec(spec).targetPolicy).toEqual({ mode: 'inherit',executionTargetId: '' });
    expect(normalizeAutomationSpec(spec).targetPolicy).toEqual({ mode: 'inherit',executionTargetId: '' });
    expect(validateAutomationSpec(spec, catalog)).toBe('');

    spec.targetPolicy = { mode: 'inherit',executionTargetId: 'local' } as unknown as AutomationTargetPolicy;
    expect(validateAutomationSpec(spec, catalog)).toContain('cannot contain an execution target');
    spec.targetPolicy = { mode: 'inherit',executionTargetId: '' };
    spec.nodes = [newAutomationNode('trigger.schedule')];
    spec.actions[0]!.entryNodeId = spec.nodes[0]!.id;
    expect(validateAutomationSpec(spec, catalog)).toContain('cannot use autonomous trigger');
  });

  it('hydrates, clones, normalizes, and validates parameter bindings without changing expression semantics', () => {
    const spec = newAutomationSpec('Bound values');
    spec.nodes = [newAutomationNode('trigger.manual', { message: 'fixed fallback',z: 0 })];
    spec.nodes[0].id = 'start';
    spec.actions[0]!.entryNodeId = 'start';
    spec.nodes[0].parameterBindings = [
      { target: ' /z ',expression: '{{ $input.altitude }}',language: 'xgc-expression-v2' },
      { target: '/message',expression: '{{ $input.name }}',language: 'xgc-expression-v2' },
    ];

    const hydrated = hydrateAutomationSpec(spec);
    const cloned = cloneAutomationSpec(hydrated);
    const normalized = normalizeAutomationSpec(cloned);
    expect(normalized.nodes[0].parameterBindings).toEqual([
      { target: '/message',expression: '{{ $input.name }}',language: 'xgc-expression-v2' },
      { target: '/z',expression: '{{ $input.altitude }}',language: 'xgc-expression-v2' },
    ]);
    expect(validateAutomationSpec(normalized, catalog)).toBe('');

    cloned.nodes[0].parameterBindings![0].expression = '{{ $run.parameters.changed }}';
    expect(hydrated.nodes[0].parameterBindings![0].expression).toBe('{{ $input.altitude }}');

    const withoutBindings = newAutomationSpec('Fixed only');
    withoutBindings.nodes = [newAutomationNode('trigger.manual')];
    expect(hydrateAutomationSpec(withoutBindings).nodes[0]).not.toHaveProperty('parameterBindings');
    expect(JSON.stringify(normalizeAutomationSpec(withoutBindings))).not.toContain('parameterBindings');
  });

  it('requires explicit v2 bindings to be pure local INPUT mappings', () => {
    const spec = newAutomationSpec('Invalid bindings');
    spec.nodes = [newAutomationNode('trigger.manual', { message: '',nested: {} })];
    spec.nodes[0].id = 'start';
    spec.actions[0]!.entryNodeId = 'start';

    spec.nodes[0].parameterBindings = [{ target: '/message',expression: '{{ $input.name }}',language: 'xgc-expression-v2' }];
    expect(validateAutomationSpec(spec, catalog)).toBe('');

    spec.nodes[0].parameterBindings = [{
      target: '/message',expression: '{{ $input.name }}',
    } as unknown as AutomationParameterBinding];
    expect(validateAutomationSpec(spec, catalog)).toContain('must use xgc-expression-v2');

    spec.nodes[0].parameterBindings = [{ target: '/message',expression: 'Robot {{ $input.name }} ready',language: 'xgc-expression-v2' }];
    expect(validateAutomationSpec(spec, catalog)).toBe('');
    spec.nodes[0].parameterBindings = [{ target: '/message',expression: '{{ $run.parameters.name }}',language: 'xgc-expression-v2' }];
    expect(validateAutomationSpec(spec, catalog)).toContain('local INPUT expressions');
    spec.nodes[0].parameterBindings = [{ target: '/message',expression: '{{ $assets.external.name }}',language: 'xgc-expression-v2' }];
    expect(validateAutomationSpec(spec, catalog)).toContain('local INPUT expressions');

    spec.nodes[0].parameterBindings = [{ target: '/bad~2pointer',expression: '{{ $input }}',language: 'xgc-expression-v2' }];
    expect(validateAutomationSpec(spec, catalog)).toContain('RFC 6901');

    spec.nodes[0].parameterBindings = [
      { target: '/message',expression: '{{ $input }}',language: 'xgc-expression-v2' },
      { target: '/message',expression: '{{ $inputs.source }}',language: 'xgc-expression-v2' },
    ];
    expect(validateAutomationSpec(spec, catalog)).toContain('must be unique');

    spec.nodes[0].parameterBindings = [
      { target: '/nested',expression: '{{ $input }}',language: 'xgc-expression-v2' },
      { target: '/nested/value',expression: '{{ $input.value }}',language: 'xgc-expression-v2' },
    ];
    expect(validateAutomationSpec(spec, catalog)).toContain('must not overlap');

    spec.nodes[0].parameterBindings = [{ target: '/message',expression: 'Robot ready',language: 'xgc-expression-v2' }];
    expect(validateAutomationSpec(spec, catalog)).toContain('local INPUT expressions');
  });

  it('requires a persisted display name independently of the stable node ID', () => {
    const spec = newAutomationSpec('Mission');
    spec.nodes = [newAutomationNode('trigger.manual', {}, 'Launch mission')];
    spec.nodes[0].id = 'internal-trigger-01';
    spec.actions[0]!.entryNodeId = 'internal-trigger-01';

    expect(spec.nodes[0]).toEqual(expect.objectContaining({
      id: 'internal-trigger-01',displayName: 'Launch mission',kind: 'trigger.manual',
    }));
    expect(validateAutomationSpec(spec, catalog)).toBe('');

    spec.nodes[0].displayName = '   ';
    expect(validateAutomationSpec(spec, catalog)).toContain('requires a display name');

    spec.nodes[0].displayName = '节'.repeat(AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH);
    expect(validateAutomationSpec(spec, catalog)).toBe('');
    spec.nodes[0].displayName += '点';
    expect(validateAutomationSpec(spec, catalog)).toContain('exceeds 160 characters');
  });

  it('recognizes every registered event source as the single graph trigger', () => {
    expect(AUTOMATION_TRIGGER_KINDS).toEqual([
      'trigger.manual',
      'trigger.schedule',
      'trigger.target-startup',
      'trigger.form-submission',
      'trigger.chat-message',
      'trigger.webhook',
      'trigger.automation-call',
    ]);
    for (const kind of AUTOMATION_TRIGGER_KINDS) {
      const spec = newAutomationSpec(kind);
      spec.nodes = [newAutomationNode(kind)];
      spec.actions[0]!.entryNodeId = spec.nodes[0]!.id;
      if (kind === AUTOMATION_CALL_TRIGGER_KIND) {
        spec.nodes[0].id = 'called';
        spec.actions[0]!.entryNodeId = 'called';
        spec.nodes.push({ ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' });
        spec.edges = [{ id: 'called-return',from: 'called',to: 'return',condition: 'success' }];
      }
      expect(isAutomationTriggerKind(kind)).toBe(true);
      expect(validateAutomationSpec(spec, catalog)).toBe('');
    }
    expect(isAutomationTriggerKind('notification')).toBe(false);
    expect(isAutomationTriggerKind('automation.call')).toBe(false);
    expect(automationWorkflowNodeCount([
      { kind: 'trigger.manual' },
      { kind: 'process.run-definition' },
      { kind: 'notification' },
    ])).toBe(2);
  });

  it('occupies work nodes, including waits, and ignores triggers', () => {
    const nodes = [
      { id: 'manual',kind: 'trigger.manual' },
      { id: 'compile',kind: 'process.run-bash' },
    ];
    expect(automationWorkNodeOccupancy(nodes)).toEqual({ ready: 0,total: 1,failed: false });
    expect(automationWorkNodeOccupancy(nodes,[
      { nodeId: 'manual',status: 'succeeded' },
      { nodeId: 'compile',status: 'running' },
    ])).toEqual({ ready: 1,total: 1,failed: false });
    expect(automationWorkNodeOccupancy(nodes,[
      { nodeId: 'manual',status: 'succeeded' },
      { nodeId: 'compile',status: 'failed' },
    ])).toEqual({ ready: 1,total: 1,failed: true });
    expect(automationWorkNodeOccupancy([
      { id: 'manual',kind: 'trigger.manual' },
      { id: 'wait',kind: 'wait.process' },
    ], [
      { nodeId: 'manual',status: 'succeeded' },
      { nodeId: 'wait',status: 'waiting' },
    ])).toEqual({ ready: 1,total: 1,failed: false });
    expect(automationWorkNodeOccupancy([
      { id: 'manual',kind: 'trigger.manual' },
      { id: 'first',kind: 'process.run-bash' },
      { id: 'second',kind: 'process.run-bash' },
    ], [
      { nodeId: 'first',status: 'succeeded' },
      { nodeId: 'second',status: 'running' },
    ])).toEqual({ ready: 2,total: 2,failed: false });
  });

  it('scopes occupancy to the invoked Action graph, not sibling Actions', () => {
    const spec = {
      nodes: [
        { id: 'publish-entry',kind: 'trigger.manual' },
        { id: 'publish',kind: 'ros.publish' },
        { id: 'algo-entry',kind: 'trigger.manual' },
        { id: 'wait',kind: 'wait.process' },
      ],
      edges: [
        { from: 'publish-entry',to: 'publish' },
        { from: 'algo-entry',to: 'wait' },
      ],
    };
    expect(automationActionWorkNodes(spec,{ entryNodeId: 'publish-entry' }).map((node) => node.id))
      .toEqual(['publish-entry','publish']);
    expect(automationWorkNodeOccupancy(
      automationActionWorkNodes(spec,{ entryNodeId: 'publish-entry' }),
      [{ nodeId: 'publish',status: 'running' },{ nodeId: 'wait',status: 'waiting' }],
    )).toEqual({ ready: 1,total: 1,failed: false });
    expect(automationWorkNodeOccupancy(
      automationActionWorkNodes(spec,{ entryNodeId: 'algo-entry' }),
      [{ nodeId: 'publish',status: 'succeeded' },{ nodeId: 'wait',status: 'waiting' }],
    )).toEqual({ ready: 1,total: 1,failed: false });
  });

  it('accepts multiple independent entrypoints and rejects incoming trigger connections', () => {
    const multi = newAutomationSpec('Multiple triggers');
    multi.nodes = [newAutomationNode('trigger.manual'),newAutomationNode('trigger.webhook')];
    multi.nodes[0].id = 'manual';
    multi.nodes[1].id = 'webhook';
    expect(validateAutomationSpec(multi, catalog)).toBe('');

    multi.nodes.push({ ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' });
    multi.nodes.push({ ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' });
    multi.edges.push({ id: 'called-return',from: 'called',to: 'return',condition: 'success' });
    expect(validateAutomationSpec(multi, catalog)).toBe('');
    multi.nodes.push({ ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called-again' });
    expect(validateAutomationSpec(multi, catalog)).toContain('only one When called');
    multi.nodes.pop();

    const incoming = newAutomationSpec('Incoming trigger');
    incoming.nodes = [newAutomationNode('trigger.chat-message'),newAutomationNode('process.command')];
    incoming.nodes[0].id = 'chat';
    incoming.nodes[1].id = 'task';
    incoming.actions[0]!.entryNodeId = 'chat';
    incoming.edges = [{ id: 'task-chat',from: 'task',to: 'chat',condition: 'success' }];
    expect(validateAutomationSpec(incoming, catalog)).toContain('cannot have incoming connections');
  });

  it('validates Return convergence only inside the When called entrypoint scope', () => {
    const independent = newAutomationSpec('Manual and called branches');
    independent.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('process.command'),id: 'called-task' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
      { ...newAutomationNode('trigger.manual'),id: 'manual' },
      { ...newAutomationNode('process.command'),id: 'manual-task' },
    ];
    independent.edges = [
      { id: 'called-task',from: 'called',to: 'called-task',condition: 'success' },
      { id: 'called-return',from: 'called-task',to: 'return',condition: 'success' },
      { id: 'manual-task',from: 'manual',to: 'manual-task',condition: 'success' },
    ];
    expect(validateAutomationSpec(independent, catalog)).toBe('');

    const shared = structuredClone(independent);
    shared.nodes = shared.nodes.filter((node) => !['called-task','manual-task'].includes(node.id));
    shared.nodes.push({ ...newAutomationNode('process.command'),id: 'shared-task' });
    shared.edges = [
      { id: 'called-shared',from: 'called',to: 'shared-task',condition: 'success' },
      { id: 'manual-shared',from: 'manual',to: 'shared-task',condition: 'success' },
      { id: 'shared-return',from: 'shared-task',to: 'return',condition: 'success' },
    ];
    expect(validateAutomationSpec(shared, catalog)).toBe('');
  });

  it('accepts output ports only when the trusted catalog declares them', () => {
    const spec = newAutomationSpec('Lifecycle outputs');
    spec.nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'start' },
      { ...newAutomationNode('process.run-definition'),id: 'master' },
      { ...newAutomationNode('process.command'),id: 'consumer' },
    ];
    spec.actions[0]!.entryNodeId = 'start';
    spec.edges = [
      { id: 'start-master',from: 'start',to: 'master',condition: 'success' },
      { id: 'master-consumer',from: 'master',to: 'consumer',sourcePort: 'ready',condition: 'success' },
    ];
    expect(validateAutomationSpec(spec, catalog)).toBe('');

    spec.edges[1].sourcePort = 'logs';
    expect(validateAutomationSpec(spec, catalog)).toContain('unsupported output port');
    spec.edges[1] = { ...spec.edges[1],from: 'start',sourcePort: 'ready' };
    expect(validateAutomationSpec(spec, catalog)).toContain('without declared output ports');
  });

  it('validates catalog routes and terminal Stop and Error nodes without special Merge edges', () => {
    const routed = newAutomationSpec('Routed control');
    routed.nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'start' },
      { ...newAutomationNode('condition'),id: 'condition' },
      { ...newAutomationNode('process.command'),id: 'finish' },
    ];
    routed.actions[0]!.entryNodeId = 'start';
    routed.edges = [
      { id: 'start-condition',from: 'start',to: 'condition',condition: 'success' },
      { id: 'condition-finish',from: 'condition',to: 'finish',condition: 'success',route: 'true' },
    ];
    expect(validateAutomationSpec(routed, catalog)).toBe('');
    routed.edges[1].route = 'maybe';
    expect(validateAutomationSpec(routed, catalog)).toContain('not declared');

    const merged = newAutomationSpec('Merge branches');
    merged.nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'start' },
      { ...newAutomationNode('process.command'),id: 'left' },
      { ...newAutomationNode('merge'),id: 'join' },
    ];
    merged.actions[0]!.entryNodeId = 'start';
    merged.edges = [
      { id: 'start-left',from: 'start',to: 'left',condition: 'success' },
      { id: 'left-join',from: 'left',to: 'join',condition: 'success' },
    ];
    expect(validateAutomationSpec(merged, catalog)).toBe('');
    merged.edges[1].condition = 'always';
    expect(validateAutomationSpec(merged, catalog)).toBe('');

    const stopped = newAutomationSpec('Stop terminal');
    stopped.nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'start' },
      { ...newAutomationNode('stop-and-error'),id: 'stop' },
    ];
    stopped.actions[0]!.entryNodeId = 'start';
    stopped.edges = [{ id: 'start-stop',from: 'start',to: 'stop',condition: 'success' }];
    expect(validateAutomationSpec(stopped, catalog)).toBe('');
    stopped.nodes.push({ ...newAutomationNode('process.command'),id: 'after' });
    stopped.edges.push({ id: 'stop-after',from: 'stop',to: 'after',condition: 'success' });
    expect(validateAutomationSpec(stopped, catalog)).toContain('cannot have outgoing connections');
  });

  it('applies optional CoreFlow graph semantics only through exact-version composition', () => {
    const stopped = newAutomationSpec('Static terminal semantics');
    stopped.nodes = [
      { ...newAutomationNode('trigger.manual'),id: 'start' },
      { ...newAutomationNode('stop-and-error'),id: 'stop' },
      { ...newAutomationNode('process.command'),id: 'after' },
    ];
    stopped.actions[0]!.entryNodeId = 'start';
    stopped.edges = [
      { id: 'start-stop',from: 'start',to: 'stop',condition: 'success' },
      { id: 'stop-after',from: 'stop',to: 'after',condition: 'success' },
    ];

    expect(validateAutomationSpecBase(stopped, catalog)).toBe('');
    expect(validateAutomationSpec(stopped, catalog)).toContain('cannot have outgoing connections');

    stopped.nodes[1] = { ...stopped.nodes[1]!,typeVersion: 2 };
    expect(validateAutomationSpec(stopped, catalog)).toBe('');
  });

  it('treats Automation Return as a terminal node', () => {
    const spec = newAutomationSpec('Called workflow');
    spec.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    spec.actions[0]!.entryNodeId = 'called';
    spec.edges = [{ id: 'called-return',from: 'called',to: 'return',condition: 'success' }];

    expect(validateAutomationSpec(spec, catalog)).toBe('');
    const missingReturn = { ...spec,nodes: spec.nodes.slice(0, 1),edges: [] };
    expect(validateAutomationSpec(missingReturn, catalog)).toContain('requires exactly one Return');
    const ordinary = { ...spec,actions: spec.actions.map((action) => ({ ...action,entryNodeId: 'manual' })),nodes: [
      { ...newAutomationNode('trigger.manual'),id: 'manual' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ],edges: [{ id: 'manual-return',from: 'manual',to: 'return',condition: 'success' as const }] };
    expect(validateAutomationSpec(ordinary, catalog)).toContain('Only an Automation started by When called');
    spec.nodes.push({ ...newAutomationNode('process.command'),id: 'after' });
    spec.edges.push({ id: 'return-after',from: 'return',to: 'after',condition: 'success' });
    expect(validateAutomationSpec(spec, catalog)).toContain('cannot have outgoing connections');
  });

  it('requires every successful called-workflow outcome to converge on Return', () => {
    const branches = newAutomationSpec('Called workflow with branches');
    branches.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('condition'),id: 'decision' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
      { ...newAutomationNode('process.command'),id: 'unreturned' },
    ];
    branches.actions[0]!.entryNodeId = 'called';
    branches.edges = [
      { id: 'called-decision',from: 'called',to: 'decision',condition: 'success' },
      { id: 'decision-return',from: 'decision',to: 'return',condition: 'success',route: 'true' },
      { id: 'decision-unreturned',from: 'decision',to: 'unreturned',condition: 'success',route: 'false' },
    ];
    expect(validateAutomationSpec(branches, catalog)).toContain('successful path ends at node unreturned');

    branches.nodes[3] = { ...newAutomationNode('stop-and-error'),id: 'unreturned' };
    expect(validateAutomationSpec(branches, catalog)).toBe('');

    branches.nodes = branches.nodes.slice(0, 3);
    branches.edges = branches.edges.slice(0, 2);
    expect(validateAutomationSpec(branches, catalog)).toContain('node decision route "false"');
  });

  it('allows multiple Return inputs but rejects mutually exclusive branch joins', () => {
    const branches = newAutomationSpec('Called branches');
    branches.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('condition'),id: 'decision' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    branches.actions[0]!.entryNodeId = 'called';
    branches.edges = [
      { id: 'called-decision',from: 'called',to: 'decision',condition: 'success' },
      { id: 'decision-true',from: 'decision',to: 'return',condition: 'success',route: 'true' },
      { id: 'decision-false',from: 'decision',to: 'return',condition: 'success',route: 'false' },
    ];
    expect(validateAutomationSpec(branches, catalog)).toContain('joins mutually exclusive branches');

    branches.edges.splice(2, 1);
    expect(validateAutomationSpec(branches, catalog)).toContain('node decision route "false"');

    branches.nodes.splice(1, 1,
      { ...newAutomationNode('process.command'),id: 'left' },
      { ...newAutomationNode('process.command'),id: 'right' },
    );
    branches.edges = [
      { id: 'called-left',from: 'called',to: 'left',condition: 'success' },
      { id: 'called-right',from: 'called',to: 'right',condition: 'success' },
      { id: 'left-return',from: 'left',to: 'return',condition: 'success' },
      { id: 'right-return',from: 'right',to: 'return',condition: 'success' },
    ];
    expect(validateAutomationSpec(branches, catalog)).toBe('');
  });

  it('lets an unnamed main continuation cover named outcomes and requires Filter empty convergence', () => {
    const condition = newAutomationSpec('Called condition');
    condition.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('condition'),id: 'decision' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    condition.actions[0]!.entryNodeId = 'called';
    condition.edges = [
      { id: 'called-decision',from: 'called',to: 'decision',condition: 'success' },
      { id: 'decision-return',from: 'decision',to: 'return',condition: 'success',sourcePort: 'main' },
    ];
    expect(validateAutomationSpec(condition, catalog)).toBe('');

    const filter = newAutomationSpec('Called filter');
    filter.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('filter'),id: 'filter' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    filter.actions[0]!.entryNodeId = 'called';
    filter.edges = [
      { id: 'called-filter',from: 'called',to: 'filter',condition: 'success' },
      { id: 'filter-return',from: 'filter',to: 'return',condition: 'success',route: 'kept' },
    ];
    expect(validateAutomationSpec(filter, catalog)).toContain('route "empty"');
    filter.edges[1].route = undefined;
    expect(validateAutomationSpec(filter, catalog)).toBe('');

    filter.edges[1] = { id: 'filter-return',from: 'filter',to: 'return',condition: 'always',route: 'kept' };
    expect(validateAutomationSpec(filter, catalog)).toContain('must use a success connection');
  });

  it('rejects ordinary joins of mutually exclusive IF and Switch branches', () => {
    const implicitIfJoin = newAutomationSpec('Called IF join');
    implicitIfJoin.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('condition'),id: 'decision' },
      { ...newAutomationNode('process.command'),id: 'true-action' },
      { ...newAutomationNode('process.command'),id: 'false-action' },
      { ...newAutomationNode('process.command'),id: 'join' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    implicitIfJoin.actions[0]!.entryNodeId = 'called';
    implicitIfJoin.edges = [
      { id: 'called-decision',from: 'called',to: 'decision',condition: 'success' },
      { id: 'decision-true',from: 'decision',to: 'true-action',condition: 'success',route: 'true' },
      { id: 'decision-false',from: 'decision',to: 'false-action',condition: 'success',route: 'false' },
      { id: 'true-join',from: 'true-action',to: 'join',condition: 'success' },
      { id: 'false-join',from: 'false-action',to: 'join',condition: 'success' },
      { id: 'join-return',from: 'join',to: 'return',condition: 'success' },
    ];
    expect(validateAutomationSpec(implicitIfJoin, catalog)).toContain('joins mutually exclusive branches');

    const explicitMerge = newAutomationSpec('Called IF merge');
    explicitMerge.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('condition'),id: 'decision' },
      { ...newAutomationNode('merge'),id: 'merge' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    explicitMerge.actions[0]!.entryNodeId = 'called';
    explicitMerge.edges = [
      { id: 'called-decision',from: 'called',to: 'decision',condition: 'success' },
      { id: 'decision-true',from: 'decision',to: 'merge',condition: 'always',route: 'true' },
      { id: 'decision-false',from: 'decision',to: 'merge',condition: 'always',route: 'false' },
      { id: 'merge-return',from: 'merge',to: 'return',condition: 'success' },
    ];
    expect(validateAutomationSpec(explicitMerge, catalog)).toContain('must use a success connection');
    explicitMerge.edges[1].condition = 'success';
    explicitMerge.edges[2].condition = 'success';
    expect(validateAutomationSpec(explicitMerge, catalog)).toContain('joins mutually exclusive branches');

    const implicitSwitchJoin = newAutomationSpec('Called Switch join');
    implicitSwitchJoin.nodes = [
      { ...newAutomationNode(AUTOMATION_CALL_TRIGGER_KIND),id: 'called' },
      { ...newAutomationNode('switch', { rules: [{},{}] }),id: 'switch' },
      { ...newAutomationNode('process.command'),id: 'case-one' },
      { ...newAutomationNode('process.command'),id: 'case-two' },
      { ...newAutomationNode('stop-and-error'),id: 'fallback' },
      { ...newAutomationNode('process.command'),id: 'join' },
      { ...newAutomationNode(AUTOMATION_RETURN_KIND),id: 'return' },
    ];
    implicitSwitchJoin.actions[0]!.entryNodeId = 'called';
    implicitSwitchJoin.edges = [
      { id: 'called-switch',from: 'called',to: 'switch',condition: 'success' },
      { id: 'switch-one',from: 'switch',to: 'case-one',condition: 'success',route: 'case-1' },
      { id: 'switch-two',from: 'switch',to: 'case-two',condition: 'success',route: 'case-2' },
      { id: 'switch-fallback',from: 'switch',to: 'fallback',condition: 'success',route: 'fallback' },
      { id: 'one-join',from: 'case-one',to: 'join',condition: 'success' },
      { id: 'two-join',from: 'case-two',to: 'join',condition: 'success' },
      { id: 'join-return',from: 'join',to: 'return',condition: 'success' },
    ];
    expect(validateAutomationSpec(implicitSwitchJoin, catalog)).toContain('joins mutually exclusive branches');
  });

  it('limits editable display names by Unicode characters instead of UTF-16 code units', () => {
    expect(limitAutomationNodeDisplayName('🚀'.repeat(161))).toBe('🚀'.repeat(160));
    expect(newAutomationNode('notification', {}, '🚀'.repeat(161)).displayName).toBe('🚀'.repeat(160));
  });

  it('rejects untrusted kinds, invalid typed parameter rules and graph cycles', () => {
    const spec = newAutomationSpec('Mission');
    spec.nodes = [newAutomationNode('untrusted.node')];
    spec.actions[0]!.entryNodeId = spec.nodes[0]!.id;
    expect(validateAutomationSpec(spec, catalog)).toContain('untrusted kind');

    const pinnedV1 = newAutomationSpec('Pinned v1');
    pinnedV1.nodes = [newAutomationNode('trigger.manual', {}, 'Manual', 1)];
    pinnedV1.actions[0]!.entryNodeId = pinnedV1.nodes[0]!.id;
    expect(validateAutomationSpec(pinnedV1, catalog.map((entry) => ({ ...entry,typeVersion: 2 })))).toBe('');

    spec.nodes = [newAutomationNode('trigger.manual'),newAutomationNode('process.command')];
    spec.nodes[0].id = 'start';
    spec.nodes[1].id = 'task';
    spec.actions[0]!.entryNodeId = 'start';
    spec.edges = [
      { id: 'start-task',from: 'start',to: 'task',condition: 'success' },
      { id: 'task-start',from: 'task',to: 'start',condition: 'success' },
    ];
    expect(graphHasCycle(spec.nodes, spec.edges)).toBe(true);
    expect(validateAutomationSpec(spec, catalog)).toContain('cycle');

    spec.edges = [{ id: 'start-task',from: 'start',to: 'task',condition: 'success' }];
    spec.actions[0]!.inputSchema.fields = [{ name: 'secret',kind: 'number',sensitive: true }];
    expect(validateAutomationSpec(spec, catalog)).toContain('must be a string');
  });

  it('round-trips bounded recursive run parameter schemas without opening unknown objects', () => {
    const spec = newAutomationSpec('Recursive parameters');
    spec.nodes = [newAutomationNode('trigger.manual')];
    spec.actions[0]!.entryNodeId = spec.nodes[0]!.id;
    spec.actions[0]!.inputSchema.fields = [{
      name: 'robots',kind: 'array',required: true,array: {
        minItems: 1,maxItems: 2,items: { kind: 'object',object: { fields: [
          { name: 'px4',kind: 'object',required: true,object: { fields: [{ name: 'mavSystemId',kind: 'integer',required: true }] } },
          { name: 'id',kind: 'string',required: true },
        ] } },
      },
    }];
    const normalized = normalizeAutomationSpec(hydrateAutomationSpec(cloneAutomationSpec(spec)));
    expect(normalized.actions[0]!.inputSchema.fields[0]).toEqual(expect.objectContaining({
      name: 'robots',kind: 'array',array: expect.objectContaining({ minItems: 1,maxItems: 2 }),
    }));
    expect(normalized.actions[0]!.inputSchema.fields[0]!.array?.items.object?.fields.map((field) => field.name)).toEqual(['id','px4']);
    expect(validateAutomationSpec(normalized, catalog)).toBe('');

    spec.actions[0]!.inputSchema.fields = [{
      name: 'robotIds',kind: 'array',required: true,array: {
        minItems: 0,maxItems: 8,items: { kind: 'string' },default: ['scout-01','scout-02'],
      },
    }];
    const withDefault = normalizeAutomationSpec(hydrateAutomationSpec(cloneAutomationSpec(spec)));
    expect(withDefault.actions[0]!.inputSchema.fields[0]!.array?.default).toEqual(['scout-01','scout-02']);
    const clonedDefault = withDefault.actions[0]!.inputSchema.fields[0]!.array?.default as string[];
    clonedDefault.push('mutated');
    expect(spec.actions[0]!.inputSchema.fields[0]!.array?.default).toEqual(['scout-01','scout-02']);
    expect(validateAutomationSpec(withDefault, catalog)).toBe('');

    withDefault.actions[0]!.inputSchema.fields[0]!.array!.default = true as unknown as string[];
    expect(validateAutomationSpec(withDefault, catalog)).toContain('must be an array');
    withDefault.actions[0]!.inputSchema.fields[0]!.array!.default = ['a','b','c','d','e','f','g','h','i'];
    expect(validateAutomationSpec(withDefault, catalog)).toContain('between 0 and 8');
    withDefault.actions[0]!.inputSchema.fields[0]!.array!.default = [1 as unknown as string];
    expect(validateAutomationSpec(withDefault, catalog)).toContain('must be a string');

    normalized.actions[0]!.inputSchema.fields[0]!.array!.maxItems = 10_001;
    expect(validateAutomationSpec(normalized, catalog)).toContain('invalid array bounds');
    normalized.actions[0]!.inputSchema.fields[0]!.array!.maxItems = 2;
    normalized.actions[0]!.inputSchema.fields[0]!.array!.items.object!.fields[1]!.number = {};
    expect(validateAutomationSpec(normalized, catalog)).toContain('constraints for the wrong kind');
  });

  it('normalizes and validates sticky notes as authoring-only canvas data', () => {
    const spec = newAutomationSpec('Mission');
    spec.nodes = [newAutomationNode('trigger.manual')];
    spec.actions[0]!.entryNodeId = spec.nodes[0]!.id;
    spec.stickyNotes = [newAutomationStickyNote(' note-2 ', { x: 25,y: 40 }),newAutomationStickyNote('note-1', { x: 5,y: 10 })];

    const normalized = normalizeAutomationSpec(spec);
    expect(normalized.stickyNotes.map((note) => note.id)).toEqual(['note-1','note-2']);
    expect(normalized.stickyNotes[0]).toEqual(expect.objectContaining({ width: 240,height: 160,position: { x: 5,y: 10 } }));
    expect(validateAutomationSpec(normalized, catalog)).toBe('');

    normalized.stickyNotes[1].id = 'note-1';
    expect(validateAutomationSpec(normalized, catalog)).toContain('must be unique');
    normalized.stickyNotes[1].id = 'note-2';
    normalized.stickyNotes[1].width = 149;
    expect(validateAutomationSpec(normalized, catalog)).toContain('width is invalid');
  });

  it('treats every canonical non-terminal Run status as in progress', () => {
    expect(['accepted','queued','running','waiting','stopping'].map((status) => (
      isAutomationRunActive(runFixture({ status: status as AutomationRun['status'] }))
    ))).toEqual([true,true,true,true,true]);
    expect(['succeeded','failed','canceled','stopped','rejected'].map((status) => (
      isAutomationRunActive(runFixture({ status: status as AutomationRun['status'] }))
    ))).toEqual([false,false,false,false,false]);
  });

});

function runFixture(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: 'run-a',targetId: 'local',automationResourceId: 'automation-a',definitionId: 'runtime-definition',definitionVersion: 1,actionId:'run',actionVersion:1,
    definitionDigest: 'digest',
    sourceKind: 'automation',sourceRef: { domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-1',version: 1,digest: 'digest' },
    status: 'running',revision: 1,parameters: {},admissionMode: 'limited',admissionScope: 'root',
    admissionKey: 'definition:runtime-definition',admissionLimit: 1,admissionOnConflict: 'queue',
    createdAt: '2026-07-14T00:00:00Z',startedAt: '2026-07-14T00:00:00Z',updatedAt: '2026-07-14T00:00:00Z',
    ...overrides,
    configDigest: overrides.configDigest ?? 'a'.repeat(64),executionPlanDigest: overrides.executionPlanDigest ?? 'b'.repeat(64),registryDigest: overrides.registryDigest ?? 'c'.repeat(64),
    acceptedAt: overrides.acceptedAt ?? '2026-07-14T00:00:00Z',
    rootRunId: overrides.rootRunId ?? overrides.id ?? 'run-a',depth: overrides.depth ?? 0,
    correlationId: overrides.correlationId ?? overrides.rootRunId ?? overrides.id ?? 'run-a',
    executionModel: 'orchestration-occurrence-v1',
  };
}
