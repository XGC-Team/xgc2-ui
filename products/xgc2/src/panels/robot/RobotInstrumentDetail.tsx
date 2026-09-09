import { ControlButton } from '../../components/controls/ControlButton';
import { useRobotText } from '../../domains/robot/robotPublic';
import {
  formatInstrumentPingDiagnostic,
  robotInstrumentDetailRows,
  robotInstrumentManagementAddress,
} from './robotInstrumentDetailModel';
import type { RobotPanelItem } from './robotProjectionModel';
import type { RobotProjectionChannels } from './useRobotProjectionChannels';

export function RobotInstrumentDetail({
  robotId,
  robot,
  projection,
  assetSpec,
  ping,
  onPing,
  onSsh,
}: {
  robotId: string;
  robot: RobotPanelItem;
  projection: RobotProjectionChannels;
  assetSpec?: object;
  ping?: { status: string; result?: { reachable: boolean; latencyMs: number } };
  onPing?: () => void;
  onSsh?: () => void;
}) {
  const t = useRobotText();
  const address = robotInstrumentManagementAddress(robot, assetSpec);
  const rows = robotInstrumentDetailRows({
    flight: projection.flight,
    mocapRotor: projection.mocapRotor,
    kindProjection: Boolean(projection.kindProjection),
    pose: projection.pose,
    poseStale: projection.poseChannel?.stale,
    mocap: projection.mocap,
    localizationError: projection.localizationError,
    streamHealth: projection.streamHealth,
    poseChannelId: projection.telemetryChannelIds?.pose,
    mocapPoseChannelId: projection.telemetryChannelIds?.mocapPose,
    localizationErrorChannelId: projection.telemetryChannelIds?.localizationError,
    managementAddress: address,
    pingDiagnostic: formatInstrumentPingDiagnostic(ping),
  });
  const pingBusy = ping?.status === 'checking';
  return (
    <>
      <dl
        className="robot-instrument-detail"
        data-xgc-role="robot-instrument-detail"
        data-xgc-id={robotId}
      >
        {rows.map((row) => (
          <div
            key={row.slot}
            className="robot-instrument-detail-row"
            data-xgc-role="robot-instrument-detail-row"
            data-xgc-id={`${robotId}:${row.slot}`}
          >
            <dt>{t(row.labelKey)}</dt>
            <dd>{row.value}</dd>
            <span
              className="robot-instrument-detail-diagnostic"
              data-xgc-role="robot-instrument-detail-diagnostic"
              data-xgc-id={`${robotId}:${row.slot}`}
            >
              {row.diagnostic}
            </span>
          </div>
        ))}
      </dl>
      <div
        className="robot-instrument-detail-actions"
        data-xgc-role="robot-instrument-detail-actions"
        data-xgc-id={robotId}
      >
        <ControlButton
          size="compact"
          dataXgcRole="robot-instrument-detail-ping"
          dataXgcId={robotId}
          disabled={!robot.robotAssetId || pingBusy}
          aria-busy={pingBusy || undefined}
          onClick={() => onPing?.()}
        >
          {t('Ping')}
        </ControlButton>
        <ControlButton
          size="compact"
          dataXgcRole="robot-instrument-detail-ssh"
          dataXgcId={robotId}
          disabled={!robot.robotAssetId || !address}
          onClick={() => onSsh?.()}
        >
          {t('SSH')}
        </ControlButton>
      </div>
    </>
  );
}
