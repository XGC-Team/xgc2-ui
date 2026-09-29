import type { AppLanguage } from '../../shared/localization/languagePreference';
import { formatOperatorDateTime } from '../../shared/operatorTime';

const english = {
  title: 'Device sign-in',
  address: 'Station address', chooseAddress: 'Choose an address on this network',
  expires: 'Valid until', noExpiry: 'No expiry set',
  generate: 'Generate sign-in link',
  link: 'Sign-in link', linkExpires: 'One-time link, open before',
  linkExpired: 'This link has expired. Generate a fresh one; any device that already opened a link keeps its authorization.',
  copy: 'Copy link', copied: 'Link copied', copyFailed: 'Copy failed — select the link and copy it manually.',
  unavailable: 'Sign-in links can only be generated in the browser on the station computer itself.',
  noOrigins: 'No reachable network address is available.',
  noGrant: 'The current identity cannot sign in other devices.',
  loading: 'Loading the current device identity…', retry: 'Refresh',
  signedOut: 'This browser is not signed in.', current: 'This browser',
  logout: 'Sign out this device',
  // Invitee page copy (behavior unchanged).
  description: 'This device is signing in to the station with a one-time link.',
  pairTitle: 'Sign in to the station',
  pairing: 'Checking the link…', paired: 'Verified. Opening the station…',
  missing: 'Open a fresh sign-in link from the station.',
  failed: 'This link has expired or was already used. Ask for a fresh one.',
  loadFailed: 'The sign-in state could not be loaded.', issueFailed: 'The sign-in link could not be generated.',
  issueUndescribed: 'This identity’s permissions cannot be described by this interface; link generation is blocked.',
  logoutFailed: 'Sign-out failed; the authorization has not been confirmed closed.',
  // Inline robot-control fencing (the station shell itself never gates).
  controlSessionDenied: 'This browser is not signed in, so robot control is disabled.',
  controlSessionUnavailable: 'The station could not confirm this browser, so robot control is temporarily disabled.',
  controlSessionRetry: 'Retry sign-in',
  controlSessionChecking: 'Confirming sign-in…',
};

type OperatorAccessCopy = typeof english;
const chinese: OperatorAccessCopy = {
  title: '设备登录',
  address: '主站地址', chooseAddress: '选择这个网络里的地址',
  expires: '有效期至', noExpiry: '未设到期时间',
  generate: '生成登录链接',
  link: '登录链接', linkExpires: '一次性链接，有效期至',
  linkExpired: '这个链接已过期，请重新生成；已打开过链接的设备保留其授权。',
  copy: '复制链接', copied: '链接已复制', copyFailed: '复制失败，请选择链接并手动复制。',
  unavailable: '只能在这台主站本机的浏览器里生成登录链接。',
  noOrigins: '当前没有可用的网络地址。',
  noGrant: '当前身份不能用于登录其它设备。',
  loading: '正在读取当前设备身份…', retry: '刷新',
  signedOut: '此浏览器尚未登录。', current: '这台浏览器',
  logout: '退出这台设备的登录',
  description: '这台设备正在通过一次性链接登录主站。',
  pairTitle: '登录主站',
  pairing: '正在验证链接…', paired: '已验证，正在打开主站…',
  missing: '请打开主站生成的新登录链接。',
  failed: '链接已过期或已被使用。请重新生成。',
  loadFailed: '无法读取登录状态。', issueFailed: '无法生成登录链接。',
  issueUndescribed: '本界面无法说明该身份的权限，已阻止生成链接。',
  logoutFailed: '退出失败，尚未确认已退出。',
  controlSessionDenied: '此浏览器尚未登录，机器人控制已停用。',
  controlSessionUnavailable: '暂时无法向主站确认此浏览器，机器人控制已临时停用。',
  controlSessionRetry: '重试登录',
  controlSessionChecking: '正在确认登录状态…',
};

export function operatorAccessCopy(language: AppLanguage): OperatorAccessCopy {
  return language === 'zh-CN' ? chinese : english;
}

export function formatOperatorExpiry(value: string | undefined, language: AppLanguage): string {
  if (!value) return operatorAccessCopy(language).noExpiry;
  return formatOperatorDateTime(value, language);
}

// The capabilities this interface version can account for (real request
// guards, product composition markers and the historical core.proxy marker).
// This set is display-side bookkeeping, not a permission authority: anything
// outside it makes the sign-in link unsafe to issue from this interface.
const KNOWN_OPERATOR_CAPABILITIES: ReadonlySet<string> = new Set([
  'core.view', 'core.proxy', 'access.manage', 'terminal.manage',
  'host.read', 'host.write', 'host.process.kill', 'host.ssh.manage', 'host.firewall.manage',
  'operations.process.read', 'operations.process.control',
  'operations.robot.read', 'operations.robot.control',
  'operations.job.read', 'operations.job.control',
  'operations.events.read', 'operations.mcp.control',
  'ground-station.interactions.read', 'ground-station.interactions.publish', 'ground-station.interactions.respond',
  'automations.read', 'automations.edit', 'automations.run',
  'toolbox.maintenance', 'robot.read', 'robot.manage',
  'calibration.read', 'calibration.edit',
  'recordings.read', 'recordings.write',
  'experiment.read', 'experiment.manage',
  'usernode.read', 'usernode.edit', 'usernode.run',
  'audit.task.read',
  'terminal.local', 'terminal.remote',
  'system.overview', 'system.files', 'system.processes', 'system.network', 'system.maintenance',
]);

/**
 * Capabilities in the grant this interface cannot account for. Set.has is
 * prototype-safe: 'toString'/'constructor'/'__proto__' come back unknown.
 */
export function unknownOperatorCapabilities(capabilities: readonly string[]): readonly string[] {
  return capabilities.filter((capability) => !KNOWN_OPERATOR_CAPABILITIES.has(capability));
}
