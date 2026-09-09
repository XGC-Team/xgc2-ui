import { openAutomationSourceLocation } from '../domains/automation/automationPublic';
import { executionTargetResourceId } from '../domains/execution/executionPublic';
import { openExperimentSourceLocation } from '../domains/experiment/experimentPublic';
import type {
  GroundStationContextDestination,
  GroundStationContextInteraction,
  GroundStationInteraction,
} from '../domains/groundStationInteraction/groundStationInteractionPublic';
import type { Page } from './navigation/navConfig';

const contextPages: Readonly<Record<string,Page>> = {
  experiment: 'experiment',telemetry: 'experiment',automation: 'automations','automation-run': 'automations',
};

export function groundStationContextPage(kind: string): Page | undefined {
  return contextPages[kind];
}

function matchesTarget(interaction: GroundStationInteraction, selectedTargetId: string) {
  return Boolean(selectedTargetId.trim()) && (interaction.targetScope === selectedTargetId
    || interaction.targetScope === executionTargetResourceId(selectedTargetId));
}

export async function openGroundStationContext(
  context: GroundStationContextDestination,
  interaction: GroundStationContextInteraction,
  navigatePage: (page: Page) => void,
  selectedTargetId: string,
): Promise<boolean> {
  if (!matchesTarget(interaction, selectedTargetId) || !context.id.trim()) return false;
  if (context.kind === 'experiment' || context.kind === 'telemetry') {
    const resourceId = context.kind === 'experiment' ? context.id : interaction.origin.experimentId;
    if (!resourceId) return false;
    return openExperimentSourceLocation({
      targetId: selectedTargetId,resourceId,
      ...(context.subview && context.subview !== 'activity' ? { dashboardId: context.subview } : { preferActivity: true }),
    }, () => navigatePage('experiment'));
  }
  if (context.kind === 'automation-run') {
    const sameRun = interaction.origin.runId === context.id;
    return openAutomationSourceLocation({
      targetId: selectedTargetId,runId: context.id,
      ...(sameRun ? { nodeId: interaction.origin.nodeId,invocationId: interaction.origin.invocationId } : {}),
    }, () => navigatePage('automations'));
  }
  if (context.kind === 'automation') {
    return openAutomationSourceLocation({ targetId: selectedTargetId,resourceId: context.id }, () => navigatePage('automations'));
  }
  // Unsupported destinations do not pretend that changing the top-level page
  // selected their robot, operation or log stream.
  return false;
}

export async function openGroundStationInteractionOrigin(
  interaction: GroundStationInteraction,
  navigatePage: (page: Page) => void,
  selectedTargetId: string,
): Promise<boolean> {
  if (!matchesTarget(interaction, selectedTargetId)) return false;
  const origin = interaction.origin;
  const experimentId = origin.experimentId || (origin.type === 'experiment' ? origin.ref : undefined);
  if (experimentId) {
    return openExperimentSourceLocation({
      targetId: selectedTargetId,resourceId: experimentId,preferActivity: true,
    }, () => navigatePage('experiment'));
  }
  if (origin.runId) {
    return openAutomationSourceLocation({
      targetId: selectedTargetId,runId: origin.runId,nodeId: origin.nodeId,invocationId: origin.invocationId,
    }, () => navigatePage('automations'));
  }
  if (origin.type === 'automation' && origin.ref) {
    return openAutomationSourceLocation({
      targetId: selectedTargetId,resourceId: origin.ref,nodeId: origin.nodeId,
    }, () => navigatePage('automations'));
  }
  return false;
}
