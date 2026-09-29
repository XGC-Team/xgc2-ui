import { memo,useCallback,type KeyboardEvent,type PointerEvent } from 'react';
import { StatusText } from '@xgc2/ui-react';
import { experimentRobotSimulationSourceMark,useExperimentSurfaceVisible } from '../../domains/experiment/experimentPublic';
import {
  requestRobotInstrumentSshJump,
  useRobotText,
} from '../../domains/robot/robotPublic';
import { checkRobotAssetReachability,useRobotAssetReachability } from '../../domains/robot/robotAssetPublic';
import { useProductRouteVisible } from '../../shared/routeReady';
import { RobotInstrumentDetail } from './RobotInstrumentDetail';
import { RobotInstrumentProjection } from './RobotInstrumentProjection';
import { RobotListProjection } from './RobotListProjection';
import { robotHealthTone,type RobotPanelItem } from './robotProjectionModel';
import { useRobotInstrumentDetailHover } from './useRobotInstrumentDetailHover';
import { useRobotProjectionChannels } from './useRobotProjectionChannels';

export const RobotProjectionCard = memo(function RobotProjectionCard({ targetId,assetTargetCoreId,runId,runMode,robot,assetSpec,selected,chassisHold = false,instrument,onSelect }: {
  targetId: string;
  /** Core that owns the asset catalog; independent of runtime execution target. */
  assetTargetCoreId: string;
  runId?: string;
  runMode?: string;
  robot: RobotPanelItem;
  assetSpec?: object;
  selected: boolean;
  chassisHold?: boolean;
  instrument: boolean;
  onSelect: (robotId: string) => void;
}) {
  const t = useRobotText();
  // A parked route or hidden dashboard tab keeps the card mounted (DOM
  // identity) but does not draw its 5 Hz telemetry until it is visible again.
  const routeVisible = useProductRouteVisible();
  const surfaceVisible = useExperimentSurfaceVisible();
  const projection = useRobotProjectionChannels({
    targetId,runId,robot,instrument,parked:!routeVisible || !surfaceVisible,
  });
  const probe = useCallback((resourceId: string) => checkRobotAssetReachability(resourceId,
    assetTargetCoreId === 'local' ? undefined : { targetCoreId: assetTargetCoreId }), [assetTargetCoreId]);
  const reachability = useRobotAssetReachability(probe);
  const healthTone = robotHealthTone({
    hasRun: Boolean(runId),
    robot,
    channels: projection.channels,
    healthChannel: projection.healthChannel,
    health: projection.health,
    online: projection.status.online,
    operationalReady: projection.status.operationalReady,
    kindProjection: projection.kindProjection,
  });
  const selectFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(robot.id);
  };
  const showSimulationSourceMark = experimentRobotSimulationSourceMark(runMode, robot.hybridSource);
  const hover = useRobotInstrumentDetailHover({
    robotId: robot.id,
    content: <RobotInstrumentDetail
      robotId={robot.id}
      robot={robot}
      projection={projection}
      assetSpec={assetSpec}
      ping={reachability.reachabilityById[robot.robotAssetId]}
      onPing={() => { void reachability.checkReachability(robot.robotAssetId); }}
      onSsh={() => requestRobotInstrumentSshJump(robot.robotAssetId,assetTargetCoreId)}
    />,
  });
  return (
    <>
      <article
        className="robot-instrument-card robot-selectable-robot"
        data-xgc-role="run-robot-card"
        data-xgc-id={robot.id}
        data-xgc-health={healthTone}
        data-xgc-status={projection.status.status}
        data-xgc-presentation={instrument ? 'instrument' : 'list'}
        data-xgc-platform={projection.flight ? 'flight' : projection.kindProjection?.platform ?? 'ground'}
        data-xgc-chassis-hold={chassisHold ? 'true' : undefined}
        role="button"
        aria-pressed={selected}
        tabIndex={0}
        onPointerDown={(event: PointerEvent<HTMLElement>) => { if (event.button === 0) onSelect(robot.id); }}
        onKeyDown={selectFromKeyboard}
        onPointerEnter={hover.pointerHandlers.onPointerEnter}
        onPointerMove={hover.pointerHandlers.onPointerMove}
        onPointerLeave={hover.pointerHandlers.onPointerLeave}
      >
        {instrument && showSimulationSourceMark && (
          <StatusText
            status="error"
            className="robot-instrument-source-badge"
            title={t('This Robot uses its authored simulation source when the Session selects the hybrid branch.')}
            data-xgc-id={robot.id}
          >
            (sim)
          </StatusText>
        )}
        {instrument
          ? <RobotInstrumentProjection robot={robot} projection={projection} healthTone={healthTone} />
          : <RobotListProjection
            robot={robot}
            projection={projection}
            healthTone={healthTone}
            showSimulationSourceMark={showSimulationSourceMark}
          />}
      </article>
      {hover.portal}
    </>
  );
});
