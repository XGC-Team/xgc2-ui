import { memo } from 'react';

export const RobotInstrumentIdentity = memo(function RobotInstrumentIdentity({
  robotId,
  name,
  className,
  title,
}: {
  robotId: string;
  name: string;
  className?: string;
  title?: string;
}) {
  return (
    <strong
      className={className}
      data-xgc-role="robot-instrument-identity"
      data-xgc-id={robotId}
      title={title}
    >
      {name}
    </strong>
  );
});
