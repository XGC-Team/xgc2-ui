import type {
  AutomationDocument,
  AutomationEdge,
  AutomationParameterField,
} from '../../domains/automation/automationPublic';
import { automationTargetPolicyInheritsExperiment } from '../../domains/automation/automationPublic';
import {
  LICHTBLICK_LAYOUT_DEFAULTS,
  LICHTBLICK_LAYOUT_MODES,
} from './lichtblickLayoutOptions';

export const LICHTBLICK_SYSTEM_WORKFLOW_KEY = 'lichtblick-ros-bridge';

/** The Experiment workflow slot this panel starts and stops. */
export const LICHTBLICK_WORKFLOW_SLOT = 'lichtblick';

export const LICHTBLICK_CAMERA_TOPICS = {
  simulation: {
    imageTopic: '/xgc/camera/world/video_h264',
    cameraInfoTopic: '/xgc/camera/world/camera_info',
  },
  physical: {
    imageTopic: '/usb_cam/image_raw/compressed',
    cameraInfoTopic: '/usb_cam/camera_info',
  },
} as const;

export type LichtblickRunMode = 'simulation' | 'physical' | 'hybrid';

export type LichtblickWorkflowResolution = {
  document?: AutomationDocument;
  error: string;
};

export function resolveLichtblickSystemWorkflow(
  documents: AutomationDocument[],
): LichtblickWorkflowResolution {
  const candidates = documents.filter((document) => (
    document.head.system === true
    && !document.head.originResourceId
    && document.head.systemKey === LICHTBLICK_SYSTEM_WORKFLOW_KEY
  ));
  if (candidates.length === 0) return { error: 'Lichtblick visualization system workflow is unavailable.' };
  if (candidates.length > 1) return { error: 'Lichtblick visualization has multiple protected system workflows.' };
  const document = candidates[0]!;
  const error = lichtblickWorkflowValidationError(document);
  return error ? { error } : { document,error: '' };
}

export function lichtblickCameraTopicsForRunMode(
  document: AutomationDocument,
  runMode: string,
) {
  if (lichtblickWorkflowValidationError(document) || !isLichtblickRunMode(runMode)) return undefined;
  return runMode === 'physical' || runMode === 'hybrid'
    ? LICHTBLICK_CAMERA_TOPICS.physical
    : LICHTBLICK_CAMERA_TOPICS.simulation;
}

export function lichtblickWorkflowValidationError(document: AutomationDocument) {
  const label = `Lichtblick visualization workflow "${document.spec.metadata.name}"`;
  if (!automationTargetPolicyInheritsExperiment(document.spec.targetPolicy)) {
    return `${label} must inherit the current Experiment execution target.`;
  }
  if (!trustedActions(document)) {
    return `${label} must expose only the canonical start and start-for-experiment Actions.`;
  }
  if (document.spec.actions.some((action) => !trustedAdmission(action.admission))) {
    return `${label} must enforce one active workflow because its bridge and WebUI listeners are singletons.`;
  }

  const manual = canonicalNode(document, 'manual', 'trigger.manual');
  const called = canonicalNode(document, 'called', 'trigger.automation-call');
  const entry = canonicalNode(document, 'entry', 'merge');
  const rosReady = canonicalNode(document, 'ros-master', 'ros1.wait-roscore-ready');
  const robots = canonicalNode(document, 'experiment-robots', 'asset.experiment-robots');
  const scene = canonicalNode(document, 'robot-scene', 'visualization.robot-scene');
  const descriptions = canonicalNode(document, 'robot-descriptions', 'visualization.robot-descriptions');
  const mode = canonicalNode(document, 'is-physical', 'condition');
  const simulationLayout = canonicalNode(document, 'simulation-layout', 'visualization.lichtblick-layout');
  const physicalLayout = canonicalNode(document, 'physical-layout', 'visualization.lichtblick-layout');
  const selectedLayout = canonicalNode(document, 'lichtblick-layout', 'merge');
  const bridge = canonicalProcess(document, 'foxglove-bridge', 'foxglove-bridge');
  const web = canonicalProcess(document, 'lichtblick-web', 'lichtblick-web');
  const returned = canonicalNode(document, 'return', 'automation.return');

  if (!manual || manual.typeVersion !== 2 || !emptyObject(manual.parameters)
      || !called || called.typeVersion !== 1 || !emptyObject(called.parameters)
      || (called.parameterBindings?.length ?? 0) !== 0
      || !entry || entry.typeVersion !== 1
      || !isCanonicalMerge(entry.parameters, ['manual','called'])
      || (entry.parameterBindings?.length ?? 0) !== 0
      || !isCanonicalEntryFanIn(document.spec.edges)) {
    return `${label} must use the canonical manual and Automation-call choose-first entry.`;
  }
  if (!rosReady || rosReady.typeVersion !== 1) {
    return `${label} must contain the canonical ROS Core readiness wait.`;
  }
  if (!robots || robots.typeVersion !== 4 || !emptyObject(robots.parameters)) {
    return `${label} must read the canonical immutable current Experiment Robot selection.`;
  }
  if (!scene || scene.typeVersion !== 1 || !trustedSceneParameters(scene)) {
    return `${label} must publish one trusted run-aware mixed robot scene.`;
  }
  if (!descriptions || descriptions.typeVersion !== 1 || !trustedDescriptionsParameters(descriptions)) {
    return `${label} must publish one trusted run-aware Robot description set.`;
  }
  if (!mode || mode.typeVersion !== 2 || !trustedRunModeCondition(mode)) {
    return `${label} must select physical topics when Experiment runMode is physical or hybrid.`;
  }
  if (!simulationLayout || simulationLayout.typeVersion !== 5
      || !trustedLayoutNodeParameters(simulationLayout, LICHTBLICK_CAMERA_TOPICS.simulation)
      || !physicalLayout || physicalLayout.typeVersion !== 5
      || !trustedLayoutNodeParameters(physicalLayout, LICHTBLICK_CAMERA_TOPICS.physical)) {
    return `${label} must contain the canonical simulation and physical Lichtblick layout version 5 nodes.`;
  }
  if (!selectedLayout || selectedLayout.typeVersion !== 1
      || !isCanonicalMerge(selectedLayout.parameters, ['simulation-layout','physical-layout'])
      || (selectedLayout.parameterBindings?.length ?? 0) !== 0) {
    return `${label} must choose one run-mode-specific layout through the canonical merge.`;
  }
  if (!returned || returned.typeVersion !== 1 || !emptyObject(returned.parameters)
      || (returned.parameterBindings?.length ?? 0) !== 0) {
    return `${label} must expose one parameter-free Automation-call return.`;
  }
  if (!supervisedProcess(bridge) || !supervisedProcess(web)) {
    return `${label} must supervise one pinned Foxglove bridge and one pinned Lichtblick WebUI process.`;
  }
  if (!trustedBridgeParameters(bridge!)) {
    return `${label} must bind the selected frozen layout Robot roster allowlist into the supervised bridge.`;
  }
  if (!trustedWebParameters(web!)) {
    return `${label} must keep the supervised Lichtblick WebUI process free of XGC layout parameters.`;
  }
  if (document.spec.nodes.length !== 14 || !hasCanonicalEdges(document.spec.edges)) {
    return `${label} must use the exact canonical run-mode layout selection and supervised visualization graph.`;
  }
  return '';
}

function isLichtblickRunMode(runMode: string): runMode is LichtblickRunMode {
  return runMode === 'simulation' || runMode === 'physical' || runMode === 'hybrid';
}

function canonicalNode(document: AutomationDocument, id: string, kind: string) {
  const matches = document.spec.nodes.filter((node) => node.id === id && node.kind === kind);
  return matches.length === 1 ? matches[0] : undefined;
}

function canonicalProcess(document: AutomationDocument, id: string, definitionId: string) {
  const node = canonicalNode(document, id, 'process.run-definition');
  return node?.parameters.definitionId === definitionId ? node : undefined;
}

function supervisedProcess(node: AutomationDocument['spec']['nodes'][number] | undefined) {
  return Boolean(node)
    && node!.typeVersion === 1
    && node!.parameters.runtimeLifecycle === 'supervised'
    && typeof node!.parameters.definitionDigest === 'string'
    && /^[0-9a-f]{64}$/.test(node!.parameters.definitionDigest as string);
}

function emptyObject(value: Record<string,unknown>) {
  return Object.keys(value).length === 0;
}

const layoutInputParameterKinds = new Map([
  ['layoutMode','string'],
  ['runMode','string'],
  ['gridVisible','boolean'],
  ['gridColor','string'],
  ['gridSize','number'],
  ['gridDivisions','integer'],
  ['gridLineWidth','number'],
  ['axesVisible','boolean'],
  ['axesScale','number'],
  ['visualizationTopics','array'],
  ['transformTopics','array'],
  ['plotPaths','array'],
]);

const entryParameterKinds = new Map([
  ...layoutInputParameterKinds,
  ['markerColor','string'],
]);

function trustedActions(document: AutomationDocument) {
  if (document.spec.actions.length !== 2) return false;
  const start = document.spec.actions.find((action) => action.id === 'start');
  const experiment = document.spec.actions.find((action) => action.id === 'start-for-experiment');
  return trustedAction(start, 'manual', 'Start Lichtblick visualization')
    && trustedAction(
      experiment,
      'called',
      'Start Lichtblick visualization for Experiment',
    );
}

function trustedAction(
  action: AutomationDocument['spec']['actions'][number] | undefined,
  entryNodeId: string,
  label: string,
) {
  return Boolean(action)
    && hasExactKeys(action!, actionEnvelopeKeys)
    && action!.version === 2
    && action!.label === label
    && action!.entryNodeId === entryNodeId
    && action!.kind === 'service'
    && action!.controls.length === 2
    && action!.controls[0] === 'cancel'
    && action!.controls[1] === 'stop'
    && hasExactKeys(action!.resultSchema, ['fields'])
    && action!.resultSchema.fields.length === 0
    && action!.requiredCapabilities.length === 0
    && action!.projectionContracts.length === 1
    && action!.projectionContracts[0] === 'visualization-layout.v1'
    && trustedInputSchema(action!.inputSchema);
}

const actionEnvelopeKeys = [
  'id',
  'version',
  'label',
  'entryNodeId',
  'kind',
  'inputSchema',
  'resultSchema',
  'controls',
  'admission',
  'requiredCapabilities',
  'projectionContracts',
];

function trustedAdmission(
  admission: AutomationDocument['spec']['actions'][number]['admission'],
) {
  const concurrency = admission.concurrency;
  return hasExactKeys(admission, ['concurrency'])
    && Boolean(concurrency)
    && hasExactKeys(concurrency!, ['scope','limit','onConflict','appliesTo'])
    && concurrency!.scope === 'workflow'
    && concurrency!.limit === 1
    && concurrency!.onConflict === 'reject'
    && concurrency!.appliesTo === 'all';
}

function trustedInputSchema(schema: AutomationDocument['spec']['actions'][number]['inputSchema']) {
  if (!hasExactKeys(schema, ['title','description','fields'])
      || schema.title !== 'Lichtblick visualization'
      || schema.description !== 'Values supplied by the Lichtblick panel are frozen into the Run and configure its scene labels and initial layout.') {
    return false;
  }
  const fields = schema.fields;
  return fields.length === entryParameterKinds.size && fields.every((field) => (
    entryParameterKinds.get(field.name) === field.kind
    && field.required === true
    && !field.sensitive
    && field.label === entryParameterLabels.get(field.name)
    && trustedEntryParameterBounds(field)
  ));
}

function hasExactKeys(value: object, expected: string[]) {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key,index) => key === canonical[index]);
}

const entryParameterLabels = new Map([
  ['layoutMode','Initial layout'],
  ['runMode','Experiment run mode'],
  ['gridVisible','Show grid'],
  ['gridColor','Grid color'],
  ['gridSize','Grid size'],
  ['gridDivisions','Grid divisions'],
  ['gridLineWidth','Grid line width'],
  ['axesVisible','Show world axes'],
  ['axesScale','World axis size'],
  ['markerColor','Robot label color'],
  ['visualizationTopics','Algorithm visualization topics'],
  ['transformTopics','Algorithm transform topics'],
  ['plotPaths','Plot series'],
]);

function trustedEntryParameterBounds(field: AutomationParameterField) {
  switch (field.name) {
    case 'layoutMode': return field.string?.default === LICHTBLICK_LAYOUT_DEFAULTS.layoutMode
      && field.string.enum?.length === LICHTBLICK_LAYOUT_MODES.length
      && field.string.enum.every((value,index) => value === LICHTBLICK_LAYOUT_MODES[index]);
    case 'gridVisible': return field.boolean?.default === LICHTBLICK_LAYOUT_DEFAULTS.gridVisible;
    case 'gridColor': return field.string?.default === LICHTBLICK_LAYOUT_DEFAULTS.gridColor;
    case 'gridSize': return field.number?.default === LICHTBLICK_LAYOUT_DEFAULTS.gridSize
      && field.number.minimum === 0.1 && field.number.maximum === 100000;
    case 'gridDivisions': return field.integer?.default === LICHTBLICK_LAYOUT_DEFAULTS.gridDivisions
      && field.integer.minimum === 1 && field.integer.maximum === 10000;
    case 'gridLineWidth': return field.number?.default === 1
      && field.number.minimum === 0.1 && field.number.maximum === 100;
    case 'axesVisible': return field.boolean?.default === LICHTBLICK_LAYOUT_DEFAULTS.axesVisible;
    case 'axesScale': return field.number?.default === LICHTBLICK_LAYOUT_DEFAULTS.axesScale
      && field.number.minimum === 0.01 && field.number.maximum === 100000;
    case 'markerColor': return field.string?.default === LICHTBLICK_LAYOUT_DEFAULTS.markerColor;
    case 'runMode': return field.string?.default === 'simulation'
      && field.string.enum?.length === 3
      && field.string.enum[0] === 'simulation'
      && field.string.enum[1] === 'physical'
      && field.string.enum[2] === 'hybrid';
    case 'visualizationTopics': return trustedVisualizationTopicsField(field);
    case 'plotPaths': return hasExactKeys(field, ['name','label','description','kind','required','array'])
      && field.description === 'Numeric ROS message paths for the Plot pane. One path per series; empty keeps Plot blank.'
      && Boolean(field.array)
      && hasExactKeys(field.array!, ['default','minItems','maxItems','items'])
      && field.array?.minItems === 0 && field.array.maxItems === 16
      && Array.isArray(field.array.default) && field.array.default.length === 0
      && hasExactKeys(field.array.items, ['kind','string'])
      && field.array.items.kind === 'string'
      && hasExactKeys(field.array.items.string ?? {}, []);
    case 'transformTopics': return hasExactKeys(field, ['name','label','description','kind','required','array'])
      && field.description
      === 'Explicit dedicated TFMessage topics; global /tf and /tf_static remain system-owned.'
      && Boolean(field.array)
      && hasExactKeys(field.array!, ['default','minItems','maxItems','items'])
      && field.array?.minItems === 0 && field.array.maxItems === 4
      && Array.isArray(field.array.default) && field.array.default.length === 0
      && hasExactKeys(field.array.items, ['kind','string'])
      && field.array.items.kind === 'string'
      && hasExactKeys(field.array.items.string ?? {}, []);
    default: return false;
  }
}

function trustedVisualizationTopicsField(field: AutomationParameterField) {
  const items = field.array?.items;
  const fields = items?.object?.fields;
  const expected = [
    ['expectedFrame','string'],
    ['messageType','string'],
    ['role','string'],
    ['topic','string'],
    ['visible3d','boolean'],
    ['visibleAr','boolean'],
  ] as const;
  if (!hasExactKeys(field, ['name','label','description','kind','required','array'])
      || field.description !== 'Explicit standard ROS visualization topics. The Experiment fixture or caller owns the roster; this Automation never infers an algorithm interface.'
      || !field.array || !hasExactKeys(field.array, ['default','minItems','maxItems','items'])
      || field.array?.minItems !== 0 || field.array.maxItems !== 16
      || !Array.isArray(field.array.default) || field.array.default.length !== 0
      || !items || !hasExactKeys(items, ['kind','object']) || items.kind !== 'object'
      || !Array.isArray(fields) || fields.length !== expected.length) {
    return false;
  }
  return expected.every(([name,kind],index) => {
    const child = fields[index];
    if (!child || child.name !== name || child.kind !== kind || child.required !== true
        || child.label !== undefined || child.description !== undefined || child.sensitive !== undefined) {
      return false;
    }
    if (kind === 'boolean') {
      return hasExactKeys(child, ['name','kind','required','boolean'])
        && hasExactKeys(child.boolean ?? {}, []);
    }
    if (!hasExactKeys(child, ['name','kind','required','string'])) return false;
    if (name === 'messageType') {
      return hasExactKeys(child.string ?? {}, ['enum']) && exactStrings(child.string?.enum, [
        'nav_msgs/Path','visualization_msgs/Marker','visualization_msgs/MarkerArray','geometry_msgs/PoseArray',
      ]);
    }
    if (name === 'role') {
      return hasExactKeys(child.string ?? {}, ['enum'])
        && exactStrings(child.string?.enum, ['history','prediction','obstacle','semantic']);
    }
    return hasExactKeys(child.string ?? {}, []);
  });
}

function exactStrings(actual: string[] | undefined, expected: string[]) {
  return actual?.length === expected.length
    && expected.every((value,index) => actual[index] === value);
}

function trustedDescriptionsParameters(node: AutomationDocument['spec']['nodes'][number]) {
  return Object.keys(node.parameters).length === 1
    && typeof node.parameters.definitionDigest === 'string'
    && /^[0-9a-f]{64}$/.test(node.parameters.definitionDigest)
    && (node.parameterBindings?.length ?? 0) === 0;
}

function trustedSceneParameters(node: AutomationDocument['spec']['nodes'][number]) {
  const parameters = node.parameters;
  const bindings = node.parameterBindings ?? [];
  const markerBinding = bindings[0];
  const runModeBinding = bindings[1];
  return Object.keys(parameters).length === 3
    && typeof parameters.definitionDigest === 'string'
    && /^[0-9a-f]{64}$/.test(parameters.definitionDigest)
    && parameters.markerColor === LICHTBLICK_LAYOUT_DEFAULTS.markerColor
    && parameters.runMode === 'simulation'
    && bindings.length === 2
    && markerBinding?.target === '/markerColor'
    && markerBinding.language === 'xgc-expression-v2'
    && markerBinding.expression === '{{ $inputs["entry"].markerColor }}'
    && runModeBinding?.target === '/runMode'
    && runModeBinding.language === 'xgc-expression-v2'
    && runModeBinding.expression === '{{ $inputs["entry"].runMode }}';
}

function trustedRunModeCondition(node: AutomationDocument['spec']['nodes'][number]) {
  const parameters = node.parameters;
  const conditions = parameters.conditions;
  return Object.keys(parameters).length === 5
    && parameters.source === 'input'
    && parameters.inputNode === 'entry'
    && parameters.itemsPath === ''
    && parameters.combinator === 'any'
    && Array.isArray(conditions)
    && conditions.length === 2
    && isExactRecord(conditions[0], {
      path: '/runMode',operator: 'equals',value: 'physical',
    })
    && isExactRecord(conditions[1], {
      path: '/runMode',operator: 'equals',value: 'hybrid',
    })
    && (node.parameterBindings?.length ?? 0) === 0;
}

function trustedLayoutNodeParameters(
  node: AutomationDocument['spec']['nodes'][number],
  topics: { readonly imageTopic: string; readonly cameraInfoTopic: string },
) {
  const parameters = node.parameters;
  const bindings = node.parameterBindings ?? [];
  return Object.keys(parameters).length === layoutInputParameterKinds.size + 2
    && parameters.cameraImageTopic === topics.imageTopic
    && parameters.cameraInfoTopic === topics.cameraInfoTopic
    && bindings.length === layoutInputParameterKinds.size
    && [...layoutInputParameterKinds.keys()].every((name) => (
      Object.hasOwn(parameters, name)
      && trustedLayoutNodeDefault(name, parameters[name])
      && bindings.some((binding) => binding.target === `/${name}`
        && binding.language === 'xgc-expression-v2'
        && binding.expression === `{{ $inputs["entry"].${name} }}`)
    ));
}

function trustedLayoutNodeDefault(name: string, value: unknown) {
  switch (name) {
    case 'layoutMode': return value === LICHTBLICK_LAYOUT_DEFAULTS.layoutMode;
    case 'runMode': return value === 'simulation';
    case 'gridVisible': return value === LICHTBLICK_LAYOUT_DEFAULTS.gridVisible;
    case 'gridColor': return value === LICHTBLICK_LAYOUT_DEFAULTS.gridColor;
    case 'gridSize': return value === LICHTBLICK_LAYOUT_DEFAULTS.gridSize;
    case 'gridDivisions': return value === LICHTBLICK_LAYOUT_DEFAULTS.gridDivisions;
    case 'gridLineWidth': return value === LICHTBLICK_LAYOUT_DEFAULTS.gridLineWidth;
    case 'axesVisible': return value === LICHTBLICK_LAYOUT_DEFAULTS.axesVisible;
    case 'axesScale': return value === LICHTBLICK_LAYOUT_DEFAULTS.axesScale;
    case 'visualizationTopics': return Array.isArray(value) && value.length === 0;
    case 'transformTopics': return Array.isArray(value) && value.length === 0;
    case 'plotPaths': return Array.isArray(value) && value.length === 0;
    default: return false;
  }
}

function trustedBridgeParameters(node: AutomationDocument['spec']['nodes'][number]) {
  const processParameters = node.parameters.parameters;
  if (!processParameters || typeof processParameters !== 'object' || Array.isArray(processParameters)) return false;
  const parameters = processParameters as Record<string,unknown>;
  const bindings = node.parameterBindings ?? [];
  return Object.keys(parameters).length === 5
    && parameters.port === 8765
    && parameters.rosMasterPort === 11311
    && typeof parameters.rosPackagePath === 'string'
    && parameters.rosPackagePath.startsWith('/')
    && parameters.allowedTopics === '/xgc/scene'
    && parameters.runMode === 'physical'
    && bindings.length === 2
    && bindings[0]?.target === '/parameters/allowedTopics'
    && bindings[0].language === 'xgc-expression-v2'
    && bindings[0].expression === '{{ $inputs["lichtblick-layout"].allowedTopics }}'
    && bindings[1]?.target === '/parameters/runMode'
    && bindings[1].language === 'xgc-expression-v2'
    && bindings[1].expression === '{{ $inputs["lichtblick-layout"].parameters.runMode }}';
}

function trustedWebParameters(node: AutomationDocument['spec']['nodes'][number]) {
  const processParameters = node.parameters.parameters;
  if (!processParameters || typeof processParameters !== 'object' || Array.isArray(processParameters)) return false;
  const parameters = processParameters as Record<string,unknown>;
  return Object.keys(parameters).length === 2
    && parameters.port === 18081
    && parameters.bridgePort === 8765
    && (node.parameterBindings?.length ?? 0) === 0;
}

function isCanonicalMerge(parameters: Record<string,unknown>, inputOrder: string[]) {
  const actualOrder = parameters.inputOrder;
  return parameters.mode === 'choose-first'
    && Array.isArray(actualOrder)
    && actualOrder.length === inputOrder.length
    && inputOrder.every((nodeId,index) => actualOrder[index] === nodeId)
    && Object.keys(parameters).length === 2;
}

function isCanonicalEntryFanIn(edges: AutomationEdge[]) {
  const incoming = edges.filter((edge) => edge.to === 'entry');
  return incoming.length === 2
    && incoming.every((edge) => (
      (edge.from === 'manual' || edge.from === 'called')
      && edge.condition === 'always'
      && !edge.sourcePort
      && !edge.route
    ));
}

function hasCanonicalEdges(edges: AutomationEdge[]) {
  const expected = [
    edge('manual','entry','always'),
    edge('called','entry','always'),
    edge('entry','ros-master'),
    edge('entry','experiment-robots'),
    edge('lichtblick-layout','foxglove-bridge'),
    edge('ros-master','foxglove-bridge','success','ready'),
    edge('robot-scene','foxglove-bridge'),
    edge('robot-descriptions','foxglove-bridge'),
    edge('entry','robot-scene'),
    edge('experiment-robots','robot-scene'),
    edge('ros-master','robot-scene','success','ready'),
    edge('experiment-robots','robot-descriptions'),
    edge('ros-master','robot-descriptions','success','ready'),
    edge('entry','is-physical'),
    edge('is-physical','simulation-layout','success','false'),
    edge('is-physical','physical-layout','success','true'),
    edge('entry','simulation-layout'),
    edge('entry','physical-layout'),
    edge('experiment-robots','simulation-layout'),
    edge('experiment-robots','physical-layout'),
    edge('simulation-layout','lichtblick-layout','always'),
    edge('physical-layout','lichtblick-layout','always'),
    edge('lichtblick-layout','lichtblick-web'),
    edge('foxglove-bridge','lichtblick-web'),
    edge('ros-master','return','success','ready'),
    edge('lichtblick-layout','return'),
    edge('lichtblick-web','return'),
  ].map(edgeSignature).sort();
  const actual = edges.map(edgeSignature).sort();
  return actual.length === expected.length
    && actual.every((signature,index) => signature === expected[index]);
}

function edge(from: string, to: string, condition: AutomationEdge['condition'] = 'success', route = '') {
  return { from,to,condition,...(route ? { sourcePort:route,route } : {}) } as AutomationEdge;
}

function edgeSignature(edgeValue: AutomationEdge) {
  return [
    edgeValue.from,
    edgeValue.to,
    edgeValue.condition,
    edgeValue.sourcePort ?? '',
    edgeValue.route ?? '',
  ].join('\u0000');
}

function isExactRecord(value: unknown, expected: Record<string,unknown>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string,unknown>;
  const keys = Object.keys(expected);
  return Object.keys(record).length === keys.length
    && keys.every((key) => record[key] === expected[key]);
}
