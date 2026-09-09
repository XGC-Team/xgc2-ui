import {
  PANEL_SCHEMA_VERSION,
  type ExperimentPanel,
  type PanelInstance,
  type PanelPortBinding,
} from './experimentModel';

export function panelToEditor(panel: ExperimentPanel): PanelInstance {
  return {
    id: panel.id,
    pluginId: panel.pluginId,
    title: panel.title,
    targetCoreId: panel.executionTargetId,
    gridPos: { ...panel.grid },
    query: structuredClone(panel.view.query),
    options: structuredClone(panel.view.options),
    fieldConfig: structuredClone(panel.view.fieldConfig),
    portBindings: structuredClone(panel.portBindings),
  };
}

export function panelFromEditor(panel: PanelInstance): ExperimentPanel {
  return normalizeExperimentPanel({
    schemaVersion: PANEL_SCHEMA_VERSION,
    id: panel.id,
    pluginId: panel.pluginId,
    title: panel.title,
    executionTargetId: panel.targetCoreId,
    grid: panel.gridPos,
    view: {
      query: panel.query,
      options: panel.options,
      fieldConfig: panel.fieldConfig,
    },
    portBindings: panel.portBindings,
  });
}

export function normalizeExperimentPanel(panel: ExperimentPanel): ExperimentPanel {
  return {
    schemaVersion: PANEL_SCHEMA_VERSION,
    id: panel.id.trim(),
    pluginId: panel.pluginId.trim(),
    title: panel.title.trim(),
    ...(panel.executionTargetId?.trim() ? { executionTargetId: panel.executionTargetId.trim() } : {}),
    grid: { ...panel.grid },
    view: {
      query: structuredClone(panel.view.query ?? {}),
      options: structuredClone(panel.view.options ?? {}),
      fieldConfig: structuredClone(panel.view.fieldConfig ?? {}),
    },
    portBindings: normalizePanelPortBindings(panel.portBindings ?? []),
  };
}

function normalizePanelPortBindings(bindings: PanelPortBinding[]) {
  return bindings.map((binding) => {
    switch (binding.kind) {
    case 'workflow':
      return {
        portId:binding.portId.trim(),kind:binding.kind,
        workflowInstanceId:binding.workflowInstanceId.trim(),presetId:binding.presetId.trim(),
        managed:Boolean(binding.managed),relation:binding.relation,failurePolicy:binding.failurePolicy,
      };
    case 'action':
      return {
        portId: binding.portId.trim(),kind: binding.kind,
        presetId: binding.presetId.trim(),
      };
    case 'data':
      return { portId: binding.portId.trim(),kind: binding.kind,projection: binding.projection.trim() };
    case 'authoring':
      return {
        portId: binding.portId.trim(),kind: binding.kind,target: binding.target,
        ...(binding.presetId?.trim() ? { presetId: binding.presetId.trim() } : {}),
      };
    case 'interaction':
      return {
        portId: binding.portId.trim(),kind: binding.kind,
        channel: binding.channel.trim(),contract: binding.contract.trim(),
      };
    }
  });
}
