import { CONFIGURATION_MAIN_BRANCH } from '../../shared/configResource';
import {
  normalizeRobotNamespace,
  type RobotAssetKindComposition,
} from '../robot/robotAssetPublic';
import {
  EXPERIMENT_HYBRID_SOURCES,
  type ConfigRef,
  type ExperimentHybridSource,
  type ExperimentRobotBinding,
} from './experimentModel';

export function normalizeExperimentRobotBindings(
  bindings: ExperimentRobotBinding[],
  composition?: RobotAssetKindComposition,
) {
  if (!Array.isArray(bindings)) return [];
  return bindings.map((binding) => {
    const normalized: ExperimentRobotBinding = {
      id: binding.id.trim(),
      ref: normalizeRobotRef(binding.ref),
      namespace: normalizeRobotNamespace(binding.namespace),
      // Preserve exact bytes so validation rejects aliases, padding and case.
      hybridSource: binding.hybridSource as ExperimentHybridSource,
      runtimeParameters: cloneStringMap(binding.runtimeParameters),
      initialPose: { ...binding.initialPose },
      // Exactly one kind marker when present; never copy retired transport fields.
      ...(binding.px4 ? { px4: {} as Record<string, never> } : {}),
      ...(binding.scout ? {
        scout: {
          lidarSimulationEnabled: Boolean(binding.scout.lidarSimulationEnabled),
          imageSimulationEnabled: Boolean(binding.scout.imageSimulationEnabled),
        },
      } : {}),
      ...(binding.mecanum ? { mecanum: {} as Record<string, never> } : {}),
    };
    for (const wireArm of composition?.experimentBindingArms ?? []) {
      if (!Object.hasOwn(binding, wireArm)) continue;
      const adapter = composition?.contributionByExperimentBindingArm(wireArm)?.experimentBinding;
      if (adapter) normalized[wireArm] = adapter.normalize(binding[wireArm]);
    }
    return normalized;
  });
}

export function validateExperimentRobotBindings(
  bindings: ExperimentRobotBinding[],
  composition?: RobotAssetKindComposition,
) {
  const ids = new Set<string>();
  const resourceIds = new Set<string>();
  const namespaces = new Set<string>();
  for (const binding of bindings) {
    const id = binding.id.trim();
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) {
      return `Experiment Robot "${id}" must start with a lowercase letter and use lowercase letters, numbers, or hyphens.`;
    }
    if (ids.has(id)) return `Experiment Robot ID "${id}" must be unique.`;
    ids.add(id);
    if (binding.ref.domain !== 'robot' || !binding.ref.resourceId.trim() || !binding.ref.branch.trim()) {
      return `Experiment Robot "${id}" must use a valid Robot asset.`;
    }
    if (binding.ref.componentId?.trim()) return `Experiment Robot "${id}" cannot use a Robot component.`;
    if (resourceIds.has(binding.ref.resourceId)) {
      return `Robot asset "${binding.ref.resourceId}" cannot be added to this Experiment more than once.`;
    }
    resourceIds.add(binding.ref.resourceId);
    if (!/^\/[A-Za-z][A-Za-z0-9_]*(?:\/[A-Za-z][A-Za-z0-9_]*)*$/.test(binding.namespace)) {
      return `Experiment Robot "${id}" requires an absolute ROS namespace.`;
    }
    if (namespaces.has(binding.namespace)) return `ROS namespace "${binding.namespace}" must be unique.`;
    namespaces.add(binding.namespace);
    if (!(EXPERIMENT_HYBRID_SOURCES as readonly string[]).includes(binding.hybridSource)) {
      return `Experiment Robot "${id}" has unsupported hybrid source "${binding.hybridSource}".`;
    }
    const runtimeIssue = validateRuntimeParameters(binding.runtimeParameters);
    if (runtimeIssue) return `Experiment Robot "${id}" ${runtimeIssue}`;
    if (Object.values(binding.initialPose).some((value) => !Number.isFinite(value))) {
      return `Experiment Robot "${id}" initial pose must be finite.`;
    }
    // Parity with core experimentconfig: each slot needs exactly one kind arm.
    const contributedArms = (composition?.experimentBindingArms ?? [])
      .filter((wireArm) => Object.hasOwn(binding, wireArm));
    const arms = [binding.px4, binding.scout, binding.mecanum, ...contributedArms]
      .filter((arm) => arm != null);
    if (arms.length !== 1) {
      return `Experiment Robot "${id}" requires exactly one Robot kind settings arm.`;
    }
    if (binding.px4 && Object.keys(binding.px4).length > 0) {
      return `Experiment Robot "${id}" px4 overrides must be empty; Robot assets own transport identity.`;
    }
    if (binding.mecanum && Object.keys(binding.mecanum).length > 0) {
      return `Experiment Robot "${id}" mecanum overrides must be empty; Robot assets own transport identity.`;
    }
    for (const wireArm of contributedArms) {
      const adapter = composition?.contributionByExperimentBindingArm(wireArm)?.experimentBinding;
      const issue = adapter?.validate(binding[wireArm], id) ?? '';
      if (issue) return issue;
    }
    if (binding.scout) {
      if (typeof binding.scout.lidarSimulationEnabled !== 'boolean'
        || typeof binding.scout.imageSimulationEnabled !== 'boolean') {
        return `Experiment Robot "${id}" Scout simulation switches must be booleans.`;
      }
      // Parity with empty px4/mecanum markers: no residual robot-owned UGV transport.
      const scoutKeys = Object.keys(binding.scout as object);
      if (scoutKeys.some((key) => key !== 'lidarSimulationEnabled' && key !== 'imageSimulationEnabled')) {
        return `Experiment Robot "${id}" scout overrides may only set lidar/image simulation switches; Robot assets own transport identity.`;
      }
    }
  }
  return '';
}

function normalizeRobotRef(ref: ConfigRef): ConfigRef {
  return {
    domain: ref.domain.trim().toLowerCase() as ConfigRef['domain'],
    resourceId: ref.resourceId.trim(),
    branch: ref.branch.trim() || CONFIGURATION_MAIN_BRANCH,
    ...(ref.componentId?.trim() ? { componentId: ref.componentId.trim() } : {}),
  };
}

function cloneStringMap(value: Record<string,string>) {
  return Object.fromEntries(Object.entries(value).sort(([left],[right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
}

/** Robot-owned keys (parity with core experimentconfig.isRobotOwnedRuntimeParameter). */
const ROBOT_OWNED_RUNTIME_PARAMETERS = new Set([
  'namespace',
  'mocap_rigid_body',
  'positioning_frame_number',
  'positioning_comparison_threshold_m',
  'mav_system_id',
  'management_ip',
  'management_address',
  'connector',
  'telemetry_remote_port',
  'control_local_port',
  'physical_mavros_local_port',
  'physical_fcu_remote_port',
  'simulation_local_port',
  'simulation_remote_port',
  'physical_fcu_url',
  'physical_gcs_url',
  'simulation_fcu_url',
]);

function validateRuntimeParameters(value: unknown) {
  if (!isPlainObject(value)) return 'runtime parameters must be a string map.';
  if (Object.keys(value).length > 64) return 'runtime parameters must not exceed 64 entries.';
  for (const [key,parameterValue] of Object.entries(value)) {
    if (ROBOT_OWNED_RUNTIME_PARAMETERS.has(key)) {
      return `runtime parameter "${key}" is reserved and derived from the Experiment Robot configuration.`;
    }
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return `runtime parameter key "${key}" is invalid.`;
    if (typeof parameterValue !== 'string') return `runtime parameter "${key}" must be a string.`;
    if (new TextEncoder().encode(parameterValue).byteLength > 4096) {
      return `runtime parameter "${key}" must not exceed 4096 bytes.`;
    }
  }
  return '';
}

function isPlainObject(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
