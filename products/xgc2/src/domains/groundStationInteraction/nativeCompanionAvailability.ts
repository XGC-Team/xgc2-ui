import { AgentClientError } from '@xgc2/agent-runtime/client';

const COMPANION_CODES = new Set([
  'native_upstream_unavailable',
  'native_unavailable',
]);

const COMPANION_COPY = new Set([
  '客户端连接中断。',
  '本机客户端服务连接中断。',
  '客户端未连接。',
  '本机客户端服务尚未连接。',
]);

export function isTransportTimeout(cause: unknown): boolean {
  return /^request timeout after \d+ms: /.test(messageOf(cause));
}

export function isNativeCompanionUnavailable(cause: unknown): boolean {
  if (cause instanceof AgentClientError && COMPANION_CODES.has(cause.code)) return true;
  const message = messageOf(cause);
  if (COMPANION_COPY.has(message)) return true;
  return isTransportTimeout(cause) && message.includes('/native-agents/');
}

export function operatorNativeErrorMessage(cause: unknown): string {
  if (isNativeCompanionUnavailable(cause) || isTransportTimeout(cause)) return '';
  return messageOf(cause);
}

export function composerControlReason(input: {
  locale: 'en' | 'zh';
  companionUnavailable: boolean;
  providersLoaded: boolean;
  hasEnabledProvider: boolean;
}): string {
  if (input.companionUnavailable) {
    return input.locale === 'zh' ? '本机客户端未连接' : 'The local companion is not connected';
  }
  if (input.providersLoaded && !input.hasEnabledProvider) {
    return input.locale === 'zh' ? '没有已启用的供应者。在设置中启用。' : 'No enabled provider. Enable one in Settings.';
  }
  return '';
}

export function isNativeCompanionUnavailableMessage(message: string): boolean {
  return COMPANION_COPY.has(message)
    || (/^request timeout after \d+ms: /.test(message) && message.includes('/native-agents/'));
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : String(cause);
}
