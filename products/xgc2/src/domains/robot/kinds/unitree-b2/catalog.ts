import {
  UNITREE_B2_CATALOG_KIND,
  UNITREE_B2_LABEL,
  UNITREE_B2_PROFILE_ID,
  type UnitreeB2InventoryPayload,
  type UnitreeB2RobotAssetSpec,
} from './contracts';

export type UnitreeB2OverviewAttr = { id: string; label: string; value: string };

/** Folder / kind option entry for the Robots catalog UI. */
export const UNITREE_B2_CATALOG_ENTRY = Object.freeze({
  id: UNITREE_B2_CATALOG_KIND,
  label: UNITREE_B2_LABEL,
  chassisClass: 'quadruped',
  vendorLabel: 'Unitree',
});

export const UNITREE_B2_DEFAULT_PROFILE_ID = UNITREE_B2_PROFILE_ID;

/** Default display name for the Nth B2 asset (1-based sequence). */
export function unitreeB2DefaultName(sequence: number): string {
  return `B2 ${String(sequence).padStart(2, '0')}`;
}

/** Parse trailing fleet index from a B2 display name (e.g. "B2 03" → 3). */
export function unitreeB2NameSequence(name: string): number | undefined {
  const match = name.trim().match(/^B2\s*0*(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

/** Endpoint shown on inventory list cards / endpoint column. */
export function unitreeB2Endpoint(spec: UnitreeB2RobotAssetSpec): string {
  return spec.unitreeB2.robotAddress;
}

/** Inventory facts for the Robot Assets list overview (password omitted). */
export function unitreeB2OverviewAttributes(
  payload: UnitreeB2InventoryPayload,
): UnitreeB2OverviewAttr[] {
  return [
    { id: 'robot-address', label: 'Robot address', value: payload.robotAddress || '—' },
    { id: 'ros-domain-id', label: 'ROS domain ID', value: String(payload.rosDomainId) },
    { id: 'ssh-username', label: 'SSH username', value: payload.sshUsername || '—' },
  ];
}
