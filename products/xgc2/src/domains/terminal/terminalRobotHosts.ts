import {
  isContributedRobotAsset,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  robotAssetKindLabel,
  type RobotAssetDocument,
} from '../robot/robotAssetPublic';
import type { TerminalHost } from './terminalModel';

/** Stable TerminalHost id prefix so robot inventory never collides with user Hosts. */
export const TERMINAL_ROBOT_HOST_ID_PREFIX = 'robot-asset:';

/**
 * Project Robot assets that carry SSH connection facts into TerminalHost rows.
 * Used for quick login beside user-managed Hosts; Hosts remain free-form extras.
 * Built-in PX4/Scout/Mecanum and composition-contributed kinds that expose a
 * remote address + SSH user on a leaf arm are projected the same way.
 */
export function projectRobotAssetsAsTerminalHosts(
  assets: readonly RobotAssetDocument[],
): TerminalHost[] {
  return assets.flatMap((asset) => {
    const host = terminalHostFromRobotAsset(asset);
    return host ? [host] : [];
  });
}

export function isTerminalRobotHostId(id: string) {
  return id.startsWith(TERMINAL_ROBOT_HOST_ID_PREFIX);
}

export function mergeTerminalLoginHosts(
  robotHosts: readonly TerminalHost[],
  customHosts: readonly TerminalHost[],
): TerminalHost[] {
  // Hosts (free-form) first, then robot inventory groups below.
  return [...customHosts,...robotHosts];
}

function terminalHostFromRobotAsset(asset: RobotAssetDocument): TerminalHost | null {
  if (isPX4RobotAsset(asset)) {
    const { managementIp,sshUsername,sshPassword } = asset.spec.px4;
    if (!managementIp.trim() || !sshUsername.trim()) return null;
    return robotTerminalHost({
      asset,
      address: managementIp.trim(),
      user: sshUsername.trim(),
      password: sshPassword,
    });
  }
  // Scout and Mecanum share the UGV link model (managementAddress + SSH).
  if (isScoutRobotAsset(asset) || isMecanumRobotAsset(asset)) {
    const link = isScoutRobotAsset(asset) ? asset.spec.scout : asset.spec.mecanum;
    const { managementAddress,sshUsername,sshPassword } = link;
    if (!managementAddress.trim() || !sshUsername.trim()) return null;
    return robotTerminalHost({
      asset,
      address: managementAddress.trim(),
      user: sshUsername.trim(),
      password: sshPassword,
    });
  }
  // Extension kinds (e.g. Unitree B2) own their wire arm; Terminal only reads
  // generic remote-address + SSH facts without importing a leaf package.
  if (isContributedRobotAsset(asset)) {
    const ssh = contributedRobotSshFacts(asset.spec);
    if (!ssh) return null;
    return robotTerminalHost({
      asset,
      address: ssh.address,
      user: ssh.user,
      password: ssh.password,
    });
  }
  return null;
}

/**
 * Discover companion SSH facts on a contributed leaf arm without naming any
 * product leaf. Accepts the common inventory shapes used by robot dogs / UGVs:
 * robotAddress|managementAddress|managementIp + sshUsername + sshPassword.
 */
function contributedRobotSshFacts(spec: RobotAssetDocument['spec']): {
  address: string;
  user: string;
  password: string;
} | null {
  for (const value of Object.values(spec)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const arm = value as Record<string, unknown>;
    const address = firstNonEmptyString(arm, [
      'robotAddress',
      'managementAddress',
      'managementIp',
    ]);
    const user = firstNonEmptyString(arm, ['sshUsername']);
    if (!address || !user) continue;
    const password = typeof arm.sshPassword === 'string' ? arm.sshPassword : '';
    return { address, user, password };
  }
  return null;
}

function firstNonEmptyString(
  arm: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = arm[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function robotTerminalHost({
  asset,
  address,
  user,
  password,
}: {
  asset: RobotAssetDocument;
  address: string;
  user: string;
  password: string;
}): TerminalHost {
  return {
    id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}${asset.head.resourceId}`,
    name: asset.spec.name,
    // Kind label keeps robots grouped separately from free-form Host groups.
    group: robotAssetKindLabel(asset),
    address,
    port: 22,
    user,
    authMode: 'password',
    password,
    privateKey: '',
    passphrase: '',
    rememberPassword: true,
    hasPassword: Boolean(password.trim()),
    hostKey: '',
    description: `Robot asset · ${robotAssetKindLabel(asset)}`,
    createdAt: asset.head.createdAt,
    updatedAt: asset.head.updatedAt,
  };
}
