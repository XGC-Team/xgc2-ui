import type {
  AutomationChildRunRelation,
  AutomationRunDetail,
} from '../../automation/automationPublic';
import { canonicalRobotSelectionParameters } from '../../robot/robotPublic';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';

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

export function instrumentSlotGroupsKnown(
  details: Readonly<Record<string,AutomationRunDetail>>,
  parentRunIds: readonly string[],
) {
  return parentRunIds.some((parentRunId) => {
    const relations = details[parentRunId]?.relations;
    return Boolean(relations?.childRunGroups.some((group) => group.producerNodeId === 'robot-slots'));
  });
}

export function liveInstrumentSlotStops(
  details: Readonly<Record<string,AutomationRunDetail>>,
  parentRunIds: readonly string[],
  robotIds: ReadonlySet<string>,
  locallyStoppedRunIds: ReadonlySet<string> = new Set(),
) {
  const stops: { itemKey: string; child: AutomationChildRunRelation }[] = [];
  const seen = new Set<string>();
  parentRunIds.forEach((parentRunId) => {
    const relations = details[parentRunId]?.relations;
    if (!relations) return;
    const groupIds = new Set(
      relations.childRunGroups
        .filter((group) => group.producerNodeId === 'robot-slots')
        .map((group) => group.id),
    );
    relations.childRunGroupMembers.forEach((member) => {
      if (!groupIds.has(member.groupId)
        || member.state === 'abandoned'
        || member.state === 'terminal'
        || !robotIds.has(member.itemKey)
        || locallyStoppedRunIds.has(member.childRunId)
        || seen.has(member.itemKey)) return;
      const child = relations.childRuns.find((candidate) => candidate.childRunId === member.childRunId);
      const status = child?.runStatus ?? child?.observedStatus;
      if (!child || !status || !isRunStatusActive(status)) return;
      seen.add(member.itemKey);
      stops.push({ itemKey: member.itemKey,child });
    });
  });
  return stops;
}
