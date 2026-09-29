import type {
  AutomationChildRunRelation,
  AutomationRunDetail,
} from '../../automation/automationPublic';
import { canonicalRobotSelectionParameters } from '../../robot/robotPublic';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import { experimentChildRunRelations } from '../experimentChildRunBinding';
import type { ExperimentDashboard } from '../experimentModel';
import type { ExperimentSessionView } from '../experimentWorkflowModel';

export function robotInstrumentSessionRunIds(
  dashboards: readonly ExperimentDashboard[],
  session: ExperimentSessionView | undefined,
) {
  const bindings = new Set(dashboards.flatMap(dashboard => dashboard.panels
    .filter(panel => panel.pluginId === 'robot-instruments-grid')
    .flatMap(panel => panel.portBindings.flatMap(binding => binding.kind === 'workflow'
      ? [binding.workflowInstanceId] : []))));
  return robotInstrumentSessionBindingRunIds(session, [...bindings]);
}

export function robotInstrumentSessionBindingRunIds(
  session: ExperimentSessionView | undefined,
  bindingIds: readonly string[],
) {
  const bindings = new Set(bindingIds.filter(Boolean));
  if (!bindings.size || !session || !['opening','active'].includes(session.session.state)) return [];
  const members = session.members.filter(member => member.targetId === session.session.targetId
    && (member.status === 'running' || member.status === 'attached'));
  const owners = members.filter(member => member.kind === 'workflow_run' && bindings.has(member.bindingId));
  // The binding projection follows admitted replacements across command roots.
  // A manual partial Session can still be acquiring its first binding owner.
  const sources = owners.length ? owners : members.filter(member => member.kind === 'workflow_command');
  return [...new Set(sources.map(member => member.ownerId))];
}

export type InstrumentConnectionCoverage = {
  robotIds: readonly string[];
  coversAll: boolean;
};

export function partitionSelectedRobotConnection(
  selectedIds: readonly string[],
  connectedIds: ReadonlySet<string>,
) {
  const selected = canonicalRobotSelectionParameters(selectedIds).robotIds;
  return {
    selected,
    toConnect: selected.filter((id) => !connectedIds.has(id)),
    toDisconnect: selected.filter((id) => connectedIds.has(id)),
  };
}

export function connectedRobotIdsForSelection(
  selectedIds: readonly string[],
  coverages: readonly InstrumentConnectionCoverage[],
) {
  const selected = new Set(canonicalRobotSelectionParameters(selectedIds).robotIds);
  const connected = new Set<string>();
  coverages.forEach((coverage) => {
    if (coverage.coversAll) {
      selected.forEach((id) => connected.add(id));
      return;
    }
    coverage.robotIds.forEach((id) => {
      if (selected.has(id)) connected.add(id);
    });
  });
  return connected;
}

export function instrumentRunCoversAll(robotIds: readonly string[], selectionKey: string) {
  return robotIds.length === 0 || selectionKey === 'all';
}

export const INSTRUMENT_SLOT_PRODUCER_NODE_ID = 'robot-slots';
export const INSTRUMENT_OBSERVER_PRODUCER_NODE_ID = 'robot-observers';

export function instrumentSlotGroupsKnown(
  details: Readonly<Record<string,AutomationRunDetail>>,
  parentRunIds: readonly string[],
) {
  return parentRunIds.some((parentRunId) => {
    const relations = details[parentRunId]?.relations;
    return Boolean(relations?.childRunGroups.some((group) => group.producerNodeId === INSTRUMENT_SLOT_PRODUCER_NODE_ID));
  });
}

export function liveInstrumentSlotStops(
  details: Readonly<Record<string,AutomationRunDetail>>,
  parentRunIds: readonly string[],
  robotIds: ReadonlySet<string>,
  locallyStoppedRunIds: ReadonlySet<string> = new Set(),
) {
  return liveInstrumentRobotStops(
    details,parentRunIds,robotIds,locallyStoppedRunIds,[INSTRUMENT_SLOT_PRODUCER_NODE_ID],
  );
}

export function liveInstrumentRobotStops(
  details: Readonly<Record<string,AutomationRunDetail>>,
  parentRunIds: readonly string[],
  robotIds: ReadonlySet<string>,
  locallyStoppedRunIds: ReadonlySet<string> = new Set(),
  producerNodeIds: readonly string[] = [INSTRUMENT_SLOT_PRODUCER_NODE_ID],
) {
  const producers = new Set(producerNodeIds);
  const stops: { itemKey: string; child: AutomationChildRunRelation }[] = [];
  const seen = new Set<string>();
  parentRunIds.forEach((parentRunId) => {
    const relations = details[parentRunId]?.relations;
    if (!relations) return;
    const producerByGroup = new Map(
      relations.childRunGroups
        .filter((group) => producers.has(group.producerNodeId))
        .map((group) => [group.id, group.producerNodeId]),
    );
    relations.childRunGroupMembers.forEach((member) => {
      const producerNodeId = producerByGroup.get(member.groupId);
      if (!producerNodeId
        || member.state === 'abandoned'
        || member.state === 'terminal'
        || !robotIds.has(member.itemKey)
        || locallyStoppedRunIds.has(member.childRunId)) return;
      const seenKey = `${producerNodeId}:${member.itemKey}`;
      if (seen.has(seenKey)) return;
      const child = experimentChildRunRelations(relations, member.childRunId)[0];
      const exactRun = details[member.childRunId]?.run;
      const status = exactRun && exactRun.revision >= (child?.runRevision ?? 0)
        ? exactRun.status : child?.runStatus ?? child?.observedStatus;
      if (!child || !status || !isRunStatusActive(status)) return;
      seen.add(seenKey);
      stops.push({ itemKey: member.itemKey,child: { ...child,runStatus:status } });
    });
  });
  return stops;
}
