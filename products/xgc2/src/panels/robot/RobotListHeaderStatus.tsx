import type { ReactNode } from 'react';
import { RobotInstrumentStatusGlyph } from './RobotInstrumentStatus';
import type { RobotListHeaderStatusItem } from './RobotListHeaderStatusModel';

export function RobotListHeaderStatus({ robotId,items,children }: {
  robotId: string;
  items: readonly RobotListHeaderStatusItem[];
  children?: ReactNode;
}) {
  return (
    <div
      className="robot-list-header-trailing"
      data-xgc-role="robot-list-header-trailing"
      data-xgc-id={robotId}
    >
      <div
        className="robot-list-header-status robot-instrument-status-icons"
        data-xgc-role="robot-list-header-status"
        data-xgc-id={robotId}
        data-xgc-presentation="list"
      >
        {items.map((item) => (
          <RobotInstrumentStatusGlyph
            key={item.kind}
            robotId={robotId}
            kind={item.kind}
            role={item.role}
            label={item.label}
            tone={item.tone}
            source={item.source}
            value={item.value}
            active={item.active}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
