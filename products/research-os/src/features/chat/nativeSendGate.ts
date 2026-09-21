export const NATIVE_CONNECT_FAILED_NOTICE =
  'Native connection failed. Check the pinned CLI, native login and approved workspace; no provider fallback occurred.'

export type NativeLoginStatus = { status?: string; detail?: string }

const labels: Record<string, string> = {
  grok: 'Grok',
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor',
  opencode: 'OpenCode',
}

export function nativeProviderLabel(provider?: string): string {
  if (!provider) return ''
  return labels[provider] || provider
}

export function nativeConnectFailedNotice(notices: readonly string[] = []): boolean {
  return notices.some((text) => text === NATIVE_CONNECT_FAILED_NOTICE || text.startsWith('Native connection failed.'))
}

export function nativeInventoryWorker<T extends string>(
  inventory?: T,
  stream?: T,
): T | undefined {
  if (inventory === 'disconnected' || inventory === 'closed') return inventory
  return stream ?? inventory
}

export function nativeUnsignedHint(
  locale: 'en' | 'zh',
  login?: NativeLoginStatus,
  provider?: string,
): string {
  if (login?.status !== 'unauthenticated') return ''
  const name = nativeProviderLabel(provider)
  return locale === 'zh'
    ? `${name || '当前模型'} 未在本机登录`
    : `${name || 'This model'} is not signed in on this host`
}

export function nativeConnectFailureCopy(input: {
  locale: 'en' | 'zh'
  login?: NativeLoginStatus
  notices?: readonly string[]
  worker?: string
  attempted?: boolean
  provider?: string
}): string {
  const unauthenticated = input.login?.status === 'unauthenticated'
  const failed = nativeConnectFailedNotice(input.notices)
  const disconnected = input.worker === 'disconnected' || input.worker === 'closed'
  const live = input.worker === 'ready' || input.worker === 'running' || input.worker === 'awaiting-input' || input.worker === 'cancelling'
  if (live || (!unauthenticated && !failed)) return ''
  if (!input.attempted && !disconnected) return ''
  if (unauthenticated) {
    const name = nativeProviderLabel(input.provider)
    return input.locale === 'zh'
      ? `${name || '当前模型'} 未在本机登录，消息没有发出。请先在本机登录该客户端，或新建线程改用已登录的提供商。`
      : `${name || 'This model'} is not signed in on the host, so the message was not sent. Sign in with the native client, or start a new thread with a signed-in provider.`
  }
  return input.locale === 'zh'
    ? '原生连接失败。请检查本机客户端、登录和已批准的工作区。'
    : 'Native connection failed. Check the local CLI, sign-in and approved workspace.'
}

export function nativeShouldReconnect(input: {
  worker?: string
  login?: NativeLoginStatus
}): boolean {
  if (input.login?.status === 'unauthenticated') return false
  return input.worker === 'disconnected' || input.worker === 'closed'
}

export function nativePendingFirstFailed(worker?: string): boolean {
  return worker === 'disconnected' || worker === 'closed'
}
