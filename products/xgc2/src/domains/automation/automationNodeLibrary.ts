import type { ProcessDefinition } from '../execution/executionPublic';
import type {
  AutomationNode,
  AutomationNodeCatalogEntry,
  AutomationNodeLibraryItem,
  AutomationSpec,
} from './automationDefinitionContracts';
import {
  automationNodeEditorFromComposition,
  automationNodeLibraryPresentationFromComposition,
  type AutomationNodeWebComposition,
} from './nodes/automationNodeWebComposition';

type ProcessParameterDefinition = ProcessDefinition['parameters']['properties'][string];

export const PROCESS_RUN_DEFINITION_KIND = 'process.run-definition';
export const EXPERIMENT_PANEL_EXISTS_KIND = 'experiment.panel.exists';
export const USER_SCRIPT_KIND = 'user.script';
export const CALIBRATION_COMMIT_KIND = 'calibration.commit';
export const CALIBRATION_RENDER_FILE_KIND = 'calibration.render-file';

/**
 * Library presentation overrides for catalog nodes whose runtime label, node
 * category, or searchable vocabulary differs from what the author needs to see.
 * Leaf-owned presentation is supplied by exclusive Automation node
 * contributions and must not be hardcoded here.
 */
const nodeLibraryPresentation: Record<string,{
  label: string;
  description: string;
  category: string;
  keywords: string[];
}> = {
  [USER_SCRIPT_KIND]: {
    label: 'Run user script',
    description: 'Run one committed user script on the execution target and wait for it to finish. The script is frozen at the commit selected when the node is prepared.',
    category: 'User scripts',
    keywords: [
      'user script','script','bash','shell','python','python3','rosrun','roslaunch','custom','run',
      '用户脚本','脚本','自定义',
    ],
  },
  [CALIBRATION_COMMIT_KIND]: {
    label: 'Commit calibration',
    description: 'Read a running camera calibrator\u2019s solved result and store it as a new version of a calibration asset. Nothing is written until the calibrator reports a solved calibration.',
    category: 'perception',
    keywords: [
      'calibration','camera','intrinsic','extrinsic','commit','asset','version','calibrator',
      '\u6807\u5b9a','\u76f8\u673a','\u5185\u53c2','\u5916\u53c2','\u63d0\u4ea4',
    ],
  },
  [CALIBRATION_RENDER_FILE_KIND]: {
    label: 'Render calibration file',
    description: 'Write a committed calibration to a file on the execution target: ROS camera_info YAML, or the transform document the camera extrinsic TF publisher reads.',
    category: 'perception',
    keywords: [
      'calibration','camera','camera_info','yaml','extrinsic','tf','render','file','write','export',
      '\u6807\u5b9a','\u76f8\u673a','\u6587\u4ef6','\u5bfc\u51fa',
    ],
  },
  [EXPERIMENT_PANEL_EXISTS_KIND]: {
    label: 'Experiment panel exists',
    description: 'Check whether the frozen Experiment declares a panel of one plugin, then route presentation accordingly.',
    category: 'ground-station',
    keywords: [
      'panel','exists','dashboard','presence','ground station','plugin','routing','fallback','notification',
      '面板','存在','仪表板','分流',
    ],
  },
};

const processPresetMetadata: Record<string,{ category: string;keywords: string[] }> = {
  'lichtblick-web': { category: 'visualization',keywords: ['lichtblick','web','foxglove','workspace','visualization'] },
  roscore: { category: 'ros1',keywords: ['ros','ros1','master','core','roscore'] },
  'foxglove-bridge': { category: 'ros1',keywords: ['ros','ros1','foxglove','bridge','websocket'] },
  'gazebo-server': { category: 'ros1',keywords: ['ros','ros1','gazebo','simulation','server','gzserver'] },
  'scout-gazebo-robot': { category: 'ros1',keywords: ['ros','ros1','scout','ugv','gazebo','robot','simulation'] },
  'px4-sitl-fs150': { category: 'simulation',keywords: ['px4','sitl','fs150','simulation'] },
  'mavros-px4-sitl': { category: 'ros1',keywords: ['mavros','px4','sitl','mavlink'] },
  'gazebo-vrpn-server': { category: 'ros1',keywords: ['ros','ros1','gazebo','vrpn','tracking','simulation','server'] },
  'gazebo-client': { category: 'simulation',keywords: ['gazebo','simulation','client','gui'] },
  'vrpn-client-ros1': { category: 'ros1',keywords: ['ros1','noetic','vrpn','tracking','client','motion capture'] },
  'xgc2-camera-intrinsic-calibrator-ros1': { category: 'perception',keywords: ['camera','calibration','intrinsic','lens','checkerboard','相机','内参','标定'] },
  'xgc2-camera-extrinsic-calibrator-ros1': { category: 'perception',keywords: ['camera','calibration','extrinsic','world frame','fixed camera','相机','外参','世界坐标','标定'] },
  'xgc2-camera-extrinsic-tf-ros1': { category: 'perception',keywords: ['camera','calibration','extrinsic','tf','transform','publisher','相机','外参','坐标变换'] },
  rviz: { category: 'ros1',keywords: ['ros','ros1','rviz','visualization'] },
};

export function buildAutomationNodeLibrary(
  catalog: AutomationNodeCatalogEntry[],
  processDefinitions: ProcessDefinition[],
  nodeComposition?: AutomationNodeWebComposition,
): AutomationNodeLibraryItem[] {
  const currentCatalog = latestCatalogEntries(catalog);
  const managedProcess = currentCatalog.find((entry) => entry.kind === PROCESS_RUN_DEFINITION_KIND);
  const handlerItems = currentCatalog.flatMap((entry) => {
    if (entry.kind === PROCESS_RUN_DEFINITION_KIND) return [];
    const item = catalogLibraryItem(entry, nodeComposition);
    // Fail closed: omit catalog items whose exact contribution editor rejects them.
    return item ? [item] : [];
  });
  if (!managedProcess) return handlerItems;
  const processItems = processDefinitions.flatMap((definition) => {
    const metadata = processPresetMetadata[definition.id];
    if (!metadata || !definition.digest.trim()) return [];
    return [processDefinitionLibraryItem(managedProcess, definition, metadata)];
  });
  return [...handlerItems,...processItems];
}

export function defaultAutomationNodeLibraryItems(items: AutomationNodeLibraryItem[]) {
  return items.filter((item) => !item.hiddenFromDefaultLibrary);
}

export function automationNodeLibraryItemForNode(
  items: AutomationNodeLibraryItem[],
  node: Pick<AutomationNode,'kind' | 'typeVersion' | 'parameters'>,
) {
  if (node.kind === PROCESS_RUN_DEFINITION_KIND) {
    const definitionId = typeof node.parameters.definitionId === 'string' ? node.parameters.definitionId : '';
    return items.find((item) => item.runtimeKind === node.kind && libraryItemDefinitionId(item) === definitionId);
  }
  return items.find((item) => item.runtimeKind === node.kind
    && item.runtimeTypeVersion === node.typeVersion
    && item.editableParameterPath === 'root');
}

export function validateAutomationLibraryNodes(spec: Pick<AutomationSpec,'nodes'>, items: AutomationNodeLibraryItem[]) {
  const unavailable = spec.nodes.find((node) => {
    if (node.kind !== PROCESS_RUN_DEFINITION_KIND) return false;
    const item = automationNodeLibraryItemForNode(items, node);
    return !item || node.parameters.definitionDigest !== item.initialParameters.definitionDigest;
  });
  return unavailable ? `Node ${unavailable.id} uses an unavailable or changed process definition. Replace the node from the library.` : '';
}

function catalogLibraryItem(
  entry: AutomationNodeCatalogEntry,
  nodeComposition?: AutomationNodeWebComposition,
): AutomationNodeLibraryItem | null {
  const editor = automationNodeEditorFromComposition(nodeComposition, entry.kind, entry.typeVersion);
  const validationError = editor?.validateCatalogEntry?.(entry);
  if (validationError) return null;

  const composed = automationNodeLibraryPresentationFromComposition(
    nodeComposition, entry.kind, entry.typeVersion,
  );
  const presentation = composed ?? nodeLibraryPresentation[entry.kind];
  const parameterSchema = structuredClone(entry.parameterSchema);
  return {
    id: entry.kind,
    runtimeKind: entry.kind,
    runtimeTypeVersion: entry.typeVersion,
    hiddenFromDefaultLibrary: composed?.hiddenFromDefaultLibrary || undefined,
    label: presentation?.label ?? entry.label,
    description: presentation?.description ?? catalogLibraryDescription(entry.kind, entry.category),
    category: presentation?.category ?? entry.category,
    keywords: [entry.kind,entry.category,entry.label,...(presentation?.keywords ?? [])],
    initialParameters: initialSchemaParameters(parameterSchema),
    editableParameterSchema: parameterSchema,
    editableParameterPath: 'root',
    outputSchema: entry.outputSchema ? structuredClone(entry.outputSchema) : undefined,
    outputPorts: entry.outputPorts ?? undefined,
    canCompensate: entry.canCompensate,
  };
}

function latestCatalogEntries(catalog: AutomationNodeCatalogEntry[]) {
  const latestVersion = new Map<string,number>();
  for (const entry of catalog) {
    const current = latestVersion.get(entry.kind);
    if (current === undefined || entry.typeVersion > current) latestVersion.set(entry.kind, entry.typeVersion);
  }
  const emitted = new Set<string>();
  return catalog.filter((entry) => {
    if (entry.typeVersion !== latestVersion.get(entry.kind) || emitted.has(entry.kind)) return false;
    emitted.add(entry.kind);
    return true;
  });
}

function processDefinitionLibraryItem(
  runtime: AutomationNodeCatalogEntry,
  definition: ProcessDefinition,
  metadata: { category: string;keywords: string[] },
): AutomationNodeLibraryItem {
  return {
    id: `process-preset:${definition.id}`,
    runtimeKind: runtime.kind,
    runtimeTypeVersion: runtime.typeVersion,
    label: definition.label,
    description: definition.description?.trim() || `Start the trusted ${definition.label} process.`,
    category: metadata.category,
    keywords: [definition.id,definition.label,definition.description ?? '',...metadata.keywords],
    initialParameters: {
      ...initialSchemaParameters(runtime.parameterSchema),
      definitionId: definition.id,
      definitionDigest: definition.digest,
      parameters: initialProcessParameters(definition),
    },
    editableParameterSchema: processParameterSchema(definition),
    editableParameterPath: 'parameters',
    outputSchema: runtime.outputSchema ? structuredClone(runtime.outputSchema) : undefined,
    outputPorts: runtime.outputPorts ?? undefined,
    canCompensate: runtime.canCompensate,
  };
}

function catalogLibraryDescription(kind: string, category: string) {
  // ManualTriggers, CallGraph, GroundStation, Process, and Parameter leaves own
  // their catalog copy through exact-version composition. Remaining shell
  // descriptions cover kinds that still lack exclusive web leaves.
  const descriptions: Record<string,string> = {
    'trigger.schedule': 'Start this Automation on a configured schedule.',
    'trigger.target-startup': 'Start this activated Automation once whenever its execution target service boots.',
    'trigger.form-submission': 'Start when the hosted form is submitted.',
    'trigger.chat-message': 'Start when a chat message arrives.',
    'trigger.webhook': 'Start when the webhook endpoint receives a call.',
    'asset.experiment-robots': 'Read the immutable Robot selection frozen into the current Experiment run.',
    'robot.ensure-connected': 'Resolve and connect the selected robot through its trusted Robot Adapter.',
		'ros1.wait-roscore-ready': 'Wait for a matching managed ROS Core to become ready.',
		'ros1.run': 'Select setup.bash, then enter one complete rosrun or roslaunch command.',
		'ros1.wait-gazebo-ready': 'Wait for any managed Gazebo server on the execution target to become ready.',
    'simulation.gazebo-spawn-obstacle': 'Add one trusted geometric obstacle to the running Gazebo world.',
    'simulation.gazebo-move-obstacle': 'Move one XGC-managed obstacle in the running Gazebo world.',
    'simulation.gazebo-clear-obstacles': 'Remove every XGC-managed obstacle without restarting Gazebo.',
    'ros1.record-bag': 'Record explicit topics from selected Experiment robot slots until the Automation stops.',
    'ros1.publish-topic': 'Publish typed ROS1 messages.',
    'ros1.call-service': 'Call an arbitrary typed ROS1 service; prefer semantic robot nodes when their safety policy applies.',
    'robot.operation': 'Run a Profile-defined operation for one robot or a selected robot batch through the trusted semantic control path.',
    'panel.state.get': 'Read one revision-pinned public state snapshot from a panel in the immutable Experiment.',
    ...Object.fromEntries(Object.entries(nodeLibraryPresentation).map(
      ([presentationKind, presentation]) => [presentationKind,presentation.description],
    )),
  };
  return descriptions[kind] ?? `Add a ${category.trim().toLowerCase() || 'workflow'} node to the Automation.`;
}

function processParameterSchema(definition: ProcessDefinition): Record<string,unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    ...(definition.parameters.required?.length ? { required: [...definition.parameters.required] } : {}),
    ...(definition.parameters.groups?.length ? {
      'x-xgc-parameter-groups': definition.parameters.groups.map((group) => ({
        id: group.id,
        label: group.label,
        collapsed: group.collapsed,
        parameters: [...group.parameters],
      })),
    } : {}),
    properties: Object.fromEntries(Object.entries(definition.parameters.properties).map(([name, parameter]) => [
      name,
      processParameterProperty(name, parameter),
    ])),
  };
}

function processParameterProperty(name: string, parameter: ProcessParameterDefinition) {
  return {
    type: parameter.type,
    title: parameter.title?.trim() || processParameterLabel(name),
    ...(parameter.default !== undefined ? { default: structuredClone(parameter.default) } : {}),
    ...(parameter.enum?.length ? { enum: structuredClone(parameter.enum) } : {}),
    ...(parameter.enumNames?.length ? { enumNames: [...parameter.enumNames] } : {}),
    ...(parameter.minimum !== undefined ? { minimum: parameter.minimum } : {}),
    ...(parameter.maximum !== undefined ? { maximum: parameter.maximum } : {}),
    ...(parameter.description ? { description: parameter.description } : {}),
    ...(parameter.sensitive ? { sensitive: true } : {}),
    ...(parameter['x-xgc-path-kind'] ? { 'x-xgc-path-kind': parameter['x-xgc-path-kind'] } : {}),
    ...(parameter['x-xgc-file-extensions']?.length ? { 'x-xgc-file-extensions': [...parameter['x-xgc-file-extensions']] } : {}),
    ...(!parameter.sensitive && !parameter.fixedOnly ? { 'x-xgc-expression': true } : {}),
  };
}

function initialProcessParameters(definition: ProcessDefinition) {
  const required = new Set(definition.parameters.required ?? []);
  return Object.fromEntries(Object.entries(definition.parameters.properties).flatMap(([name, parameter]) => {
    if (parameter.default !== undefined) return [[name,structuredClone(parameter.default)]];
    if (!required.has(name)) return [];
    switch (parameter.type) {
      case 'boolean': return [[name,false]];
      case 'integer':
      case 'number': return [[name,parameter.minimum ?? 0]];
      default: return [[name,'']];
    }
  }));
}

function initialSchemaParameters(schema: Record<string,unknown>): Record<string,unknown> {
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []);
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return Object.fromEntries(Object.entries(properties).flatMap(([name, value]) => {
    const property = isRecord(value) ? value : {};
    if (property.readOnly === true) return [];
    if ('default' in property) return [[name,structuredClone(property.default)]];
    if (!required.has(name)) return [];
    switch (property.type) {
      case 'boolean': return [[name,false]];
      case 'integer':
      case 'number': return [[name,typeof property.minimum === 'number' ? property.minimum : 0]];
      case 'object': return [[name,initialSchemaParameters(property)]];
      case 'array': return [[name,[]]];
      default: return [[name,'']];
    }
  }));
}

function libraryItemDefinitionId(item: AutomationNodeLibraryItem) {
  return typeof item.initialParameters.definitionId === 'string' ? item.initialParameters.definitionId : '';
}

function processParameterLabel(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ');
  return words.replace(/\b(id|ip|uri|ros|rviz|vrpn|px4|ugv)\b/gi, (word) => word.toUpperCase()).replace(/^\w/, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
