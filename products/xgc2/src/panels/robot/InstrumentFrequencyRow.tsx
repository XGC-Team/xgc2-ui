import { useRobotText } from '../../domains/robot/robotPublic';
import {
  COMMAND_STREAM_ACTIVE_HZ,
  formatAlarmHz,
  formatFrequencyRateLabel,
  frequencyRateMagnitude,
  frequencyValueTone,
  isCommandStreamChannel,
  isInformationalFrequencyChannel,
} from './frequencyAlarm';

export function InstrumentFrequencyRow({
  robotId,
  channelId,
  compactLabel,
  fullLabel,
  rate,
  alarmHz,
  role = 'robot-flight-frequency',
  source,
  valueRole,
  valueId,
}: {
  robotId: string;
  channelId: string;
  compactLabel: string;
  fullLabel: string;
  rate: number;
  alarmHz?: number;
  role?: string;
  source?: string;
  valueRole?: string;
  valueId?: string;
}) {
  const t = useRobotText();
  const numericRate = Number(rate);
  const command = isCommandStreamChannel(channelId);
  const informational = isInformationalFrequencyChannel(channelId);
  const caption = command
    ? t('{channel} {rate}; green above {active} Hz', {
      channel: compactLabel,
      rate: formatFrequencyRateLabel(numericRate),
      active: COMMAND_STREAM_ACTIVE_HZ,
    })
    : informational
      ? t('{channel} {rate}; no frequency alarm', {
        channel: compactLabel,
        rate: formatFrequencyRateLabel(numericRate),
      })
      : t('{channel} {rate}; alarm below {alarm} Hz', {
        channel: compactLabel,
        rate: formatFrequencyRateLabel(numericRate),
        alarm: formatAlarmHz(alarmHz ?? 0),
      });
  return (
    <span
      data-xgc-role={role}
      data-xgc-id={`${robotId}:${channelId}`}
      data-xgc-source={source}
      data-xgc-stream={command ? 'command' : informational ? 'informational' : 'sensor'}
      data-xgc-alarm-hz={command || informational || alarmHz == null ? undefined : formatAlarmHz(alarmHz)}
      data-xgc-active-hz={command ? String(COMMAND_STREAM_ACTIVE_HZ) : undefined}
      title={caption}
      aria-label={caption}
    >
      <small>
        <span className="robot-flight-frequency-label-compact">{compactLabel}</span>
        <span className="robot-flight-frequency-label-full">{fullLabel}</span>
      </small>
      <strong
        className="robot-flight-frequency-value"
        data-xgc-role={valueRole}
        data-xgc-id={valueId}
        data-xgc-tone={frequencyValueTone(numericRate, channelId, alarmHz)}
      >
        <span className="robot-flight-frequency-value-compact">
          {frequencyRateMagnitude(numericRate, true)}
          <span className="robot-flight-frequency-unit"> Hz</span>
        </span>
        <span className="robot-flight-frequency-value-full">
          {frequencyRateMagnitude(numericRate, false)}
          <span className="robot-flight-frequency-unit"> Hz</span>
        </span>
      </strong>
    </span>
  );
}
