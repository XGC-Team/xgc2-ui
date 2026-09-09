import type {
  ExperimentDocument,
  ExperimentWorkflowInstance,
  WorkflowActionPreset,
} from './experimentModel';

export function experimentWorkflowInstance(
  experiment: ExperimentDocument | undefined,
  instanceId: string,
): ExperimentWorkflowInstance | undefined {
  return experiment?.spec.workflowInstances.find((instance) => instance.id === instanceId);
}

export function experimentWorkflowActionPreset(
  experiment: ExperimentDocument | undefined,
  instanceId: string,
  presetId: string,
): WorkflowActionPreset | undefined {
  return experimentWorkflowInstance(experiment,instanceId)?.actionPresets
    .find((preset) => preset.id === presetId);
}

/**
 * Commits values onto the named workflow instance's explicit Action presets.
 * The caller must deliberately select which presets it owns. Target and
 * parameter-expression bindings remain separate authored graph facts.
 */
export function updateWorkflowActionPresets(
  experiment: ExperimentDocument,
  instanceId: string,
  select: (preset: WorkflowActionPreset) => boolean,
  update: (inputs: Record<string,unknown>,preset: WorkflowActionPreset) => Record<string,unknown>,
): ExperimentDocument {
  let instanceFound = false;
  let presetFound = false;
  const workflowInstances = experiment.spec.workflowInstances.map((instance) => {
    if (instance.id !== instanceId) return instance;
    instanceFound = true;
    const actionPresets = instance.actionPresets.map((preset) => {
      if (!select(preset)) return preset;
      presetFound = true;
      return { ...preset,inputs: update(preset.inputs,preset) };
    });
    return { ...instance,actionPresets };
  });
  if (!instanceFound) throw new Error(`Experiment workflow instance "${instanceId}" is unavailable.`);
  if (!presetFound) throw new Error(`Experiment workflow instance "${instanceId}" has no selected Action preset.`);
  return { ...experiment,spec: { ...experiment.spec,workflowInstances } };
}
