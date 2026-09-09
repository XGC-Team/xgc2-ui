export const px4RotorControlActions = [
  {
    id: 'set-flight-mode',operationId: 'set-flight-mode',label: 'Set mode',
    systemWorkflowKey: 'px4-panel-control.v7.set-flight-mode',
  },
  {
    id: 'mode-offboard',operationId: 'set-flight-mode',label: 'OFFBOARD',fixedMode: 'OFFBOARD',
    systemWorkflowKey: 'px4-panel-control.v7.mode-offboard',
  },
  {
    id: 'mode-altctl',operationId: 'set-flight-mode',label: 'ALTCTL',fixedMode: 'ALTCTL',
    systemWorkflowKey: 'px4-panel-control.v7.mode-altctl',
  },
  {
    id: 'mode-posctl',operationId: 'set-flight-mode',label: 'POSCTL',fixedMode: 'POSCTL',
    systemWorkflowKey: 'px4-panel-control.v7.mode-posctl',
  },
  {
    id: 'mode-stabilized',operationId: 'set-flight-mode',label: 'STABILIZED',fixedMode: 'STABILIZED',
    systemWorkflowKey: 'px4-panel-control.v7.mode-stabilized',
  },
  {
    id: 'arm',operationId: 'arm',label: 'Arm',fixedArmed: true,
    systemWorkflowKey: 'px4-panel-control.v7.arm',
  },
  {
    id: 'disarm',operationId: 'arm',label: 'Disarm',fixedArmed: false,
    systemWorkflowKey: 'px4-panel-control.v7.disarm',
  },
  {
    id: 'force-disarm',operationId: 'force-disarm',label: 'Kill',
    systemWorkflowKey: 'px4-panel-control.v7.force-disarm',
  },
  {
    id: 'reboot-autopilot',operationId: 'reboot-autopilot',label: 'Reboot',
    systemWorkflowKey: 'px4-panel-control.v7.reboot-autopilot',
  },
] as const;

export type PX4RotorControlActionId = (typeof px4RotorControlActions)[number]['id'];

/**
 * Operator layout: mode controls plus Set mode / Arm test, then
 * Arm / Disarm / Reboot / Kill. Arm test remains a separate preflight control.
 */
export const px4RotorControlPanelActionIds = [
  'set-flight-mode','mode-offboard','mode-altctl','mode-posctl','mode-stabilized','arm','disarm','force-disarm','reboot-autopilot',
] as const satisfies readonly PX4RotorControlActionId[];

/** Modes accepted by the PX4 Robot Profile set-flight-mode contract. */
export const PX4_FLIGHT_MODE_OPTIONS = [
  'OFFBOARD','POSCTL','ALTCTL','STABILIZED',
] as const;

export type PX4FlightMode = (typeof PX4_FLIGHT_MODE_OPTIONS)[number];

/**
 * xgc1 `cb_targer_mode` order in XExternalAgentsControlPanel.ui.
 * AUTO.* sit in the combobox for parity; the current robot profile enum
 * still only guarantees OFFBOARD / POSCTL / ALTCTL / STABILIZED.
 */
export const PX4_SET_MODE_OPTIONS = [
  'AUTO.LOITER','POSCTL','OFFBOARD','ALTCTL','STABILIZED','AUTO.MISSION','AUTO.RTL','AUTO.LAND',
] as const;

export type PX4SetModeOption = (typeof PX4_SET_MODE_OPTIONS)[number];

export const PX4_SET_MODE_DEFAULT: PX4SetModeOption = 'POSCTL';

/** Shortcuts only retarget the combobox. xgc1 `pb_pos` / `pb_alt` / `pb_offboard`. */
export const PX4_SET_MODE_SHORTCUTS = [
  { id: 'posctl',label: 'Position',mode: 'POSCTL' },
  { id: 'altctl',label: 'Altitude',mode: 'ALTCTL' },
  { id: 'offboard',label: 'Offboard',mode: 'OFFBOARD' },
] as const satisfies ReadonlyArray<{ id: string; label: string; mode: PX4SetModeOption }>;
