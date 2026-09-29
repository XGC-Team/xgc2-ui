import { ChevronLeft,ChevronRight } from 'lucide-react';
import { useMemo,type CSSProperties } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { EmptyState } from '@xgc2/ui-react';
import { experimentProcessRuntimeProjection,robotInstrumentSessionBindingRunIds } from '../../domains/experiment/experimentPublic';
import type { ExperimentDocument } from '../../domains/experiment/experimentPublic';
import { useRobotSelection,useRobotText,useRobotRuns,useUgvChassisHold } from '../../domains/robot/robotPublic';
import {
  useRobotAssetKindComposition,
  type RobotAssetDocument,
} from '../../domains/robot/robotAssetPublic';
import { panelDashboardId } from '../../shared/panelDashboard';
import type { PanelPluginProps } from '../types';
import {
  ROBOT_SIMULATION_WORKFLOW_SLOT,
} from './robotSimulationPanelModel';
import { RobotProjectionCard } from './RobotProjectionCard';
import { RobotSimulationWorkflow } from './RobotSimulationWorkflow';
import {
  resolveRobotInstrumentRoster,
  robotCategory,
  robotProjectionSessionRunId,
  staticRobot,
} from './robotProjectionModel';
import { useRobotInstrumentBoard } from './useRobotInstrumentBoard';

export function RobotInstrumentsGrid({ panel,context }: PanelPluginProps<readonly ['visualization','experiment','automation']>) {
  const t = useRobotText();
  const experiment = experimentDocument(context.ports.data.robots?.value);
  const assets = robotAssetProjection(context.ports.data['robot-assets']?.value);
  const experimentRuntime = experimentProcessRuntimeProjection(context.ports.data['robot-runtime']?.value);
  const action = context.ports.actions[ROBOT_SIMULATION_WORKFLOW_SLOT];
  const targetId = context.executionTargetId || experimentRuntime?.targetId || 'local';
  const projectionRunId = robotProjectionSessionRunId(
    experimentRuntime,action?.trace.workflowInstanceId,
  );
  const session = experimentRuntime?.sessionViews?.find(view => view.members.some(member => (
    member.kind === 'workflow_run' && member.ownerId === projectionRunId
  )));
  const projectionRunIds = robotInstrumentSessionBindingRunIds(session, [action?.trace.workflowInstanceId ?? '']);
  const runtime = useRobotRuns(targetId,projectionRunIds);
  const robotKindComposition = useRobotAssetKindComposition();
  // One lookup per binding and per card instead of a catalog scan for each.
  const assetIndex = useMemo(() => robotAssetIndex(assets.assets),[assets.assets]);
  const staticRobots = useMemo(() => (experiment?.spec.robots ?? []).flatMap((binding) => {
    const asset = assetIndex.byRef.get(assetRefKey(binding.ref.resourceId,binding.ref.branch));
    return asset ? [staticRobot(binding,asset,robotKindComposition)] : [];
  }),[assetIndex,experiment?.spec.robots,robotKindComposition]);
  const runtimeRobots = runtime.projection?.robots;
  const robots = useMemo(
    () => resolveRobotInstrumentRoster(staticRobots,runtimeRobots),
    [staticRobots,runtimeRobots],
  );
  const experimentId = experiment?.head.resourceId;
  const dashboardId = panelDashboardId(panel);
  const [selected,setSelected] = useRobotSelection({
    experimentId,dashboardId,panelId:panel.id,shared:context.sharedStateScope,
  });
  const selectedIds = useMemo(() => new Set(selected),[selected]);
  const [chassisHold] = useUgvChassisHold({
    experimentId,dashboardId,panelId:panel.id,shared:context.sharedStateScope,
  });
  const typeFilter = typeof panel.options.typeFilter === 'string' ? panel.options.typeFilter : 'all';
  const visible = useMemo(() => typeFilter === 'all'
    ? robots
    : robots.filter((robot) => (
      robot.kind === typeFilter || robotCategory(robot, robotKindComposition) === typeFilter
    )),[
    robotKindComposition,robots,typeFilter,
  ]);
  const robotIdsKey = JSON.stringify(robots.map((robot) => robot.id));
  const visibleRobotIdsKey = JSON.stringify(visible.map((robot) => robot.id));
  const robotIds = useMemo<string[]>(() => JSON.parse(robotIdsKey),[robotIdsKey]);
  const visibleRobotIds = useMemo<string[]>(() => JSON.parse(visibleRobotIdsKey),[visibleRobotIdsKey]);
  const board = useRobotInstrumentBoard({
    experimentId,dashboardId,panelId:panel.id,robotIds,visibleRobotIds,setSelected,
  });
  const pagedVisible = useMemo(() => {
    if (board.viewMode === 'workflow') return visible;
    const allowed = new Set(board.pagedRobotIds);
    return visible.filter((robot) => allowed.has(robot.id));
  },[board.pagedRobotIds,board.viewMode,visible]);
  const listDensity = pagedVisible.length <= 6 ? 'comfortable' : pagedVisible.length <= 12 ? 'compact' : 'dense';
  const empty = visible.length === 0 && !assets.loading;
  const showPagination = (board.viewMode === 'single' || board.viewMode === 'double')
    && !empty && board.pageCount > 1;
  return (
    <div
      ref={board.panelRef}
      className="robot-instruments-panel"
      data-xgc-role="run-robot-instruments"
      data-xgc-id={projectionRunId || panel.id}
      data-xgc-mode={board.viewMode}
      data-xgc-page={board.viewMode === 'workflow' ? undefined : String(board.pageIndex + 1)}
      data-xgc-page-count={board.viewMode === 'workflow' ? undefined : String(board.pageCount)}
      data-xgc-page-size={board.viewMode === 'workflow' ? undefined : String(board.pageSize)}
    >
      {board.viewMode === 'workflow' ? (
        <RobotSimulationWorkflow panelId={panel.id} runtime={experimentRuntime}
          workflowResourceId={action?.trace.automationResourceId ?? ''} />
      ) : empty ? (
        <EmptyState className="robot-instrument-empty" density="compact" appearance="plain" fill title={t('No matching robots')} />
      ) : (
        <div
          ref={board.boardRef}
          className="robot-instrument-grid"
          data-xgc-layout={board.viewMode}
          data-xgc-density={board.viewMode === 'list' ? listDensity : undefined}
          style={board.viewMode === 'list' ? undefined : {
            '--robot-instrument-board-height':`${board.boardRowHeight}px`,
          } as CSSProperties}
          onPointerDown={board.beginBoxSelection}
          onPointerMove={board.moveBoxSelection}
          onPointerUp={board.finishBoxSelection}
          onPointerCancel={board.clearSelectionBox}
          onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}
          aria-label={t('Robot instruments')}
        >
          {pagedVisible.map((robot) => (
            <RobotProjectionCard
              assetTargetCoreId="local"
              key={robot.id}
              targetId={targetId}
              runId={runtime.runIdsByRobotId?.[robot.id]}
              runMode={experimentRuntime?.activeRun?.runMode}
              robot={robot}
              assetSpec={assetIndex.byId.get(robot.robotAssetId)?.spec}
              selected={selectedIds.has(robot.id)}
              chassisHold={chassisHold && robotCategory(robot, robotKindComposition) === 'ugv'}
              instrument={board.viewMode !== 'list'}
              onSelect={board.toggleRobot}
            />
          ))}
        </div>
      )}
      {showPagination && (
        <div className="robot-instrument-pagination" data-xgc-role="robot-instrument-pagination" data-xgc-id={panel.id}>
          <ControlButton size="compact" iconOnly aria-label={t('Previous instrument page')}
            dataXgcRole="robot-instrument-page-prev" dataXgcId={panel.id} disabled={board.pageIndex <= 0}
            onClick={() => board.setPageIndex((current) => Math.max(0,current - 1))}>
            <ChevronLeft size={14} />
          </ControlButton>
          <span className="robot-instrument-pagination-label" data-xgc-role="robot-instrument-page-label" data-xgc-id={panel.id}>
            {board.pageIndex + 1}/{board.pageCount}
          </span>
          <ControlButton size="compact" iconOnly aria-label={t('Next instrument page')}
            dataXgcRole="robot-instrument-page-next" dataXgcId={panel.id}
            disabled={board.pageIndex >= board.pageCount - 1}
            onClick={() => board.setPageIndex((current) => Math.min(board.pageCount - 1,current + 1))}>
            <ChevronRight size={14} />
          </ControlButton>
        </div>
      )}
      {board.viewMode !== 'workflow' && !empty && (
        <div ref={board.selectionBoxRef} className="robot-instrument-selection-box" hidden />
      )}
    </div>
  );
}

function assetRefKey(resourceId:string,branch:string) {
  return `${resourceId}\u0000${branch}`;
}

/** First asset per (resource, branch) and per resource, as find() would pick. */
function robotAssetIndex(assets:readonly RobotAssetDocument[]) {
  const byRef = new Map<string,RobotAssetDocument>();
  const byId = new Map<string,RobotAssetDocument>();
  assets.forEach((asset) => {
    const ref = assetRefKey(asset.head.resourceId,asset.branch.name);
    if (!byRef.has(ref)) byRef.set(ref,asset);
    if (!byId.has(asset.head.resourceId)) byId.set(asset.head.resourceId,asset);
  });
  return { byRef,byId };
}

function experimentDocument(value:unknown):ExperimentDocument|undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ExperimentDocument>;
  return candidate.head && candidate.branch && candidate.spec ? candidate as ExperimentDocument : undefined;
}

function robotAssetProjection(value:unknown):{ assets:readonly RobotAssetDocument[];loading:boolean;error:string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { assets:[],loading:false,error:'' };
  const candidate = value as { assets?:unknown;loading?:unknown;error?:unknown };
  return {
    assets:Array.isArray(candidate.assets) ? candidate.assets as RobotAssetDocument[] : [],
    loading:candidate.loading === true,
    error:typeof candidate.error === 'string' ? candidate.error : '',
  };
}
