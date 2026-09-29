import { decodeExperimentWorldBoundary } from './experimentWorldBoundary';
import { decodeConfigResourceBranch,decodeConfigResourceHead } from '../../shared/configResourceDecoder';
import {
  cloneExecutionHostRef,
  cloneExperimentDeployment,
  validateExecutionHostRef,
  validateExperimentDeployment,
} from './experimentDeployment';
import {
  protocolBoolean,
  protocolEnum,
  protocolField,
  protocolObject,
  protocolOptionalString,
  protocolRequiredArray,
  protocolRequiredInteger,
  protocolRequiredNumber,
  protocolRequiredString,
  protocolRequiredStringArray,
} from '../../shared/strictProtocolDecoder';
import type { GridPos } from '../../types/common';
import { PANEL_PORT_KINDS } from '../../shared/generatedWorkflowControlContract';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';
import {
  EXPERIMENT_DOMAIN,
  EXPERIMENT_HYBRID_SOURCES,
  EXPERIMENT_SCHEMA_VERSION,
  PANEL_AUTHORING_TARGETS,
  PANEL_ACTION_EXECUTION_MODES,
  PANEL_WORKFLOW_FAILURE_POLICIES,
  PANEL_WORKFLOW_RELATIONS,
  PANEL_SCHEMA_VERSION,
  normalizeExperimentSpec,
  validateExperimentSpec,
  type ConfigRef,
  type ExperimentDashboard,
  type ExperimentDeployment,
  type ExperimentDocument,
  type ExperimentPanel,
  type ExperimentRobotBinding,
  type ExperimentScene,
  type ExperimentSpec,
  type ExperimentWorkflowInstance,
  type ExecutionHostRef,
  type PanelPortBinding,
  type PanelView,
} from './experimentModel';

export function decodeExperimentDocument(
  value: unknown,
  robotKindComposition?: RobotAssetKindComposition,
): ExperimentDocument {
  const path = 'Experiment document';
  const document = protocolObject(value,path,['head','branch','spec']);
  const head = decodeConfigResourceHead(protocolField(document,'head',path),EXPERIMENT_DOMAIN,`${path}.head`);
  const branch = decodeConfigResourceBranch(protocolField(document,'branch',path),EXPERIMENT_DOMAIN,`${path}.branch`);
  if (branch.resourceId !== head.resourceId) {
    throw new Error(`Protocol error: ${path}.branch.resourceId must match ${path}.head.resourceId.`);
  }
  const spec = decodeExperimentSpec(
    protocolField(document,'spec',path),
    `${path}.spec`,
    robotKindComposition,
  );
  const validationError = validateExperimentSpec(spec, robotKindComposition);
  if (validationError) throw new Error(`Protocol error: ${path}.spec is invalid: ${validationError}`);
  if (JSON.stringify(normalizeExperimentSpec(spec, robotKindComposition)) !== JSON.stringify(spec)) {
    throw new Error(`Protocol error: ${path}.spec must already use the canonical current schema.`);
  }
  return { head,branch,spec };
}

function decodeExperimentSpec(
  value: unknown,
  path: string,
  robotKindComposition?: RobotAssetKindComposition,
): ExperimentSpec {
  const spec = protocolObject(value,path,[
    'schemaVersion','name','description','tags','runModes','worldBoundary','localizationOffset',
    'robots','workflowInstances','dashboards','deployment','scene',
  ]);
  const schemaVersion = protocolRequiredInteger(spec,'schemaVersion',path);
  if (schemaVersion !== EXPERIMENT_SCHEMA_VERSION) {
    throw new Error(`Protocol error: ${path}.schemaVersion must be ${EXPERIMENT_SCHEMA_VERSION}.`);
  }
  const deployment = Object.hasOwn(spec,'deployment')
    ? decodeExperimentDeployment(protocolField(spec,'deployment',path),`${path}.deployment`)
    : undefined;
  const scene = Object.hasOwn(spec,'scene')
    ? decodeExperimentScene(protocolField(spec,'scene',path),`${path}.scene`)
    : undefined;
  const localizationOffsetPath = `${path}.localizationOffset`;
  const localizationOffset = protocolObject(
    protocolField(spec,'localizationOffset',path),
    localizationOffsetPath,
    ['x','y','z'],
  );
  return {
    ...(deployment === undefined ? {} : { deployment }),
    ...(scene === undefined ? {} : { scene }),
    schemaVersion,
    name: protocolRequiredString(spec,'name',path),
    description: protocolRequiredString(spec,'description',path),
    tags: protocolRequiredStringArray(spec,'tags',path),
    runModes: protocolRequiredStringArray(spec,'runModes',path),
    worldBoundary: decodeExperimentWorldBoundary(protocolField(spec,'worldBoundary',path)),
    localizationOffset: {
      x:protocolRequiredNumber(localizationOffset,'x',localizationOffsetPath),
      y:protocolRequiredNumber(localizationOffset,'y',localizationOffsetPath),
      z:protocolRequiredNumber(localizationOffset,'z',localizationOffsetPath),
    },
    robots: protocolRequiredArray(spec,'robots',path).map((binding,index) => (
      decodeRobotBinding(binding,`${path}.robots[${index}]`, robotKindComposition)
    )),
    workflowInstances: protocolRequiredArray(spec,'workflowInstances',path).map((instance,index) => (
      decodeWorkflowInstance(instance,`${path}.workflowInstances[${index}]`)
    )),
    dashboards: protocolRequiredArray(spec,'dashboards',path)
      .map((dashboard,index) => decodeDashboard(dashboard,`${path}.dashboards[${index}]`)),
  };
}

function decodeExperimentDeployment(value: unknown,path: string): ExperimentDeployment {
  const issue = validateExperimentDeployment(value);
  if (issue) throw new Error(`Protocol error: ${path} is invalid: ${issue}`);
  return cloneExperimentDeployment(value as ExperimentDeployment);
}

function decodeExperimentScene(value: unknown,path: string): ExperimentScene {
  const scene = protocolObject(value,path,['asset','simulator','parameters']);
  const parameters = Object.hasOwn(scene,'parameters')
    ? protocolRecord(protocolField(scene,'parameters',path),`${path}.parameters`)
    : undefined;
  return {
    asset: protocolRequiredString(scene,'asset',path),
    simulator: protocolRequiredString(scene,'simulator',path),
    ...(parameters === undefined ? {} : { parameters }),
  };
}

function decodeWorkflowInstance(value: unknown,path: string): ExperimentWorkflowInstance {
  const instance = protocolObject(value,path,[
    'id','ref','executionTargetId','actionPresets',
  ]);
  return {
    id: protocolRequiredString(instance,'id',path),
    ref: decodeConfigRef(protocolField(instance,'ref',path),'automation',`${path}.ref`),
    executionTargetId:protocolOptionalString(instance,'executionTargetId',path),
    actionPresets: protocolRequiredArray(instance,'actionPresets',path).map((value,index) => {
      const presetPath = `${path}.actionPresets[${index}]`;
      const preset = protocolObject(value,presetPath,['id','actionId','inputs','parameterBindings']);
      return {
        id: protocolRequiredString(preset,'id',presetPath),
        actionId: protocolRequiredString(preset,'actionId',presetPath),
        inputs: protocolRecord(protocolField(preset,'inputs',presetPath),`${presetPath}.inputs`),
        parameterBindings:protocolRequiredArray(preset,'parameterBindings',presetPath).map((binding,bindingIndex) => {
          const bindingPath = `${presetPath}.parameterBindings[${bindingIndex}]`;
          const decoded = protocolObject(binding,bindingPath,['target','expression','language']);
          return {
            target:protocolRequiredString(decoded,'target',bindingPath),
            expression:protocolRequiredString(decoded,'expression',bindingPath),
            language:protocolEnum(
              protocolField(decoded,'language',bindingPath),
              ['xgc-expression-v2'],
              `${bindingPath}.language`,
            ),
          };
        }),
      };
    }),
  };
}

function decodeRobotBinding(
  value: unknown,
  path: string,
  robotKindComposition?: RobotAssetKindComposition,
): ExperimentRobotBinding {
  const binding = protocolObject(
    value,
    path,
    [
      'id','ref','namespace','hybridSource','runtimeParameters','initialPose','executionHost','simulationSensors','linkProfile','px4','scout','mecanum',
      ...(robotKindComposition?.experimentBindingArms ?? []),
    ],
  );
  const initialPosePath = `${path}.initialPose`;
  const initialPose = protocolObject(
    protocolField(binding,'initialPose',path),
    initialPosePath,
    ['x','y','z','yaw'],
  );
  const executionHost = Object.hasOwn(binding,'executionHost')
    ? decodeExecutionHostRef(protocolField(binding,'executionHost',path),`${path}.executionHost`)
    : undefined;
  const decoded: ExperimentRobotBinding = {
    ...(executionHost === undefined ? {} : { executionHost }),
    id: protocolRequiredString(binding,'id',path),
    ref: decodeConfigRef(protocolField(binding,'ref',path),'robot',`${path}.ref`),
    namespace: protocolRequiredString(binding,'namespace',path),
    hybridSource: protocolEnum(
      protocolField(binding,'hybridSource',path),
      EXPERIMENT_HYBRID_SOURCES,
      `${path}.hybridSource`,
    ),
    runtimeParameters: protocolStringRecord(
      protocolField(binding,'runtimeParameters',path),
      `${path}.runtimeParameters`,
    ),
    initialPose: {
      x: protocolRequiredNumber(initialPose,'x',initialPosePath),
      y: protocolRequiredNumber(initialPose,'y',initialPosePath),
      z: protocolRequiredNumber(initialPose,'z',initialPosePath),
      yaw: protocolRequiredNumber(initialPose,'yaw',initialPosePath),
    },
  };
  const simulationSensorsPath = `${path}.simulationSensors`;
  const simulationSensors = Object.hasOwn(binding,'simulationSensors')
    ? protocolObject(
      protocolField(binding,'simulationSensors',path),
      simulationSensorsPath,
      ['simpleLidar'],
    )
    : undefined;
  decoded.simulationSensors = {
    simpleLidar: simulationSensors === undefined
      ? false
      : protocolBoolean(
        protocolField(simulationSensors,'simpleLidar',simulationSensorsPath),
        `${simulationSensorsPath}.simpleLidar`,
      ),
  };
  if (Object.hasOwn(binding,'linkProfile')) {
    decoded.linkProfile = protocolRequiredString(binding,'linkProfile',path);
  }
  if (Object.hasOwn(binding,'px4')) {
    const px4Path = `${path}.px4`;
    const px4 = protocolObject(protocolField(binding,'px4',path),px4Path,['imageSimulationEnabled']);
    decoded.px4 = Object.hasOwn(px4,'imageSimulationEnabled')
      ? { imageSimulationEnabled: protocolBoolean(px4.imageSimulationEnabled,`${px4Path}.imageSimulationEnabled`) }
      : {};
  }
  if (Object.hasOwn(binding,'scout')) {
    const scoutPath = `${path}.scout`;
    const scout = protocolObject(
      protocolField(binding,'scout',path),
      scoutPath,
      ['lidarSimulationEnabled','imageSimulationEnabled'],
    );
    decoded.scout = {
      lidarSimulationEnabled: protocolBoolean(
        protocolField(scout,'lidarSimulationEnabled',scoutPath),
        `${scoutPath}.lidarSimulationEnabled`,
      ),
      imageSimulationEnabled: protocolBoolean(
        protocolField(scout,'imageSimulationEnabled',scoutPath),
        `${scoutPath}.imageSimulationEnabled`,
      ),
    };
  }
  if (Object.hasOwn(binding,'mecanum')) {
    const mecanumPath = `${path}.mecanum`;
    // Empty kind marker — Robot assets own physical UGV transport.
    protocolObject(protocolField(binding,'mecanum',path),mecanumPath,[]);
    decoded.mecanum = {};
  }
  for (const wireArm of robotKindComposition?.experimentBindingArms ?? []) {
    if (!Object.hasOwn(binding, wireArm)) continue;
    const adapter = robotKindComposition
      ?.contributionByExperimentBindingArm(wireArm)
      ?.experimentBinding;
    if (adapter) {
      decoded[wireArm] = adapter.decode(
        protocolField(binding, wireArm, path),
        `${path}.${wireArm}`,
      );
    }
  }
  return decoded;
}

function decodeExecutionHostRef(value: unknown,path: string): ExecutionHostRef {
  const issue = validateExecutionHostRef(value);
  if (issue) throw new Error(`Protocol error: ${path} is invalid: ${issue}`);
  return cloneExecutionHostRef(value as ExecutionHostRef);
}

function decodeConfigRef(value: unknown,domain: ConfigRef['domain'],path: string): ConfigRef {
  const reference = protocolObject(value,path,['domain','resourceId','branch','componentId']);
  const componentId = protocolOptionalString(reference,'componentId',path);
  return {
    domain: protocolEnum(protocolField(reference,'domain',path),[domain],`${path}.domain`),
    resourceId: protocolRequiredString(reference,'resourceId',path),
    branch: protocolRequiredString(reference,'branch',path),
    ...(componentId === undefined ? {} : { componentId }),
  };
}

function decodeDashboard(value: unknown,path: string): ExperimentDashboard {
  const dashboard = protocolObject(value,path,['id','name','description','panels']);
  return {
    id: protocolRequiredString(dashboard,'id',path),
    name: protocolRequiredString(dashboard,'name',path),
    description: protocolRequiredString(dashboard,'description',path),
    panels: protocolRequiredArray(dashboard,'panels',path)
      .map((panel,index) => decodePanel(panel,`${path}.panels[${index}]`)),
  };
}

function decodePanel(value: unknown,path: string): ExperimentPanel {
  const panel = protocolObject(value,path,[
    'schemaVersion','id','pluginId','title','executionTargetId','grid','view','portBindings',
  ]);
  const schemaVersion = protocolRequiredInteger(panel,'schemaVersion',path);
  if (schemaVersion !== PANEL_SCHEMA_VERSION) {
    throw new Error(`Protocol error: ${path}.schemaVersion must be ${PANEL_SCHEMA_VERSION}.`);
  }
  const executionTargetId = protocolOptionalString(panel,'executionTargetId',path);
  return {
    schemaVersion,
    id: protocolRequiredString(panel,'id',path),
    pluginId: protocolRequiredString(panel,'pluginId',path),
    title: protocolRequiredString(panel,'title',path),
    ...(executionTargetId === undefined ? {} : { executionTargetId }),
    grid: decodeGrid(protocolField(panel,'grid',path),`${path}.grid`),
    view: decodePanelView(protocolField(panel,'view',path),`${path}.view`),
    portBindings: protocolRequiredArray(panel,'portBindings',path)
      .map((binding,index) => decodePanelPortBinding(binding,`${path}.portBindings[${index}]`)),
  };
}

function decodeGrid(value: unknown,path: string): GridPos {
  const grid = protocolObject(value,path,['x','y','w','h']);
  return {
    x: protocolRequiredInteger(grid,'x',path),
    y: protocolRequiredInteger(grid,'y',path),
    w: protocolRequiredInteger(grid,'w',path),
    h: protocolRequiredInteger(grid,'h',path),
  };
}

function decodePanelView(value: unknown,path: string): PanelView {
  const payload = protocolObject(value,path,['query','options','fieldConfig']);
  return {
    query: protocolRecord(protocolField(payload,'query',path),`${path}.query`),
    options: protocolRecord(protocolField(payload,'options',path),`${path}.options`),
    fieldConfig: protocolRecord(protocolField(payload,'fieldConfig',path),`${path}.fieldConfig`),
  };
}

function decodePanelPortBinding(value: unknown,path: string): PanelPortBinding {
  const candidate = protocolRecord(value,path);
  const kind = protocolEnum(protocolField(candidate,'kind',path),PANEL_PORT_KINDS,`${path}.kind`);
  if (kind === 'workflow') {
    const binding = protocolObject(value,path,[
      'portId','kind','workflowInstanceId','presetId','managed','relation','failurePolicy',
    ]);
    return {
      portId:protocolRequiredString(binding,'portId',path),kind,
      workflowInstanceId:protocolRequiredString(binding,'workflowInstanceId',path),
      presetId:protocolRequiredString(binding,'presetId',path),
      managed:Object.hasOwn(binding,'managed')
        ? protocolBoolean(protocolField(binding,'managed',path),`${path}.managed`)
        : false,
      relation:protocolEnum(
        protocolField(binding,'relation',path),PANEL_WORKFLOW_RELATIONS,`${path}.relation`,
      ),
      failurePolicy:protocolEnum(
        protocolField(binding,'failurePolicy',path),PANEL_WORKFLOW_FAILURE_POLICIES,`${path}.failurePolicy`,
      ),
    };
  }
  if (kind === 'action') {
    const binding = protocolObject(value,path,['portId','kind','presetId','executionMode']);
    return {
      portId: protocolRequiredString(binding,'portId',path),kind,
      presetId: protocolRequiredString(binding,'presetId',path),
      ...(Object.hasOwn(binding,'executionMode') ? { executionMode:protocolEnum(binding.executionMode,PANEL_ACTION_EXECUTION_MODES,`${path}.executionMode`) } : {}),
    };
  }
  if (kind === 'data') {
    const binding = protocolObject(value,path,['portId','kind','projection']);
    return {
      portId: protocolRequiredString(binding,'portId',path),kind,
      projection: protocolRequiredString(binding,'projection',path),
    };
  }
  if (kind === 'authoring') {
    const binding = protocolObject(value,path,['portId','kind','target','presetId']);
    const presetId = protocolOptionalString(binding,'presetId',path);
    return {
      portId: protocolRequiredString(binding,'portId',path),kind,
      target: protocolEnum(protocolField(binding,'target',path),[...PANEL_AUTHORING_TARGETS],`${path}.target`),
      ...(presetId === undefined ? {} : { presetId }),
    };
  }
  const binding = protocolObject(value,path,['portId','kind','channel','contract']);
  return {
    portId: protocolRequiredString(binding,'portId',path),kind,
    channel: protocolRequiredString(binding,'channel',path),
    contract: protocolRequiredString(binding,'contract',path),
  };
}

function protocolRecord(value: unknown,path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Protocol error: ${path} must be an object.`);
  }
  return value as Record<string,unknown>;
}

function protocolStringRecord(value: unknown,path: string): Record<string,string> {
  const record = protocolRecord(value,path);
  const result: Record<string,string> = {};
  for (const [key,item] of Object.entries(record)) {
    if (typeof item !== 'string') {
      throw new Error(`Protocol error: ${path}.${key} must be a string.`);
    }
    result[key] = item;
  }
  return result;
}
