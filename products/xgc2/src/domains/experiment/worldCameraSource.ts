import type { ExperimentDocument, ExperimentWorkflowInstance } from './experimentModel';
import { experimentWorkflowInstance } from './experimentWorkflowInstances';

/** The Experiment workflow slot that owns the world camera provider. */
export const WORLD_CAMERA_WORKFLOW_INSTANCE_ID = 'panel-world-camera';
export const WORLD_CAMERA_EXPERIMENT_ACTION_ID = 'start-for-experiment';
/** Lichtblick reads this same pixel choice so the augmented view follows the camera. */
export const LICHTBLICK_WORKFLOW_INSTANCE_ID = 'panel-lichtblick';
const LICHTBLICK_EXPERIMENT_ACTION_ID = 'start-for-experiment';

export const WORLD_CAMERA_SOURCES = ['auto','simulation','physical','replay'] as const;
export type WorldCameraSource = (typeof WORLD_CAMERA_SOURCES)[number];

/** AR pixel semantics: Gazebo pixels never carry obstacle projection, real and replay pixels do. */
export type WorldCameraPixelSource = 'simulation' | 'physical';

/**
 * A Run's scene is frozen when its obstacles come from a native Gazebo world,
 * or when it has no Experiment copy to edit. Replay assets no longer freeze a
 * scene; the name is kept for its existing importers.
 */
export const REPLAY_SCENE_LOCKED_REASON = 'Scene geometry is read-only for this Run: it comes from a native Gazebo world or has no Experiment copy to edit.';

export type WorldCameraSourceSelection = {
  cameraSource: WorldCameraSource;
};

/** Read the orthogonal pixel-source choice from the world-camera Action inputs. */
export function worldCameraSourceSelection(inputs: Record<string,unknown>): WorldCameraSourceSelection {
  const cameraSource = typeof inputs.cameraSource === 'string'
    && (WORLD_CAMERA_SOURCES as readonly string[]).includes(inputs.cameraSource)
    ? inputs.cameraSource as WorldCameraSource
    : 'auto';
  return { cameraSource };
}

export function worldCameraPresetInputs(experiment: ExperimentDocument | undefined): Record<string,unknown> | undefined {
  return experimentWorkflowInstance(experiment,WORLD_CAMERA_WORKFLOW_INSTANCE_ID)?.actionPresets
    .find((preset) => preset.actionId === WORLD_CAMERA_EXPERIMENT_ACTION_ID)?.inputs;
}

export function worldCameraSourceForExperiment(experiment: ExperimentDocument | undefined): WorldCameraSourceSelection {
  return worldCameraSourceSelection(worldCameraPresetInputs(experiment) ?? {});
}

/**
 * Update the camera preset and mirror its pixel source to the existing
 * Lichtblick preset. Experiment.scene remains owned by Config.
 */
export function applyWorldCameraSourceSelection(
  instances: readonly ExperimentWorkflowInstance[],
  instanceId: string,
  presetId: string,
  nextInputs: Record<string, unknown>,
): ExperimentWorkflowInstance[] {
  const cameraSource = worldCameraSourceSelection(nextInputs).cameraSource;
  return instances.map((instance) => {
    let changed = false;
    const actionPresets = instance.actionPresets.map((preset) => {
      if (instance.id === instanceId && preset.id === presetId) {
        changed = true;
        return { ...preset, inputs: { ...nextInputs, cameraSource } };
      }
      if (instance.id === LICHTBLICK_WORKFLOW_INSTANCE_ID && preset.actionId === LICHTBLICK_EXPERIMENT_ACTION_ID) {
        changed = true;
        return { ...preset, inputs: { ...preset.inputs, cameraSource } };
      }
      return preset;
    });
    return changed ? { ...instance, actionPresets } : instance;
  });
}

/**
 * The effective pixel source decides the camera topic group and AR obstacle
 * projection. Explicit simulation/physical/replay choices win; auto and a
 * missing preset keep the current runMode mapping.
 */
export function effectiveWorldCameraPixelSource(
  experiment: ExperimentDocument | undefined,
  runMode: string,
): WorldCameraPixelSource | undefined {
  const { cameraSource } = worldCameraSourceForExperiment(experiment);
  if (cameraSource === 'physical' || cameraSource === 'replay') return 'physical';
  if (cameraSource === 'simulation') return 'simulation';
  if (runMode === 'physical' || runMode === 'hybrid') return 'physical';
  if (runMode === 'simulation') return 'simulation';
  return undefined;
}
