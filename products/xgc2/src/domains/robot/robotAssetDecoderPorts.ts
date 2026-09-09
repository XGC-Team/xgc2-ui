/** Historical default for physical MAVROS local bind port. */
export function defaultPhysicalMavrosLocalPort(mavSystemId: number) {
  return 9000 + mavSystemId * 10;
}

/** Auto-distinguished SITL MAVROS local bind port (instance = mavSystemId - 1). */
export function defaultSimulationMavrosLocalPort(mavSystemId: number) {
  return 15000 + Math.max(1, mavSystemId) - 1;
}

/** Auto-distinguished SITL PX4 remote UDP port (instance = mavSystemId - 1). */
export function defaultSimulationPx4RemotePort(mavSystemId: number) {
  return 15300 + Math.max(1, mavSystemId) - 1;
}
